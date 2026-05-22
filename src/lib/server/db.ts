import { MongoClient, type Db, type Collection, type Document } from 'mongodb';
import { MONGODB_URL, MONGODB_DB } from '$env/static/private';

let client: MongoClient | undefined;
let db: Db | undefined;

interface SessionDoc {
	playerId: string;
	token: string;
	expiresAt: number;
}

interface RatingDoc {
	playerId: string;
	mmr: number;
}

interface QueueEntryDoc {
	playerId: string;
	playerName: string;
	mmr: number;
	joinedAt: number;
}

interface QueueDoc {
	_id: string;
	entries: QueueEntryDoc[];
}

interface ActiveMatchDoc {
	playerId: string;
	roomCode: string;
	player1Id: string;
	player2Id: string;
	player1Name: string;
	player2Name: string;
	createdAt: number;
}

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
	await ensureIndexes(db);
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

async function ensureIndexes(d: Db): Promise<void> {
	await d.collection('rooms').createIndex({ code: 1 }, { unique: true });
	await d.collection('ratings').createIndex({ playerId: 1 }, { unique: true });
	await d.collection('sessions').createIndex({ playerId: 1 }, { unique: true });
	await d.collection('activeMatches').createIndex({ playerId: 1 }, { unique: true });
}

export function roomsCol<T extends Document>(): Collection<T> {
	return getDB().collection<T>('rooms');
}
export function ratingsCol(): Collection<RatingDoc> {
	return getDB().collection<RatingDoc>('ratings');
}
export function sessionsCol(): Collection<SessionDoc> {
	return getDB().collection<SessionDoc>('sessions');
}
export function queueCol(): Collection<QueueDoc> {
	return getDB().collection<QueueDoc>('queue');
}
export function activeMatchesCol(): Collection<ActiveMatchDoc> {
	return getDB().collection<ActiveMatchDoc>('activeMatches');
}
