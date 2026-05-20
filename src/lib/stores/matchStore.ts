import { writable } from 'svelte/store';
import { playerId as roomPlayerId } from './roomStore';

export const matchStatus = writable<'idle' | 'queued' | 'matched'>('idle');
export const matchRoomCode = writable<string | null>(null);
export const matchQueueSize = writable(0);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentPlayerId = '';

export function getCurrentPlayerId(): string {
	return currentPlayerId;
}

export async function quickJoin(name: string): Promise<string | null> {
	matchStatus.set('queued');
	const pid = crypto.randomUUID();
	currentPlayerId = pid;

	const res = await fetch('/api/matchmaking', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'join', playerId: pid, playerName: name })
	});
	const data = await res.json();

	if (data.status === 'matched') {
		matchStatus.set('matched');
		matchRoomCode.set(data.roomCode);
		roomPlayerId.set(pid);
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
				if (data.status === 'matched') {
					matchStatus.set('matched');
					matchRoomCode.set(data.roomCode);
					roomPlayerId.set(currentPlayerId);
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
	await fetch('/api/matchmaking', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'leave', playerId: currentPlayerId })
	});
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
		body: JSON.stringify({ roomCode })
	});
	if (res.ok) return res.json();
	return null;
}
