import { describe, expect, it } from 'vitest';
import { createGame } from '$lib/engine/remi/actions';
import {
	appendToSir,
	cloneState,
	countDublePairs,
	createFormation,
	findMeld,
	findPiece,
	freshTurnState,
	hasPiece,
	nextMeldIds,
	pairOf,
	removePieces,
	takeFromSir,
	takeLastFromSir,
	TABLE_REASON
} from '$lib/engine/remi/table';
import type { Color, GameState, Piece } from '$lib/engine/remi/types';

let seq = 0;

function n(color: Color, value: number, id?: string): Piece {
	return { id: id ?? `${color}-${value}-${seq++}`, isJoker: false, value, color };
}

function joker(id?: string): Piece {
	return { id: id ?? `joker-${seq++}`, isJoker: true, value: 0, color: 'black' };
}

function game(): GameState {
	const deck = [
		n('red', 5),
		n('red', 5),
		n('red', 7),
		n('blue', 9),
		n('black', 13),
		n('yellow', 1),
		n('blue', 2),
		n('blue', 3),
		n('blue', 4),
		n('blue', 6),
		n('black', 7),
		n('black', 8),
		n('black', 9),
		n('black', 10),
		n('black', 11),
		n('black', 12),
		joker(),
		n('blue', 8),
		n('blue', 10),
		n('blue', 12),
		n('black', 1),
		n('yellow', 2),
		n('yellow', 3),
		n('yellow', 4),
		n('yellow', 5),
		n('yellow', 6),
		n('yellow', 7),
		n('yellow', 8),
		n('yellow', 9),
		n('yellow', 10),
		n('yellow', 11),
		n('yellow', 12)
	];
	return createGame({ playerCount: 2, deck });
}

describe('freshTurnState', () => {
	it('starts undrawn with no must-use list', () => {
		expect(freshTurnState()).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
	});

	it('returns a fresh object each call', () => {
		expect(freshTurnState()).not.toBe(freshTurnState());
	});
});

describe('cloneState', () => {
	it('copies every mutable container without touching the source', () => {
		const original = game();
		const copy = cloneState(original);

		expect(copy).toEqual(original);
		copy.players[0]?.rack.push(n('red', 3));
		copy.table.sir.push(n('blue', 2));
		copy.table.stock.pop();
		copy.turnState.mustUsePieceIds.push('x');
		copy.dubleOffers[0] = n('red', 5);
		copy.swappedJokerIds.push('x');
		copy.scores.push(1);
		copy.sessionTotals.push(1);

		expect(copy.players[0]?.rack).toHaveLength((original.players[0]?.rack.length as number) + 1);
		expect(original.table.sir).toHaveLength(0);
		expect(copy.table.stock).toHaveLength((original.table.stock.length as number) - 1);
		expect(original.turnState.mustUsePieceIds).toHaveLength(0);
		expect(original.dubleOffers[0]).toBeNull();
		expect(original.swappedJokerIds).toHaveLength(0);
		expect(original.scores).toHaveLength(0);
		expect(original.sessionTotals).toEqual([0, 0]);
	});

	it('deep-copies melds, so lipire on the clone never leaks', () => {
		const original = game();
		const meld = createFormation('m0', 'terta', [n('red', 5), n('blue', 5), n('yellow', 5)], 0);
		original.table.melds.push(meld);

		const copy = cloneState(original);
		(copy.table.melds[0]?.pieces as Piece[]).push(n('black', 5));
		(copy.table.melds[0]?.lipitBy as (number | null)[]).push(1);

		expect(original.table.melds[0]?.pieces).toHaveLength(3);
		expect(original.table.melds[0]?.lipitBy).toEqual([null, null, null]);
	});
});

describe('sir helpers', () => {
	it('appends without mutating the source', () => {
		const sir = appendToSir([n('red', 3)], n('blue', 4));
		expect(sir.map((piece) => piece.id)).toHaveLength(2);
	});

	it('takes the last piece off the șir', () => {
		const first = n('red', 3);
		const last = n('blue', 4);
		const result = takeLastFromSir([first, n('yellow', 5), last]);

		expect(result.piece.id).toBe(last.id);
		expect(result.sir).toHaveLength(2);
		expect(result.sir[0]?.id).toBe(first.id);
	});

	it('refuses to take from an empty șir', () => {
		expect(() => takeLastFromSir([])).toThrow(TABLE_REASON.sirEmpty);
	});

	it('takes the broken piece and everything laid after it', () => {
		const dead = n('red', 3);
		const before = n('black', 6);
		const broken = n('blue', 4);
		const after = n('yellow', 5);
		const result = takeFromSir([dead, before, broken, after], broken.id);

		expect(result.index).toBe(2);
		expect(result.piece.id).toBe(broken.id);
		expect(result.taken.map((piece) => piece.id)).toEqual([broken.id, after.id]);
		expect(result.sir.map((piece) => piece.id)).toEqual([dead.id, before.id]);
	});

	it('never takes the dead first piece', () => {
		const dead = n('red', 3);
		expect(() => takeFromSir([dead, n('blue', 4)], dead.id)).toThrow(TABLE_REASON.sirDeadFirst);
	});

	it('rejects a piece that is not in the șir', () => {
		expect(() => takeFromSir([n('red', 3), n('blue', 4)], 'nope')).toThrow(
			TABLE_REASON.pieceNotInSir
		);
	});
});

describe('meld helpers', () => {
	it('creates a formation owned by the player with no lipire yet', () => {
		const pieces = [n('red', 5), n('blue', 5), n('yellow', 5)];
		const meld = createFormation('m0', 'terta', pieces, 1);

		expect(meld).toEqual({
			id: 'm0',
			type: 'terta',
			pieces,
			owner: 1,
			lipitBy: [null, null, null],
			// No joker, so nobody is the terță's joker completer.
			tertaCompleter: null
		});
		expect(meld.pieces).not.toBe(pieces);
	});

	it('makes the melder the joker completer of a finished terță', () => {
		const meld = createFormation(
			'm0',
			'terta',
			[n('red', 5), n('blue', 5), n('yellow', 5), joker()],
			2
		);
		expect(meld.tertaCompleter).toBe(2);
	});

	it('leaves an unfinished joker terță without a completer', () => {
		const meld = createFormation('m0', 'terta', [n('red', 5), n('blue', 5), joker()], 2);
		expect(meld.tertaCompleter).toBeNull();
	});

	it('never marks a joker suită as completed', () => {
		const meld = createFormation('m0', 'suite', [n('red', 4), n('red', 5), joker()], 1);
		expect(meld.tertaCompleter).toBeNull();
	});

	it('mints ids after the existing ones', () => {
		const melds = [createFormation('m0', 'terta', [], 0), createFormation('m1', 'terta', [], 0)];
		expect(nextMeldIds(melds, 2)).toEqual(['m2', 'm3']);
	});

	it('finds a meld and throws otherwise', () => {
		const meld = createFormation('m7', 'suite', [], 0);
		expect(findMeld([meld], 'm7')).toBe(meld);
		expect(() => findMeld([meld], 'm8')).toThrow(TABLE_REASON.meldNotFound);
	});
});

describe('piece collections', () => {
	it('finds and tests membership by id', () => {
		const pieces = [n('red', 3), n('blue', 4)];
		expect(findPiece(pieces, pieces[1]?.id as string)?.value).toBe(4);
		expect(hasPiece(pieces, 'missing')).toBe(false);
	});

	it('removes by id without mutating the source', () => {
		const pieces = [n('red', 3), n('blue', 4), n('red', 5)];
		const removed = removePieces(pieces, [pieces[1]?.id as string]);

		expect(removed.map((piece) => piece.value)).toEqual([3, 5]);
		expect(pieces).toHaveLength(3);
	});

	it('collects both copies of an offered dublă', () => {
		const offered = n('red', 5, 'offered');
		const rack = [offered, n('blue', 4), n('red', 5, 'twin'), joker()];
		expect(pairOf(rack, offered).map((piece) => piece.id)).toEqual(['offered', 'twin']);
	});
});

describe('countDublePairs', () => {
	it('counts complete pairs only', () => {
		const rack = [
			n('red', 5, 'a'),
			n('red', 5, 'b'),
			n('blue', 7, 'c'),
			n('blue', 7, 'd'),
			n('black', 9, 'e'),
			n('yellow', 9, 'f')
		];
		expect(countDublePairs(rack)).toBe(2);
	});

	it('ignores jokers and lonely copies', () => {
		expect(countDublePairs([joker(), joker(), n('red', 5)])).toBe(0);
	});

	it('is zero on an empty rack', () => {
		expect(countDublePairs([])).toBe(0);
	});
});
