import { json } from '@sveltejs/kit';
import { recordResult, removeMatch, getMMR } from '$lib/server/mmr';
import { getRoom } from '$lib/server/roomService';

export async function POST({ request }) {
	const { roomCode } = await request.json();
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

	recordResult(winnerId, loserId);
	removeMatch(room.players[0].id);
	removeMatch(room.players[1].id);

	return json({
		ok: true,
		winnerMMR: getMMR(winnerId),
		loserMMR: getMMR(loserId)
	});
}
