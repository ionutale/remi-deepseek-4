import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Remi Etalat E2E — the structural spine of the new game.
 *
 * The deal is random (`shuffle` in `src/lib/engine/remi/pieces.ts`), so nothing
 * here asserts a concrete piece: only phases, piece counts, the Romanian copy
 * and the two server-side rejections. Every selector is a role, a label or a
 * visible Romanian string — no `data-testid` anywhere.
 *
 * Turn structure this suite relies on (deterministic, see spec §1.4):
 *   turn 1  the opener (always seat 0 — `createGame` sets `firstPlayerIndex: 0`)
 *           discards without drawing; that piece is the dead `sir[0]`;
 *   turn 2  the second seat draws + discards;
 *   turn 3+ the opener draws + discards, and `Etalează` is offered
 *           (`onmeld` needs `turnNumber > players.length`).
 */

/* ── Rate-limit pacer ─────────────────────────────────────────────────────────
 * `src/hooks.server.ts` allows 120 requests / 60s per IP and exempts only the
 * room poll. One document load of the Vite dev server is ~80 requests, so two
 * loads inside one window would 429 — which the room stores render as a
 * silently stuck screen. One worker (config) + one paced document load per test
 * keeps every load inside a fresh window. SvelteKit client-side navigations
 * (`goto`) are not document loads and cost a handful of requests.
 */
const RATE_WINDOW_MS = 62_000;
let lastDocumentLoad = 0;

async function paceDocumentLoad(): Promise<void> {
	const wait = lastDocumentLoad + RATE_WINDOW_MS - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	lastDocumentLoad = Date.now();
}

/**
 * Full page load, then wait for hydration — the E2E server is the Vite dev
 * server (see tests/e2e/start-with-mongo.mjs), so clicks landing before the
 * client bundle runs are silently dropped.
 */
async function open(page: Page, urlPath: string): Promise<void> {
	await paceDocumentLoad();
	await page.goto(urlPath);
	await page.waitForLoadState('networkidle');
}

/* ── Locators (Romanian copy, spec §4) ─────────────────────────────────── */

/** The player's own rack — `role=group`, labelled "Tabla ta (N piese)". */
function rack(page: Page): Locator {
	return page.getByRole('group', { name: /^Tabla ta/ });
}

/** The shared table: melds, grămadă, șir, atu. */
function masa(page: Page): Locator {
	return page.getByRole('region', { name: 'Masa comună' });
}

/** The opponent seat cards ("N piese" per seat). */
function adversari(page: Page): Locator {
	return page.getByRole('region', { name: 'Adversari' });
}

/**
 * One seat card of the opponents strip, found by its name. The strip repeats the
 * seat name in the card, so this is the only unambiguous way to read one seat's
 * piece count (and `/game` lists every seat in it, including "Tu").
 */
function seatCard(page: Page, name: RegExp | string): Locator {
	return adversari(page)
		.locator(':scope > div')
		.filter({ has: page.getByText(name) });
}

/** The șir column label, e.g. "Șir (2)". */
function sir(page: Page): Locator {
	return page.getByText(/^Șir \(\d+\)$/, { exact: true });
}

/** The turn chip in the table HUD: "Rândul tău" / "Așteaptă". */
function turnChip(page: Page, mine: boolean): Locator {
	return page.getByText(mine ? 'Rândul tău' : 'Așteaptă', { exact: true });
}

async function expectRackSize(page: Page, size: number): Promise<void> {
	await expect(rack(page)).toHaveAttribute('aria-label', `Tabla ta (${size} piese)`);
}

/**
 * Picks the first rack piece and lays it on the șir through the real UI.
 * Before a selection the action reads "Aruncă · alege piesa" and is disabled.
 */
async function discardFirstRackPiece(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: 'Aruncă · alege piesa' })).toBeDisabled();
	await rack(page).getByRole('button').first().click();
	const discard = page.getByRole('button', { name: 'Aruncă', exact: true });
	await expect(discard).toBeEnabled();
	await discard.click();
}

/**
 * The two pre-game phases, identical on `/game` and `/room/[code]`: the duble
 * exchange, then the atu announcement. Either seat may resolve both, so the
 * page that started the game is enough.
 */
async function runPreGame(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { name: 'Remi Etalat · Duble' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Schimbul de duble' })).toBeVisible();
	await page.getByRole('button', { name: 'Continuă', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Remi Etalat · Atu' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Atu' })).toBeVisible();
	await page.getByRole('button', { name: 'Continuă jocul' }).click();

	await expect(turnChip(page, true)).toBeVisible();
	await expect(page.getByText('Faza: joc', { exact: true })).toBeVisible();
}

/** Creates a room from the home screen and returns its code. */
async function createRoom(page: Page, name: string, maxPlayers: number): Promise<string> {
	await open(page, '/');
	await page.getByLabel('Numele tău').fill(name);
	await page
		.getByRole('group', { name: 'Jucători max', exact: true })
		.getByRole('button', { name: String(maxPlayers), exact: true })
		.click();
	// Two buttons carry this name (the tab and the submit) — the submit is last.
	await page.getByRole('button', { name: 'Creează cameră' }).last().click();
	// `nanoid(6)` also emits `-` and `_`, and lowercase for the create-room path.
	await page.waitForURL(/\/room\/[A-Za-z0-9_-]{6}$/);
	return page.url().split('/').pop()!;
}

/** The player-count picker of the solo start overlay (buttons read "2 jucători"). */
function soloCount(page: Page, count: number): Locator {
	return page
		.getByRole('group', { name: 'Jucători', exact: true })
		.getByRole('button', { name: new RegExp(`^${count} jucători$`) });
}

/** Seats a second player through the API — no extra browser page, no extra load. */
async function joinSeat(page: Page, code: string, name: string): Promise<Credentials> {
	const res = await page.request.patch(`/api/rooms/${code}`, {
		data: { action: 'join', playerName: name }
	});
	expect(res.ok()).toBeTruthy();
	const body = (await res.json()) as Credentials;
	expect(body.playerId).toBeTruthy();
	expect(body.sessionToken).toBeTruthy();
	return body;
}

/** The slice of the room state these specs read. */
interface GameState {
	phase: string;
	currentPlayerIndex: number;
	turnNumber: number;
	revision: number;
	players: { rack: { id: string }[] }[];
}
interface Credentials {
	playerId: string;
	sessionToken: string;
}

test.describe('Remi Etalat', () => {
	// A paced document load alone waits a full rate-limit window.
	test.describe.configure({ timeout: 240_000 });

	test('Home: Romanian hero + both paths, solo (2 jucători) lands on the duble phase', async ({
		page
	}) => {
		await open(page, '/');

		await expect(page.getByRole('heading', { name: 'Remi Etalat' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Joacă împotriva calculatorului' })
		).toBeVisible();
		await expect(page.getByRole('region', { name: 'Joc online' })).toBeVisible();
		await expect(page.getByLabel('Numele tău')).toBeVisible();
		// Quick match stays locked until a name is typed.
		await expect(page.getByRole('button', { name: 'Căutare adversar (1v1)' })).toBeDisabled();
		await page.getByLabel('Numele tău').fill('Alice');
		await expect(page.getByRole('button', { name: 'Căutare adversar (1v1)' })).toBeEnabled();

		// Path 1 — vs the calculator, 2 players, straight into the duble phase.
		await page
			.getByRole('group', { name: 'Jucători', exact: true })
			.getByRole('button', { name: '2', exact: true })
			.click();
		await page.getByRole('button', { name: 'Începe jocul' }).click();
		await page.waitForURL('**/game');

		await expect(page.getByRole('heading', { name: 'Remi Etalat · Duble' })).toBeVisible();
		await expect(page.getByRole('region', { name: 'Schimbul de duble' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continuă', exact: true })).toBeVisible();
		// The three ropet categories are always listed, whatever the deal holds.
		await expect(page.getByText('Dublă mică', { exact: true })).toBeVisible();
		await expect(page.getByText('Dublă mare', { exact: true })).toBeVisible();
		await expect(page.getByText('Dublă cheie', { exact: true })).toBeVisible();
	});

	test('Solo: duble → atu → table, opening discard, then a draw + discard cycle', async ({
		page
	}) => {
		await open(page, '/game');

		// Start overlay: the dealer picker is the home page's job too.
		await expect(page.getByRole('heading', { name: 'Remi Etalat' })).toBeVisible();
		await soloCount(page, 2).click();
		await page.getByRole('button', { name: 'Începe jocul' }).click();

		await runPreGame(page);

		// Turn 1 — the opening discard, without a draw.
		await expect(
			page.getByText('Prima tură: aruncă o piesă ca să deschizi șirul.', { exact: true })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Trage din grămadă' })).toHaveCount(0);
		await expect(sir(page)).toHaveText('Șir (0)');
		// The opener is dealt 15 pieces (ropet), the calculator seat 14.
		await expectRackSize(page, 15);

		await discardFirstRackPiece(page);

		// Turn 2 is the calculator seat and it answers straight away, so the șir
		// already holds both pieces by the time the turn is back with us.
		await expect(turnChip(page, true)).toBeVisible();
		await expect(sir(page)).toHaveText('Șir (2)');
		await expectRackSize(page, 14);

		// Turn 3 — a full draw + discard cycle, with the whole action bar live.
		await expect(page.getByRole('button', { name: 'Trage din grămadă' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Etalează' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Aruncă · alege piesa' })).toBeDisabled();

		await page.getByRole('button', { name: 'Trage din grămadă' }).click();
		await expectRackSize(page, 15);

		await discardFirstRackPiece(page);
		// The calculator seat answers in the same beat. From turn 4 it may also etalează
		// instead of laying a piece down, so the șir grows by one or stays as it is.
		await expect(sir(page)).toHaveText(/^Șir \([34]\)$/);
		await expectRackSize(page, 14);

		// The table keeps its Romanian furniture.
		await expect(masa(page)).toBeVisible();
		await expect(masa(page).getByText('Grămadă', { exact: true })).toBeVisible();
		await expect(masa(page).getByText('Atu', { exact: true })).toBeVisible();
		await expect(sir(page)).toBeVisible();
		// The calculator seat is labelled by seat number ("Calculator 2" in a 2-player
		// game) and holds a private count; `/game` also lists our own seat in this
		// strip. Its exact count depends on whether it etalează, so only the shape
		// of the label is asserted.
		await expect(seatCard(page, /^Calculator \d+$/)).toContainText(/\d+ piese/);
		await expect(
			// `<aside aria-label="Acțiuni">` is a `complementary` landmark, and its
			// heading carries our own piece count.
			page.getByRole('complementary', { name: 'Acțiuni' }).getByText(/^Tu \(\d+ piese\)$/)
		).toBeVisible();
	});

	test('Multiplayer: create → join → start → both phases → alternating turns', async ({
		browser
	}) => {
		test.setTimeout(300_000);
		// Separate contexts: the seat lives in a per-tab store + sessionStorage, so
		// each browser has to join for itself.
		const baseURL = test.info().project.use.baseURL as string;
		const aliceCtx = await browser.newContext({ baseURL });
		const bobCtx = await browser.newContext({ baseURL });
		const alice = await aliceCtx.newPage();
		const bob = await bobCtx.newPage();

		const code = await createRoom(alice, 'Alice', 2);

		// ── Lobby ──
		await expect(alice.getByRole('heading', { name: 'Cameră' })).toBeVisible();
		await expect(alice.getByText('Cod:', { exact: true })).toBeVisible();
		await expect(alice.getByText(code, { exact: true })).toBeVisible();
		const seats = alice.getByRole('region', { name: 'Locuri la masă' });
		await expect(seats.getByText('Alice', { exact: true })).toBeVisible();
		await expect(seats.getByText('Gazdă', { exact: true })).toBeVisible();
		await expect(seats.getByText('Tu', { exact: true })).toBeVisible();
		await expect(seats.getByText('Loc liber')).toHaveCount(1);
		await expect(seats.getByText('1 / 2', { exact: true })).toBeVisible();
		// One player cannot start.
		await expect(alice.getByRole('button', { name: 'Începe jocul' })).toBeDisabled();
		await expect(alice.getByText('Așteaptă cel puțin 2 jucători la masă…')).toBeVisible();

		// ── Join from a second browser ──
		await open(bob, '/');
		await bob.getByLabel('Numele tău').fill('Bob');
		await bob
			.getByRole('group', { name: 'Acțiune cameră' })
			.getByRole('button', { name: 'Intră în cameră', exact: true })
			.click();
		await bob.getByLabel('Cod cameră').fill(code);
		await bob.getByRole('button', { name: 'Intră în cameră' }).last().click();
		await bob.waitForURL(new RegExp(`/room/${code}$`));

		await expect(seats.getByText('2 / 2', { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(seats.getByText('Bob', { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(seats.getByText('Loc liber')).toHaveCount(0);
		await expect(bob.getByText('Așteaptă ca gazda să înceapă jocul…')).toBeVisible();
		await expect(alice.getByRole('button', { name: 'Începe jocul' })).toBeEnabled();

		// ── Host starts: both seats see the duble phase, then the atu phase ──
		await alice.getByRole('button', { name: 'Începe jocul' }).click();
		await expect(alice.getByRole('heading', { name: 'Remi Etalat · Duble' })).toBeVisible({
			timeout: 15_000
		});
		await expect(bob.getByRole('heading', { name: 'Remi Etalat · Duble' })).toBeVisible({
			timeout: 15_000
		});

		await alice.getByRole('button', { name: 'Continuă', exact: true }).click();
		await expect(alice.getByRole('heading', { name: 'Remi Etalat · Atu' })).toBeVisible({
			timeout: 15_000
		});
		await expect(bob.getByRole('heading', { name: 'Remi Etalat · Atu' })).toBeVisible({
			timeout: 15_000
		});
		await alice.getByRole('button', { name: 'Continuă jocul' }).click();

		// ── Playing: seat 0 (the host) opens ──
		await expect(turnChip(alice, true)).toBeVisible();
		await expect(turnChip(bob, false)).toBeVisible({ timeout: 15_000 });
		await expect(
			alice.getByText('Prima tură: aruncă o piesă ca să deschizi șirul.', { exact: true })
		).toBeVisible();
		await expect(sir(alice)).toHaveText('Șir (0)');
		// The opener is dealt 15 pieces (ropet), the guest 14.
		await expectRackSize(alice, 15);
		await expectRackSize(bob, 14);

		await discardFirstRackPiece(alice);
		await expect(sir(alice)).toHaveText('Șir (1)');
		await expectRackSize(alice, 14);
		await expect(turnChip(alice, false)).toBeVisible();
		await expect(turnChip(bob, true)).toBeVisible({ timeout: 15_000 });

		// ── Bob draws and discards; Alice watches his seat count move ──
		await expect(adversari(bob).getByText('14 piese', { exact: true })).toBeVisible();
		await bob.getByRole('button', { name: 'Trage din grămadă' }).click();
		await expectRackSize(bob, 15);
		await expect(adversari(alice).getByText('15 piese', { exact: true })).toBeVisible({
			timeout: 15_000
		});

		await discardFirstRackPiece(bob);
		await expect(turnChip(alice, true)).toBeVisible({ timeout: 15_000 });
		await expect(sir(alice)).toHaveText('Șir (2)');
		await expectRackSize(bob, 14);
		await expect(adversari(alice).getByText('14 piese', { exact: true })).toBeVisible({
			timeout: 15_000
		});

		// Both turns are persisted server-side, not just rendered.
		const roomRes = await alice.request.get(`/api/rooms/${code}`);
		expect(roomRes.ok()).toBeTruthy();
		const { gameState } = (await roomRes.json()) as { gameState: GameState };
		expect(gameState.phase).toBe('playing');
		expect(gameState.currentPlayerIndex).toBe(0);
		expect(gameState.players.map((player) => player.rack.length)).toEqual([14, 14]);

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('Multiplayer: a mid-game reload reclaims the seat (no join card)', async ({ page }) => {
		const code = await createRoom(page, 'Alice', 2);
		const bob = await joinSeat(page, code, 'Bob');
		await expect(
			page.getByRole('region', { name: 'Locuri la masă' }).getByText('2 / 2')
		).toBeVisible({ timeout: 15_000 });

		await page.getByRole('button', { name: 'Începe jocul' }).click();
		await runPreGame(page);
		await discardFirstRackPiece(page);
		await expect(sir(page)).toHaveText('Șir (1)');

		// The turn passed to Bob, so the reclaimed seat must show his turn.
		await expect(page.getByText('Așteaptă — este rândul lui Bob.', { exact: true })).toBeVisible({
			timeout: 15_000
		});

		await paceDocumentLoad();
		await page.reload();
		await page.waitForLoadState('networkidle');

		// No join card: the seat in `sessionStorage` was reclaimed.
		await expect(page.getByRole('button', { name: 'Intră în cameră' })).toHaveCount(0);
		await expect(page.getByRole('region', { name: 'Locuri la masă' })).toHaveCount(0);
		await expect(masa(page)).toBeVisible({ timeout: 20_000 });
		await expectRackSize(page, 14);
		await expect(sir(page)).toHaveText('Șir (1)');
		await expect(page.getByText('Așteaptă — este rândul lui Bob.', { exact: true })).toBeVisible();

		// The reclaimed seat is back in the game: Bob plays through the API and the
		// reloaded page picks the new turn up by polling.
		const stored = (await (await page.request.get(`/api/rooms/${code}`)).json()) as {
			gameState: GameState;
		};
		const intent = async (baseRevision: number, body: Record<string, unknown>) => {
			const res = await page.request.put(`/api/rooms/${code}`, {
				data: { ...bob, baseRevision, intent: body }
			});
			expect(res.ok()).toBeTruthy();
			return (await res.json()) as { gameState: GameState };
		};
		const drawn = await intent(stored.gameState.revision, { kind: 'draw-stock' });
		const discarded = await intent(drawn.gameState.revision, {
			kind: 'discard',
			pieceId: drawn.gameState.players[1]!.rack[0]!.id
		});
		expect(discarded.gameState.currentPlayerIndex).toBe(0);

		await expect(turnChip(page, true)).toBeVisible({ timeout: 15_000 });
		await expect(sir(page)).toHaveText('Șir (2)');
	});

	test('Room API: an out-of-turn intent is 403 and a stale baseRevision is 409', async ({
		page
	}) => {
		// The whole flow through the API: no browser page, no document load.
		const createRes = await page.request.post('/api/rooms', {
			data: { ownerName: 'Alice', maxPlayers: 2 }
		});
		expect(createRes.ok()).toBeTruthy();
		const created = (await createRes.json()) as { code: string; ownerId: string } & Credentials;
		const code = created.code;
		const alice: Credentials = {
			playerId: created.ownerId,
			sessionToken: created.sessionToken
		};
		const bob = await joinSeat(page, code, 'Bob');

		const startRes = await page.request.patch(`/api/rooms/${code}`, {
			data: { action: 'start', ...alice }
		});
		expect(startRes.ok()).toBeTruthy();

		/** One intent against the stored state, gated by the caller's `baseRevision`. */
		const put = (creds: Credentials, baseRevision: number, kind: string) =>
			page.request.put(`/api/rooms/${code}`, {
				data: { ...creds, baseRevision, intent: { kind } }
			});

		const dealt = (await (await page.request.get(`/api/rooms/${code}`)).json()) as {
			gameState: GameState;
		};
		expect(dealt.gameState.phase).toBe('duble');
		expect(dealt.gameState.currentPlayerIndex).toBe(0);

		// Pre-game intents are turn-free, so either seat can walk the game into play.
		const dubleRes = await put(alice, dealt.gameState.revision, 'duble-resolve');
		expect(dubleRes.ok()).toBeTruthy();
		const duble = (await dubleRes.json()) as { revision: number; gameState: GameState };
		expect(duble.gameState.phase).toBe('atu');

		const playRes = await put(alice, duble.revision, 'start-playing');
		expect(playRes.ok()).toBeTruthy();
		const playing = (await playRes.json()) as { revision: number; gameState: GameState };
		expect(playing.gameState.phase).toBe('playing');
		expect(playing.gameState.currentPlayerIndex).toBe(0);
		expect(playing.gameState.turnNumber).toBe(1);

		// Out of turn: Bob's credentials on a turn-owned intent → 403.
		const notYourTurn = await put(bob, playing.revision, 'draw-stock');
		expect(notYourTurn.status()).toBe(403);
		expect(((await notYourTurn.json()) as { error: string }).error).toBe('Not your turn');

		// Stale optimistic lock → 409, with the authoritative state in the body.
		const stale = await put(alice, playing.revision - 1, 'draw-stock');
		expect(stale.status()).toBe(409);
		const staleBody = (await stale.json()) as { error: string; gameState: GameState };
		expect(staleBody.error).toBe('Revision mismatch');
		expect(staleBody.gameState.revision).toBe(playing.revision);

		// The rejected intents left the state untouched, and the seat owner with the
		// current revision still gets through.
		const ok = await put(alice, playing.revision, 'draw-stock');
		expect(ok.ok()).toBeTruthy();
		const after = (await (await page.request.get(`/api/rooms/${code}`)).json()) as {
			gameState: GameState;
		};
		expect(after.gameState.revision).toBeGreaterThan(playing.revision);
		expect(after.gameState.players[0]!.rack).toHaveLength(16);

		// A 403 is an ownership failure, not a revision failure: the revision is intact.
		expect(after.gameState.turnNumber).toBe(1);
	});
});
