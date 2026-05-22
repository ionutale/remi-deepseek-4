import { json } from '@sveltejs/kit';
import {
	getRoom,
	joinRoom,
	startGame,
	restartGame,
	updateGameState,
	closeRoom,
	pingPlayer
} from '$lib/server/roomService';
import { createSession, verifySession, destroySession, sanitizeName } from '$lib/server/auth';

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

const TURN_TIMEOUT_MS = 120_000;

export async function PUT({ params, request }) {
	const { playerId, sessionToken, gameState } = await request.json();
	if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	const room = await getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (!room.players.some((p) => p.id === playerId)) {
		return json({ error: 'Not a player in this room' }, { status: 403 });
	}
	if (room.gameState && Date.now() - room.gameState.turnStartedAt > TURN_TIMEOUT_MS) {
		return json({ error: 'Turn timed out' }, { status: 400 });
	}
	const result = await updateGameState(params.code, gameState);
	if (result.error) return json(result, { status: 400 });
	return json({ ok: true });
}
