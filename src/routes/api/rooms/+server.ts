import { json } from '@sveltejs/kit';
import { createRoom, getAllRooms } from '$lib/server/roomService';
import { createSession, sanitizeName } from '$lib/server/auth';

export async function POST({ request }) {
	const { ownerName, maxPlayers } = await request.json();
	if (typeof ownerName !== 'string' || ownerName.trim().length === 0) {
		return json({ error: 'Name required' }, { status: 400 });
	}
	const n = maxPlayers ?? 4;
	const count: 2 | 3 | 4 = n <= 2 ? 2 : n >= 4 ? 4 : 3;
	const room = createRoom(sanitizeName(ownerName), count);
	const sessionToken = createSession(room.ownerId);
	return json({ ...room, sessionToken });
}

export async function GET() {
	return json(getAllRooms());
}
