import { writable, derived, get } from 'svelte/store';
import type { GameState, PatternType } from '$lib/engine/remi/types';
import type { Room } from '$lib/server/roomService';

/**
 * Frozen multiplayer intent contract (Remi Etalat task W4b). The server never
 * trusts client state: the client sends an intent + baseRevision, the server
 * applies the matching engine action to the stored state.
 */
export type RemiIntent =
	| { kind: 'duble-offer'; pieceId: string }
	| { kind: 'duble-withdraw' }
	| { kind: 'duble-resolve' }
	| { kind: 'strica' }
	| { kind: 'atu-announce' }
	| { kind: 'start-playing' }
	| { kind: 'next-game' }
	| { kind: 'opening-discard'; pieceId: string }
	| { kind: 'draw-stock' }
	| { kind: 'take-last' }
	| { kind: 'take-atu' }
	| { kind: 'break-sir'; pieceId: string }
	| { kind: 'meld'; formations: { type: 'suite' | 'terta'; pieceIds: string[] }[] }
	| { kind: 'lipi'; meldId: string; pieceId: string }
	| {
			kind: 'swap-joker';
			meldId: string;
			jokerPieceId: string;
			replacementPieceId: string;
	  }
	| { kind: 'discard'; pieceId: string }
	| { kind: 'close'; pieceId: string }
	| { kind: 'declare-pe-tabla'; pattern: PatternType }
	| { kind: 'pe-tabla-close'; pieceId: string };

export const remiRoom = writable<Room | null>(null);
export const remiPlayerId = writable<string>('');
export const remiError = writable<string | null>(null);
/** Set when the 2s poll fails; the room page surfaces "Reconnecting…" via its notice. */
export const remiConnectionLost = writable<boolean>(false);

export const remiGameState = derived(remiRoom, ($room) => $room?.gameState ?? null);
export const remiStatus = derived(remiRoom, ($room) => $room?.status ?? null);
export const remiPlayers = derived(remiRoom, ($room) => $room?.players ?? []);

const remiSessionToken = writable<string>('');
const remiPlayerName = writable<string>('');

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCode: string | null = null;

async function pollOnce(): Promise<void> {
	if (!pollCode) return;
	try {
		const pid = get(remiPlayerId);
		const res = await fetch(`/api/rooms/${pollCode}${pid ? `?playerId=${pid}` : ''}`);
		if (res.ok) {
			remiConnectionLost.set(false);
			const data = (await res.json()) as Room;
			const local = get(remiRoom);
			const serverState = data?.gameState as GameState | null;
			const localState = local?.gameState as GameState | null;
			if (localState && serverState && serverState.revision < localState.revision) {
				// Local state is strictly newer; keep it, but pick up lobby/player updates.
				remiRoom.set({ ...data, gameState: localState });
			} else {
				// Server wins on equal revision too: it is authoritative.
				remiRoom.set(data);
			}
		} else {
			remiConnectionLost.set(true);
		}
	} catch (e) {
		remiConnectionLost.set(true);
		console.error('Remi room polling failed:', e);
	}
}

export function startRemiPolling(code: string): void {
	stopRemiPolling();
	pollCode = code;
	pollTimer = setInterval(pollOnce, 2000);
}

export function stopRemiPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	pollCode = null;
}

export async function joinRemiRoom(
	code: string,
	name: string
): Promise<{ room?: Room; playerId?: string; sessionToken?: string; error?: string }> {
	remiError.set(null);
	const res = await fetch(`/api/rooms/${code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'join', playerName: name })
	});
	const data = await res.json();
	if (!res.ok) {
		const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
		remiError.set(message);
		return { error: message };
	}
	if (data.playerId) {
		remiPlayerId.set(data.playerId);
		if (data.sessionToken) remiSessionToken.set(data.sessionToken);
		remiPlayerName.set(name);
		if (data.room) remiRoom.set(data.room as Room);
		startRemiPolling(code.toUpperCase());
	}
	return data;
}

export async function createRemiRoom(name: string, maxPlayers: number = 4) {
	remiError.set(null);
	const res = await fetch('/api/rooms', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ownerName: name, maxPlayers })
	});
	const data = await res.json();
	if (!res.ok) {
		const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
		remiError.set(message);
		return data;
	}
	if (data.code) {
		remiPlayerId.set(data.ownerId ?? data.players?.[0]?.id ?? '');
		if (data.sessionToken) remiSessionToken.set(data.sessionToken);
		remiPlayerName.set(name);
		remiRoom.set(data);
		startRemiPolling(data.code);
	}
	return data;
}

export async function startRemiGame(): Promise<void> {
	const $room = get(remiRoom);
	if (!$room) return;
	remiError.set(null);
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'start',
			playerId: get(remiPlayerId),
			sessionToken: get(remiSessionToken)
		})
	});
	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		try {
			const body = await res.json();
			if (typeof body?.error === 'string') message = body.error;
		} catch {
			// Non-JSON error body: keep the status fallback.
		}
		remiError.set(message);
		console.error('Failed to start remi game:', message);
	}
}

export async function leaveRemiRoom(): Promise<void> {
	const $room = get(remiRoom);
	if ($room) {
		try {
			await fetch(`/api/rooms/${$room.code}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'close',
					playerId: get(remiPlayerId),
					sessionToken: get(remiSessionToken)
				})
			});
		} catch (e) {
			console.error('Failed to leave remi room:', e);
		}
	}
	stopRemiPolling();
	remiRoom.set(null);
}

/**
 * Sends one intent to the server. The server applies the matching engine
 * action to the STORED state and returns the authoritative gameState, which
 * is adopted immediately (the 2s poll converges anything else).
 */
export async function sendRemiIntent(
	intent: RemiIntent
): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
	const $room = get(remiRoom);
	if (!$room) return { ok: false, error: 'No room loaded' };
	const local = $room.gameState as GameState | null;
	const res = await fetch(`/api/rooms/${$room.code}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			playerId: get(remiPlayerId),
			sessionToken: get(remiSessionToken),
			baseRevision: local?.revision ?? -1,
			intent
		})
	});
	let body: { gameState?: GameState; error?: string } | null = null;
	try {
		body = (await res.json()) as { gameState?: GameState; error?: string };
	} catch {
		// Non-JSON body: fall through to the status-based handling.
	}
	if (res.status === 409) {
		// Revision mismatch (or a stale-state reset): adopt the server state.
		if (body?.gameState) {
			remiRoom.update((r) => (r ? { ...r, gameState: body.gameState as GameState } : r));
		} else {
			try {
				const pid = get(remiPlayerId);
				const refetch = await fetch(`/api/rooms/${$room.code}${pid ? `?playerId=${pid}` : ''}`);
				if (refetch.ok) remiRoom.set(await refetch.json());
			} catch (e) {
				console.error('Failed to re-fetch remi room after conflict:', e);
			}
		}
		const message = typeof body?.error === 'string' ? body.error : 'Revision mismatch';
		return { ok: false, conflict: true, error: message };
	}
	if (!res.ok) {
		const message = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`;
		console.error('Failed to send remi intent:', message);
		return { ok: false, error: message };
	}
	if (body?.gameState) {
		remiRoom.update((r) => (r ? { ...r, gameState: body.gameState as GameState } : r));
	}
	return { ok: true };
}

export async function nextRemiGame(): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
	return sendRemiIntent({ kind: 'next-game' });
}

export function resetRemi(): void {
	stopRemiPolling();
	remiRoom.set(null);
	remiPlayerId.set('');
	remiSessionToken.set('');
	remiPlayerName.set('');
	remiError.set(null);
	remiConnectionLost.set(false);
}
