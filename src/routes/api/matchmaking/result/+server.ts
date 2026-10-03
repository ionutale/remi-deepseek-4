import { json } from '@sveltejs/kit';
import { removeMatch, getMMR } from '$lib/server/mmr';
import { getRoom, maybeRecordMmr } from '$lib/server/roomService';
import { verifySession } from '$lib/server/auth';
import type { GameState } from '$lib/engine/remi/types';

export async function POST({ request }) {
	const { roomCode, playerId, sessionToken } = await request.json();
	if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const room = await getRoom(roomCode);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	const gs = room.gameState as GameState | null;
	if (!gs || gs.schemaVersion !== 3 || gs.phase !== 'finished') {
		return json({ error: 'Game not finished' }, { status: 400 });
	}
	// MMR is only rated for 1v1 matchmaking — custom rooms with 3-4 players
	// are casual and don't affect ratings. See P1-4 in the plan.
	if (room.players.length !== 2) {
		return json({ error: 'Only 1v1 matches are rated' }, { status: 400 });
	}

	if (gs.gameWinner === null || gs.gameWinner === undefined) {
		return json({ error: 'No winner' }, { status: 400 });
	}

	// Idempotent per finished game (shared with the auto-record path in
	// `saveGameState`): a retry or a double submit never counts twice.
	const outcome = await maybeRecordMmr(roomCode, gs);
	if (outcome === 'skipped') return json({ error: 'Result not recorded' }, { status: 400 });

	const winnerId = room.players[gs.gameWinner].id;
	const loserId = room.players[gs.gameWinner === 0 ? 1 : 0].id;
	await removeMatch(room.players[0].id);
	await removeMatch(room.players[1].id);

	return json({
		ok: true,
		winnerMMR: await getMMR(winnerId),
		loserMMR: await getMMR(loserId)
	});
}
