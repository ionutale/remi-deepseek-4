import { nanoid } from 'nanoid';
import { sessionsCol } from './db';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export async function createSession(playerId: string): Promise<string> {
	const token = nanoid(20);
	const expiresAt = Date.now() + SESSION_TTL_MS;
	await sessionsCol().updateOne(
		{ playerId },
		{ $set: { playerId, token, expiresAt } },
		{ upsert: true }
	);
	return token;
}

export async function verifySession(playerId: string, token: string): Promise<boolean> {
	const entry = await sessionsCol().findOne({ playerId });
	if (!entry) return false;
	if (Date.now() > entry.expiresAt) {
		await sessionsCol().deleteOne({ playerId });
		return false;
	}
	return entry.token === token;
}

export async function destroySession(playerId: string): Promise<void> {
	await sessionsCol().deleteOne({ playerId });
}

export function sanitizeName(name: string): string {
	return name
		.replace(/<[^>]*>/g, '')
		.replace(/[<>]/g, '')
		.trim()
		.slice(0, 30);
}
