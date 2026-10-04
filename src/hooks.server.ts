import { connectDB, disconnectDB, ensureDB } from '$lib/server/db';
import { startCleanupTimer as startRoomCleanup } from '$lib/server/roomService';
import { startCleanupTimer as startMmrCleanup } from '$lib/server/mmr';

let timersStarted = false;

function startTimersOnce(): void {
	if (timersStarted) return;
	timersStarted = true;
	startRoomCleanup();
	startMmrCleanup();
}

connectDB()
	.then(() => {
		console.log('MongoDB connected');
		startTimersOnce();
	})
	.catch((err) => {
		console.error('MongoDB connection failed — will retry on demand per request', err);
	});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = requestCounts.get(ip);
	if (!entry || now > entry.resetAt) {
		requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return true;
	}
	entry.count++;
	return entry.count <= RATE_LIMIT_MAX;
}

const ALLOWED_ORIGINS: string[] = [
	'http://localhost:5173',
	'http://localhost:4173',
	...(process.env.ORIGIN ? [process.env.ORIGIN] : [])
];

function isAllowedOrigin(origin: string | null): boolean {
	if (!origin) return true;
	return ALLOWED_ORIGINS.includes(origin);
}

export async function handle({ event, resolve }) {
	// The per-room poll (GET /api/rooms/[code], every 2s per open tab) is not
	// rate-limited: with several tabs or users behind one NAT the shared
	// 120/min/IP bucket would 429 ordinary play. Mutations stay limited.
	const isRoomPoll =
		event.request.method === 'GET' && /^\/api\/rooms\/[^/]+$/.test(event.url.pathname);
	if (!isRoomPoll) {
		const ip = event.getClientAddress();
		if (!rateLimit(ip)) {
			return new Response('Too many requests', { status: 429 });
		}
	}

	const origin = event.request.headers.get('origin');
	if (!isAllowedOrigin(origin)) {
		return new Response('Forbidden', { status: 403 });
	}

	// Make sure the DB is connected before handling: cold starts may not have
	// finished the module-init connection yet (or it may have failed once).
	try {
		await ensureDB();
		startTimersOnce();
	} catch (err) {
		console.error('MongoDB unavailable for request', err);
	}

	return resolve(event);
}

process.on('SIGTERM', () => {
	disconnectDB().catch(console.error);
});
process.on('SIGINT', () => {
	disconnectDB().catch(console.error);
});
