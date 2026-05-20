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

export async function GET({ params, url }) {
	const room = getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	const playerId = url.searchParams.get('playerId');
	if (playerId) pingPlayer(params.code, playerId);
	return json(room);
}

export async function PATCH({ params, request }) {
	const { action, playerId, playerName } = await request.json();
	const code = params.code;

	switch (action) {
		case 'join': {
			const result = joinRoom(code, playerName);
			if ('error' in result) return json(result, { status: 400 });
			return json(result);
		}
		case 'start': {
			const result = startGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'restart': {
			const result = restartGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'close': {
			const result = closeRoom(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}
}

export async function PUT({ params, request }) {
	const { playerId, gameState } = await request.json();
	const room = getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (!room.players.some((p) => p.id === playerId)) {
		return json({ error: 'Not a player in this room' }, { status: 403 });
	}
	const result = updateGameState(params.code, gameState);
	if (result.error) return json(result, { status: 400 });
	return json({ ok: true });
}
