import { nanoid } from 'nanoid';
import { ratingsCol, queueCol, activeMatchesCol } from './db';

const DEFAULT_MMR = 1000;
const K_FACTOR = 32;
const MATCH_RANGE_EXPAND_MS = 15_000;
const INITIAL_MMR_DIFF = 100;
const MAX_MMR_DIFF = 500;

export interface QueueEntry {
	playerId: string;
	playerName: string;
	mmr: number;
	joinedAt: number;
}

export interface MatchInfo {
	roomCode: string;
	player1Id: string;
	player2Id: string;
	player1Name: string;
	player2Name: string;
	createdAt: number;
}

const QUEUE_DOC_ID = 'queue';

export async function getMMR(playerId: string): Promise<number> {
	const doc = await ratingsCol().findOne({ playerId });
	return doc?.mmr ?? DEFAULT_MMR;
}

export async function ensureMMR(playerId: string): Promise<void> {
	await ratingsCol().updateOne(
		{ playerId },
		{ $setOnInsert: { playerId, mmr: DEFAULT_MMR } },
		{ upsert: true }
	);
}

async function getQueue(): Promise<QueueEntry[]> {
	const doc = await queueCol().findOne({ _id: QUEUE_DOC_ID });
	return doc?.entries ?? [];
}

async function setQueue(entries: QueueEntry[]): Promise<void> {
	await queueCol().updateOne({ _id: QUEUE_DOC_ID }, { $set: { entries } }, { upsert: true });
}

function mmrDiff(entry: QueueEntry, now: number): number {
	const wait = now - entry.joinedAt;
	return Math.min(INITIAL_MMR_DIFF + Math.floor(wait / MATCH_RANGE_EXPAND_MS) * 50, MAX_MMR_DIFF);
}

export async function tryMatch(
	playerId: string,
	playerName: string
): Promise<{ matched: MatchInfo } | { queued: true }> {
	await ensureMMR(playerId);
	const mmr = await getMMR(playerId);
	const now = Date.now();

	const queue = await getQueue();

	const existing = queue.find((e) => e.playerId === playerId);
	if (existing) return { queued: true };

	let best: QueueEntry | null = null;
	let bestScore = -Infinity;

	for (const entry of queue) {
		const diff = Math.abs(entry.mmr - mmr);
		const maxDiff = mmrDiff(entry, now);
		if (diff > maxDiff) continue;
		const waitBonus = Math.min(now - entry.joinedAt, 60_000) / 1000;
		const score = waitBonus - diff;
		if (score > bestScore) {
			bestScore = score;
			best = entry;
		}
	}

	if (best) {
		queue.splice(queue.indexOf(best), 1);
		await setQueue(queue);

		const roomCode = nanoid(6).toUpperCase();
		const match: MatchInfo = {
			roomCode,
			player1Id: playerId,
			player2Id: best.playerId,
			player1Name: playerName,
			player2Name: best.playerName,
			createdAt: Date.now()
		};
		await activeMatchesCol().insertMany([
			{ playerId, ...match },
			{ playerId: best.playerId, ...match }
		]);
		return { matched: match };
	}

	queue.push({ playerId, playerName, mmr, joinedAt: now });
	await setQueue(queue);
	return { queued: true };
}

export async function leaveQueue(playerId: string): Promise<void> {
	const queue = await getQueue();
	const idx = queue.findIndex((e) => e.playerId === playerId);
	if (idx >= 0) {
		queue.splice(idx, 1);
		await setQueue(queue);
	}
}

export async function getMatch(playerId: string): Promise<MatchInfo | null> {
	const doc = await activeMatchesCol().findOne({ playerId });
	if (!doc) return null;
	const { _id, playerId: _pid, ...match } = doc as any;
	return match as MatchInfo;
}

export async function removeMatch(playerId: string): Promise<void> {
	const doc = await activeMatchesCol().findOne({ playerId });
	if (doc) {
		await activeMatchesCol().deleteMany({
			$or: [{ playerId: doc.player1Id }, { playerId: doc.player2Id }]
		});
	}
}

export async function recordResult(winnerId: string, loserId: string): Promise<void> {
	if (winnerId === loserId) return;
	await ensureMMR(winnerId);
	await ensureMMR(loserId);
	const winnerMMR = await getMMR(winnerId);
	const loserMMR = await getMMR(loserId);
	const expected = 1 / (1 + Math.pow(10, (loserMMR - winnerMMR) / 400));
	const delta = Math.round(K_FACTOR * (1 - expected));
	await ratingsCol().updateOne({ playerId: winnerId }, { $set: { mmr: winnerMMR + delta } });
	await ratingsCol().updateOne(
		{ playerId: loserId },
		{ $set: { mmr: Math.max(0, loserMMR - delta) } }
	);
}

export async function isQueued(playerId: string): Promise<boolean> {
	const queue = await getQueue();
	return queue.some((e) => e.playerId === playerId);
}

export async function cleanAbandonedMatches(): Promise<void> {
	await activeMatchesCol().deleteMany({ createdAt: { $lt: Date.now() - 3_600_000 } });
}

export async function getQueueSize(): Promise<number> {
	const queue = await getQueue();
	return queue.length;
}

const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
export function startCleanupTimer(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => {
		cleanAbandonedMatches().catch(console.error);
	}, CLEANUP_INTERVAL_MS);
}
export function stopCleanupTimer(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}
