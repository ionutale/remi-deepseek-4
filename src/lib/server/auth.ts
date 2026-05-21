import { nanoid } from 'nanoid';

const sessions = new Map<string, string>();

export function createSession(playerId: string): string {
	const token = nanoid(20);
	sessions.set(playerId, token);
	return token;
}

export function verifySession(playerId: string, token: string): boolean {
	const stored = sessions.get(playerId);
	if (!stored) return false;
	return stored === token;
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
