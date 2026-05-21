import { json } from '@sveltejs/kit';
import { tryMatch, getMatch, leaveQueue, getQueueSize, isQueued } from '$lib/server/mmr';
import { createRoom, startGame } from '$lib/server/roomService';
import { createSession, verifySession, sanitizeName } from '$lib/server/auth';
import { nanoid } from 'nanoid';

export async function POST({ request }) {
	const { action, playerId, playerName, sessionToken } = await request.json();

	if (action === 'join') {
		if (!playerName) return json({ error: 'Name required' }, { status: 400 });

		const id = nanoid(10);
		const token = createSession(id);
		const result = tryMatch(id, sanitizeName(playerName));
		if ('queued' in result) {
			return json({ status: 'queued', playerId: id, sessionToken: token, queueSize: getQueueSize() });
		}
		const match = result.matched;

		const room = createRoom(match.player1Name, 2, match.roomCode, match.player1Id);
		room.players.push({ id: match.player2Id, name: match.player2Name, lastSeen: Date.now() });

		startGame(match.roomCode, match.player1Id);

		return json({
			status: 'matched',
			playerId: id,
			sessionToken: token,
			roomCode: match.roomCode,
			match
		});
	}

	if (action === 'leave') {
		if (!playerId || !sessionToken || !verifySession(playerId, sessionToken)) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}
		leaveQueue(playerId);
		return json({ ok: true });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET({ url }) {
	const playerId = url.searchParams.get('playerId');
	if (!playerId) return json({ queueSize: getQueueSize() });

	const match = getMatch(playerId);
	if (match) return json({ status: 'matched', roomCode: match.roomCode, match });

	if (isQueued(playerId)) {
		return json({ status: 'queued', queueSize: getQueueSize() });
	}
	return json({ status: 'idle' });
}
