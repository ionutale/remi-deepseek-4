import { describe, it, expect } from 'vitest';
import { isValidSet, isValidSequence, isValidMeld, canFormValidClose } from '$lib/engine/meld';
import type { Card, Suit, Value } from '$lib/engine/types';

function c(suit: Suit, value: Value, isJoker = false): Card {
	return { suit, value, id: `${suit}-${value}-${Math.random()}`, isJoker };
}

describe('isValidSet', () => {
	it('accepts 3 cards same value different suits', () => {
		expect(isValidSet([c('♠', 5), c('♥', 5), c('♦', 5)])).toBe(true);
	});

	it('rejects 3 cards with duplicate suit', () => {
		expect(isValidSet([c('♠', 5), c('♥', 5), c('♠', 5)])).toBe(false);
	});

	it('rejects less than 3 cards', () => {
		expect(isValidSet([c('♠', 5), c('♥', 5)])).toBe(false);
	});

	it('accepts set with joker', () => {
		expect(isValidSet([c('♠', 5), c('♥', 5), c('♠', 0 as Value, true)])).toBe(true);
	});

	it('accepts 4 cards same value all different suits', () => {
		expect(isValidSet([c('♠', 7), c('♥', 7), c('♦', 7), c('♣', 7)])).toBe(true);
	});
});

describe('isValidSequence', () => {
	it('accepts 3 cards same suit consecutive values', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), c('♠', 7)])).toBe(true);
	});

	it('rejects non-consecutive values', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), c('♠', 8)])).toBe(false);
	});

	it('rejects different suits', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), c('♥', 7)])).toBe(false);
	});

	it('rejects less than 3 cards', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6)])).toBe(false);
	});

	it('accepts sequence with joker filling a gap', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), c('♠', 0 as Value, true)])).toBe(true);
	});

	it('accepts sequence with joker at start', () => {
		expect(isValidSequence([c('♠', 0 as Value, true), c('♠', 6), c('♠', 7)])).toBe(true);
	});

	it('accepts sequence with joker at end', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), c('♠', 0 as Value, true)])).toBe(true);
	});

	it('accepts longer sequence of 4 cards', () => {
		expect(isValidSequence([c('♣', 10), c('♣', 11), c('♣', 12), c('♣', 13)])).toBe(true);
	});
});

describe('isValidMeld', () => {
	it('accepts a valid set', () => {
		expect(isValidMeld([c('♠', 5), c('♥', 5), c('♦', 5)])).toBe(true);
	});

	it('accepts a valid sequence', () => {
		expect(isValidMeld([c('♠', 5), c('♠', 6), c('♠', 7)])).toBe(true);
	});

	it('rejects invalid cards (neither set nor sequence)', () => {
		expect(isValidMeld([c('♠', 5), c('♥', 6), c('♦', 7)])).toBe(false);
	});
});

describe('canFormValidClose', () => {
	it('accepts valid hand with sets and sequences (15 cards)', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 3),
			c('♣', 4),
			c('♣', 5)
		];
		expect(canFormValidClose(hand)).toBe(true);
	});

	it('rejects hand missing a set', () => {
		const hand = [
			c('♠', 5),
			c('♠', 6),
			c('♠', 7),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 3),
			c('♣', 4),
			c('♣', 5),
			c('♥', 8),
			c('♥', 9),
			c('♥', 10),
			c('♦', 2),
			c('♦', 3),
			c('♦', 4)
		];
		expect(canFormValidClose(hand)).toBe(false);
	});

	it('rejects hand missing a sequence', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♣', 3),
			c('♦', 3),
			c('♥', 3),
			c('♠', 2),
			c('♥', 2),
			c('♦', 2)
		];
		expect(canFormValidClose(hand)).toBe(false);
	});

	it('accepts valid hand with jokers filling gaps', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♠', 10),
			c('♠', 0 as Value, true),
			c('♣', 3),
			c('♣', 4),
			c('♣', 5),
			c('♠', 0 as Value, true),
			c('♥', 2),
			c('♦', 2)
		];
		expect(canFormValidClose(hand)).toBe(true);
	});

	it('rejects hand where 1 card does not fit any meld', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 3),
			c('♣', 4),
			c('♠', 13)
		];
		expect(canFormValidClose(hand)).toBe(false);
	});

	it('rejects hand with incomplete melds (only 2 cards)', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 3),
			c('♣', 4)
		];
		expect(canFormValidClose(hand)).toBe(false);
	});

	it('rejects hand with only 14 cards', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 3),
			c('♣', 4)
		];
		expect(canFormValidClose(hand)).toBe(false);
	});

	it('accepts valid hand with multiple valid partition possibilities', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12),
			c('♣', 2),
			c('♣', 3),
			c('♣', 4)
		];
		expect(canFormValidClose(hand)).toBe(true);
	});

	it('accepts hand where first partition is all-sets but mixed partition exists', () => {
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♠', 6),
			c('♥', 6),
			c('♦', 6),
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♠', 8),
			c('♥', 8),
			c('♦', 8),
			c('♠', 9),
			c('♥', 9),
			c('♦', 9)
		];
		expect(canFormValidClose(hand)).toBe(true);
	});

	it('accepts hand where first partition is all-sequences but mixed partition exists', () => {
		const hand = [
			c('♠', 5),
			c('♠', 6),
			c('♠', 7),
			c('♥', 5),
			c('♥', 6),
			c('♥', 7),
			c('♦', 5),
			c('♦', 6),
			c('♦', 7),
			c('♣', 5),
			c('♣', 6),
			c('♣', 7),
			c('♠', 9),
			c('♠', 10),
			c('♠', 11)
		];
		expect(canFormValidClose(hand)).toBe(true);
	});
});
