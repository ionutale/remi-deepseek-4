import { describe, expect, it } from 'vitest';
import {
	REASON,
	analyzeFormation,
	canOpen,
	finalPieceValue,
	partitionIntoFormations
} from '$lib/engine/remi/formations';
import type { Color, Piece } from '$lib/engine/remi/types';

let counter = 0;

function p(color: Color, value: number): Piece {
	return { id: `n${counter++}`, isJoker: false, value, color };
}

function j(): Piece {
	return { id: `j${counter++}`, isJoker: true, value: 0, color: 'black' };
}

function run(color: Color, from: number, to: number): Piece[] {
	const pieces: Piece[] = [];
	for (let value = from; value <= to; value++) pieces.push(p(color, value));
	return pieces;
}

describe('finalPieceValue', () => {
	it('values naturals by the end-of-game table', () => {
		expect(finalPieceValue(p('red', 1))).toBe(25);
		for (let value = 2; value <= 9; value++) expect(finalPieceValue(p('red', value))).toBe(5);
		for (let value = 10; value <= 13; value++) expect(finalPieceValue(p('red', value))).toBe(10);
	});

	it('values a joker at 50', () => {
		expect(finalPieceValue(j())).toBe(50);
	});
});

describe('analyzeFormation — suită', () => {
	it('accepts 1-2-3', () => {
		const result = analyzeFormation('suite', [p('red', 1), p('red', 2), p('red', 3)]);
		expect(result).toEqual({ valid: true, points: 15, jokerValues: {} });
	});

	it('accepts a plain ascending run', () => {
		expect(analyzeFormation('suite', [p('blue', 2), p('blue', 3), p('blue', 4)]).valid).toBe(true);
		expect(analyzeFormation('suite', run('yellow', 5, 9)).valid).toBe(true);
	});

	it('accepts 12-13-1', () => {
		const result = analyzeFormation('suite', [p('red', 12), p('red', 13), p('red', 1)]);
		expect(result).toEqual({ valid: true, points: 30, jokerValues: {} });
	});

	it('accepts wrapped runs longer than three', () => {
		expect(
			analyzeFormation('suite', [p('red', 11), p('red', 12), p('red', 13), p('red', 1)]).valid
		).toBe(true);
		expect(
			analyzeFormation('suite', [p('red', 12), p('red', 13), p('red', 1), p('red', 2)]).valid
		).toBe(true);
		expect(analyzeFormation('suite', run('blue', 3, 13)).valid).toBe(true);
		expect(analyzeFormation('suite', run('black', 10, 13)).valid).toBe(true);
	});

	it('ignores the order the pieces are passed in', () => {
		expect(analyzeFormation('suite', [p('red', 3), p('red', 1), p('red', 2)]).valid).toBe(true);
	});

	it('rejects 13-1-2 (the 1 in the middle)', () => {
		expect(analyzeFormation('suite', [p('red', 13), p('red', 1), p('red', 2)])).toMatchObject({
			valid: false,
			reason: REASON.oneRule
		});
	});

	it('rejects longer runs that would need the 1 in the middle', () => {
		expect(
			analyzeFormation('suite', [p('red', 13), p('red', 1), p('red', 2), p('red', 3)])
		).toMatchObject({ valid: false, reason: REASON.oneRule });
	});

	it('rejects mixed colours', () => {
		expect(analyzeFormation('suite', [p('red', 5), p('blue', 6), p('red', 7)])).toMatchObject({
			valid: false,
			reason: REASON.oneColour
		});
	});

	it('rejects a gap with no joker to fill it', () => {
		expect(analyzeFormation('suite', [p('red', 5), p('red', 6), p('red', 8)])).toMatchObject({
			valid: false,
			reason: REASON.notConsecutive
		});
	});

	it('rejects duplicate values in one colour', () => {
		expect(analyzeFormation('suite', [p('red', 5), p('red', 5), p('red', 6)])).toMatchObject({
			valid: false,
			reason: REASON.notConsecutive
		});
	});

	it('rejects fewer than 3 pieces', () => {
		expect(analyzeFormation('suite', [p('red', 5), p('red', 6)])).toMatchObject({
			valid: false,
			reason: REASON.tooFew
		});
	});

	it('rejects a suită longer than 13 pieces', () => {
		expect(analyzeFormation('suite', [...run('red', 2, 13), j(), j()])).toMatchObject({
			valid: false
		});
	});
});

describe('analyzeFormation — suită with jokers', () => {
	it('accepts one joker filling a single gap', () => {
		const joker = j();
		const result = analyzeFormation('suite', [p('red', 5), p('red', 6), joker]);
		expect(result.valid).toBe(true);
		expect(result.jokerValues).toEqual({ [joker.id]: 7 });
		expect(result.points).toBe(15);
	});

	it('accepts a joker completing the run upward', () => {
		const joker = j();
		const result = analyzeFormation('suite', [p('red', 13), p('red', 1), joker]);
		expect(result.valid).toBe(true);
		expect(result.jokerValues).toEqual({ [joker.id]: 12 });
		expect(result.points).toBe(30);
	});

	it('rejects one joker with a single natural', () => {
		expect(analyzeFormation('suite', [p('red', 5), j()])).toMatchObject({
			valid: false,
			reason: REASON.oneJokerNeedsNaturals
		});
	});

	it('accepts two non-adjacent jokers', () => {
		const first = j();
		const second = j();
		const result = analyzeFormation('suite', [
			p('red', 5),
			first,
			p('red', 7),
			p('red', 8),
			second,
			p('red', 10)
		]);
		expect(result.valid).toBe(true);
		expect(result.jokerValues).toEqual({ [first.id]: 6, [second.id]: 9 });
		expect(result.points).toBe(35);
	});

	it('rejects two adjacent jokers', () => {
		expect(
			analyzeFormation('suite', [p('red', 5), p('red', 6), p('red', 7), j(), j(), p('red', 10)])
		).toMatchObject({ valid: false, reason: REASON.jokersAdjacent });
	});

	it('rejects two jokers with only three naturals', () => {
		expect(
			analyzeFormation('suite', [p('red', 5), p('red', 6), p('red', 8), j(), j()])
		).toMatchObject({ valid: false, reason: REASON.twoJokersNeedNaturals });
	});

	it('rejects more than two jokers', () => {
		expect(analyzeFormation('suite', [j(), j(), j(), p('red', 5), p('red', 6)])).toMatchObject({
			valid: false,
			reason: REASON.tooManyJokers
		});
	});
});

describe('analyzeFormation — terță', () => {
	it('accepts three different colours', () => {
		const result = analyzeFormation('terta', [p('red', 5), p('blue', 5), p('yellow', 5)]);
		expect(result).toEqual({ valid: true, points: 15, jokerValues: {} });
	});

	it('accepts all four colours', () => {
		const result = analyzeFormation('terta', [
			p('red', 5),
			p('blue', 5),
			p('yellow', 5),
			p('black', 5)
		]);
		expect(result).toEqual({ valid: true, points: 20, jokerValues: {} });
	});

	it('rejects a repeated colour', () => {
		expect(analyzeFormation('terta', [p('red', 5), p('red', 5), p('blue', 5)])).toMatchObject({
			valid: false,
			reason: REASON.distinctColours
		});
	});

	it('rejects mixed values', () => {
		expect(analyzeFormation('terta', [p('red', 5), p('blue', 6), p('yellow', 7)])).toMatchObject({
			valid: false,
			reason: REASON.sameValue
		});
	});

	it('rejects fewer than three pieces', () => {
		expect(analyzeFormation('terta', [p('red', 5), p('blue', 5)])).toMatchObject({
			valid: false,
			reason: REASON.tooFew
		});
	});

	it('rejects more than four pieces', () => {
		expect(
			analyzeFormation('terta', [
				p('red', 5),
				p('red', 5),
				p('blue', 5),
				p('yellow', 5),
				p('black', 5)
			])
		).toMatchObject({ valid: false, reason: REASON.distinctColours });
	});

	it('accepts one joker on top of two naturals', () => {
		const joker = j();
		const result = analyzeFormation('terta', [p('red', 7), p('blue', 7), joker]);
		expect(result.valid).toBe(true);
		expect(result.jokerValues).toEqual({ [joker.id]: 7 });
		expect(result.points).toBe(15);
	});

	it('rejects two jokers on top of two naturals', () => {
		expect(analyzeFormation('terta', [p('red', 7), p('blue', 7), j(), j()])).toMatchObject({
			valid: false,
			reason: REASON.twoJokersNeedNaturals
		});
	});

	it('rejects more than two jokers', () => {
		expect(
			analyzeFormation('terta', [p('red', 7), p('blue', 7), p('yellow', 7), j(), j(), j()])
		).toMatchObject({
			valid: false,
			reason: REASON.tooManyJokers
		});
	});
});

describe('analyzeFormation — first-meld points', () => {
	it('values a 1 as 5 in 1-2-3 and as 10 in 12-13-1', () => {
		expect(analyzeFormation('suite', [p('red', 1), p('red', 2), p('red', 3)]).points).toBe(15);
		expect(analyzeFormation('suite', [p('red', 12), p('red', 13), p('red', 1)]).points).toBe(30);
	});

	it('values a 1 as 25 in a terță', () => {
		expect(analyzeFormation('terta', [p('red', 1), p('blue', 1), p('yellow', 1)]).points).toBe(75);
		expect(
			analyzeFormation('terta', [p('red', 1), p('blue', 1), p('yellow', 1), p('black', 1)]).points
		).toBe(100);
	});

	it('values a joker as the piece it substitutes', () => {
		// Joker becomes a 6 → 5 points.
		expect(analyzeFormation('suite', [p('red', 4), p('red', 5), j()]).points).toBe(15);
		// Joker becomes a 13 → 10 points.
		expect(analyzeFormation('suite', [p('red', 11), p('red', 12), j()]).points).toBe(30);
		// Joker becomes the wrapped 1 of 11-12-13-1 → 10 points.
		const wrapped = j();
		const wrapResult = analyzeFormation('suite', [
			p('red', 11),
			p('red', 12),
			p('red', 13),
			p('red', 2),
			wrapped
		]);
		expect(wrapResult.jokerValues).toEqual({ [wrapped.id]: 1 });
		expect(wrapResult.points).toBe(45);
		// Joker becomes a 1 inside a terță → 25 points.
		const joker = j();
		const result = analyzeFormation('terta', [p('red', 1), p('blue', 1), joker]);
		expect(result.jokerValues).toEqual({ [joker.id]: 1 });
		expect(result.points).toBe(75);
	});

	it('values 2-9 as 5 and 10-13 as 10', () => {
		expect(analyzeFormation('suite', [p('red', 2), p('red', 3), p('red', 4)]).points).toBe(15);
		expect(analyzeFormation('suite', [p('red', 10), p('red', 11), p('red', 12)]).points).toBe(30);
		expect(analyzeFormation('terta', [p('red', 13), p('blue', 13), p('yellow', 13)]).points).toBe(
			30
		);
	});
});

describe('canOpen', () => {
	const suiteBig = () => ({ type: 'suite' as const, pieces: run('red', 10, 13) }); // 40
	const suiteSmall = () => ({ type: 'suite' as const, pieces: run('red', 5, 7) }); // 15
	const terta = (color: Color, value: number, size = 3) => ({
		type: 'terta' as const,
		pieces: (['red', 'blue', 'yellow', 'black'] as Color[]).slice(0, size).map((c) => p(c, value))
	});

	it('opens at exactly 45 points with a suită', () => {
		expect(canOpen([suiteSmall(), terta('red', 10, 3)])).toEqual({ ok: true, points: 45 });
	});

	it('opens above 45 points with a suită', () => {
		expect(canOpen([suiteBig(), terta('red', 5, 3)])).toEqual({ ok: true, points: 55 });
	});

	it('refuses below 45 points', () => {
		expect(canOpen([suiteSmall()])).toMatchObject({
			ok: false,
			points: 15,
			reason: 'first meld needs at least 45 points'
		});
	});

	it('refuses enough points without a suită', () => {
		expect(canOpen([terta('red', 12, 4), terta('red', 5, 4)])).toMatchObject({
			ok: false,
			points: 60,
			reason: 'first meld needs at least one suite'
		});
	});

	it('opens with a single terță of three 1s', () => {
		expect(canOpen([terta('red', 1, 3)])).toEqual({ ok: true, points: 75 });
	});

	it('opens with a single terță of four 1s', () => {
		expect(canOpen([terta('red', 1, 4)])).toEqual({ ok: true, points: 100 });
	});

	it('opens with a terță of 1s completed by a joker', () => {
		expect(canOpen([{ type: 'terta', pieces: [p('red', 1), p('blue', 1), j()] }])).toMatchObject({
			ok: true
		});
	});

	it('refuses when another 1-terță is on the table too', () => {
		expect(canOpen([terta('red', 1, 3), terta('red', 1, 4)])).toMatchObject({
			ok: false,
			points: 175,
			reason: 'first meld needs at least one suite'
		});
	});

	it('refuses an invalid formation', () => {
		expect(
			canOpen([{ type: 'suite', pieces: [p('red', 5), p('blue', 6), p('yellow', 7)] }])
		).toMatchObject({ ok: false, points: 0, reason: 'first meld not valid' });
	});

	it('refuses an empty opening', () => {
		expect(canOpen([])).toMatchObject({
			ok: false,
			points: 0,
			reason: 'first meld needs at least 45 points'
		});
	});
});

describe('partitionIntoFormations', () => {
	it('splits pieces into valid formations', () => {
		const partition = partitionIntoFormations([
			p('red', 5),
			p('red', 6),
			p('red', 7),
			p('blue', 5),
			p('blue', 6),
			p('blue', 7)
		]);
		expect(partition).toHaveLength(2);
		expect(partition?.every((formation) => formation.type === 'suite')).toBe(true);
		expect(partition?.flatMap((formation) => formation.pieces)).toHaveLength(6);
	});

	it('mixes suits and terțe', () => {
		const partition = partitionIntoFormations([
			p('red', 5),
			p('red', 6),
			p('red', 7),
			p('yellow', 9),
			p('blue', 9),
			p('black', 9)
		]);
		expect(partition).toHaveLength(2);
		expect(partition?.map((formation) => formation.type).sort()).toEqual(['suite', 'terta']);
	});

	it('uses a joker when that is the only way', () => {
		const joker = j();
		const partition = partitionIntoFormations([p('red', 5), p('red', 6), joker]);
		expect(partition).toHaveLength(1);
		expect(partition?.[0]?.pieces.map((piece) => piece.id)).toContain(joker.id);
	});

	it('returns null when nothing can be formed', () => {
		expect(partitionIntoFormations([p('red', 5), p('blue', 5), p('red', 7)])).toBeNull();
		expect(partitionIntoFormations([p('red', 1), p('red', 5), p('red', 9)])).toBeNull();
		expect(partitionIntoFormations([p('red', 5), j()])).toBeNull();
	});

	it('is deterministic', () => {
		const pieces = [
			p('red', 5),
			p('red', 6),
			p('red', 7),
			p('yellow', 9),
			p('blue', 9),
			p('black', 9)
		];
		const first = partitionIntoFormations(pieces);
		const second = partitionIntoFormations(pieces);
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it('handles a full 14 piece board', () => {
		const pieces = [
			...run('red', 5, 7),
			...run('blue', 5, 7),
			p('red', 10),
			p('blue', 10),
			p('yellow', 10),
			p('black', 10),
			p('red', 11),
			p('blue', 11),
			p('yellow', 11),
			p('black', 11)
		];
		const partition = partitionIntoFormations(pieces);
		expect(partition).toHaveLength(4);
		expect(partition?.flatMap((formation) => formation.pieces)).toHaveLength(14);
	});
});
