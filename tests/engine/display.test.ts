import { describe, it, expect } from 'vitest';
import { cardLabel, isRed, displayValue } from '$lib/engine/display';
import type { Card, Suit } from '$lib/engine/types';

function card(suit: Suit, value: number): Card {
	return { suit, value, id: 'c1', isJoker: false };
}

function coloredJoker(): Card {
	return { suit: '♠', value: 0, id: 'j1', isJoker: true, jokerType: 'colored' };
}

function blackJoker(): Card {
	return { suit: '♠', value: 0, id: 'j2', isJoker: true, jokerType: 'black' };
}

describe('cardLabel', () => {
	it('returns value and suit for numbered cards', () => {
		expect(cardLabel(card('♠', 5))).toBe('5♠');
		expect(cardLabel(card('♥', 10))).toBe('10♥');
	});

	it('returns A for ace', () => {
		expect(cardLabel(card('♦', 1))).toBe('A♦');
	});

	it('returns J for jack', () => {
		expect(cardLabel(card('♣', 11))).toBe('J♣');
	});

	it('returns Q for queen', () => {
		expect(cardLabel(card('♥', 12))).toBe('Q♥');
	});

	it('returns K for king', () => {
		expect(cardLabel(card('♠', 13))).toBe('K♠');
	});

	it('returns ★C for colored joker', () => {
		expect(cardLabel(coloredJoker())).toBe('★C');
	});

	it('returns ★B for black joker', () => {
		expect(cardLabel(blackJoker())).toBe('★B');
	});
});

describe('isRed', () => {
	it('returns true for hearts', () => {
		expect(isRed('♥')).toBe(true);
	});

	it('returns true for diamonds', () => {
		expect(isRed('♦')).toBe(true);
	});

	it('returns false for spades', () => {
		expect(isRed('♠')).toBe(false);
	});

	it('returns false for clubs', () => {
		expect(isRed('♣')).toBe(false);
	});
});

describe('displayValue', () => {
	it('returns number for numbered cards', () => {
		expect(displayValue(card('♠', 3))).toBe('3');
		expect(displayValue(card('♠', 10))).toBe('10');
	});

	it('returns A for ace', () => {
		expect(displayValue(card('♠', 1))).toBe('A');
	});

	it('returns J for jack', () => {
		expect(displayValue(card('♠', 11))).toBe('J');
	});

	it('returns Q for queen', () => {
		expect(displayValue(card('♠', 12))).toBe('Q');
	});

	it('returns K for king', () => {
		expect(displayValue(card('♠', 13))).toBe('K');
	});

	it('returns ★ for jokers', () => {
		expect(displayValue(coloredJoker())).toBe('★');
		expect(displayValue(blackJoker())).toBe('★');
	});
});
