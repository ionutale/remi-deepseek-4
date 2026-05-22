import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;

export async function setup() {
	mongod = await MongoMemoryServer.create({
		instance: { dbName: 'remi_test' }
	});
	const uri = mongod.getUri();
	process.env.MONGODB_URL = uri;
	process.env.MONGODB_DB = 'remi_test';
	console.log(`[E2E] MongoDB started at ${uri}`);
}

export async function teardown() {
	if (mongod) {
		await mongod.stop();
		console.log('[E2E] MongoDB stopped');
	}
}
