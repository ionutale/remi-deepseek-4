import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// #196: Forces Svelte 5 runes mode for all project files (not node_modules)
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	// #197: adapter-node for Node.js deployment; alternatives: adapter-static, adapter-vercel, adapter-netlify
	kit: { adapter: adapter() }
};

export default config;
