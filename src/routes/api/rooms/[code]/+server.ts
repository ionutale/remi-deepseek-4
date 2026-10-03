import { json } from '@sveltejs/kit';
import {
	getRoom,
	joinRoom,
	startGame,
	restartGame,
	closeRoom,
	pingPlayer,
	saveGameState,
	resetStaleGameState
} from '$lib/server/roomService';
import { createSession, verifySession, destroySession, sanitizeName } from '$lib/server/auth';
import { closeGame, nextRound } from '$lib/engine/game';
import type { CloseDeclaration, GameState } from '$lib/engine/types';

export async function GET({ params, url }) {
	const room = await getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	const playerId = url.searchParams.get('playerId');
	if (playerId) await pingPlayer(params.code, playerId);
	return json(room);
}

export async function PATCH({ params, request }) {
	const { action, playerId, playerName, sessionToken } = await request.json();
	const code = params.code;

	switch (action) {
		case 'join': {
			if (typeof playerName !== 'string' || sanitizeName(playerName).length === 0) {
				return json({ error: 'Name required' }, { status: 400 });
			}
			const result = await joinRoom(code, sanitizeName(playerName));
			if ('error' in result) return json(result, { status: 400 });
			const token = await createSession(result.playerId);
			return json({ ...result, sessionToken: token });
		}
		case 'start': {
			if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await startGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'restart': {
			if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await restartGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'close': {
			if (!playerId || !sessionToken) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await closeRoom(code, playerId, sessionToken);
			if (result.error) return json(result, { status: 400 });
			await destroySession(playerId);
			return json({ ok: true });
		}
		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}
}

export async function PUT({ params, request }) {
	const { playerId, sessionToken, baseRevision, action, gameState, declaration } =
		await request.json();
	if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	const room = await getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (!room.players.some((p) => p.id === playerId)) {
		return json({ error: 'Not a player in this room' }, { status: 403 });
	}
	if (room.gameState && (room.gameState as GameState).schemaVersion !== 2) {
		await resetStaleGameState(params.code);
		return json({ error: 'state reset' }, { status: 409 });
	}
	const stored = room.gameState;
	if (!stored) return json({ error: 'No game in progress' }, { status: 400 });
	if (baseRevision !== stored.revision) {
		const current = await getRoom(params.code);
		return json(current, { status: 409 });
	}
	const currentPlayerId = room.players[stored.currentPlayerIndex]?.id;
	switch (action) {
		case 'move': {
			if (currentPlayerId !== playerId) {
				return json({ error: 'Not your turn' }, { status: 403 });
			}
			if (!gameState) return json({ error: 'gameState required' }, { status: 400 });
			if (gameState.phase === 'round-over' || gameState.phase === 'finished') {
				return json({ error: 'invalid move transition' }, { status: 400 });
			}
			const next: GameState = { ...gameState, revision: baseRevision + 1 };
			await saveGameState(params.code, next);
			return json({ ok: true, revision: next.revision });
		}
		case 'close': {
			if (currentPlayerId !== playerId) {
				return json({ error: 'Not your turn' }, { status: 403 });
			}
			if (stored.phase !== 'discard') {
				return json({ error: 'Can only close during discard phase' }, { status: 400 });
			}
			if (!declaration) return json({ error: 'declaration required' }, { status: 400 });
			let next: GameState;
			try {
				next = closeGame(stored, declaration as CloseDeclaration);
			} catch (err) {
				return json(
					{ error: err instanceof Error ? err.message : 'Invalid close' },
					{ status: 400 }
				);
			}
			await saveGameState(params.code, next);
			return json({ ok: true, revision: next.revision });
		}
		case 'next-round': {
			if (stored.phase !== 'round-over') {
				return json({ error: 'Round is not over' }, { status: 400 });
			}
			let next: GameState;
			try {
				next = nextRound(stored);
			} catch (err) {
				return json(
					{ error: err instanceof Error ? err.message : 'Cannot start next round' },
					{ status: 400 }
				);
			}
			await saveGameState(params.code, next);
			return json({ ok: true, revision: next.revision });
		}
		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}
}
