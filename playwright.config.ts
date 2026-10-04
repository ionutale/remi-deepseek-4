import { defineConfig } from '@playwright/test';

/**
 * The E2E server (see `webServer` below) serves the app on this port and the
 * specs reach it through `baseURL`. `start-with-mongo.mjs` derives the same port
 * (and the app's allowed `Origin`) from it, so the two must stay in step.
 *
 * The default is deliberately NOT 5173 (`vite dev`) or 4173 (`vite preview`):
 * other projects on this machine tend to sit on those, and Playwright refuses to
 * start when the port is already taken. Override with `E2E_PORT=<free port>`.
 */
const PORT = Number(process.env.E2E_PORT ?? 4180);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	// One worker: the specs share a single in-memory MongoDB and the app rate-limits
	// per IP (see src/hooks.server.ts), so parallel workers would fight over both.
	workers: 1,
	fullyParallel: false,
	// The rate limit is 120 requests / 60s per IP and a dev-server page load alone is
	// ~80 requests, so the specs pace their document loads instead (see the pacer at
	// the top of each spec). One retry rides out a straggler.
	retries: 1,
	use: {
		baseURL: BASE_URL
	},
	webServer: {
		command: 'node tests/e2e/start-with-mongo.mjs',
		port: PORT,
		timeout: 120_000,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	testMatch: '**/*.e2e.{ts,js}'
});
