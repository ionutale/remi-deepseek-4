import { writable, derived } from 'svelte/store';
import type { GameState } from '$lib/engine/types';
import type { Room } from '$lib/server/roomService';

export const room = writable<Room | null>(null);
export const playerId = writable<string>('');
export const playerName = writable<string>('');

export const currentGameState = derived(room, ($room) => $room?.gameState ?? null);
export const roomStatus = derived(room, ($room) => $room?.status ?? 'waiting');
export const players = derived(room, ($room) => $room?.players ?? []);

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling(code: string) {
	stopPolling();
	pollTimer = setInterval(async () => {
		try {
			const pid = getPlayerIdValue();
			const res = await fetch(`/api/rooms/${code}${pid ? `?playerId=${pid}` : ''}`);
			if (res.ok) {
				const data = await res.json();
				room.set(data);
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

export async function joinRoom(code: string, name: string): Promise<{ room?: Room; playerId?: string; error?: string }> {
	const res = await fetch(`/api/rooms/${code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'join', playerName: name })
	});
	const data = await res.json();
	if (data.playerId) {
		playerId.set(data.playerId);
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
		playerName.set(name);
		room.set(data);
		startPolling(data.code);
	}
	return data;
}

export async function startGame() {
	const $room = getRoomValue();
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'start', playerId: getPlayerIdValue() })
	});
	if (!res.ok) console.error('Failed to start game:', await res.text());
}

export async function restartGame() {
	const $room = getRoomValue();
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'restart', playerId: getPlayerIdValue() })
	});
	if (!res.ok) console.error('Failed to restart game:', await res.text());
}

export async function closeRoomAction() {
	const $room = getRoomValue();
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'close', playerId: getPlayerIdValue() })
	});
	if (!res.ok) {
		console.error('Failed to close room:', await res.text());
		return;
	}
	stopPolling();
	room.set(null);
}

export async function sendGameState(state: GameState) {
	const $room = getRoomValue();
	if (!$room) return;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ playerId: getPlayerIdValue(), gameState: state })
	});
	if (res.ok) {
		room.update((r) => (r ? { ...r, gameState: state } : r));
	}
}

let roomVal: Room | null = null;
let playerIdVal = '';

room.subscribe((v) => {
	roomVal = v;
});
playerId.subscribe((v) => {
	playerIdVal = v;
});

function getRoomValue() {
	return roomVal;
}
function getPlayerIdValue() {
	return playerIdVal;
}

export function reset() {
	stopPolling();
	room.set(null);
	playerId.set('');
	playerName.set('');
}
