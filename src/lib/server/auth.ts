import { nanoid } from 'nanoid';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface SessionEntry {
	token: string;
	expiresAt: number;
}

const sessions = new Map<string, SessionEntry>();

export function createSession(playerId: string): string {
	const token = nanoid(20);
	sessions.set(playerId, { token, expiresAt: Date.now() + SESSION_TTL_MS });
	return token;
}

export function verifySession(playerId: string, token: string): boolean {
	const entry = sessions.get(playerId);
	if (!entry) return false;
	if (Date.now() > entry.expiresAt) {
		sessions.delete(playerId);
		return false;
	}
	return entry.token === token;
}

export function destroySession(playerId: string): void {
	sessions.delete(playerId);
}

export function sanitizeName(name: string): string {
	return name
		.replace(/<[^>]*>/g, '')
		.replace(/[<>]/g, '')
		.trim()
		.slice(0, 30);
}
