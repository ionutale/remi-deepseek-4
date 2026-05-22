import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import process from 'node:process';

async function main() {
	const mongod = await MongoMemoryServer.create({
		instance: { dbName: 'remi_test' }
	});
	const uri = mongod.getUri();
	process.env.MONGODB_URL = uri;
	process.env.MONGODB_DB = 'remi_test';
	const port = process.env.PORT || '4173';
	console.log(`[E2E] MongoDB started at ${uri}`);

	const server = spawn('node', ['build/index.js'], {
		stdio: 'inherit',
		env: { ...process.env, PORT: port }
	});

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
