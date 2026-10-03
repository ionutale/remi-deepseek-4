import { describe, expect, it } from 'vitest';
import { PATTERN_BONUS, PATTERN_REASON, validatePattern } from '$lib/engine/remi/patterns';
import type { Color, PatternType, Piece } from '$lib/engine/remi/types';

let counter = 0;

function p(color: Color, value: number): Piece {
	return { id: `n${counter++}`, isJoker: false, value, color };
}

function j(): Piece {
	return { id: `j${counter++}`, isJoker: true, value: 0, color: 'black' };
}

const ALL: Color[] = ['red', 'blue', 'yellow', 'black'];

/** A complete `1..13,1` run of one colour (14 pieces). */
function completeRun(color: Color): Piece[] {
	const pieces: Piece[] = [];
	for (let value = 1; value <= 13; value++) pieces.push(p(color, value));
	pieces.push(p(color, 1));
	return pieces;
}

/** A complete `1..13,1` run laid out so no two neighbours share a colour. */
function mosaicRun(lastOne: Color): Piece[] {
	const cycle: Color[] = ['red', 'blue', 'yellow', 'black'];
	const pieces: Piece[] = [];
	for (let value = 1; value <= 13; value++) pieces.push(p(cycle[(value - 1) % 4] as Color, value));
	pieces.push(p(lastOne, 1));
	return pieces;
}

function progressOf(pattern: PatternType, pieces: Piece[]): number {
	return validatePattern(pattern, pieces).progress;
}

describe('PATTERN_BONUS', () => {
	it('matches the score sheet', () => {
		expect(PATTERN_BONUS).toEqual({
			simplu: 500,
			bete: 700,
			mozaic: 1000,
			bicolor: 1200,
			duble: 1300,
			monocolor: 1500
		});
	});
});

describe('validatePattern — simplu', () => {
	it('accepts a board of suits and terțe', () => {
		const board = [
			p('red', 5),
			p('red', 6),
			p('red', 7),
			p('red', 1),
			p('red', 12),
			p('red', 13),
			p('yellow', 9),
			p('blue', 9),
			p('black', 9)
		];
		expect(validatePattern('simplu', board)).toEqual({ valid: true, progress: 1 });
	});

	it('accepts a joker when it completes a suită', () => {
		const board = [p('red', 5), p('red', 6), j()];
		expect(validatePattern('simplu', board).valid).toBe(true);
	});

	it('rejects a board that cannot be arranged', () => {
		const board = [p('red', 5), p('blue', 5), p('red', 7)];
		const result = validatePattern('simplu', board);
		expect(result).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.notArrangement,
			progress: 0
		});
	});

	it('grows monotonically as pieces are added', () => {
		const partial = [p('red', 5), p('red', 7)];
		const complete = [p('red', 5), p('red', 6), p('red', 7)];
		expect(progressOf('simplu', partial)).toBe(0);
		expect(progressOf('simplu', complete)).toBe(1);
		// A piece that can be arranged keeps the ratio at 1.
		expect(progressOf('simplu', [...complete, p('red', 4)])).toBe(1);
		// A piece that can never be arranged lowers it.
		expect(progressOf('simplu', [...complete, p('blue', 12)])).toBeLessThan(1);
	});
});

describe('validatePattern — bete', () => {
	it('accepts two terțe of 4 plus two terțe of 3', () => {
		const board = [
			...ALL.map((color) => p(color, 5)),
			...ALL.map((color) => p(color, 6)),
			p('red', 7),
			p('blue', 7),
			p('yellow', 7),
			p('red', 8),
			p('blue', 8),
			p('yellow', 8)
		];
		expect(board).toHaveLength(14);
		expect(validatePattern('bete', board)).toEqual({ valid: true, progress: 1 });
	});

	it('rejects the wrong number of pieces', () => {
		const board = [...ALL.map((color) => p(color, 5)), p('red', 6), p('blue', 6)];
		expect(validatePattern('bete', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(14)
		});
	});

	it('rejects four terțe of 4 that do not split into 4-4-3-3', () => {
		const board = [
			...ALL.map((color) => p(color, 5)),
			...ALL.map((color) => p(color, 6)),
			...ALL.map((color) => p(color, 7)),
			p('red', 8),
			p('blue', 8)
		];
		expect(validatePattern('bete', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.beteShape
		});
	});

	it('grows monotonically', () => {
		const oneTerta = [...ALL.map((color) => p(color, 5))];
		const twoTerte = [...oneTerta, ...ALL.map((color) => p(color, 6))];
		expect(progressOf('bete', oneTerta)).toBeLessThan(progressOf('bete', twoTerte));
		expect(progressOf('bete', twoTerte)).toBeLessThan(1);
	});
});

describe('validatePattern — mozaic', () => {
	it('accepts a complete run with alternating colours', () => {
		expect(validatePattern('mozaic', mosaicRun('blue'))).toEqual({ valid: true, progress: 1 });
	});

	it('rejects two 1s of the same colour', () => {
		expect(validatePattern('mozaic', mosaicRun('red'))).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.mozaicColours
		});
	});

	it('rejects two neighbouring pieces of the same colour', () => {
		const board = mosaicRun('blue');
		// value 6 is blue; make value 7 blue too.
		board[6] = p('blue', 7);
		expect(validatePattern('mozaic', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.mozaicColours
		});
	});

	it('rejects a first four that does not cover the four colours', () => {
		const board = mosaicRun('blue');
		board[3] = p('red', 4);
		expect(validatePattern('mozaic', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.mozaicColours
		});
	});

	it('rejects a wrong value set', () => {
		const board = mosaicRun('blue');
		board[12] = p('black', 12);
		expect(validatePattern('mozaic', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.mozaicValues
		});
	});

	it('rejects a missing second 1', () => {
		const board = mosaicRun('blue').slice(0, 13);
		expect(validatePattern('mozaic', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(14)
		});
		expect(validatePattern('mozaic', [...board, p('red', 13)])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.mozaicValues
		});
	});

	it('rejects jokers', () => {
		expect(validatePattern('mozaic', [...mosaicRun('blue').slice(0, 13), j()])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.noJokers
		});
	});

	it('grows monotonically with the values collected', () => {
		const values = [1, 2, 3, 4, 5];
		const board = values.map((value, index) => p(ALL[index % 4] as Color, value));
		expect(progressOf('mozaic', board)).toBeCloseTo(5 / 14);
		const more = [...board, p('red', 6), p('blue', 7)];
		expect(progressOf('mozaic', more)).toBeGreaterThan(progressOf('mozaic', board));
	});
});

describe('validatePattern — bicolor', () => {
	it('accepts two complete runs in two colours', () => {
		const board = [...completeRun('red'), ...completeRun('blue')];
		expect(board).toHaveLength(28);
		expect(validatePattern('bicolor', board)).toEqual({ valid: true, progress: 1 });
	});

	it('rejects two complete runs in the same colour', () => {
		const board = [...completeRun('red'), ...completeRun('red')];
		expect(validatePattern('bicolor', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.bicolorColours
		});
	});

	it('rejects an incomplete second run', () => {
		const board = [...completeRun('red'), ...completeRun('blue').slice(1), p('blue', 3)];
		expect(board).toHaveLength(28);
		expect(validatePattern('bicolor', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.bicolorColours
		});
	});

	it('rejects the wrong number of pieces and jokers', () => {
		expect(validatePattern('bicolor', completeRun('red'))).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(28)
		});
		expect(validatePattern('bicolor', [...completeRun('red').slice(1), j()])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(28)
		});
	});

	it('grows monotonically', () => {
		const oneRun = completeRun('red');
		expect(progressOf('bicolor', oneRun)).toBeCloseTo(14 / 28);
		expect(progressOf('bicolor', [...oneRun, ...completeRun('blue')])).toBe(1);
	});
});

describe('validatePattern — monocolor', () => {
	it('accepts a complete run in one colour', () => {
		expect(validatePattern('monocolor', completeRun('yellow'))).toEqual({
			valid: true,
			progress: 1
		});
	});

	it('rejects a run missing its second 1', () => {
		expect(validatePattern('monocolor', completeRun('yellow').slice(0, 13))).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(14)
		});
		expect(
			validatePattern('monocolor', [...completeRun('yellow').slice(0, 13), p('red', 1)])
		).toMatchObject({ valid: false, reason: PATTERN_REASON.monocolorColours });
	});

	it('rejects a run spread over two colours', () => {
		const board = completeRun('yellow');
		board[6] = p('red', 7);
		expect(validatePattern('monocolor', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.monocolorColours
		});
	});

	it('rejects the wrong number of pieces and jokers', () => {
		expect(validatePattern('monocolor', completeRun('yellow').slice(1))).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(14)
		});
		expect(validatePattern('monocolor', [...completeRun('yellow').slice(1), j()])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.noJokers
		});
		expect(validatePattern('monocolor', [...completeRun('yellow'), j()])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.wrongCount(14)
		});
	});

	it('grows monotonically', () => {
		const partial = completeRun('yellow').slice(0, 10);
		expect(progressOf('monocolor', partial)).toBeCloseTo(10 / 14);
		expect(progressOf('monocolor', completeRun('yellow'))).toBe(1);
	});
});

describe('validatePattern — duble', () => {
	const pairs = () => {
		const board: Piece[] = [];
		for (let value = 1; value <= 7; value++) {
			board.push(p('red', value), p('red', value));
		}
		return board;
	};

	it('accepts seven identical pairs', () => {
		const board = pairs();
		expect(board).toHaveLength(14);
		expect(validatePattern('duble', board)).toEqual({ valid: true, progress: 1 });
	});

	it('rejects six pairs plus two singletons', () => {
		const board = [...pairs().slice(0, 12), p('blue', 9), p('blue', 10)];
		expect(validatePattern('duble', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.dublePairs
		});
	});

	it('counts a triple as a single pair', () => {
		const board = [...pairs().slice(0, 11), p('red', 6), p('red', 7), p('blue', 9)];
		expect(board).toHaveLength(14);
		expect(validatePattern('duble', board)).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.dublePairs
		});
	});

	it('rejects jokers', () => {
		expect(validatePattern('duble', [...pairs().slice(0, 13), j()])).toMatchObject({
			valid: false,
			reason: PATTERN_REASON.noJokers
		});
	});

	it('grows monotonically', () => {
		expect(progressOf('duble', [])).toBe(0);
		expect(progressOf('duble', pairs().slice(0, 2))).toBeCloseTo(2 / 14);
		expect(progressOf('duble', pairs().slice(0, 8))).toBeCloseTo(8 / 14);
		expect(progressOf('duble', pairs())).toBe(1);
	});
});
