import { describe, expect, it } from 'vitest';
import { pickWinner, scoreGame } from '$lib/engine/remi/scoring';
import type {
	Color,
	Formation,
	FormationType,
	GameState,
	PatternType,
	Piece,
	PlayerState
} from '$lib/engine/remi/types';

let counter = 0;

function p(color: Color, value: number): Piece {
	return { id: `n${counter++}`, isJoker: false, value, color };
}

function j(): Piece {
	return { id: `j${counter++}`, isJoker: true, value: 0, color: 'black' };
}

function meld(
	type: FormationType,
	pieces: Piece[],
	owner: number,
	lipitBy: (number | null)[] = pieces.map(() => null)
): Formation {
	return { id: `m${counter++}`, type, pieces, owner, lipitBy };
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
	return {
		rack: [],
		melded: true,
		meldedTurn: null,
		turnsTaken: 0,
		announcedAtu: false,
		peTabla: null,
		peTablaComplete: false,
		...overrides
	};
}

function state(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
	return {
		schemaVersion: 3,
		phase: 'finished',
		players,
		currentPlayerIndex: 0,
		table: { melds: [], sir: [], stock: [], atu: null },
		dubleOffers: players.map(() => null),
		turnState: { hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] },
		swappedJokerIds: [],
		turnNumber: 20,
		firstPlayerIndex: 0,
		doubleGame: false,
		scores: [],
		sessionTotals: [],
		gameWinner: null,
		turnStartedAt: 0,
		revision: 1,
		...overrides
	};
}

/**
 * These fixtures lay the closer's discard on top of the șir, which is the piece
 * `close` hands to `scoreGame`. A pe-tablă whole-rack close passes `null` — it
 * discarded nothing (interpretation #11).
 */
const closingDiscard = (game: GameState): Piece | null =>
	game.table.sir[game.table.sir.length - 1] ?? null;

const suite = (color: Color, from: number, to: number) => {
	const pieces: Piece[] = [];
	for (let value = from; value <= to; value++) pieces.push(p(color, value));
	return pieces;
};

describe('scoreGame — melders', () => {
	it('adds melded value and the closing bonus for the closer', () => {
		const pieces = suite('red', 5, 7);
		const game = state([player(), player()], {
			table: {
				melds: [meld('suite', pieces, 0)],
				sir: [p('black', 9), p('blue', 4)],
				stock: [],
				atu: null
			}
		});

		const { scores, breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]).toEqual({
			meldedPoints: 15,
			lipitPoints: 0,
			rackPenalty: 0,
			closingBonus: 50,
			atuBonus: 0,
			peTablaBonus: 0,
			nonMelderPenalty: 0,
			multiplier: 1,
			total: 65
		});
		expect(scores).toEqual([65, 0]);
	});

	it('subtracts the rack of every melder', () => {
		const game = state([player({ rack: [p('red', 1), p('red', 2)] })], {
			table: { melds: [meld('suite', suite('red', 5, 7), 0)], sir: [], stock: [], atu: null }
		});

		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.rackPenalty).toBe(-30);
		expect(breakdowns[0]?.total).toBe(-15);
	});

	it('values a joker left on the rack at 50', () => {
		const game = state([player({ rack: [j()] })]);
		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.rackPenalty).toBe(-50);
		expect(breakdowns[0]?.total).toBe(-50);
	});

	it('counts pieces lipit onto another player meld for the lipitor', () => {
		const pieces = suite('red', 5, 7);
		const game = state([player(), player()], {
			table: {
				melds: [meld('suite', pieces, 1, [null, 0, null])],
				sir: [],
				stock: [],
				atu: null
			}
		});

		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.lipitPoints).toBe(5);
		expect(breakdowns[0]?.meldedPoints).toBe(0);
		expect(breakdowns[1]?.meldedPoints).toBe(10);
		expect(breakdowns[1]?.lipitPoints).toBe(0);
	});

	it('counts a piece lipit onto your own meld only once', () => {
		const pieces = suite('red', 5, 7);
		const game = state([player()], {
			table: {
				melds: [meld('suite', pieces, 0, [null, 0, null])],
				sir: [],
				stock: [],
				atu: null
			}
		});

		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.meldedPoints).toBe(10);
		expect(breakdowns[0]?.lipitPoints).toBe(5);
		expect(breakdowns[0]?.total).toBe(15);
	});
});

describe('scoreGame — bonuses and penalties', () => {
	it('gives no closing bonus when the stock runs out', () => {
		const game = state([player()], {
			table: {
				melds: [meld('suite', suite('red', 5, 7), 0)],
				sir: [p('blue', 4)],
				stock: [],
				atu: null
			}
		});

		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.closingBonus).toBe(0);
		expect(breakdowns[0]?.total).toBe(15);
	});

	it('adds the atu bonus to anyone who announced it', () => {
		const game = state([player({ announcedAtu: true })], {
			table: { melds: [meld('suite', suite('red', 5, 7), 0)], sir: [], stock: [], atu: null }
		});
		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.atuBonus).toBe(50);
		expect(breakdowns[0]?.total).toBe(65);
	});

	it('flattens a non-melder at -100 without counting their rack', () => {
		const game = state([player({ melded: false, rack: [p('red', 1), p('red', 13)] })]);
		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.nonMelderPenalty).toBe(-100);
		expect(breakdowns[0]?.rackPenalty).toBe(0);
		expect(breakdowns[0]?.total).toBe(-100);
	});

	it('nets -50 for a non-melder who announced atu', () => {
		const game = state([player({ melded: false, announcedAtu: true })]);
		const { breakdowns } = scoreGame(game, null, null);
		expect(breakdowns[0]?.total).toBe(-50);
	});

	it('gives a non-melder no closing bonus', () => {
		const game = state([player({ melded: false })], {
			table: { melds: [], sir: [p('blue', 4)], stock: [], atu: null }
		});
		const { breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.closingBonus).toBe(0);
		expect(breakdowns[0]?.total).toBe(-100);
	});
});

describe('scoreGame — multipliers', () => {
	const base = (overrides: Partial<GameState> = {}, sir: Piece[] = [p('blue', 4)]) =>
		state([player(), player({ melded: false })], {
			table: { melds: [meld('suite', suite('red', 5, 7), 0)], sir, stock: [], atu: null },
			...overrides
		});

	it('doubles the closer total when the closing piece is a joker', () => {
		const game = base({}, [j()]);
		const { scores, breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.multiplier).toBe(2);
		expect(breakdowns[0]?.total).toBe(130);
		expect(breakdowns[1]?.multiplier).toBe(1);
		expect(scores).toEqual([130, -100]);
	});

	it('doubles every score in a joc dublu', () => {
		const game = base({ doubleGame: true });
		const { scores, breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.multiplier).toBe(2);
		expect(scores).toEqual([130, -200]);
	});

	it('multiplies by four on a joker close in a joc dublu', () => {
		const game = base({ doubleGame: true }, [j()]);
		const { scores, breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.multiplier).toBe(4);
		expect(scores).toEqual([260, -200]);
	});

	it('ignores a joker that is not the closing piece', () => {
		const game = base({}, [j(), p('blue', 4)]);
		const { breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.multiplier).toBe(1);
	});
});

describe('scoreGame — pe tablă', () => {
	const board = (pattern: PatternType, overrides: Partial<PlayerState> = {}) =>
		player({
			melded: false,
			rack: [p('red', 1), p('red', 2)],
			peTabla: { pattern, declaredTurn: 1 },
			peTablaComplete: true,
			...overrides
		});

	it('replaces the meld math with the pattern bonus', () => {
		const game = state([board('monocolor'), player()], {
			table: { melds: [], sir: [p('blue', 4)], stock: [], atu: null }
		});
		const { scores, breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.peTablaBonus).toBe(1500);
		expect(breakdowns[0]?.rackPenalty).toBe(0);
		expect(breakdowns[0]?.total).toBe(1500);
		expect(scores).toEqual([1500, 0]);
	});

	it('adds the atu bonus to a completed board', () => {
		const game = state([board('duble', { announcedAtu: true })]);
		const { breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.total).toBe(1350);
	});

	it('applies the joc dublu multiplier to the pattern bonus', () => {
		const game = state([board('simplu')], { doubleGame: true });
		const { breakdowns } = scoreGame(game, 0, closingDiscard(game));
		expect(breakdowns[0]?.multiplier).toBe(2);
		expect(breakdowns[0]?.total).toBe(1000);
	});

	it('ignores a joker left on the șir by someone else', () => {
		// Interpretation #11: a board covering the whole rack closes with no
		// discard at all, so there is no closing piece and no x2.
		const game = state([board('simplu')], {
			table: { melds: [], sir: [j()], stock: [], atu: null }
		});
		const { breakdowns } = scoreGame(game, 0, null);
		expect(breakdowns[0]?.multiplier).toBe(1);
		expect(breakdowns[0]?.total).toBe(500);
	});

	it('doubles a completed board closed by discarding a joker', () => {
		const outside = j();
		const game = state([board('simplu')], {
			table: { melds: [], sir: [outside], stock: [], atu: null }
		});
		const { breakdowns } = scoreGame(game, 0, outside);
		expect(breakdowns[0]?.multiplier).toBe(2);
		expect(breakdowns[0]?.total).toBe(1000);
	});

	it('doubles a board closed by a joker in a joc dublu', () => {
		const outside = j();
		const game = state([board('simplu', { announcedAtu: true })], {
			table: { melds: [], sir: [outside], stock: [], atu: null },
			doubleGame: true
		});
		const { breakdowns } = scoreGame(game, 0, outside);
		expect(breakdowns[0]?.multiplier).toBe(4);
		// (500 pattern + 50 atu) x 4
		expect(breakdowns[0]?.total).toBe(2200);
	});

	it('flattens a declared but incomplete board at -100', () => {
		const game = state(
			[player({ melded: false, peTabla: { pattern: 'bete', declaredTurn: 2 } }), player()],
			{ table: { melds: [], sir: [p('blue', 4)], stock: [], atu: null } }
		);
		const { breakdowns } = scoreGame(game, 1, closingDiscard(game));
		expect(breakdowns[0]?.peTablaBonus).toBe(0);
		expect(breakdowns[0]?.nonMelderPenalty).toBe(-100);
		expect(breakdowns[0]?.total).toBe(-100);
	});
});

describe('pickWinner', () => {
	it('returns the highest score', () => {
		expect(pickWinner([10, 40, 20])).toBe(1);
		expect(pickWinner([-100, -50, -200])).toBe(1);
	});

	it('breaks ties with the lowest index', () => {
		expect(pickWinner([30, 30, 10])).toBe(0);
	});

	it('handles an empty score list', () => {
		expect(pickWinner([])).toBeNull();
	});
});
