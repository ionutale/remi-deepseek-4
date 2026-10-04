import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

/**
 * Screenshot run for `static/screenshots/*` (the set the README embeds).
 *
 * Four captures of the shipped UI, all in Romanian (spec §4):
 *   home.png        — the home page: hero + both paths (solo / online)
 *   lobby.png       — a room lobby with two seats, waiting for the host
 *   room-table.png  — a two-player table in the `playing` phase, mid-turn
 *   solo-table.png  — a solo table in the `playing` phase, mid-turn
 *
 * Every step is driven by clicking through the app, so the whole run costs a
 * single document load (the in-app navigations are SvelteKit client-side `goto`s)
 * — which matters because `src/hooks.server.ts` rate-limits everything except the
 * room poll to 120 requests / 60s / IP and one dev-server document load is ~80 of
 * them. The only second browser leg (the guest seat) goes through the room API.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../static/screenshots');

/** Captures with animations fast-forwarded, so deals and counts are settled. */
const SHOT = { animations: 'disabled' } as const;

/** Every file this spec owns; anything else in the directory is a stale capture. */
const SHOTS = ['home.png', 'lobby.png', 'room-table.png', 'solo-table.png'];

async function shoot(page: Page, name: string): Promise<void> {
	await page.screenshot({
		path: path.join(SCREENSHOT_DIR, name),
		fullPage: true,
		...SHOT
	});
	expect(fs.statSync(path.join(SCREENSHOT_DIR, name)).size).toBeGreaterThan(1000);
}

/* ── Locators (Romanian copy, spec §4) ─────────────────────────────────── */

function rack(page: Page) {
	return page.getByRole('group', { name: /^Tabla ta/ });
}

/** The șir column label, e.g. "Șir (2)". */
function sir(page: Page) {
	return page.getByText(/^Șir \(\d+\)$/, { exact: true });
}

async function expectRackSize(page: Page, size: number): Promise<void> {
	await expect(rack(page)).toHaveAttribute('aria-label', `Tabla ta (${size} piese)`);
}

/** The slice of the stored game state the guest leg reads. */
interface GameState {
	revision: number;
	phase: string;
	players: { rack: { id: string }[] }[];
}
interface Credentials {
	playerId: string;
	sessionToken: string;
}

/**
 * The two pre-game phases — identical on `/game` and `/room/[code]`: the blind
 * duble exchange, then the atu announcement. Either seat may resolve both.
 */
async function runPreGame(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { name: 'Remi Etalat · Duble' })).toBeVisible();
	await page.getByRole('button', { name: 'Continuă', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Remi Etalat · Atu' })).toBeVisible();
	await page.getByRole('button', { name: 'Continuă jocul' }).click();
	await expect(page.getByText('Rândul tău', { exact: true })).toBeVisible();
}

/**
 * Turn 1 — the opening discard, without a draw: the dead first șir piece. The
 * callers assert the resulting șir size, because the solo calculator seat answers
 * immediately while a room seat waits for its opponent.
 */
async function openingDiscard(page: Page): Promise<void> {
	await expect(
		page.getByText('Prima tură: aruncă o piesă ca să deschizi șirul.', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Aruncă · alege piesa' })).toBeDisabled();
	await rack(page).getByRole('button').first().click();
	await page.getByRole('button', { name: 'Aruncă', exact: true }).click();
	await expectRackSize(page, 14);
}

/**
 * The guest seat's turn, sent through the room API so the screenshot run needs
 * no second browser. Seat 1 is the guest (the host created the room).
 */
async function guestTurn(page: Page, code: string, guest: Credentials): Promise<void> {
	const put = async (baseRevision: number, intent: Record<string, unknown>) => {
		const res = await page.request.put(`/api/rooms/${code}`, {
			data: { ...guest, baseRevision, intent }
		});
		expect(res.ok()).toBeTruthy();
		return ((await res.json()) as { gameState: GameState }).gameState;
	};
	const stored = (
		(await (await page.request.get(`/api/rooms/${code}`)).json()) as {
			gameState: GameState;
		}
	).gameState;
	const drawn = await put(stored.revision, { kind: 'draw-stock' });
	const discarded = await put(drawn.revision, {
		kind: 'discard',
		pieceId: drawn.players[1]!.rack[0]!.id
	});
	expect(discarded.phase).toBe('playing');
}

test.describe('Screenshots', () => {
	test.setTimeout(240_000);

	test('capture home, room lobby, room table and solo table', async ({ page }) => {
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
		// Tall enough that no capture needs stitching: a full-page shot taller than
		// the viewport can leave the last rows unpainted.
		await page.setViewportSize({ width: 1280, height: 1100 });

		// ── 1. Home ──
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Remi Etalat' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Joacă împotriva calculatorului' })
		).toBeVisible();
		await expect(page.getByRole('region', { name: 'Joc online' })).toBeVisible();
		await shoot(page, 'home.png');

		// ── 2. Room lobby ──
		await page.getByLabel('Numele tău').fill('Alice');
		await page
			.getByRole('group', { name: 'Jucători max', exact: true })
			.getByRole('button', { name: '2', exact: true })
			.click();
		// Two buttons carry this name (the tab and the submit) — the submit is last.
		await page.getByRole('button', { name: 'Creează cameră' }).last().click();
		// `nanoid(6)` also emits `-` and `_`, and lowercase for the create-room path.
		await page.waitForURL(/\/room\/[A-Za-z0-9_-]{6}$/);
		const code = page.url().split('/').pop()!;

		// A second seat, taken through the API: it needs no browser of its own.
		const joinRes = await page.request.patch(`/api/rooms/${code}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		expect(joinRes.ok()).toBeTruthy();
		const guest = (await joinRes.json()) as Credentials;
		const seats = page.getByRole('region', { name: 'Locuri la masă' });
		await expect(seats.getByText('2 / 2', { exact: true })).toBeVisible({ timeout: 15_000 });
		await shoot(page, 'lobby.png');

		// ── 3. Room table (playing) ──
		await page.getByRole('button', { name: 'Începe jocul' }).click();
		await runPreGame(page);
		await openingDiscard(page);
		await expect(sir(page)).toHaveText('Șir (1)');
		await guestTurn(page, code, guest);
		await expect(page.getByText('Rândul tău', { exact: true })).toBeVisible({ timeout: 15_000 });
		await page.getByRole('button', { name: 'Trage din grămadă' }).click();
		await expectRackSize(page, 15);
		await expect(sir(page)).toHaveText('Șir (2)');
		await shoot(page, 'room-table.png');

		// Back home through the app's own button (client-side navigation), then the
		// solo table — still no second document load.
		await page.getByRole('button', { name: 'Părăsește camera' }).click();
		await page.waitForURL('/');
		await page
			.getByRole('group', { name: 'Jucători', exact: true })
			.getByRole('button', { name: '2', exact: true })
			.click();
		await page.getByRole('button', { name: 'Începe jocul' }).click();
		await page.waitForURL('**/game');

		// ── 4. Solo table (playing) ──
		await runPreGame(page);
		await openingDiscard(page);
		// The calculator seat answered on its own, so it is our turn again: draw and
		// stop mid-turn, with a full rack and the whole action bar live.
		await expect(sir(page)).toHaveText('Șir (2)');
		await expect(page.getByRole('button', { name: 'Trage din grămadă' })).toBeVisible({
			timeout: 15_000
		});
		await page.getByRole('button', { name: 'Trage din grămadă' }).click();
		await expectRackSize(page, 15);
		await expect(page.getByRole('button', { name: 'Etalează' })).toBeVisible();
		await shoot(page, 'solo-table.png');

		// The stale close-mode captures are gone: the directory holds exactly the
		// four images this spec owns (README embeds these four).
		const onDisk = fs
			.readdirSync(SCREENSHOT_DIR)
			.filter((entry) => entry.endsWith('.png'))
			.sort();
		expect(onDisk).toEqual([...SHOTS].sort());
	});
});
