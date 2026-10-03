import type { Color, FormationType, Piece } from './types';

export type FormationAnalysis = {
	valid: boolean;
	reason?: string;
	/** First-meld valuation (not the end-of-game value — see `finalPieceValue`). */
	points: number;
	/** Joker piece id -> the value it substitutes inside this formation. */
	jokerValues: Record<string, number>;
};

/** A type-agnostic formation, used by the partition solver and the AI. */
export type PieceFormation = { type: FormationType; pieces: Piece[] };

/** Exact, stable reason strings — the UI maps them to Romanian copy. */
export const REASON = {
	tooFew: 'at least 3 pieces',
	oneColour: 'all pieces must share one colour',
	notConsecutive: 'values must be consecutive',
	oneRule: 'the 1 can only be used in 1-2-3 or 12-13-1',
	sameValue: 'all natural pieces must share one value',
	distinctColours: 'terta colours must differ',
	tooManyJokers: 'max 2 jokers',
	oneJokerNeedsNaturals: 'a joker needs at least 2 natural pieces',
	twoJokersNeedNaturals: 'two jokers need at least 4 natural pieces',
	jokersAdjacent: 'two jokers cannot be adjacent'
} as const;

const MIN_FORMATION = 3;
const MAX_TERTA = 4;
const MAX_JOKERS = 2;
const MIN_NATURALS_TWO_JOKERS = 4;
const MAX_VALUE = 13;

/** Per-run variant cap for the partition solver (guards duplicate-heavy boards). */
const MAX_SUITE_VARIANTS = 24;
/** Node budget for the backtracking partition search. */
const PARTITION_BUDGET = 50_000;

/** End-of-game scoring value of a single piece. */
export function finalPieceValue(piece: Piece): number {
	if (piece.isJoker) return 50;
	if (piece.value === 1) return 25;
	return piece.value <= 9 ? 5 : 10;
}

/** First-meld value of a value inside a suită. A 1 is 10 when it closes 12-13-1. */
function suitePoints(value: number, followsThirteen: boolean): number {
	if (value === 1) return followsThirteen ? 10 : 5;
	return value <= 9 ? 5 : 10;
}

/** First-meld value of a value inside a terță. */
function tertaPoints(value: number): number {
	return value === 1 ? 25 : value <= 9 ? 5 : 10;
}

/**
 * Plain ascending blocks `a..a+n-1` (a + n - 1 <= 13), highest start first, so a
 * joker fills the gap *above* the run (5-6-J becomes 5-6-7, not 4-5-6).
 */
function plainRuns(length: number): number[][] {
	const runs: number[][] = [];
	for (let start = 1 + MAX_VALUE - length; start >= 1; start--) {
		const run: number[] = [];
		for (let v = start; v < start + length; v++) run.push(v);
		runs.push(run);
	}
	return runs;
}

/**
 * Wrapped blocks `[14-k..13, 1..n-k]`: the 13 -> 1 wrap happens after the piece
 * numbered `13-k+1`, so k = 2 is 12-13-1. k = 1 is the illegal 13-1-2 shape and
 * only exists so a failing suită can report the 1-rule reason.
 */
function wrappedRuns(length: number, fromK: number): number[][] {
	const runs: number[][] = [];
	for (let k = fromK; k <= length - 1; k++) {
		const run: number[] = [];
		for (let v = 14 - k; v <= MAX_VALUE; v++) run.push(v);
		for (let v = 1; v <= length - k; v++) run.push(v);
		runs.push(run);
	}
	return runs;
}

/** Legal runs of `length` pieces, in the order the analyser should try them. */
function enumerateRuns(length: number): number[][] {
	return [...plainRuns(length), ...wrappedRuns(length, 2)];
}

const runCache = new Map<number, number[][]>();
function cachedRuns(length: number): number[][] {
	const cached = runCache.get(length);
	if (cached) return cached;
	const runs = enumerateRuns(length);
	runCache.set(length, runs);
	return runs;
}

type SuiteSlot = { value: number; piece: Piece | null };

function analyzeSuite(pieces: Piece[]): FormationAnalysis {
	const empty: FormationAnalysis = { valid: false, points: 0, jokerValues: {} };
	const fail = (reason: string): FormationAnalysis => ({ ...empty, reason });

	const naturals = pieces.filter((p) => !p.isJoker);
	const jokers = pieces.filter((p) => p.isJoker);

	// Joker limits are structural, so they are checked before the piece count —
	// that way "a joker needs at least 2 natural pieces" is reachable.
	if (jokers.length > MAX_JOKERS) return fail(REASON.tooManyJokers);
	if (jokers.length === 1 && naturals.length < 2) return fail(REASON.oneJokerNeedsNaturals);
	if (jokers.length === 2 && naturals.length < MIN_NATURALS_TWO_JOKERS)
		return fail(REASON.twoJokersNeedNaturals);

	if (pieces.length < MIN_FORMATION) return fail(REASON.tooFew);

	const colour = naturals[0]?.color as Color;
	if (!naturals.every((p) => p.color === colour)) return fail(REASON.oneColour);

	const seenValues = new Set<number>();
	for (const natural of naturals) {
		if (seenValues.has(natural.value)) return fail(REASON.notConsecutive);
		seenValues.add(natural.value);
	}

	const length = pieces.length;
	let adjacencyBlocked = false;
	let oneRuleBlocked = false;

	for (const run of cachedRuns(length)) {
		// A suită never repeats a value; longer runs than 13 cannot exist.
		if (new Set(run).size !== run.length) continue;
		if (![...seenValues].every((value) => run.includes(value))) continue;

		const slots: SuiteSlot[] = run.map((value) => ({
			value,
			piece: naturals.find((p) => p.value === value) ?? null
		}));

		const gaps = slots.filter((slot) => slot.piece === null);
		if (gaps.length > jokers.length) continue;
		gaps.forEach((gap, i) => {
			gap.piece = jokers[i] as Piece;
		});

		let adjacent = false;
		for (let i = 1; i < slots.length; i++) {
			const previous = slots[i - 1]?.piece;
			const current = slots[i]?.piece;
			if (previous?.isJoker && current?.isJoker) adjacent = true;
		}
		if (adjacent) {
			adjacencyBlocked = true;
			continue;
		}

		let points = 0;
		const jokerValues: Record<string, number> = {};
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i] as SuiteSlot;
			const piece = slot.piece as Piece;
			const followsThirteen = i > 0 && (slots[i - 1] as SuiteSlot).value === MAX_VALUE;
			points += suitePoints(slot.value, followsThirteen);
			if (piece.isJoker) jokerValues[piece.id] = slot.value;
		}

		return { valid: true, points, jokerValues };
	}

	// No legal run: work out whether the 1 is the culprit so the reason is precise.
	for (const run of wrappedRuns(length, 1)) {
		if (new Set(run).size !== run.length) continue;
		if ([...seenValues].every((value) => run.includes(value))) {
			oneRuleBlocked = true;
			break;
		}
	}

	if (oneRuleBlocked) return fail(REASON.oneRule);
	if (adjacencyBlocked) return fail(REASON.jokersAdjacent);
	return fail(REASON.notConsecutive);
}

function analyzeTerta(pieces: Piece[]): FormationAnalysis {
	const empty: FormationAnalysis = { valid: false, points: 0, jokerValues: {} };
	const fail = (reason: string): FormationAnalysis => ({ ...empty, reason });

	const naturals = pieces.filter((p) => !p.isJoker);
	const jokers = pieces.filter((p) => p.isJoker);

	if (jokers.length > MAX_JOKERS) return fail(REASON.tooManyJokers);
	if (jokers.length === 1 && naturals.length < 2) return fail(REASON.oneJokerNeedsNaturals);
	if (jokers.length === 2 && naturals.length < MIN_NATURALS_TWO_JOKERS)
		return fail(REASON.twoJokersNeedNaturals);

	if (pieces.length < MIN_FORMATION) return fail(REASON.tooFew);
	if (pieces.length > MAX_TERTA) return fail(REASON.distinctColours);

	const value = naturals[0]?.value as number;
	if (!naturals.every((p) => p.value === value)) return fail(REASON.sameValue);

	const colours = new Set(naturals.map((p) => p.color));
	if (colours.size !== naturals.length) return fail(REASON.distinctColours);

	// Every joker takes the common value, in a colour no natural holds.
	const jokerValues: Record<string, number> = {};
	for (const joker of jokers) jokerValues[joker.id] = value;

	return { valid: true, points: tertaPoints(value) * pieces.length, jokerValues };
}

export function analyzeFormation(type: FormationType, pieces: Piece[]): FormationAnalysis {
	return type === 'suite' ? analyzeSuite(pieces) : analyzeTerta(pieces);
}

/**
 * First meld of the game: >= 45 points plus at least one suită, unless the meld
 * is exactly one terță of 1s (jokers substituting the 1 included).
 */
export function canOpen(melds: { type: FormationType; pieces: Piece[] }[]): {
	ok: boolean;
	points: number;
	reason?: string;
} {
	const analyses = melds.map((meld) => analyzeFormation(meld.type, meld.pieces));
	const points = analyses.reduce((sum, analysis) => sum + analysis.points, 0);

	if (!analyses.every((analysis) => analysis.valid)) {
		return { ok: false, points, reason: 'first meld not valid' };
	}

	if (melds.length === 1 && melds[0]?.type === 'terta' && isTertaOfOnes(melds[0].pieces)) {
		return { ok: true, points };
	}

	if (points < 45) return { ok: false, points, reason: 'first meld needs at least 45 points' };
	if (!melds.some((meld, i) => meld.type === 'suite' && analyses[i]?.valid)) {
		return { ok: false, points, reason: 'first meld needs at least one suite' };
	}

	return { ok: true, points };
}

function isTertaOfOnes(pieces: Piece[]): boolean {
	if (pieces.length !== 3 && pieces.length !== 4) return false;
	return pieces.every((piece) => piece.isJoker || piece.value === 1);
}

/* ------------------------------------------------------------------ *
 * Partition solver
 * ------------------------------------------------------------------ */

function subsetsOfSize<T>(pool: T[], size: number): T[][] {
	if (size === 0) return [[]];
	if (pool.length < size) return [];
	const [first, ...rest] = pool;
	const out: T[][] = [];
	for (const combo of subsetsOfSize(rest, size - 1)) out.push([first as T, ...combo]);
	for (const combo of subsetsOfSize(rest, size)) out.push(combo);
	return out;
}

function combinationsIncluding<T>(pool: T[], includeId: string, size: number): T[][] {
	const anchor = pool.find((item) => (item as { id: string }).id === includeId);
	if (!anchor) return [];
	const others = pool.filter((item) => (item as { id: string }).id !== includeId);
	return subsetsOfSize(others, size - 1).map((combo) => [anchor, ...combo]);
}

/**
 * Builds the piece combinations for one ordered run of one colour: one piece per
 * run value (gaps take jokers), branching over duplicate copies up to a cap.
 */
function suiteVariants(
	remaining: Piece[],
	anchor: Piece,
	colour: Color,
	run: number[],
	jokers: Piece[]
): Piece[][] {
	const slotOptions = run.map((value) => ({
		value,
		options: remaining.filter((p) => !p.isJoker && p.color === colour && p.value === value)
	}));

	const gaps = slotOptions.filter((slot) => slot.options.length === 0).length;
	if (gaps > jokers.length || gaps > MAX_JOKERS) return [];

	const choices: Piece[][] = [];
	for (const slot of slotOptions) {
		if (slot.options.length === 0) continue;
		const holdsAnchor = !anchor.isJoker && anchor.value === slot.value && anchor.color === colour;
		const rest = slot.options.filter((p) => p.id !== anchor.id);
		choices.push(holdsAnchor ? [anchor, ...rest] : rest);
	}

	let variants: Piece[][] = [[]];
	for (const options of choices) {
		const next: Piece[][] = [];
		for (const prefix of variants) {
			for (const option of options) {
				if (next.length >= MAX_SUITE_VARIANTS) break;
				next.push([...prefix, option]);
			}
		}
		variants = next;
	}

	// Anchor first so a joker anchor always lands in the first gap.
	const orderedJokers = [...jokers].sort((a, b) => {
		if (a.id === anchor.id) return -1;
		if (b.id === anchor.id) return 1;
		return a.id.localeCompare(b.id);
	});

	return variants.map((variant) => [...variant, ...orderedJokers.slice(0, gaps)]);
}

/**
 * Every valid formation that can be built from `pieces` and contains `anchor`.
 * Deterministic order: suites before terțe, then by piece ids.
 */
export function findFormationsContaining(pieces: Piece[], anchor: Piece): PieceFormation[] {
	const naturals = pieces.filter((p) => !p.isJoker);
	const jokers = pieces.filter((p) => p.isJoker);
	const found: PieceFormation[] = [];
	const seen = new Set<string>();

	const push = (type: FormationType, candidate: Piece[]): void => {
		const key = `${type}:${candidate
			.map((p) => p.id)
			.sort()
			.join(',')}`;
		if (seen.has(key)) return;
		if (!analyzeFormation(type, candidate).valid) return;
		seen.add(key);
		found.push({ type, pieces: candidate });
	};

	// Terțe: anchored on the piece's value, or on every value when the anchor is a joker.
	const valueGroups: Piece[][] = [];
	if (anchor.isJoker) {
		const byValue = new Map<number, Piece[]>();
		for (const natural of naturals) {
			const bucket = byValue.get(natural.value) ?? [];
			bucket.push(natural);
			byValue.set(natural.value, bucket);
		}
		for (const group of byValue.values()) valueGroups.push(group);
	} else {
		valueGroups.push([
			anchor,
			...naturals.filter((p) => p.value === anchor.value && p.id !== anchor.id)
		]);
	}

	for (const group of valueGroups) {
		const pool = [...group, ...jokers];
		for (let size = MIN_FORMATION; size <= MAX_TERTA; size++) {
			for (const combo of combinationsIncluding(pool, anchor.id, size)) {
				push('terta', combo);
			}
		}
	}

	// Suites: one colour, every legal run length.
	const colours: Color[] = anchor.isJoker
		? [...new Set(naturals.map((p) => p.color))]
		: [anchor.color];

	for (const colour of colours) {
		for (let length = MIN_FORMATION; length <= MAX_VALUE; length++) {
			for (const run of cachedRuns(length)) {
				if (!anchor.isJoker && !run.includes(anchor.value)) continue;
				for (const variant of suiteVariants(pieces, anchor, colour, run, jokers)) {
					push('suite', variant);
				}
			}
		}
	}

	return found.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'suite' ? -1 : 1;
		return a.pieces
			.map((p) => p.id)
			.sort()
			.join(',')
			.localeCompare(
				b.pieces
					.map((p) => p.id)
					.sort()
					.join(',')
			);
	});
}

/**
 * Splits a piece multiset into valid suits and terțe, or returns null. Used by
 * the pe-tablă "simplu" pattern and by the AI. Deterministic for a given input
 * (memoised, bounded search — gives up rather than hanging on pathological input).
 */
export function partitionIntoFormations(pieces: Piece[]): PieceFormation[] | null {
	const sorted = [...pieces].sort((a, b) => a.id.localeCompare(b.id));
	const failed = new Set<string>();
	let budget = PARTITION_BUDGET;

	const walk = (remaining: Piece[]): PieceFormation[] | null => {
		if (remaining.length === 0) return [];
		const key = remaining.map((p) => p.id).join(',');
		if (failed.has(key)) return null;
		if (budget-- <= 0) return null;

		const anchor = remaining[0] as Piece;
		for (const candidate of findFormationsContaining(remaining, anchor)) {
			const used = new Set(candidate.pieces.map((p) => p.id));
			const rest = remaining.filter((p) => !used.has(p.id));
			const sub = walk(rest);
			if (sub) return [candidate, ...sub];
		}

		failed.add(key);
		return null;
	};

	return walk(sorted);
}
