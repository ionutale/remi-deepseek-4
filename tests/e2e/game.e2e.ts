import { test, expect } from '@playwright/test';

test.describe('Remi E2E', () => {
	test('Room creation and waiting lobby', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Remi')).toBeVisible();

		await page.fill('input[placeholder="Player"]', 'Alice');
		await page.locator('.join button:has-text("2")').click();
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
		await page.locator('.join button:has-text("2")').click();
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

	test('Full 2-player match with alternating turns', async ({ context }) => {
		test.setTimeout(120_000);
		const bobPage = await context.newPage();
		const alicePage = await context.newPage();

		// Alice creates 2-player room
		await alicePage.goto('/');
		await alicePage.fill('input[placeholder="Player"]', 'Alice');
		await alicePage.locator('.join button:has-text("2")').click();
		await alicePage.click('button:has-text("Create Room")');
		await alicePage.waitForURL(/\/room\//);
		const roomCode = alicePage.url().split('/').pop()!;

		// Bob joins via home page
		await bobPage.goto('/');
		await bobPage.fill('input[placeholder="Player"]', 'Bob');
		await bobPage.fill('input[placeholder="ABC123"]', roomCode);
		await bobPage.click('button:has-text("Join Room")');
		await bobPage.waitForURL(/\/room\//);

		// Both see Bob in player list
		await expect(alicePage.getByText('Bob')).toBeVisible();
		await expect(bobPage.getByText('Alice')).toBeVisible();

		// Alice starts game
		await alicePage.click('button:has-text("Start Game")');
		await expect(alicePage.getByText('Your turn')).toBeVisible({ timeout: 10000 });

		const MAX_ROUNDS = 12;

		async function playTurn(page: typeof alicePage) {
			const closeBtn = page.getByText('Close Game');
			if (await closeBtn.isVisible()) {
				await closeBtn.click();
				return 'closed';
			}
			if (await page.getByLabel(/Draw pile,/).isVisible()) {
				await page.getByLabel(/Draw pile,/).click();
			}
			await page.locator('[aria-label*="Your hand"] button:not([disabled])').first().click();
			await page.getByText(/Discard (✓|a card)/).click();
			return 'played';
		}

		let rounds = 0;
		while (rounds < MAX_ROUNDS) {
			// Alice's turn
			const aliceResult = await playTurn(alicePage);
			if (aliceResult === 'closed') break;
			// Wait for polling: Alice loses "Your turn", Bob gains it
			await expect(alicePage.getByText('Your turn')).not.toBeVisible({ timeout: 5000 });
			await expect(bobPage.getByText('Your turn')).toBeVisible({ timeout: 10000 });

			// Bob's turn
			const bobResult = await playTurn(bobPage);
			if (bobResult === 'closed') break;
			await expect(bobPage.getByText('Your turn')).not.toBeVisible({ timeout: 5000 });
			await expect(alicePage.getByText('Your turn')).toBeVisible({ timeout: 10000 });

			rounds++;
		}

		// Verify game state after match
		const roomRes = await alicePage.request.get(`/api/rooms/${roomCode}`);
		const { gameState: gs } = await roomRes.json();
		expect(gs).toBeTruthy();
		expect(rounds).toBeGreaterThanOrEqual(2);
	});
});
