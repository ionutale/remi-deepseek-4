import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// #196: Forces Svelte 5 runes mode for all project files (not node_modules)
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: { adapter: adapter({ runtime: 'nodejs22.x' }) }
};

export default config;
