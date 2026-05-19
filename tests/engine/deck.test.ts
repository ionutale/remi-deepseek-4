import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, deal } from '$lib/engine/deck';

describe('createDeck', () => {
	it('returns 108 cards', () => {
		const deck = createDeck();
		expect(deck).toHaveLength(108);
	});

	it('has 4 jokers', () => {
		const deck = createDeck();
		const jokers = deck.filter((c) => c.isJoker);
		expect(jokers).toHaveLength(4);
	});

	it('has 108 unique IDs', () => {
		const deck = createDeck();
		const ids = new Set(deck.map((c) => c.id));
		expect(ids.size).toBe(108);
	});

	it('has 2 copies of each suit-value combination', () => {
		const deck = createDeck();
		const suits = ['♠', '♥', '♦', '♣'] as const;
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
		for (const suit of suits) {
			for (const value of values) {
				const matches = deck.filter((c) => c.suit === suit && c.value === value && !c.isJoker);
				expect(matches).toHaveLength(2);
			}
		}
	});
});

describe('shuffle', () => {
	it('changes card order', () => {
		const deck = createDeck();
		const shuffled = shuffle(deck);
		expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(deck));
	});
});

describe('deal', () => {
	it('deals 15 cards to each of 4 players', () => {
		const deck = createDeck();
		const { hands, remaining } = deal(deck, 4);
		expect(hands).toHaveLength(4);
		hands.forEach((hand) => expect(hand).toHaveLength(15));
		expect(remaining).toHaveLength(108 - 4 * 15);
	});

	it('does not duplicate cards', () => {
		const deck = createDeck();
		const { hands, remaining } = deal(deck, 4);
		const allIds = [...hands.flat(), ...remaining].map((c) => c.id);
		const uniqueIds = new Set(allIds);
		expect(uniqueIds.size).toBe(allIds.length);
	});
});
