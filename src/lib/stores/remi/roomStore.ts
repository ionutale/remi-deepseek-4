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

/**
 * The seat (`playerId` + `sessionToken`) is only held in memory, so a refresh,
 * an HMR update or a deep link would otherwise lose it and a running room
 * rejects a second join. The credentials are mirrored to `sessionStorage` (per
 * tab) and reclaimed through `hydrateRemiRoom`.
 */
const SESSION_STORAGE_KEY = 'remi-etalat.session';

export type RemiStoredSession = { playerId: string; sessionToken: string; code: string };

/** `sessionStorage` is browser-only and can throw in private mode — always guard. */
function readStoredSession(): RemiStoredSession | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<RemiStoredSession>;
		if (typeof parsed.playerId !== 'string' || !parsed.playerId) return null;
		if (typeof parsed.code !== 'string' || !parsed.code) return null;
		return {
			playerId: parsed.playerId,
			sessionToken: typeof parsed.sessionToken === 'string' ? parsed.sessionToken : '',
			code: parsed.code.toUpperCase()
		};
	} catch {
		return null;
	}
}

function writeStoredSession(session: RemiStoredSession | null): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		if (session) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
		else sessionStorage.removeItem(SESSION_STORAGE_KEY);
	} catch {
		/* storage unavailable: the in-memory session keeps working */
	}
}

/** Mirror the credentials currently held in memory under `code`. */
function persistSession(code: string): void {
	const playerId = get(remiPlayerId);
	const sessionToken = get(remiSessionToken);
	if (!playerId || !code) return;
	writeStoredSession({ playerId, sessionToken, code: code.toUpperCase() });
}

/** The seat this tab may reclaim, or `null` when there is none. */
export function getStoredRemiSession(): RemiStoredSession | null {
	return readStoredSession();
}

/** Drop the persisted seat — only on an explicit leave or a vanished room. */
export function forgetRemiSession(): void {
	writeStoredSession(null);
}

// Restore the credentials at module load so intents can be sent as soon as the
// room is back; `remiRoom` itself is filled by `hydrateRemiRoom` (SSR: no-op).
const restoredRemiSession = readStoredSession();
if (restoredRemiSession) {
	remiPlayerId.set(restoredRemiSession.playerId);
	remiSessionToken.set(restoredRemiSession.sessionToken);
}

/**
 * Session accessors for consumers that must send the *joined room's*
 * credentials but sit outside this module (e.g. `matchStore.recordResult`).
 */
export function getRemiSessionToken(): string {
	return get(remiSessionToken);
}

/**
 * Adopt a session minted elsewhere (matchmaking) as this client's room session.
 * `code` is optional; without it the last stored room code is kept.
 */
export function setRemiSession(playerId: string, sessionToken: string, code?: string): void {
	remiPlayerId.set(playerId);
	remiSessionToken.set(sessionToken);
	const target = (code ?? readStoredSession()?.code ?? '').toUpperCase();
	if (target) writeStoredSession({ playerId, sessionToken, code: target });
}

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

/**
 * Reclaims the seat held in `sessionStorage` for `code` without a join: fetch
 * the room once (the `playerId` query keeps the seat pinged), adopt it and keep
 * polling. Called on mount by the room page after a refresh/HMR/deep link or a
 * quick-match navigation, all of which land here with an empty store.
 *
 * Failures stay graceful: the stored seat is dropped only when the room or the
 * seat is provably gone (404 / not a member), never on a transient error.
 */
export async function hydrateRemiRoom(code: string): Promise<void> {
	const target = code.toUpperCase();
	const stored = readStoredSession();
	if (!stored || stored.code.toUpperCase() !== target) return;
	// `resetRemi()` cleared the in-memory credentials — adopt them back.
	remiPlayerId.set(stored.playerId);
	remiSessionToken.set(stored.sessionToken);
	remiError.set(null);
	remiConnectionLost.set(false);
	try {
		const res = await fetch(`/api/rooms/${target}?playerId=${encodeURIComponent(stored.playerId)}`);
		if (res.status === 404) {
			forgetRemiSession();
			remiRoom.set(null);
			remiError.set('Room not found');
			return;
		}
		if (!res.ok) {
			// 409/5xx: keep the seat, let the page fall back to its join card.
			remiConnectionLost.set(true);
			return;
		}
		const data = (await res.json()) as Room;
		if (!data?.players?.some((player) => player.id === stored.playerId)) {
			// The seat is gone (room restarted, player replaced): re-join by name.
			forgetRemiSession();
			remiRoom.set(null);
			remiError.set('Not a player in this room');
			return;
		}
		remiRoom.set(data);
		startRemiPolling(target);
	} catch (e) {
		remiConnectionLost.set(true);
		console.error('Remi room hydration failed:', e);
	}
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
		persistSession(code);
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
		persistSession(data.code);
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
		return;
	}
	// The seat now spans a running game — keep it reclaimable across refreshes.
	persistSession($room.code);
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
	// Leaving explicitly drops the persisted seat too (a mere `resetRemi()` does not).
	forgetRemiSession();
	remiPlayerId.set('');
	remiSessionToken.set('');
	remiPlayerName.set('');
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
	// The persisted seat is deliberately kept: `resetRemi()` also runs on
	// destroy/HMR, and the next mount reclaims the same seat via hydration.
}
