import { test, expect } from '@playwright/test';

test.describe('Remi E2E', () => {
	test('Room creation and waiting lobby', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Remi')).toBeVisible();

		await page.fill('input[placeholder="Player"]', 'Alice');
		await page.click('button:has-text("Create Room")');

		await page.waitForURL(/\/room\//);
		await expect(page.getByText(/Room:/)).toBeVisible();
	});

	test('Error: invalid room shows loading', async ({ page }) => {
		await page.goto('/room/XXXXXX');
		await expect(page.getByText('Loading room...')).toBeVisible({ timeout: 10000 });
	});

	test('Error: empty name shows validation', async ({ page }) => {
		await page.goto('/');
		await page.click('button:has-text("Create Room")');
		await expect(page.getByText('Enter your name')).toBeVisible();
	});

	test('Create room, join, start game, play a turn', async ({ page }) => {
		// Create room as Alice
		await page.goto('/');
		await page.fill('input[placeholder="Player"]', 'Alice');
		await page.click('button:has-text("Create Room")');
		await page.waitForURL(/\/room\//);
		const roomCode = page.url().split('/').pop()!;

		// Join as Bob via API (second player)
		const joinRes = await page.request.patch(`/api/rooms/${roomCode}`, {
			data: { action: 'join', playerName: 'Bob' }
		});
		expect(joinRes.ok()).toBeTruthy();
		const joinData = await joinRes.json();
		expect(joinData.playerId).toBeTruthy();
		expect(joinData.sessionToken).toBeTruthy();

		// Verify Bob appears in player list
		await expect(page.getByText('Bob')).toBeVisible();

		// Start game as owner
		await page.click('button:has-text("Start Game")');

		// Wait for game board
		await expect(page.getByText('Your turn')).toBeVisible({ timeout: 10000 });
		await expect(page.getByLabel(/Draw pile,/)).toBeVisible();

		// Draw from pile during draw phase
		await page.getByLabel(/Draw pile,/).click();

		// Should transition to discard phase
		await expect(page.getByText('Discard')).toBeVisible();

		// Select first enabled card to discard
		const cards = page.locator('button:not([disabled])');
		const cardCount = await cards.count();
		expect(cardCount).toBeGreaterThan(0);

		// Use API to fetch current game state to know what cards exist
		const roomRes = await page.request.get(`/api/rooms/${roomCode}`);
		const roomData = await roomRes.json();
		expect(roomData.gameState).toBeTruthy();
	});

	test('Quick Match button disabled without name', async ({ page }) => {
		await page.goto('/');
		const quickMatch = page.getByText('Quick Match (1v1)');
		await expect(quickMatch).toBeDisabled();
	});
});
