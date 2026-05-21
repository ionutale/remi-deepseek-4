import { nanoid } from 'nanoid';
import type { GameState, GameConfig } from '$lib/engine/types';
import { initGame } from '$lib/engine/game';
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

const rooms = new Map<string, Room>();

export function createRoom(ownerName: string, maxPlayers: number = 4, code?: string, ownerId?: string): Room {
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
	rooms.set(roomCode, room);
	return room;
}

export function getRoom(code: string): Room | undefined {
	return rooms.get(code.toUpperCase());
}

export function joinRoom(
	code: string,
	playerName: string
): { room: Room; playerId: string } | { error: string } {
	const room = rooms.get(code.toUpperCase());
	if (!room) return { error: 'Room not found' };
	if (room.status !== 'waiting') return { error: 'Game already started' };
	if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
	const playerId = nanoid(10);
	room.players.push({ id: playerId, name: playerName, lastSeen: Date.now() });
	return { room, playerId };
}

export function startGame(code: string, playerId: string): { error?: string } {
	const room = rooms.get(code.toUpperCase());
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can start' };
	if (room.players.length < 2) return { error: 'Need at least 2 players' };

	const config: GameConfig = {
		playerCount: room.players.length as 2 | 3 | 4,
		humanPlayerIndex: 0
	};
	room.gameState = initGame(config);
	room.status = 'playing';
	return {};
}

export function restartGame(code: string, playerId: string): { error?: string } {
	const room = rooms.get(code.toUpperCase());
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can restart' };
	if (room.status !== 'finished') return { error: 'Game not finished' };

	room.players = room.players.map((p) => ({ ...p }));
	const config: GameConfig = {
		playerCount: room.players.length as 2 | 3 | 4,
		humanPlayerIndex: 0
	};
	room.gameState = initGame(config);
	room.status = 'playing';
	return {};
}

export function updateGameState(code: string, state: GameState): { error?: string } {
	const room = rooms.get(code.toUpperCase());
	if (!room) return { error: 'Room not found' };
	room.gameState = state;
	if (state.phase === 'finished') {
		room.status = 'finished';
		if (room.players.length === 2 && state.winner !== null) {
			const winnerId = room.players[state.winner].id;
			const loserId = room.players[1 - state.winner].id;
			recordResult(winnerId, loserId);
			removeMatch(room.players[0].id);
			removeMatch(room.players[1].id);
		}
	}
	return {};
}

export function closeRoom(code: string, playerId: string): { error?: string } {
	const room = rooms.get(code.toUpperCase());
	if (!room) return { error: 'Room not found' };
	if (room.ownerId !== playerId) return { error: 'Only owner can close' };
	rooms.delete(code.toUpperCase());
	return {};
}

export function getAllRooms(): Room[] {
	return Array.from(rooms.values(), (r) => structuredClone(r));
}

const STALE_TIMEOUT_MS = 30_000;

export function pingPlayer(code: string, playerId: string): void {
	const room = rooms.get(code.toUpperCase());
	if (!room) return;
	const player = room.players.find((p) => p.id === playerId);
	if (player) player.lastSeen = Date.now();
}

export function cleanStalePlayers(): void {
	const now = Date.now();
	for (const [code, room] of rooms) {
		if (room.status !== 'waiting') continue;
		const before = room.players.length;
		room.players = room.players.filter((p) => now - p.lastSeen < STALE_TIMEOUT_MS);
		if (room.players.length === 0) {
			rooms.delete(code);
		} else if (room.players.length < before && !room.players.some((p) => p.id === room.ownerId)) {
			const newOwner = room.players[0];
			console.warn(`Room ${code}: stale owner removed, ownership transferred to ${newOwner.name} (${newOwner.id})`);
			room.ownerId = newOwner.id;
		}
	}
}

const CLEANUP_INTERVAL_MS = 15_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
export function startCleanupTimer(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(cleanStalePlayers, CLEANUP_INTERVAL_MS);
}
export function stopCleanupTimer(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}
