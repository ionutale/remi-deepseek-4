import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// #199: requireAssertions ensures every test has at least one assertion
		expect: { requireAssertions: true },
		// #200: Two test projects — client (browser/Svelte components) and server (Node).
		// If tests/engine tests fail to resolve SvelteKit aliases, add `resolve: { conditions: ['browser'] }`
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					// #198: No Svelte component tests exist yet; enable when needed
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
