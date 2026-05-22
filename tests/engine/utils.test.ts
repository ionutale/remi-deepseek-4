import { describe, it, expect, beforeEach } from 'vitest';
import { combinations, clearCombinationsCache } from '$lib/engine/utils';
import type { Card, Suit } from '$lib/engine/types';

let cardId = 0;
function card(suit: Suit, value: number): Card {
	return { suit, value, id: `c${++cardId}`, isJoker: false };
}

beforeEach(() => {
	cardId = 0;
	clearCombinationsCache();
});

describe('combinations', () => {
	it('returns [[]] for size 0', () => {
		const cards = [card('♠', 3), card('♥', 5)];
		expect(combinations(cards, 0)).toEqual([[]]);
	});

	it('returns [] when arr is shorter than size', () => {
		const cards = [card('♠', 3), card('♥', 5)];
		expect(combinations(cards, 3)).toEqual([]);
	});

	it('returns each element alone for size 1', () => {
		const c1 = card('♠', 3);
		const c2 = card('♥', 5);
		const c3 = card('♦', 7);
		const result = combinations([c1, c2, c3], 1);
		expect(result).toHaveLength(3);
		expect(result).toContainEqual([c1]);
		expect(result).toContainEqual([c2]);
		expect(result).toContainEqual([c3]);
	});

	it('returns correct number of combinations for nCr', () => {
		const cards = Array.from({ length: 6 }, (_, i) => card('♠', i + 1));
		expect(combinations(cards, 2)).toHaveLength(15);
		expect(combinations(cards, 3)).toHaveLength(20);
		expect(combinations(cards, 4)).toHaveLength(15);
	});

	it('returns correct 2-combinations from 4 elements', () => {
		const c1 = card('♠', 2);
		const c2 = card('♥', 3);
		const c3 = card('♦', 5);
		const c4 = card('♣', 7);
		const result = combinations([c1, c2, c3, c4], 2);
		expect(result).toHaveLength(6);
		expect(result).toContainEqual([c1, c2]);
		expect(result).toContainEqual([c1, c3]);
		expect(result).toContainEqual([c1, c4]);
		expect(result).toContainEqual([c2, c3]);
		expect(result).toContainEqual([c2, c4]);
		expect(result).toContainEqual([c3, c4]);
	});

	it('does not mutate the original array', () => {
		const cards = [card('♠', 2), card('♥', 3), card('♦', 5)];
		const copy = [...cards];
		combinations(cards, 2);
		expect(cards).toEqual(copy);
	});

	it('memoizes results for the same input', () => {
		const cards = [card('♠', 2), card('♥', 3), card('♦', 5)];
		const first = combinations(cards, 2);
		const second = combinations(cards, 2);
		expect(first).toBe(second);
	});
});

describe('clearCombinationsCache', () => {
	it('clears the internal cache', () => {
		const cards = [card('♠', 2), card('♥', 3), card('♦', 5)];
		const first = combinations(cards, 2);
		clearCombinationsCache();
		const second = combinations(cards, 2);
		expect(first).toEqual(second);
		expect(first).not.toBe(second);
	});
});
