import { describe, it, expect } from 'vitest';
import { cardPoints, handPoints, TARGET_SCORE } from '$lib/engine/scoring';
import type { Card, Suit, Value, JokerType } from '$lib/engine/types';

function c(suit: Suit, value: Value, isJoker = false, jokerType?: JokerType): Card {
	return { suit, value, id: `${suit}-${value}`, isJoker, jokerType };
}

describe('cardPoints', () => {
	it('number cards 2..10 at face value', () => {
		for (let v = 2; v <= 10; v++) {
			expect(cardPoints(c('♠', v as Value))).toBe(v);
		}
	});

	it('Ace (1) = 10', () => {
		expect(cardPoints(c('♠', 1))).toBe(10);
	});

	it('Jack (11) = 10', () => {
		expect(cardPoints(c('♥', 11))).toBe(10);
	});

	it('Queen (12) = 10', () => {
		expect(cardPoints(c('♦', 12))).toBe(10);
	});

	it('King (13) = 10', () => {
		expect(cardPoints(c('♣', 13))).toBe(10);
	});

	it('black joker = 25', () => {
		expect(cardPoints(c('♠', 0, true, 'black'))).toBe(25);
	});

	it('colored joker = 25', () => {
		expect(cardPoints(c('♥', 0, true, 'colored'))).toBe(25);
	});
});

describe('handPoints', () => {
	it('sums a mixed hand correctly', () => {
		const hand: Card[] = [
			c('♠', 2), // 2
			c('♥', 10), // 10
			c('♦', 1), // A = 10
			c('♣', 11), // J = 10
			c('♠', 0, true, 'black'), // joker = 25
			c('♥', 0, true, 'colored') // joker = 25
		];
		expect(handPoints(hand)).toBe(2 + 10 + 10 + 10 + 25 + 25);
	});

	it('empty hand = 0', () => {
		expect(handPoints([])).toBe(0);
	});
});

describe('TARGET_SCORE', () => {
	it('is 500', () => {
		expect(TARGET_SCORE).toBe(500);
	});
});
