import { writable, derived, get } from 'svelte/store';
import type { GameState, CloseDeclaration } from '$lib/engine/types';
import { nextRound } from '$lib/engine/game';
import type { Room } from '$lib/server/roomService';

export const room = writable<Room | null>(null);
export const playerId = writable<string>('');
export const sessionToken = writable<string>('');
export const playerName = writable<string>('');

export const currentGameState = derived(room, ($room) => $room?.gameState ?? null);
export const roomStatus = derived(room, ($room) => $room?.status ?? null);
export const players = derived(room, ($room) => $room?.players ?? []);

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling(code: string) {
	stopPolling();
	pollTimer = setInterval(async () => {
		try {
			const pid = get(playerId);
			const res = await fetch(`/api/rooms/${code}${pid ? `?playerId=${pid}` : ''}`);
			if (res.ok) {
				const data = await res.json();
				const local = get(room);
				if (
					local?.gameState &&
					data?.gameState &&
					data.gameState.revision <= local.gameState.revision
				) {
					// Local state is newer or equal; keep it, but pick up lobby/player updates.
					room.set({ ...data, gameState: local.gameState });
				} else {
					// Server wins when its revision is greater.
					room.set(data);
				}
			}
		} catch (e) {
			console.error('Room polling failed:', e);
		}
	}, 2000);
}

export function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

export async function joinRoom(
	code: string,
	name: string
): Promise<{ room?: Room; playerId?: string; sessionToken?: string; error?: string }> {
	const res = await fetch(`/api/rooms/${code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'join', playerName: name })
	});
	const data = await res.json();
	if (data.playerId) {
		playerId.set(data.playerId);
		if (data.sessionToken) sessionToken.set(data.sessionToken);
		playerName.set(name);
		startPolling(code);
	}
	return data;
}

export async function createRoom(name: string, maxPlayers: number = 4) {
	const res = await fetch('/api/rooms', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ownerName: name, maxPlayers })
	});
	const data = await res.json();
	if (data.code) {
		playerId.set(data.ownerId);
		if (data.sessionToken) sessionToken.set(data.sessionToken);
		playerName.set(name);
		room.set(data);
		startPolling(data.code);
	}
	return data;
}

export async function startGame() {
	const $room = get(room);
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'start',
			playerId: get(playerId),
			sessionToken: get(sessionToken)
		})
	});
	if (!res.ok) console.error('Failed to start game:', await res.text());
}

export async function restartGame() {
	const $room = get(room);
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'restart',
			playerId: get(playerId),
			sessionToken: get(sessionToken)
		})
	});
	if (!res.ok) console.error('Failed to restart game:', await res.text());
}

export async function closeRoomAction() {
	const $room = get(room);
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'close',
			playerId: get(playerId),
			sessionToken: get(sessionToken)
		})
	});
	if (!res.ok) {
		console.error('Failed to close room:', await res.text());
		return;
	}
	stopPolling();
	room.set(null);
}

export async function sendGameState(
	state: GameState,
	action: 'move' | 'close' | 'next-round' = 'move',
	declaration?: CloseDeclaration
): Promise<{ conflict: boolean; ok: boolean }> {
	const $room = get(room);
	if (!$room) return { conflict: false, ok: false };
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			playerId: get(playerId),
			sessionToken: get(sessionToken),
			baseRevision: state.revision - 1,
			action,
			gameState: state,
			declaration
		})
	});
	if (res.status === 409) {
		try {
			const pid = get(playerId);
			const refetch = await fetch(`/api/rooms/${$room.code}${pid ? `?playerId=${pid}` : ''}`);
			if (refetch.ok) {
				const data = await refetch.json();
				room.set(data);
			}
		} catch (e) {
			console.error('Failed to re-fetch room after conflict:', e);
		}
		return { conflict: true, ok: false };
	}
	if (!res.ok) {
		console.error('Failed to send game state:', await res.text());
		return { conflict: false, ok: false };
	}
	room.update((r) => (r ? { ...r, gameState: state } : r));
	return { conflict: false, ok: true };
}

export async function nextRoundAction(): Promise<void> {
	const $room = get(room);
	const state = $room?.gameState;
	if (!state) return;
	if (state.phase !== 'round-over') return;
	try {
		const newState = nextRound(state);
		await sendGameState(newState, 'next-round');
	} catch (e) {
		console.error('Failed to start next round:', e);
	}
}

export function reset() {
	stopPolling();
	room.set(null);
	playerId.set('');
	sessionToken.set('');
	playerName.set('');
}
