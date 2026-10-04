import {
	findFormationsContaining,
	partitionIntoFormations,
	type PieceFormation
} from './formations';
import type { Color, FormationType, PatternType, Piece } from './types';

export const PATTERN_BONUS: Record<PatternType, number> = {
	simplu: 500,
	bete: 700,
	mozaic: 1000,
	bicolor: 1200,
	duble: 1300,
	monocolor: 1500
};

export type PatternResult = { valid: boolean; reason?: string; progress: number };

/** Stable reason strings for the pe-tablă panel (UI maps them to Romanian copy). */
export const PATTERN_REASON = {
	notArrangement: 'pieces cannot be arranged into valid formations',
	wrongCount: (n: number) => `this pattern needs exactly ${n} pieces`,
	noJokers: 'this pattern cannot use jokers',
	jokerLimits: 'at most 2 jokers, and each must stand in for a missing twin',
	beteShape: 'bete needs 2 terțe of 4 plus 2 terțe of 3',
	mozaicValues: 'mozaic needs the values 1, 2, 3 ... 13, 1',
	mozaicColours: 'mozaic colours do not fit the required layout',
	bicolorColours: 'bicolor needs two complete runs in two different colours',
	monocolorColours: 'monocolor needs a complete run in one colour',
	dublePairs: 'duble needs 7 identical pairs'
} as const;

const RUN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const MAX_JOKERS = 2;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function invalid(reason: string, progress: number): PatternResult {
	return { valid: false, reason, progress: clamp01(progress) };
}

function valid(progress = 1): PatternResult {
	return { valid: true, progress: clamp01(progress) };
}

/**
 * How many of `pieces` belong to at least one valid formation of `type`.
 * Monotone: adding pieces can never shrink it.
 */
function coverableCount(pieces: Piece[], type?: FormationType): number {
	if (pieces.length === 0) return 0;
	const ids = new Set<string>();
	for (const piece of pieces) {
		for (const formation of findFormationsContaining(pieces, piece)) {
			if (type && formation.type !== type) continue;
			for (const member of formation.pieces) ids.add(member.id);
		}
	}
	return ids.size;
}

/** How many of the 14 slots of a complete `1..13,1` run a colour already fills. */
function runCoverage(pieces: Piece[], colour: Color): number {
	const naturals = pieces.filter((p) => !p.isJoker && p.color === colour);
	const values = new Set(naturals.map((p) => p.value));
	let covered = RUN_VALUES.filter((value) => values.has(value)).length;
	if (naturals.filter((p) => p.value === 1).length >= 2) covered += 1;
	return covered;
}

/** How many of the 14 required mozaic values are present (both 1s counted). */
function valueCoverage(pieces: Piece[]): number {
	const naturals = pieces.filter((p) => !p.isJoker);
	const values = new Set(naturals.map((p) => p.value));
	let covered = RUN_VALUES.filter((value) => values.has(value)).length;
	if (naturals.filter((p) => p.value === 1).length >= 2) covered += 1;
	return covered;
}

function partitionIntoTertas(pieces: Piece[]): PieceFormation[] | null {
	const sorted = [...pieces].sort((a, b) => a.id.localeCompare(b.id));
	const failed = new Set<string>();
	let budget = 20_000;

	const walk = (remaining: Piece[]): PieceFormation[] | null => {
		if (remaining.length === 0) return [];
		const key = remaining.map((p) => p.id).join(',');
		if (failed.has(key)) return null;
		if (budget-- <= 0) return null;

		const anchor = remaining[0] as Piece;
		for (const candidate of findFormationsContaining(remaining, anchor)) {
			if (candidate.type !== 'terta') continue;
			const used = new Set(candidate.pieces.map((p) => p.id));
			const sub = walk(remaining.filter((p) => !used.has(p.id)));
			if (sub) return [candidate, ...sub];
		}

		failed.add(key);
		return null;
	};

	return walk(sorted);
}

function validateSimplu(pieces: Piece[]): PatternResult {
	const covered = coverableCount(pieces);
	const progress = pieces.length === 0 ? 1 : covered / pieces.length;
	const partition = partitionIntoFormations(pieces);
	return partition ? valid(progress) : invalid(PATTERN_REASON.notArrangement, progress);
}

function validateBete(pieces: Piece[]): PatternResult {
	const covered = coverableCount(pieces, 'terta');
	const progress = covered / 14;

	if (pieces.length !== 14) return invalid(PATTERN_REASON.wrongCount(14), progress);
	const partition = partitionIntoTertas(pieces);
	// 14 pieces into terțe of 3–4 can only be 4 + 4 + 3 + 3.
	return partition ? valid(progress) : invalid(PATTERN_REASON.beteShape, progress);
}

function validateMozaic(pieces: Piece[]): PatternResult {
	const naturals = pieces.filter((p) => !p.isJoker);
	const progress = valueCoverage(naturals) / 14;

	if (pieces.length !== 14) return invalid(PATTERN_REASON.wrongCount(14), progress);
	if (naturals.length !== pieces.length) return invalid(PATTERN_REASON.noJokers, progress);

	const byValue = new Map<number, Piece[]>();
	for (const piece of naturals) {
		const bucket = byValue.get(piece.value) ?? [];
		bucket.push(piece);
		byValue.set(piece.value, bucket);
	}

	const shaped = RUN_VALUES.slice(1).every((value) => (byValue.get(value) ?? []).length === 1);
	// 14 pieces with exactly one of every value 2..13 leaves two slots for the 1s.
	if (!shaped) return invalid(PATTERN_REASON.mozaicValues, progress);

	const ones = byValue.get(1) ?? [];

	const fits = (first: Piece, last: Piece): boolean => {
		const colourOf = (value: number): Color =>
			(value === 1 ? first : ((byValue.get(value) as Piece[])[0] as Piece)).color;

		if (first.color === last.color) return false;

		// No two neighbouring pieces share a colour: 1a, 2 ... 13, 1b.
		for (let value = 1; value < 13; value++) {
			if (colourOf(value) === colourOf(value + 1)) return false;
		}
		if (colourOf(13) === last.color) return false;

		// The first four pieces cover all four colours.
		const head = new Set([colourOf(1), colourOf(2), colourOf(3), colourOf(4)]);
		return head.size === 4;
	};

	for (const [first, last] of [
		[ones[0] as Piece, ones[1] as Piece],
		[ones[1] as Piece, ones[0] as Piece]
	]) {
		if (fits(first, last)) return valid(progress);
	}

	return invalid(PATTERN_REASON.mozaicColours, progress);
}

function validateBicolor(pieces: Piece[]): PatternResult {
	const naturals = pieces.filter((p) => !p.isJoker);
	const coverages = new Map<Color, number>();
	for (const colour of new Set(naturals.map((p) => p.color))) {
		coverages.set(colour, runCoverage(pieces, colour));
	}
	const best = [...coverages.values()].sort((a, b) => b - a);
	const progress = ((best[0] ?? 0) + (best[1] ?? 0)) / 28;

	if (pieces.length !== 28) return invalid(PATTERN_REASON.wrongCount(28), progress);
	if (naturals.length !== pieces.length) return invalid(PATTERN_REASON.noJokers, progress);

	const complete = [...coverages.values()].filter((coverage) => coverage >= 14);
	return complete.length === 2 ? valid(progress) : invalid(PATTERN_REASON.bicolorColours, progress);
}

function validateMonocolor(pieces: Piece[]): PatternResult {
	const naturals = pieces.filter((p) => !p.isJoker);
	const coverages = new Map<Color, number>();
	for (const colour of new Set(naturals.map((p) => p.color))) {
		coverages.set(colour, runCoverage(pieces, colour));
	}
	const best = Math.max(0, ...coverages.values());
	const progress = best / 14;

	if (pieces.length !== 14) return invalid(PATTERN_REASON.wrongCount(14), progress);
	if (naturals.length !== pieces.length) return invalid(PATTERN_REASON.noJokers, progress);

	return best >= 14 ? valid(progress) : invalid(PATTERN_REASON.monocolorColours, progress);
}

/**
 * Duble = 7 pairs of identical pieces. Jokers are allowed under the standard
 * joker limits (interpretation #13: only Mozaic/Bicolor/Monocolor are
 * natural-only): a joker stands in for the missing twin of a lone natural, so
 * each joker needs its own single — two jokers are not an identical pair.
 * With 14 pieces and at most 2 jokers the ">= 2 / >= 4 naturals" half of the
 * joker rule can never fail here, so only the count limit is enforced.
 */
function validateDuble(pieces: Piece[]): PatternResult {
	const counts = new Map<string, number>();
	let jokers = 0;
	for (const piece of pieces) {
		if (piece.isJoker) {
			jokers++;
			continue;
		}
		const key = `${piece.color}-${piece.value}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const groupSizes = [...counts.values()];
	const naturalPairs = groupSizes.reduce((sum, count) => sum + Math.floor(count / 2), 0);
	const singles = groupSizes.filter((count) => count % 2 === 1).length;
	const pairs = naturalPairs + Math.min(jokers, singles);
	const progress = (2 * Math.min(pairs, 7)) / 14;

	if (pieces.length !== 14) return invalid(PATTERN_REASON.wrongCount(14), progress);
	if (jokers > MAX_JOKERS) return invalid(PATTERN_REASON.jokerLimits, progress);

	return pairs === 7 ? valid(progress) : invalid(PATTERN_REASON.dublePairs, progress);
}

/**
 * Validates a pe-tablă board. `progress` is a 0..1 UI estimate of how much of the
 * board is already arranged: it never drops when a piece is added that can be
 * part of a formation (a piece that can never be arranged lowers the ratio, by
 * design — it is junk on the board).
 */
export function validatePattern(pattern: PatternType, pieces: Piece[]): PatternResult {
	switch (pattern) {
		case 'simplu':
			return validateSimplu(pieces);
		case 'bete':
			return validateBete(pieces);
		case 'mozaic':
			return validateMozaic(pieces);
		case 'bicolor':
			return validateBicolor(pieces);
		case 'duble':
			return validateDuble(pieces);
		case 'monocolor':
			return validateMonocolor(pieces);
	}
}
