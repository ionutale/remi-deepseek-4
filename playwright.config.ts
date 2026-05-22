import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && node tests/e2e/start-with-mongo.mjs',
		port: 4173,
		timeout: 120_000,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	testMatch: '**/*.e2e.{ts,js}'
});
