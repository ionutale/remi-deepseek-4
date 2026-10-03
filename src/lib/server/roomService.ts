import { nanoid } from 'nanoid';
import type { GameState } from '$lib/engine/remi/types';
import { createGame, endByStockOut } from '$lib/engine/remi/actions';
import { playTurn } from '$lib/engine/remi/ai';
import { roomsCol } from './db';
import { verifySession } from './auth';
import { recordResult } from './mmr';

export interface Room {
	code: string;
	maxPlayers: number;
	players: PlayerInRoom[];
	gameState: GameState | null;
	status: 'waiting' | 'playing' | 'finished';
	createdAt: number;
	ownerId: string;
}

export interface PlayerInRoom {
	id: string;
	name: string;
	lastSeen: number;
}

/**
 * Browse-list projection: lobby metadata only, NEVER `gameState` (opponent
 * racks would otherwise leak to anyone listing rooms).
 */
export interface RoomSummary {
	code: string;
	status: 'waiting' | 'playing' | 'finished';
	maxPlayers: number;
	players: { id?: string; name: string; lastSeen?: number }[];
	createdAt: number;
}

const col = () => roomsCol<Room>();

export async function createRoom(
	ownerName: string,
	maxPlayers: number = 4,
	code?: string,
	ownerId?: string
): Promise<Room> {
	const roomCode = code ?? nanoid(6).toUpperCase();
	const id = ownerId ?? nanoid(10);
	const now = Date.now();
	const room: Room = {
		code: roomCode,
		maxPlayers,
		players: [{ id, name: ownerName, lastSeen: now }],
		gameState: null,
		status: 'waiting',
		createdAt: Date.now(),
		ownerId: id
	};
	await col().insertOne(room);
	return room;
}

export async function getRoom(code: string): Promise<Room | undefined> {
	const room = await col().findOne({ code: code.toUpperCase() });
	return room ?? undefined;
}

export async function joinRoom(
	code: string,
	playerName: string
): Promise<{ room: Room; playerId: string } | { error: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode });
	if (!room) return { error: 'Room not found' };
	if (room.status !== 'waiting') return { error: 'Game already started' };
	if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
	const playerId = nanoid(10);
	await col().updateOne(
		{ code: roomCode },
		{ $push: { players: { id: playerId, name: playerName, lastSeen: Date.now() } } }
	);
	const updated = await col().findOne({ code: roomCode });
	return { room: updated!, playerId };
}

export async function startGame(code: string, playerId: string): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode });
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can start' };
	if (room.players.length < 2) return { error: 'Need at least 2 players' };

	const next = createGame({ playerCount: room.players.length as 2 | 3 | 4 });
	next.turnStartedAt = Date.now();
	await col().updateOne({ code: roomCode }, { $set: { gameState: next, status: 'playing' } });
	return {};
}

/**
 * Deals the game after `prev` finished: same seats, `sessionTotals` carried
 * over, and the previous winner opens the new game. Fresh `revision`, so the
 * per-game MMR idempotency guard never confuses it with the previous game.
 */
export function createNextGame(prev: GameState): GameState {
	const next = createGame({ playerCount: prev.players.length as 2 | 3 | 4 });
	next.sessionTotals = [...prev.sessionTotals];
	next.firstPlayerIndex = prev.gameWinner ?? 0;
	next.currentPlayerIndex = next.firstPlayerIndex;
	next.turnStartedAt = Date.now();
	return next;
}

export async function restartGame(code: string, playerId: string): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode });
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can restart' };
	if (room.status !== 'finished') return { error: 'Game not finished' };
	if (!room.gameState || (room.gameState as GameState).schemaVersion !== 3) {
		return { error: 'No finished game to continue' };
	}

	await col().updateOne(
		{ code: roomCode },
		{ $set: { gameState: createNextGame(room.gameState), status: 'playing' } }
	);
	return {};
}

export function statusForGameState(state: GameState): 'playing' | 'finished' {
	return state.phase === 'finished' ? 'finished' : 'playing';
}

export async function saveGameState(code: string, state: GameState): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase() },
		{ $set: { gameState: state, status: statusForGameState(state) } }
	);
	if (state.phase === 'finished') {
		try {
			await maybeRecordMmr(code, state);
		} catch (err) {
			console.error(`Room ${code}: MMR auto-record failed`, err);
		}
	}
}

export async function resetStaleGameState(code: string): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase() },
		{ $set: { gameState: null, status: 'waiting' } }
	);
}

export async function updateGameState(code: string, state: GameState): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode });
	if (!room) return { error: 'Room not found' };

	await saveGameState(roomCode, state);
	return {};
}

/* ------------------------------------------------------------------ *
 * MMR — recorded once per finished game (1v1 only), keyed per game.
 * ------------------------------------------------------------------ */

/**
 * Idempotency guard keyed per finished game: `roomCode + revision + winner +
 * scores`. A fresh `next-game` restarts at revision 1 but finishes with a
 * different revision/scores key, so no explicit reset is needed.
 */
const mmrRecordedKeys = new Map<string, number>();
const MMR_KEY_TTL_MS = 2 * 60 * 60 * 1000;

function mmrKeyFor(code: string, state: GameState): string {
	return `${code.toUpperCase()}#${state.revision}:${state.gameWinner}:${state.scores.join(',')}`;
}

/**
 * Records the 1v1 MMR result for a finished game. Returns `'recorded'` when
 * this call recorded it, `'already'` when it was recorded before, and
 * `'skipped'` when the game is not MMR-eligible (unfinished, no winner, or not
 * 1v1). Shared by the auto-record path (`saveGameState`) and the explicit
 * `/api/matchmaking/result` endpoint, so a game can never count twice.
 */
export async function maybeRecordMmr(
	code: string,
	state: GameState
): Promise<'recorded' | 'already' | 'skipped'> {
	if (state.phase !== 'finished') return 'skipped';
	if (state.gameWinner === null || state.gameWinner === undefined) return 'skipped';
	const room = await getRoom(code);
	if (!room || room.players.length !== 2) return 'skipped';
	const winner = room.players[state.gameWinner];
	const loser = room.players[state.gameWinner === 0 ? 1 : 0];
	if (!winner || !loser) return 'skipped';

	const key = mmrKeyFor(code, state);
	const now = Date.now();
	for (const [k, ts] of mmrRecordedKeys) {
		if (now - ts > MMR_KEY_TTL_MS) mmrRecordedKeys.delete(k);
	}
	if (mmrRecordedKeys.has(key)) return 'already';
	await recordResult(winner.id, loser.id);
	mmrRecordedKeys.set(key, now);
	return 'recorded';
}

export async function closeRoom(
	code: string,
	playerId: string,
	sessionToken: string
): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await getRoom(code);
	if (!room) return { error: 'Room not found' };
	const authed = await verifySession(playerId, sessionToken);
	if (!authed) return { error: 'Unauthorized' };
	if (room.ownerId !== playerId) return { error: 'Only owner can close' };
	await col().deleteOne({ code: roomCode });
	return {};
}

export async function getAllRooms(): Promise<RoomSummary[]> {
	const rooms = await col().find({}).toArray();
	return rooms.map((room) => ({
		code: room.code,
		status: room.status,
		maxPlayers: room.maxPlayers,
		players: (room.players as PlayerInRoom[]).map((p) => ({
			id: p.id,
			name: p.name,
			lastSeen: p.lastSeen
		})),
		createdAt: room.createdAt
	}));
}

const STALE_TIMEOUT_MS = 30_000;

export async function pingPlayer(code: string, playerId: string): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase(), 'players.id': playerId },
		{ $set: { 'players.$.lastSeen': Date.now() } }
	);
}

export async function cleanStalePlayers(): Promise<void> {
	const now = Date.now();
	const cutoff = now - STALE_TIMEOUT_MS;
	const waitingRooms = await col().find({ status: 'waiting' }).toArray();

	for (const room of waitingRooms) {
		const before = room.players.length;
		const activePlayers = room.players.filter((p: PlayerInRoom) => p.lastSeen >= cutoff);

		if (activePlayers.length === 0) {
			await col().deleteOne({ code: room.code });
		} else if (activePlayers.length < before) {
			await col().updateOne({ code: room.code }, { $set: { players: activePlayers } });
			if (!activePlayers.some((p: PlayerInRoom) => p.id === room.ownerId)) {
				const newOwner = activePlayers[0];
				console.warn(
					`Room ${room.code}: stale owner removed, ownership transferred to ${newOwner.name} (${newOwner.id})`
				);
				await col().updateOne({ code: room.code }, { $set: { ownerId: newOwner.id } });
			}
		}
	}
}

const CLEANUP_INTERVAL_MS = 15_000;
/** Turn budget in ms; overridable for tests via `TURN_TIMEOUT_MS`. */
export const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 120_000);
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export async function autoPlayExpiredTurns(now = Date.now()): Promise<void> {
	const rooms = await col().find({ status: 'playing' }).toArray();

	for (const room of rooms) {
		const gs = room.gameState as GameState | null;
		if (!gs || (gs as GameState).schemaVersion !== 3) continue;
		if (gs.phase !== 'playing') continue;
		if (now - gs.turnStartedAt <= TURN_TIMEOUT_MS) continue;
		try {
			let next: GameState;
			try {
				next = playTurn(gs);
			} catch {
				// `playTurn` may throw on an empty stock — the stock-out rule
				// decides those games (spec §1.8), not the AI.
				next = endByStockOut(gs);
			}
			if (next.revision === gs.revision) {
				// No progress (e.g. the safe fallback with an empty stock).
				if (gs.table.stock.length === 0) {
					next = endByStockOut(gs);
				} else {
					continue;
				}
			}
			await saveGameState(room.code, next);
		} catch (err) {
			console.error(`Room ${room.code}: auto-play failed`, err);
		}
	}
}
export function startCleanupTimer(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => {
		cleanStalePlayers().catch(console.error);
		autoPlayExpiredTurns().catch(console.error);
	}, CLEANUP_INTERVAL_MS);
}
export function stopCleanupTimer(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}
