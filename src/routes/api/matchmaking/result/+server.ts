import { json } from '@sveltejs/kit';
import { recordResult, removeMatch, getMMR } from '$lib/server/mmr';
import { getRoom } from '$lib/server/roomService';
import { verifySession } from '$lib/server/auth';

const RECORDED_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const recordedRooms = new Map<string, number>();

function hasRecorded(roomCode: string): boolean {
	const ts = recordedRooms.get(roomCode);
	if (ts === undefined) return false;
	if (Date.now() - ts > RECORDED_TTL_MS) {
		recordedRooms.delete(roomCode);
		return false;
	}
	return true;
}

function markRecorded(roomCode: string): void {
	// Prune expired entries to bound memory growth
	const cutoff = Date.now() - RECORDED_TTL_MS;
	for (const [code, ts] of recordedRooms) {
		if (ts < cutoff) recordedRooms.delete(code);
	}
	recordedRooms.set(roomCode, Date.now());
}

export async function POST({ request }) {
	const { roomCode, playerId, sessionToken } = await request.json();
	if (!playerId || !sessionToken || !verifySession(playerId, sessionToken)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	if (hasRecorded(roomCode)) return json({ ok: true });

	const room = getRoom(roomCode);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (!room.gameState || room.gameState.phase !== 'finished') {
		return json({ error: 'Game not finished' }, { status: 400 });
	}
	if (room.players.length !== 2)
		return json({ error: 'Only 1v1 matches are rated' }, { status: 400 });

	const winnerIdx = room.gameState.winner;
	if (winnerIdx === null) return json({ error: 'No winner' }, { status: 400 });

	const winnerId = room.players[winnerIdx].id;
	const loserId = room.players[1 - winnerIdx].id;

	markRecorded(roomCode);
	recordResult(winnerId, loserId);
	removeMatch(room.players[0].id);
	removeMatch(room.players[1].id);

	return json({
		ok: true,
		winnerMMR: getMMR(winnerId),
		loserMMR: getMMR(loserId)
	});
}
