import { json } from '@sveltejs/kit';
import { tryMatch, getMatch, leaveQueue, getQueueSize, isQueued, getMMR } from '$lib/server/mmr';
import { createRoom, startGame } from '$lib/server/roomService';
import { createSession, verifySession, sanitizeName } from '$lib/server/auth';
import { roomsCol } from '$lib/server/db';
import { nanoid } from 'nanoid';

export async function POST({ request }) {
	const { action, playerId, playerName, sessionToken } = await request.json();

	if (action === 'join') {
		if (!playerName) return json({ error: 'Name required' }, { status: 400 });

		const id = nanoid(10);
		const token = await createSession(id);
		const mmr = await getMMR(id);
		const result = await tryMatch(id, sanitizeName(playerName));
		if ('queued' in result) {
			return json({ status: 'queued', playerId: id, sessionToken: token, mmr, queueSize: await getQueueSize() });
		}
		const match = result.matched;

		await createRoom(match.player1Name, 2, match.roomCode, match.player1Id);
		await roomsCol().updateOne(
			{ code: match.roomCode } as any,
			{ $push: { players: { id: match.player2Id, name: match.player2Name, lastSeen: Date.now() } } } as any
		);

		await startGame(match.roomCode, match.player1Id);

		return json({
			status: 'matched',
			playerId: id,
			sessionToken: token,
			roomCode: match.roomCode,
			mmr,
			match
		});
	}

	if (action === 'leave') {
		if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}
		await leaveQueue(playerId);
		return json({ ok: true });
	}

	return json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET({ url }) {
	const playerId = url.searchParams.get('playerId');
	if (!playerId) return json({ queueSize: await getQueueSize() });

	const mmr = await getMMR(playerId);
	const match = await getMatch(playerId);
	if (match) return json({ status: 'matched', roomCode: match.roomCode, match, mmr });

	if (await isQueued(playerId)) {
		return json({ status: 'queued', queueSize: await getQueueSize(), mmr });
	}
	return json({ status: 'idle', mmr });
}
