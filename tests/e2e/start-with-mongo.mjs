import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);

/** Vite's CLI entry point (`bin` is not an exported subpath). */
const viteBin = path.resolve(
	path.dirname(require.resolve('vite/package.json')),
	require('vite/package.json').bin.vite
);

async function main() {
	const mongod = await MongoMemoryServer.create({
		instance: { dbName: 'remi_test' }
	});
	const uri = mongod.getUri();
	process.env.MONGODB_URL = uri;
	process.env.MONGODB_DB = 'remi_test';
	const port = process.env.PORT || '4173';
	console.log(`[E2E] MongoDB started at ${uri}`);

	// The app is built with the Vercel adapter, so there is no node server bundle in
	// `build/` to run — E2E drives the Vite dev server instead (it compiles the
	// current sources on demand, so the specs always test the working tree).
	const server = spawn(
		process.execPath,
		[viteBin, 'dev', '--port', port, '--strictPort', '--host', '127.0.0.1'],
		{
			stdio: 'inherit',
			env: { ...process.env, PORT: port }
		}
	);

	server.on('exit', async (code) => {
		await mongod.stop();
		console.log('[E2E] MongoDB stopped');
		process.exit(code ?? 0);
	});

	process.on('SIGTERM', async () => {
		server.kill();
		await mongod.stop();
		process.exit(0);
	});
	process.on('SIGINT', async () => {
		server.kill();
		await mongod.stop();
		process.exit(0);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
