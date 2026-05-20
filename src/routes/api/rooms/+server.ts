import { json } from '@sveltejs/kit';
import { createRoom, getAllRooms, cleanStalePlayers } from '$lib/server/roomService';

export async function POST({ request }) {
	const { ownerName, maxPlayers } = await request.json();
	if (!ownerName) return json({ error: 'Name required' }, { status: 400 });
	const count = Math.max(2, Math.min(4, maxPlayers ?? 4)) as 2 | 3 | 4;
	const room = createRoom(ownerName, count);
	return json(room);
}

export async function GET() {
	cleanStalePlayers();
	return json(getAllRooms());
}
