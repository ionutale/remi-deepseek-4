import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Full page load, then wait for hydration.
 *
 * The E2E server is the Vite dev server (see tests/e2e/start-with-mongo.mjs), so the
 * client bundle is fetched after the document: without this wait, clicks that land
 * before hydration are silently dropped. Not used on the room page — it polls the
 * room every 2s and therefore never goes idle.
 */
async function open(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}

/** Turn chip in the table HUD. */
const MY_TURN = 'Your turn';
const WAITING = 'Waiting…';

/** The player's own rack. */
function hand(page: Page): Locator {
	return page.getByRole('region', { name: /Your hand/ });
}

/** The stock (draw pile) button, labelled with the number of cards left. */
function stock(page: Page): Locator {
	return page.getByRole('button', { name: /Draw pile, \d+ cards remaining/ });
}

/** The discard action button ("Discard" / "Discard 7♠") — not the discard pile. */
function discardAction(page: Page): Locator {
	return page.getByRole('button', { name: /^Discard(?! pile)/ });
}

function stockCount(pile: Locator): Promise<number> {
	return pile
		.getAttribute('aria-label')
		.then((label) => Number(/\d+/.exec(label ?? '0')?.[0] ?? 0));
}

/** The slice of the room state these specs read and replay. */
interface Card {
	suit: string;
	value: number;
	id: string;
	isJoker: boolean;
}
interface GameState {
	phase: string;
	currentPlayerIndex: number;
	revision: number;
	round: number;
	players: { hand: Card[] }[];
}
interface Credentials {
	playerId: string;
	sessionToken: string;
}

/**
 * A 15-card hand one card away from a legal close: two sets (four 5s, three 7s)
 * and two sequences (♠9-10-J-Q, ♣2-3-4), with the 2♦ left over as closing discard.
 *
 * The `-e2e` id suffix marks the cards as synthetic and, more usefully, keeps them
 * distinct from any card a previous deal staged on the board.
 */
const CLOSABLE_HAND: Card[] = [
	...['♠', '♥', '♦', '♣'].map((suit) => ({ suit, value: 5 })),
	...['♠', '♥', '♦'].map((suit) => ({ suit, value: 7 })),
	...[
		['♠', 9],
		['♠', 10],
		['♠', 11],
		['♠', 12]
	].map(([suit, value]) => ({ suit: suit as string, value: value as number })),
	...[
		['♣', 2],
		['♣', 3],
		['♣', 4]
	].map(([suit, value]) => ({ suit: suit as string, value: value as number })),
	{ suit: '♦', value: 2 }
].map(({ suit, value }) => ({ suit, value, id: `${suit}-${value}-e2e`, isJoker: false }));

/**
 * Starts the room game and returns the host credentials the page used, read off
 * its own `action: 'start'` request (they live only in the page's stores).
 */
async function startGame(page: Page): Promise<Credentials> {
	const started = page.waitForRequest(
		(request) =>
			request.method() === 'PATCH' &&
			request.url().includes('/api/rooms/') &&
			request.postData()?.includes('"start"') === true
	);
	await page.getByRole('button', { name: 'Start Game' }).click();
	await expect(page.getByText(MY_TURN, { exact: true })).toBeVisible({ timeout: 10_000 });

	const credentials = JSON.parse((await started).postData() ?? '{}') as Credentials;
	expect(credentials.playerId).toBeTruthy();
	expect(credentials.sessionToken).toBeTruthy();
	return credentials;
}

/**
 * Deals a closable 15-card hand to the host through the room API.
 *
 * A close needs 15 cards that partition into valid melds, which a random deal
 * essentially never offers. `PUT action: 'move'` accepts any state for the player
 * whose turn it is, so the deal is doctored here — the close itself stays real:
 * the server re-validates the declaration with `closeGame` before storing it.
 */
async function dealClosableHand(page: Page, roomCode: string, credentials: Credentials) {
	const roomRes = await page.request.get(`/api/rooms/${roomCode}`);
	const { gameState } = (await roomRes.json()) as { gameState: GameState };

	const putRes = await page.request.put(`/api/rooms/${roomCode}`, {
		data: {
			...credentials,
			baseRevision: gameState.revision,
			action: 'move',
			gameState: {
				...gameState,
				players: gameState.players.map((player, index) =>
					index === 0 ? { ...player, hand: CLOSABLE_HAND } : player
				),
				currentPlayerIndex: 0,
				phase: 'discard',
				revision: gameState.revision + 1
			}
		}
	});
	expect(putRes.ok()).toBeTruthy();
}

/** Creates a room through the home screen and returns its code. */
async function createRoom(page: Page, name: string, maxPlayers: number): Promise<string> {
	await open(page, '/');
	await page.getByLabel('Your name').fill(name);
	await page
		.getByRole('group', { name: 'Max players' })
		.getByRole('button', { name: String(maxPlayers), exact: true })
		.click();
	await page.getByRole('button', { name: 'Create room' }).click();
	await page.waitForURL(/\/room\//);
	return page.url().split('/').pop()!;
}

/** Draws from the stock, selects the first playable card and discards it. */
async function playTurn(page: Page) {
	await stock(page).click();
	await page.getByText(/Discard or close/).waitFor();

	const discard = discardAction(page);
	await expect(discard).toBeVisible();
	await expect(discard).toBeDisabled();
	await hand(page).locator('button:not([disabled])').first().click();
	await expect(discard).toBeEnabled();
	await discard.click();
}

test.describe('Remi E2E', () => {
	/**
	 * The app rate-limits 120 requests per 60s per IP (src/hooks.server.ts) and the whole
	 * E2E run counts as that one IP: the room pages poll every 2s on top of a document
	 * per page load, so back-to-back tests tip the bucket into a 429 — which the room
	 * stores turn into a silently stuck screen. This short pause before each test keeps
	 * the run's request rate under the limit instead of racing it.
	 */
	test.beforeEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 6_000));
	});

	test('Home: play vs AI opens the solo table', async ({ page }) => {
		await open(page, '/');
		await expect(page.getByRole('heading', { name: 'Draw. Meld. Outplay.' })).toBeVisible();

		await page.getByRole('button', { name: 'Start game vs AI' }).click();
		await page.waitForURL('**/game');

		await expect(page.getByText(MY_TURN, { exact: true })).toBeVisible();
		await expect(page.getByRole('region', { name: 'Draw and discard piles' })).toBeVisible();
		await expect(stock(page)).toBeVisible();
		// A fresh 2-player deal: 14 cards each, one AI seat.
		await expect(hand(page).locator('button')).toHaveCount(14);
		await expect(page.getByRole('status', { name: /^Player 2, \d+ cards/ })).toHaveCount(1);
		// The meld rack is always present, with its minimum of empty slots.
		await expect(page.getByRole('region', { name: 'Meld rack' })).toBeVisible();
		await expect(page.getByRole('group', { name: 'Meld slot 1' })).toBeVisible();
	});

	test('Solo: /game overlay starts a fresh table', async ({ page }) => {
		await open(page, '/game');
		await expect(page.getByRole('heading', { name: 'Ready to deal?' })).toBeVisible();

		await page
			.getByRole('group', { name: 'Players' })
			.getByRole('button', { name: '2 players' })
			.click();
		await page.getByRole('button', { name: 'Start game vs AI' }).click();

		await expect(page.getByText(MY_TURN, { exact: true })).toBeVisible();
		await expect(hand(page).locator('button')).toHaveCount(14);
		await expect(page.getByRole('status', { name: /^Player 2, \d+ cards/ })).toHaveCount(1);
	});

	test('Solo: draw from the stock, discard a card, the AI answers', async ({ page }) => {
		await open(page, '/game');
		await page.getByRole('button', { name: 'Start game vs AI' }).click();
		await expect(page.getByText(MY_TURN, { exact: true })).toBeVisible();

		const pile = stock(page);
		const before = await stockCount(pile);
		await expect(hand(page).locator('button')).toHaveCount(14);

		// Draw phase → discard phase: the stock shrinks and the hand grows.
		await pile.click();
		await expect(page.getByText(/Discard or close/)).toBeVisible();
		await expect(hand(page).locator('button')).toHaveCount(15);
		expect(await stockCount(pile)).toBe(before - 1);

		// Selecting a card enables the discard action.
		const discard = discardAction(page);
		await expect(discard).toBeDisabled();
		await hand(page).locator('button:not([disabled])').first().click();
		await expect(discard).toBeEnabled();
		await discard.click();

		// The AI seat played its turn straight away: the stock shrank again and
		// the table is back with us. (If the AI could close the round, the score
		// sheet replaces the table instead — also a valid turn progression.)
		const scoreSheet = page.getByRole('status', { name: 'Round score sheet' });
		await expect(page.getByText(MY_TURN, { exact: true }).or(scoreSheet)).toBeVisible();
		if (await scoreSheet.isVisible()) return;

		await expect(hand(page).locator('button')).toHaveCount(14);
		expect(await stockCount(pile)).toBeLessThan(before);
		await expect(page.getByRole('status', { name: /^Player 2, \d+ cards/ })).toHaveCount(1);
	});

	test('Lobby: create room shows the code and the waiting seats', async ({ page }) => {
		const roomCode = await createRoom(page, 'Alice', 2);

		await expect(page.getByText('Room:')).toBeVisible();
		await expect(page.getByText(roomCode, { exact: true })).toBeVisible();
		await expect(page.getByText('Seats')).toBeVisible();
		await expect(page.getByText('Alice', { exact: true })).toBeVisible();
		await expect(page.getByText('Host', { exact: true })).toBeVisible();
		await expect(page.getByText('You', { exact: true })).toBeVisible();
		await expect(page.getByText('Open seat')).toHaveCount(1);

		// A single player cannot start.
		await expect(page.getByRole('button', { name: 'Start Game' })).toBeDisabled();
		await expect(page.getByText(/Waiting for at least 2 players/)).toBeVisible();
	});

	test('Lobby: joining with an unknown code shows an error', async ({ page }) => {
		await open(page, '/');
		await page.getByLabel('Your name').fill('Alice');
		await page
			.getByRole('group', { name: 'Room action' })
			.getByRole('button', { name: 'Join' })
			.click();
		await page.getByLabel('Room code').fill('ZZZZZZ');
		await page.getByRole('button', { name: 'Join room' }).click();

		await expect(page.getByRole('alert')).toHaveText(/Room not found/);
		await expect(page).toHaveURL('/');
	});

	test('Lobby: unknown room URL falls back to the loading state', async ({ page }) => {
		await page.goto('/room/XXXXXX');
		await expect(page.getByText('Loading room...')).toBeVisible({ timeout: 10000 });
	});

	test('Lobby: empty name shows validation', async ({ page }) => {
		await open(page, '/');
		await page.getByRole('button', { name: 'Create room' }).click();
		await expect(page.getByRole('alert')).toHaveText('Enter your name');
	});

	test('Lobby: quick match is disabled without a name', async ({ page }) => {
		await open(page, '/');
		await expect(page.getByRole('button', { name: 'Quick Match (1v1)' })).toBeDisabled();

		await page.getByLabel('Your name').fill('Alice');
		await expect(page.getByRole('button', { name: 'Quick Match (1v1)' })).toBeEnabled();
	});

	test('Multiplayer: create, join from a second browser, start, alternate turns', async ({
		browser
	}) => {
		test.setTimeout(120_000);

		// Separate contexts: the player identity lives in a per-page store, so each
		// browser has to join for itself.
		const alice = await (await browser.newContext()).newPage();
		const bob = await (await browser.newContext()).newPage();

		const roomCode = await createRoom(alice, 'Alice', 2);

		await open(bob, '/');
		await bob.getByLabel('Your name').fill('Bob');
		await bob
			.getByRole('group', { name: 'Room action' })
			.getByRole('button', { name: 'Join' })
			.click();
		await bob.getByLabel('Room code').fill(roomCode);
		await bob.getByRole('button', { name: 'Join room' }).click();
		await bob.waitForURL(new RegExp(`/room/${roomCode}$`));

		await expect(alice.getByText('Bob', { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(alice.getByText('2 / 2')).toBeVisible();
		await expect(alice.getByText('Open seat')).toHaveCount(0);
		await expect(bob.getByText(/Waiting for the host to start/)).toBeVisible();

		await alice.getByRole('button', { name: 'Start Game' }).click();
		await expect(alice.getByText(MY_TURN, { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(alice.getByText(`Round 1`, { exact: true })).toBeVisible();
		await expect(hand(alice).locator('button')).toHaveCount(14);
		await expect(bob.getByText(WAITING, { exact: true })).toBeVisible();
		await expect(bob.getByRole('status', { name: /^Alice, \d+ cards, active turn/ })).toBeVisible();

		// Alice moves: the turn passes to Bob (his page picks it up by polling).
		await playTurn(alice);
		await expect(alice.getByText(WAITING, { exact: true })).toBeVisible();
		await expect(bob.getByText(MY_TURN, { exact: true })).toBeVisible({ timeout: 10_000 });

		// Bob answers, and the table is back with Alice.
		await playTurn(bob);
		await expect(bob.getByText(WAITING, { exact: true })).toBeVisible();
		await expect(alice.getByText(MY_TURN, { exact: true })).toBeVisible({ timeout: 10_000 });

		// Both turns are persisted server-side.
		const roomRes = await alice.request.get(`/api/rooms/${roomCode}`);
		expect(roomRes.ok()).toBeTruthy();
		const { gameState } = await roomRes.json();
		expect(gameState).toBeTruthy();
		expect(gameState.phase).toBe('draw');
		expect(gameState.currentPlayerIndex).toBe(0);
	});

	test('Multiplayer: a closable hand scores the round and deals the next one', async ({ page }) => {
		test.setTimeout(120_000);

		const roomCode = await createRoom(page, 'Alice', 2);

		// Bob only has to be seated: his hand is what the close collects points from.
		const joinRes = await page.request.patch(`/api/rooms/${roomCode}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		expect(joinRes.ok()).toBeTruthy();
		await expect(page.getByText('Bob', { exact: true })).toBeVisible({ timeout: 10_000 });

		const credentials = await startGame(page);
		await dealClosableHand(page, roomCode, credentials);

		// The page picks the doctored deal up by polling, then Organize fills the rack.
		await expect(hand(page).locator('button')).toHaveCount(15);
		await page.getByRole('button', { name: 'Organize' }).click();

		// Only a fully staged board unlocks the close action.
		const close = page.getByRole('button', { name: /^Close — discard/ });
		await expect(close).toBeVisible();
		await expect(close).toHaveText('Close — discard 2♦');
		await close.click();

		// Round score sheet: the round winner collects the opponents' hand points.
		await expect(page.getByRole('status', { name: 'Round score sheet' })).toBeVisible({
			timeout: 10_000
		});
		await expect(
			page.getByRole('heading', { name: 'Round 1 — Alice wins the round' })
		).toBeVisible();
		await expect(page.getByText('Round winner')).toBeVisible();
		await expect(page.getByText(/Race to 500/)).toBeVisible();
		await expect(
			page.getByRole('progressbar', { name: /Alice progress toward 500/ })
		).toBeVisible();

		// The round winner starts the next round.
		await page.getByRole('button', { name: 'Next round' }).click();
		await expect(page.getByText('Round 2', { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(hand(page).locator('button')).toHaveCount(14);
		await expect(page.getByText(MY_TURN, { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Close — discard/ })).toHaveCount(0);

		// The scored round is persisted, not just rendered.
		const roomRes = await page.request.get(`/api/rooms/${roomCode}`);
		const { gameState } = (await roomRes.json()) as { gameState: GameState };
		expect(gameState.round).toBe(2);
		expect(gameState.phase).toBe('draw');
	});

	test('Multiplayer: an illegal close declaration is rejected with the engine reason', async ({
		page
	}) => {
		const roomCode = await createRoom(page, 'Alice', 2);

		const joinRes = await page.request.patch(`/api/rooms/${roomCode}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		expect(joinRes.ok()).toBeTruthy();
		await expect(page.getByText('Bob', { exact: true })).toBeVisible({ timeout: 10_000 });

		const credentials = await startGame(page);
		// Doctor the deal so the room sits in 'discard' phase with the host to move.
		await dealClosableHand(page, roomCode, credentials);

		const roomRes = await page.request.get(`/api/rooms/${roomCode}`);
		const { gameState } = (await roomRes.json()) as { gameState: GameState };
		expect(gameState.phase).toBe('discard');

		// A close whose discard card is not in the hand: the server re-validates
		// the declaration against the stored hand and rejects with the reason.
		const bad = await page.request.put(`/api/rooms/${roomCode}`, {
			data: {
				...credentials,
				baseRevision: gameState.revision,
				action: 'close',
				gameState,
				declaration: { melds: [], discardId: 'no-such-card' }
			}
		});
		expect(bad.status()).toBe(400);
		const body = (await bad.json()) as { error?: string };
		expect(body.error).toBe('discard card must be in hand');
	});
});
