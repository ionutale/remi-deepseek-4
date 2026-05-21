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

const ALLOWED_ORIGINS: (string | undefined)[] = [
	undefined,
	'http://localhost:5173',
	'http://localhost:4173',
	process.env.ORIGIN
];

function isAllowedOrigin(origin: string | null): boolean {
	if (!origin) return true;
	return ALLOWED_ORIGINS.some((allowed) => allowed && origin.startsWith(allowed));
}

export async function handle({ event, resolve }) {
	const ip = event.request.headers.get('x-forwarded-for') ?? 'unknown';
	if (!rateLimit(ip)) {
		return new Response('Too many requests', { status: 429 });
	}

	const origin = event.request.headers.get('origin');
	if (!isAllowedOrigin(origin)) {
		return new Response('Forbidden', { status: 403 });
	}

	return resolve(event);
}
