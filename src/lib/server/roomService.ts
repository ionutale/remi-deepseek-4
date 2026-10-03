import { nanoid } from 'nanoid';
import type { GameState, GameConfig } from '$lib/engine/types';
import { initMatch, isRoundBlocked, voidRound } from '$lib/engine/game';
import { aiTurn } from '$lib/engine/ai';
import { roomsCol } from './db';
import { verifySession } from './auth';

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
	await col().insertOne(room as any);
	return room;
}

export async function getRoom(code: string): Promise<Room | undefined> {
	const room = await col().findOne({ code: code.toUpperCase() } as any);
	return room ?? undefined;
}

export async function joinRoom(
	code: string,
	playerName: string
): Promise<{ room: Room; playerId: string } | { error: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode } as any);
	if (!room) return { error: 'Room not found' };
	if (room.status !== 'waiting') return { error: 'Game already started' };
	if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
	const playerId = nanoid(10);
	await col().updateOne(
		{ code: roomCode } as any,
		{ $push: { players: { id: playerId, name: playerName, lastSeen: Date.now() } } } as any
	);
	const updated = await col().findOne({ code: roomCode } as any);
	return { room: updated!, playerId };
}

export async function startGame(code: string, playerId: string): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode } as any);
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can start' };
	if (room.players.length < 2) return { error: 'Need at least 2 players' };

	const config: GameConfig = {
		playerCount: room.players.length as 2 | 3 | 4,
		humanPlayerIndex: 0
	};
	await col().updateOne(
		{ code: roomCode } as any,
		{ $set: { gameState: initMatch(config), status: 'playing' } } as any
	);
	return {};
}

export async function restartGame(code: string, playerId: string): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode } as any);
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can restart' };
	if (room.status !== 'finished') return { error: 'Game not finished' };

	const config: GameConfig = {
		playerCount: room.players.length as 2 | 3 | 4,
		humanPlayerIndex: 0
	};
	await col().updateOne(
		{ code: roomCode } as any,
		{ $set: { gameState: initMatch(config), status: 'playing' } } as any
	);
	return {};
}

export function statusForGameState(state: GameState): 'playing' | 'finished' {
	// Room stays 'playing' through 'round-over'; 'finished' only at match end.
	return state.phase === 'finished' ? 'finished' : 'playing';
}

export async function saveGameState(code: string, state: GameState): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase() } as any,
		{ $set: { gameState: state, status: statusForGameState(state) } } as any
	);
}

export async function resetStaleGameState(code: string): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase() } as any,
		{ $set: { gameState: null, status: 'waiting' } } as any
	);
}

export async function updateGameState(code: string, state: GameState): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode } as any);
	if (!room) return { error: 'Room not found' };

	// MMR is recorded only by /api/matchmaking/result at match end (matchWinner,
	// 1v1 only) — never here, so results cannot be recorded twice.
	await col().updateOne(
		{ code: roomCode } as any,
		{ $set: { gameState: state, status: statusForGameState(state) } } as any
	);
	return {};
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
	await col().deleteOne({ code: roomCode } as any);
	return {};
}

export async function getAllRooms(): Promise<Room[]> {
	return await col()
		.find({} as any)
		.toArray();
}

const STALE_TIMEOUT_MS = 30_000;

export async function pingPlayer(code: string, playerId: string): Promise<void> {
	await col().updateOne(
		{ code: code.toUpperCase(), 'players.id': playerId } as any,
		{ $set: { 'players.$.lastSeen': Date.now() } } as any
	);
}

export async function cleanStalePlayers(): Promise<void> {
	const now = Date.now();
	const cutoff = now - STALE_TIMEOUT_MS;
	const waitingRooms = await col()
		.find({ status: 'waiting' } as any)
		.toArray();

	for (const room of waitingRooms) {
		const before = room.players.length;
		const activePlayers = room.players.filter((p: PlayerInRoom) => p.lastSeen >= cutoff);

		if (activePlayers.length === 0) {
			await col().deleteOne({ code: room.code } as any);
		} else if (activePlayers.length < before) {
			await col().updateOne(
				{ code: room.code } as any,
				{ $set: { players: activePlayers } } as any
			);
			if (!activePlayers.some((p: PlayerInRoom) => p.id === room.ownerId)) {
				const newOwner = activePlayers[0];
				console.warn(
					`Room ${room.code}: stale owner removed, ownership transferred to ${newOwner.name} (${newOwner.id})`
				);
				await col().updateOne(
					{ code: room.code } as any,
					{ $set: { ownerId: newOwner.id } } as any
				);
			}
		}
	}
}

const CLEANUP_INTERVAL_MS = 15_000;
export const TURN_TIMEOUT_MS = 120_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export async function autoPlayExpiredTurns(now = Date.now()): Promise<void> {
	const rooms = await col()
		.find({ status: 'playing' } as any)
		.toArray();

	for (const room of rooms) {
		const gs = room.gameState as GameState | null;
		if (!gs || (gs as GameState).schemaVersion !== 2) continue;
		try {
			if (isRoundBlocked(gs)) {
				await saveGameState(room.code, voidRound(gs));
			} else if (
				(gs.phase === 'draw' || gs.phase === 'discard') &&
				now - gs.turnStartedAt > TURN_TIMEOUT_MS
			) {
				await saveGameState(room.code, aiTurn(gs));
			}
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
