import { MongoClient, type Db } from 'mongodb';
import { MONGODB_URL, MONGODB_DB } from '$env/static/private';

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connectDB(): Promise<Db> {
	if (!MONGODB_URL) throw new Error('MONGODB_URL not set in .env');
	if (!MONGODB_DB) throw new Error('MONGODB_DB not set in .env');
	if (db) {
		try {
			await db.admin().ping();
			return db;
		} catch {
			client?.close();
			client = undefined;
			db = undefined;
		}
	}
	client = new MongoClient(MONGODB_URL, {
		maxPoolSize: 10,
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000,
		retryWrites: true
	});
	await client.connect();
	db = client.db(MONGODB_DB);
	return db;
}

export function getDB(): Db {
	if (!db) throw new Error('DB not connected. Call connectDB() first.');
	return db;
}

export async function disconnectDB(): Promise<void> {
	if (!client) return;
	await client.close();
	client = undefined;
	db = undefined;
}
