import { defineConfig } from '@playwright/test';

export default defineConfig({
	// One worker: the specs share a single in-memory MongoDB and the app rate-limits
	// per IP (see src/hooks.server.ts), so parallel workers would fight over both.
	workers: 1,
	fullyParallel: false,
	// The rate limit is 120 requests / 60s per IP and a dev-server page load alone is
	// ~70 requests, so a two-page test can tip the window into a 429 (which the room
	// stores surface as a silently stuck screen). One retry rides that out.
	retries: 1,
	webServer: {
		command: 'node tests/e2e/start-with-mongo.mjs',
		port: 4173,
		timeout: 120_000,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	testMatch: '**/*.e2e.{ts,js}'
});
