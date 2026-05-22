import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../static/screenshots');

function bobMove(gs: any): any {
	let s = { ...gs };
	if (s.phase === 'draw') {
		const drawn = s.drawPile[s.drawPile.length - 1];
		s = {
			...s,
			players: s.players.map((p: any, i: number) =>
				i === s.currentPlayerIndex ? { ...p, hand: [...p.hand, drawn] } : p
			),
			drawPile: s.drawPile.slice(0, -1),
			phase: 'discard'
		};
	}
	if (s.phase === 'discard') {
		const hand = s.players[s.currentPlayerIndex].hand;
		const card = hand[hand.length - 1];
		s = {
			...s,
			players: s.players.map((p: any, i: number) =>
				i === s.currentPlayerIndex
					? { ...p, hand: p.hand.filter((c: any) => c.id !== card.id) }
					: p
			),
			discardPile: [...s.discardPile, card],
			phase: 'draw',
			currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
			turnStartedAt: Date.now()
		};
	}
	return s;
}

test.describe('Screenshots', () => {
	test.setTimeout(120_000);

	test('take screenshots of all key pages', async ({ context }) => {
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
		const page = await context.newPage();
		await page.setViewportSize({ width: 1280, height: 800 });

		// ── 1. Home page ──
		await page.goto('/');
		await expect(page.getByText('Remi')).toBeVisible();
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'home.png'),
			fullPage: true
		});

		// ── 2. Room lobby ──
		await page.fill('input[placeholder="Player"]', 'Alice');
		await page.locator('.join button:has-text("2")').click();
		await page.click('button:has-text("Create Room")');
		await page.waitForURL(/\/room\//);
		const roomCode = page.url().split('/').pop()!;

		const joinRes = await page.request.patch(`/api/rooms/${roomCode}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		const joinData: any = await joinRes.json();

		await expect(page.getByText('Bob')).toBeVisible();
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'lobby.png'),
			fullPage: true
		});

		// ── 3. Game board ──
		await page.click('button:has-text("Start Game")');
		await expect(page.getByText('Your turn')).toBeVisible({ timeout: 10000 });

		// Play 2 rounds so the game board looks lived-in
		for (let round = 0; round < 2; round++) {
			// Alice's turn
			await page.getByLabel(/Draw pile,/).click();
			await page.waitForTimeout(200);
			await page.locator('[aria-label*="Your hand"] button:not([disabled])').first().click();
			await page.getByText(/Discard (✓|a card)/).click();
			await page.waitForTimeout(500);

			// Bob's turn via API
			const getRes = await page.request.get(`/api/rooms/${roomCode}`);
			const roomData: any = await getRes.json();
			if (roomData.gameState && roomData.gameState.phase !== 'finished') {
				const newState = bobMove(roomData.gameState);
				await page.request.put(`/api/rooms/${roomCode}`, {
					data: {
						playerId: joinData.playerId,
						sessionToken: joinData.sessionToken,
						gameState: newState
					}
				});
			}
			// Wait for polling to sync Alice's page
			await expect(page.getByText('Your turn')).toBeVisible({ timeout: 10000 });
		}

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'game-board.png'),
			fullPage: true
		});

		// ── 4. Game over ──
		const finalRes = await page.request.get(`/api/rooms/${roomCode}`);
		const finalData: any = await finalRes.json();
		if (finalData.gameState) {
			await page.request.put(`/api/rooms/${roomCode}`, {
				data: {
					playerId: joinData.playerId,
					sessionToken: joinData.sessionToken,
					gameState: { ...finalData.gameState, phase: 'finished', winner: 0 }
				}
			});
		}
		await expect(page.getByText('Game Over')).toBeVisible({ timeout: 10000 });
		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'game-over.png'),
			fullPage: true
		});
	});
});
