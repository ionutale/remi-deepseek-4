import { MongoClient, type Db } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL!;
const MONGODB_DB = process.env.MONGODB_DB!;

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
	if (db) return db;
	client = new MongoClient(MONGODB_URL);
	await client.connect();
	db = client.db(MONGODB_DB);
	return db;
}

export function getDB(): Db {
	if (!db) throw new Error('DB not connected. Call connectDB() first.');
	return db;
}
