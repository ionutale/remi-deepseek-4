import { nanoid } from 'nanoid';
import type { GameState, GameConfig } from '$lib/engine/types';
import { initGame } from '$lib/engine/game';
import { roomsCol } from './db';
import { verifySession } from './auth';
import { recordResult, removeMatch } from './mmr';

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

export async function createRoom(ownerName: string, maxPlayers: number = 4, code?: string, ownerId?: string): Promise<Room> {
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
		{ $set: { gameState: initGame(config), status: 'playing' } } as any
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
		{ $set: { gameState: initGame(config), status: 'playing' } } as any
	);
	return {};
}

export async function updateGameState(code: string, state: GameState): Promise<{ error?: string }> {
	const roomCode = code.toUpperCase();
	const room = await col().findOne({ code: roomCode } as any);
	if (!room) return { error: 'Room not found' };

	const update: Record<string, unknown> = { gameState: state };
	if (state.phase === 'finished') {
		update.status = 'finished';
		await col().updateOne({ code: roomCode } as any, { $set: update } as any);
		if (room.players.length === 2 && state.winner !== null) {
			const winnerId = room.players[state.winner].id;
			const loserId = room.players[1 - state.winner].id;
			await recordResult(winnerId, loserId);
			await removeMatch(room.players[0].id);
			await removeMatch(room.players[1].id);
		}
		return {};
	}

	await col().updateOne({ code: roomCode } as any, { $set: update } as any);
	return {};
}

export async function closeRoom(code: string, playerId: string, sessionToken: string): Promise<{ error?: string }> {
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
	return await col().find({} as any).toArray();
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
	const waitingRooms = await col().find({ status: 'waiting' } as any).toArray();

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
				console.warn(`Room ${room.code}: stale owner removed, ownership transferred to ${newOwner.name} (${newOwner.id})`);
				await col().updateOne(
					{ code: room.code } as any,
					{ $set: { ownerId: newOwner.id } } as any
				);
			}
		}
	}
}

const CLEANUP_INTERVAL_MS = 15_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
export function startCleanupTimer(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => { cleanStalePlayers().catch(console.error); }, CLEANUP_INTERVAL_MS);
}
export function stopCleanupTimer(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}
