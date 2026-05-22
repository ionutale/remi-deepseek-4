import { writable, get } from 'svelte/store';
import { playerId as roomPlayerId, sessionToken } from './roomStore';

export const matchStatus = writable<'idle' | 'queued' | 'matched'>('idle');
export const matchRoomCode = writable<string | null>(null);
export const matchQueueSize = writable(0);
export const matchMMR = writable(1000);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentPlayerId = '';
let currentSessionToken = '';

export function getCurrentPlayerId(): string {
	return currentPlayerId;
}

export async function quickJoin(name: string): Promise<string | null> {
	matchStatus.set('queued');

	const res = await fetch('/api/matchmaking', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'join', playerName: name })
	});
	const data = await res.json();

	if (data.playerId) {
		currentPlayerId = data.playerId;
		if (data.sessionToken) currentSessionToken = data.sessionToken;
	}

	if (data.mmr != null) matchMMR.set(data.mmr);

	if (data.status === 'matched') {
		matchStatus.set('matched');
		matchRoomCode.set(data.roomCode);
		roomPlayerId.set(data.playerId);
		sessionToken.set(data.sessionToken);
		return data.roomCode;
	}

	if (data.queueSize != null) matchQueueSize.set(data.queueSize);
	startPolling();
	return null;
}

export function startPolling(): void {
	stopPolling();
	pollTimer = setInterval(async () => {
		try {
			const res = await fetch(`/api/matchmaking?playerId=${currentPlayerId}`);
			if (res.ok) {
				const data = await res.json();
				if (data.mmr != null) matchMMR.set(data.mmr);
				if (data.status === 'matched') {
					matchStatus.set('matched');
					matchRoomCode.set(data.roomCode);
					roomPlayerId.set(currentPlayerId);
					sessionToken.set(currentSessionToken);
					stopPolling();
				}
				if (data.queueSize != null) matchQueueSize.set(data.queueSize);
			}
		} catch {
			/* ignore */
		}
	}, 2000);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

export async function leaveQueue(): Promise<void> {
	stopPolling();
	const res = await fetch('/api/matchmaking', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'leave', playerId: currentPlayerId, sessionToken: currentSessionToken })
	});
	if (!res.ok) return;
	matchStatus.set('idle');
	matchRoomCode.set(null);
	matchQueueSize.set(0);
}

export async function recordResult(
	roomCode: string
): Promise<{ winnerMMR: number; loserMMR: number } | null> {
	const res = await fetch('/api/matchmaking/result', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ roomCode, playerId: get(roomPlayerId), sessionToken: get(sessionToken) })
	});
	if (res.ok) return res.json();
	return null;
}
