import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../static/screenshots');

/** Captures with animations fast-forwarded, so deals and counts are settled. */
const SHOT = { animations: 'disabled' } as const;

/** The score sheet counts its numbers up over ~650ms; wait for two equal reads. */
async function settled(locator: Locator): Promise<void> {
	let previous = '';
	await expect
		.poll(
			async () => {
				const text = await locator.innerText();
				const stable = text === previous;
				previous = text;
				return stable;
			},
			{ timeout: 10_000 }
		)
		.toBe(true);
}

/** The slice of the room game state this spec reads and replays. */
interface Card {
	id: string;
	suit?: string;
	value?: number;
	isJoker?: boolean;
}
interface GameState {
	phase: string;
	currentPlayerIndex: number;
	revision: number;
	drawPile: Card[];
	discardPile: Card[];
	players: { hand: Card[] }[];
}

/**
 * Full page load, then wait for hydration — the E2E server is the Vite dev server,
 * so clicks before hydration are dropped. See tests/e2e/start-with-mongo.mjs.
 */
async function open(page: Page, urlPath: string) {
	await page.goto(urlPath);
	await page.waitForLoadState('networkidle');
}

/**
 * One full turn for the seat at `currentPlayerIndex`: draw from the stock (or the
 * discard pile when there is one), then discard. Applied server-side through the
 * room API so the screenshot run does not need a second browser for the opponent.
 */
function opponentTurn(state: GameState): GameState {
	let s = { ...state };
	if (s.phase === 'draw') {
		const fromDiscard = s.discardPile.length > 0;
		const drawn = fromDiscard ? s.discardPile[s.discardPile.length - 1] : s.drawPile.at(-1)!;
		s = {
			...s,
			players: s.players.map((p, i) =>
				i === s.currentPlayerIndex ? { ...p, hand: [...p.hand, drawn] } : p
			),
			...(fromDiscard
				? { discardPile: s.discardPile.slice(0, -1) }
				: { drawPile: s.drawPile.slice(0, -1) }),
			phase: 'discard'
		};
	}
	if (s.phase === 'discard') {
		const hand = s.players[s.currentPlayerIndex].hand;
		const card = hand[hand.length - 1];
		s = {
			...s,
			players: s.players.map((p, i) =>
				i === s.currentPlayerIndex ? { ...p, hand: p.hand.filter((c) => c.id !== card.id) } : p
			),
			discardPile: [...s.discardPile, card],
			phase: 'draw',
			currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length
		};
	}
	return s;
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
 * Starts the game and returns the host credentials the page used, read off its own
 * `action: 'start'` request (they live only in the page's stores).
 */
async function startGame(page: Page): Promise<Credentials> {
	const started = page.waitForRequest(
		(request) =>
			request.method() === 'PATCH' &&
			request.url().includes('/api/rooms/') &&
			request.postData()?.includes('"start"') === true
	);
	await page.getByRole('button', { name: 'Start Game' }).click();
	await expect(page.getByText('Your turn', { exact: true })).toBeVisible({ timeout: 10_000 });

	const credentials = JSON.parse((await started).postData() ?? '{}') as Credentials;
	expect(credentials.playerId).toBeTruthy();
	return credentials;
}

/**
 * Deals a closable 15-card hand to the host through the room API: `action: 'move'`
 * accepts any state for the player whose turn it is. Mirrors game.e2e.ts.
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

test.describe('Screenshots', () => {
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

	test.setTimeout(120_000);

	test('take screenshots of all key pages', async ({ context }) => {
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
		const page = await context.newPage();
		// Tall enough that no page needs stitching: a full-page capture taller than the
		// viewport leaves the last rows unpainted in dev mode.
		await page.setViewportSize({ width: 1280, height: 1000 });

		// ── 1. Home page ──
		await open(page, '/');
		await expect(page.getByRole('heading', { name: 'Draw. Meld. Outplay.' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Start game vs AI' })).toBeVisible();
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'home.png'),
			fullPage: true,
			...SHOT
		});

		// ── 2. Room lobby ──
		await page.getByLabel('Your name').fill('Alice');
		await page
			.getByRole('group', { name: 'Max players' })
			.getByRole('button', { name: '2', exact: true })
			.click();
		await page.getByRole('button', { name: 'Create room' }).click();
		await page.waitForURL(/\/room\//);
		const roomCode = page.url().split('/').pop()!;

		const joinRes = await page.request.patch(`/api/rooms/${roomCode}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		expect(joinRes.ok()).toBeTruthy();
		const joinData = (await joinRes.json()) as { playerId: string; sessionToken: string };

		await expect(page.getByText('Bob', { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Start Game' })).toBeEnabled();
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'lobby.png'),
			fullPage: true,
			...SHOT
		});

		// ── 3. Game board ──
		const credentials = await startGame(page);

		const hand = page.getByRole('region', { name: /Your hand/ });
		const stock = page.getByRole('button', { name: /Draw pile, \d+ cards remaining/ });

		// Play 2 rounds so the discard pile and the board look lived-in.
		for (let round = 0; round < 2; round++) {
			// Alice's turn, through the UI.
			await stock.click();
			await expect(hand.locator('button')).toHaveCount(15);
			await hand.locator('button:not([disabled])').first().click();
			await page.getByRole('button', { name: /^Discard(?! pile)/ }).click();

			// Bob's turn, through the room API (baseRevision gates the optimistic lock).
			const getRes = await page.request.get(`/api/rooms/${roomCode}`);
			const roomData = (await getRes.json()) as { gameState: GameState };
			expect(roomData.gameState.phase).toBe('draw');
			const moveRes = await page.request.put(`/api/rooms/${roomCode}`, {
				data: {
					playerId: joinData.playerId,
					sessionToken: joinData.sessionToken,
					baseRevision: roomData.gameState.revision,
					action: 'move',
					gameState: opponentTurn(roomData.gameState)
				}
			});
			expect(moveRes.ok()).toBeTruthy();

			// Wait for polling to sync Alice's page.
			await expect(page.getByText('Your turn', { exact: true })).toBeVisible({ timeout: 10_000 });
		}

		// Group the hand into real melds so the rack shows staged cards.
		await page.getByRole('button', { name: 'Organize' }).click();
		await expect(page.getByText(/\d+\s+cards staged/)).toBeVisible();

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'game-board.png'),
			fullPage: true,
			...SHOT
		});

		// ── 4. Round score sheet ──
		// A random deal is essentially never closable, so hand the host a hand that is
		// (see the mirrored helper in game.e2e.ts) and close it for real: the server
		// re-validates the declaration before it scores the round.
		await dealClosableHand(page, roomCode, credentials);
		await expect(hand.locator('button')).toHaveCount(15, { timeout: 10_000 });
		await page.getByRole('button', { name: 'Organize' }).click();
		await page.getByRole('button', { name: /^Close — discard/ }).click();

		const sheet = page.getByRole('status', { name: 'Round score sheet' });
		await expect(sheet).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole('heading', { name: 'Round 1 — Alice wins the round' })
		).toBeVisible();
		await settled(sheet);
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'score-sheet.png'),
			fullPage: true,
			...SHOT
		});
	});
});
