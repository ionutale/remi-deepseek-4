import { nanoid } from 'nanoid';

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
}

const mmrMap = new Map<string, number>();
const queue: QueueEntry[] = [];
const activeMatches = new Map<string, MatchInfo>();

export function getMMR(playerId: string): number {
	return mmrMap.get(playerId) ?? DEFAULT_MMR;
}

export function ensureMMR(playerId: string): void {
	if (!mmrMap.has(playerId)) mmrMap.set(playerId, DEFAULT_MMR);
}

function mmrDiff(entry: QueueEntry, now: number): number {
	const wait = now - entry.joinedAt;
	return Math.min(INITIAL_MMR_DIFF + Math.floor(wait / MATCH_RANGE_EXPAND_MS) * 50, MAX_MMR_DIFF);
}

export function tryMatch(
	playerId: string,
	playerName: string
): { matched: MatchInfo } | { queued: true } {
	ensureMMR(playerId);
	const mmr = getMMR(playerId);
	const now = Date.now();

	const existing = queue.find((e) => e.playerId === playerId);
	if (existing) return { queued: true };

	let best: QueueEntry | null = null;
	let bestDiff = Infinity;

	for (const entry of queue) {
		const diff = Math.abs(entry.mmr - mmr);
		const maxDiff = mmrDiff(entry, now);
		if (diff <= maxDiff && diff < bestDiff) {
			bestDiff = diff;
			best = entry;
		}
	}

	if (best) {
		queue.splice(queue.indexOf(best), 1);

		const roomCode = nanoid(6).toUpperCase();
		const match: MatchInfo = {
			roomCode,
			player1Id: playerId,
			player2Id: best.playerId,
			player1Name: playerName,
			player2Name: best.playerName
		};
		activeMatches.set(playerId, match);
		activeMatches.set(best.playerId, match);
		return { matched: match };
	}

	queue.push({ playerId, playerName, mmr, joinedAt: now });
	return { queued: true };
}

export function leaveQueue(playerId: string): void {
	const idx = queue.findIndex((e) => e.playerId === playerId);
	if (idx >= 0) queue.splice(idx, 1);
}

export function getMatch(playerId: string): MatchInfo | null {
	return activeMatches.get(playerId) ?? null;
}

export function removeMatch(playerId: string): void {
	const match = activeMatches.get(playerId);
	if (match) {
		activeMatches.delete(match.player1Id);
		activeMatches.delete(match.player2Id);
	}
}

export function recordResult(winnerId: string, loserId: string): void {
	ensureMMR(winnerId);
	ensureMMR(loserId);
	const winnerMMR = getMMR(winnerId);
	const loserMMR = getMMR(loserId);
	const expected = 1 / (1 + Math.pow(10, (loserMMR - winnerMMR) / 400));
	const delta = Math.round(K_FACTOR * (1 - expected));
	mmrMap.set(winnerId, winnerMMR + delta);
	mmrMap.set(loserId, Math.max(0, loserMMR - delta));
}

export function getQueueSize(): number {
	return queue.length;
}
