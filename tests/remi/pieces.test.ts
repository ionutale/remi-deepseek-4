import { describe, expect, it } from 'vitest';
import {
	COLORS,
	createDeck,
	deal,
	dubleCategory,
	isSamePiece,
	shuffle
} from '$lib/engine/remi/pieces';
import type { Piece } from '$lib/engine/remi/types';

function seededRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function natural(color: Piece['color'], value: number, copy = 0): Piece {
	return { id: `${color}-${value}-${copy}`, isJoker: false, value, color };
}

describe('createDeck', () => {
	it('has exactly 106 pieces', () => {
		expect(createDeck()).toHaveLength(106);
	});

	it('has two copies of every value in every colour', () => {
		const deck = createDeck();
		const counts = new Map<string, number>();
		for (const piece of deck) {
			if (piece.isJoker) continue;
			counts.set(
				`${piece.color}-${piece.value}`,
				(counts.get(`${piece.color}-${piece.value}`) ?? 0) + 1
			);
		}
		expect(counts.size).toBe(52);
		expect([...counts.values()].every((count) => count === 2)).toBe(true);
		expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(104);
	});

	it('exposes the four remi colours', () => {
		expect(COLORS).toEqual(['red', 'yellow', 'blue', 'black']);
		const colours = new Set(
			createDeck()
				.filter((p) => !p.isJoker)
				.map((p) => p.color)
		);
		expect([...colours].sort()).toEqual(['black', 'blue', 'red', 'yellow']);
	});

	it('uses deterministic ids', () => {
		const ids = createDeck().map((piece) => piece.id);
		expect(ids).toHaveLength(new Set(ids).size);
		expect(ids).toContain('red-1-0');
		expect(ids).toContain('black-13-1');
	});

	it('adds two identical jokers with value 0', () => {
		const jokers = createDeck().filter((piece) => piece.isJoker);
		expect(jokers).toHaveLength(2);
		expect(jokers.map((joker) => joker.id)).toEqual(['joker-0', 'joker-1']);
		for (const joker of jokers) {
			expect(joker.value).toBe(0);
			expect(joker.color).toBe('black');
		}
	});
});

describe('shuffle', () => {
	it('keeps every piece exactly once', () => {
		const deck = createDeck();
		const shuffled = shuffle(deck, seededRng(7));
		expect(shuffled).toHaveLength(106);
		expect(new Set(shuffled.map((piece) => piece.id)).size).toBe(106);
	});

	it('does not mutate the input deck', () => {
		const deck = createDeck();
		const before = deck.map((piece) => piece.id);
		shuffle(deck, seededRng(3));
		expect(deck.map((piece) => piece.id)).toEqual(before);
	});

	it('is deterministic for a seeded rng', () => {
		const deck = createDeck();
		expect(shuffle(deck, seededRng(11)).map((p) => p.id)).toEqual(
			shuffle(deck, seededRng(11)).map((p) => p.id)
		);
	});

	it('actually reorders with a seeded rng', () => {
		const deck = createDeck();
		const ids = deck.map((piece) => piece.id);
		expect(shuffle(deck, seededRng(5)).map((p) => p.id)).not.toEqual(ids);
	});
});

describe('deal', () => {
	for (const playerCount of [2, 3, 4]) {
		it(`gives player 0 15 pieces and the others 14 (${playerCount} players)`, () => {
			const { racks } = deal(createDeck(), playerCount);
			expect(racks).toHaveLength(playerCount);
			expect(racks[0]).toHaveLength(15);
			for (const rack of racks.slice(1)) expect(rack).toHaveLength(14);
		});

		it(`keeps every piece accounted for (${playerCount} players)`, () => {
			const deck = createDeck();
			const { racks, stock, atu } = deal(deck, playerCount);
			const dealt = [...racks.flat(), ...stock, atu];
			expect(dealt).toHaveLength(106);
			expect(new Set(dealt.map((piece) => piece.id)).size).toBe(106);
		});

		it(`lifts the atu out of the stock (${playerCount} players)`, () => {
			const { racks, stock, atu } = deal(createDeck(), playerCount);
			expect(stock).toHaveLength(106 - 15 - 14 * (playerCount - 1) - 1);
			const stockIds = stock.map((piece) => piece.id);
			const rackIds = racks.flat().map((piece) => piece.id);
			expect(stockIds).not.toContain(atu.id);
			expect(rackIds).not.toContain(atu.id);
		});
	}

	it('is a pure function of the deck order', () => {
		const deck = createDeck();
		expect(deal(deck, 3).racks[0]?.map((p) => p.id)).toEqual(deck.slice(0, 15).map((p) => p.id));
	});

	it('rejects player counts outside 2..4', () => {
		expect(() => deal(createDeck(), 1)).toThrow();
		expect(() => deal(createDeck(), 5)).toThrow();
		expect(() => deal(createDeck(), 0)).toThrow();
	});
});

describe('dubleCategory', () => {
	it('classifies naturals', () => {
		for (let value = 2; value <= 9; value++)
			expect(dubleCategory(natural('red', value))).toBe('mica');
		for (let value = 10; value <= 13; value++)
			expect(dubleCategory(natural('blue', value))).toBe('mare');
		expect(dubleCategory(natural('black', 1))).toBe('cheie');
	});

	it('rejects jokers', () => {
		expect(() =>
			dubleCategory({ id: 'joker-0', isJoker: true, value: 0, color: 'black' })
		).toThrow();
	});
});

describe('isSamePiece', () => {
	it('matches two copies of the same value and colour', () => {
		expect(isSamePiece(natural('red', 7, 0), natural('red', 7, 1))).toBe(true);
	});

	it('rejects a different colour', () => {
		expect(isSamePiece(natural('red', 7, 0), natural('blue', 7, 0))).toBe(false);
	});

	it('rejects a different value', () => {
		expect(isSamePiece(natural('red', 7, 0), natural('red', 8, 0))).toBe(false);
	});

	it('never matches jokers', () => {
		const joker: Piece = { id: 'joker-0', isJoker: true, value: 0, color: 'black' };
		const otherJoker: Piece = { id: 'joker-1', isJoker: true, value: 0, color: 'black' };
		expect(isSamePiece(joker, otherJoker)).toBe(false);
		expect(isSamePiece(joker, natural('black', 0))).toBe(false);
	});
});
