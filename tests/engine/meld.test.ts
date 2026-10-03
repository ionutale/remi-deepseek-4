import { describe, it, expect } from 'vitest';
import {
	isValidSet,
	isValidSequence,
	isValidMeld,
	validateMeld,
	validateCloseDeclaration,
	canFormValidClose
} from '$lib/engine/meld';
import type { Card, JokerType, Meld, Suit, Value } from '$lib/engine/types';

let cardId = 0;
function c(suit: Suit, value: Value, isJoker = false, jokerType?: JokerType): Card {
	return { suit, value, id: `t${cardId++}`, isJoker, jokerType };
}
function joker(jokerType: JokerType = 'black'): Card {
	return c(jokerType === 'black' ? '♠' : '♥', 0 as Value, true, jokerType);
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
		expect(isValidSet([c('♠', 5), c('♥', 5), joker()])).toBe(true);
	});

	it('rejects set with more than 1 joker', () => {
		expect(isValidSet([c('♠', 5), joker(), joker('colored')])).toBe(false);
	});

	it('rejects set with fewer than 2 naturals', () => {
		expect(isValidSet([c('♠', 5), joker(), joker('colored')])).toBe(false);
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
		expect(isValidSequence([c('♠', 5), c('♠', 7), joker()])).toBe(true);
	});

	it('accepts sequence with joker at start', () => {
		expect(isValidSequence([joker(), c('♠', 6), c('♠', 7)])).toBe(true);
	});

	it('accepts sequence with joker at end', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 6), joker()])).toBe(true);
	});

	it('rejects sequence with more than 1 joker', () => {
		expect(isValidSequence([c('♠', 5), joker(), joker('colored')])).toBe(false);
	});

	it('rejects duplicate value in a sequence', () => {
		expect(isValidSequence([c('♠', 5), c('♠', 5), c('♠', 6)])).toBe(false);
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

	it('rejects a standalone joker (colored or black)', () => {
		expect(isValidMeld([joker('colored')])).toBe(false);
		expect(isValidMeld([joker('black')])).toBe(false);
	});
});

describe('validateMeld', () => {
	it('accepts a valid set with type set', () => {
		const result = validateMeld([c('♠', 5), c('♥', 5), c('♦', 5)]);
		expect(result).toEqual({ valid: true, type: 'set' });
	});

	it('accepts a valid sequence with type sequence', () => {
		const result = validateMeld([c('♠', 5), c('♠', 6), c('♠', 7)]);
		expect(result).toEqual({ valid: true, type: 'sequence' });
	});

	it('rejects fewer than 3 cards', () => {
		expect(validateMeld([c('♠', 5), c('♥', 5)])).toEqual({
			valid: false,
			reason: 'at least 3 cards'
		});
	});

	it('rejects more than 1 joker', () => {
		expect(validateMeld([c('♠', 5), c('♥', 5), joker(), joker('colored')])).toEqual({
			valid: false,
			reason: 'max 1 joker per meld'
		});
	});

	it('rejects fewer than 2 naturals', () => {
		expect(validateMeld([c('♠', 5), joker(), joker('colored')])).toEqual({
			valid: false,
			reason: 'at least 2 natural cards'
		});
	});

	it('accepts a gap sequence with exactly 1 joker', () => {
		const result = validateMeld([c('♠', 5), c('♠', 7), joker()]);
		expect(result).toEqual({ valid: true, type: 'sequence' });
	});

	it('rejects a duplicate value in a sequence', () => {
		expect(validateMeld([c('♠', 5), c('♠', 5), c('♠', 6)])).toEqual({
			valid: false,
			reason: 'not a set or a sequence'
		});
	});

	it('rejects cards that are neither a set nor a sequence', () => {
		expect(validateMeld([c('♠', 5), c('♥', 6), c('♦', 7)])).toEqual({
			valid: false,
			reason: 'not a set or a sequence'
		});
	});
});

/** 15-card hand: set(5s) + set(7s) + seq(9-11♠) + seq(2-6♣) + J♥ spare. */
function buildCloseHand(): { hand: Card[]; melds: Meld[]; discardId: string } {
	const set5 = [c('♠', 5), c('♥', 5), c('♦', 5)];
	const set7 = [c('♠', 7), c('♥', 7), c('♦', 7)];
	const seqS = [c('♠', 9), c('♠', 10), c('♠', 11)];
	const seqC = [c('♣', 2), c('♣', 3), c('♣', 4), c('♣', 5), c('♣', 6)];
	const spare = c('♥', 11);
	const hand = [...set5, ...set7, ...seqS, ...seqC, spare];
	const melds: Meld[] = [
		{ cards: set5, type: 'set' },
		{ cards: set7, type: 'set' },
		{ cards: seqS, type: 'sequence' },
		{ cards: seqC, type: 'sequence' }
	];
	return { hand, melds, discardId: spare.id };
}

describe('validateCloseDeclaration', () => {
	it('accepts a valid close', () => {
		const { hand, melds, discardId } = buildCloseHand();
		expect(validateCloseDeclaration(hand, { melds, discardId })).toEqual({ valid: true });
	});

	it('rejects a discard card not in hand', () => {
		const { hand, melds } = buildCloseHand();
		expect(validateCloseDeclaration(hand, { melds, discardId: 'missing-id' })).toEqual({
			valid: false,
			reason: 'discard card must be in hand'
		});
	});

	it('rejects a meld card not in hand', () => {
		const { hand, melds, discardId } = buildCloseHand();
		const foreign = c('♦', 13);
		const tampered: Meld[] = melds.map((m, i) =>
			i === 0 ? { ...m, cards: [foreign, ...m.cards.slice(1)] } : m
		);
		expect(validateCloseDeclaration(hand, { melds: tampered, discardId })).toEqual({
			valid: false,
			reason: 'melds must cover exactly 14 cards, each exactly once'
		});
	});

	it('rejects a card used in two melds', () => {
		const { hand, melds, discardId } = buildCloseHand();
		const shared = melds[0].cards[0];
		const tampered: Meld[] = melds.map((m, i) =>
			i === 1 ? { ...m, cards: [shared, ...m.cards.slice(1)] } : m
		);
		expect(validateCloseDeclaration(hand, { melds: tampered, discardId })).toEqual({
			valid: false,
			reason: 'melds must cover exactly 14 cards, each exactly once'
		});
	});

	it('rejects only 13 melded cards', () => {
		const { hand, melds, discardId } = buildCloseHand();
		const short: Meld[] = melds.map((m, i) => (i === 0 ? { ...m, cards: m.cards.slice(1) } : m));
		expect(validateCloseDeclaration(hand, { melds: short, discardId })).toEqual({
			valid: false,
			reason: 'melds must cover exactly 14 cards, each exactly once'
		});
	});

	it('rejects an invalid meld', () => {
		const { hand, melds, discardId } = buildCloseHand();
		// Swap one card between two melds: coverage stays exact, both melds break.
		const [a, b] = [melds[0].cards[0], melds[2].cards[0]];
		const broken: Meld[] = [
			{ cards: [b, ...melds[0].cards.slice(1)], type: 'set' },
			melds[1],
			{ cards: [a, ...melds[2].cards.slice(1)], type: 'sequence' },
			melds[3]
		];
		expect(validateCloseDeclaration(hand, { melds: broken, discardId })).toEqual({
			valid: false,
			reason: 'not a set or a sequence'
		});
	});

	it('rejects a close with no set', () => {
		const seqA = [c('♠', 5), c('♠', 6), c('♠', 7)];
		const seqB = [c('♥', 9), c('♥', 10), c('♥', 11)];
		const seqC = [c('♣', 3), c('♣', 4), c('♣', 5), c('♣', 6)];
		const seqD = [c('♦', 2), c('♦', 3), c('♦', 4), c('♦', 5)];
		const spare = c('♣', 13);
		const hand = [...seqA, ...seqB, ...seqC, ...seqD, spare];
		const melds: Meld[] = [
			{ cards: seqA, type: 'sequence' },
			{ cards: seqB, type: 'sequence' },
			{ cards: seqC, type: 'sequence' },
			{ cards: seqD, type: 'sequence' }
		];
		expect(validateCloseDeclaration(hand, { melds, discardId: spare.id })).toEqual({
			valid: false,
			reason: 'need at least one set and one sequence'
		});
	});

	it('rejects a close with no sequence', () => {
		const setA = [c('♠', 5), c('♥', 5), c('♦', 5)];
		const setB = [c('♠', 7), c('♥', 7), c('♦', 7)];
		const setC = [c('♠', 9), c('♥', 9), c('♦', 9), c('♣', 9)];
		const setD = [c('♠', 3), c('♥', 3), c('♦', 3), c('♣', 3)];
		const spare = c('♠', 13);
		const hand = [...setA, ...setB, ...setC, ...setD, spare];
		const melds: Meld[] = [
			{ cards: setA, type: 'set' },
			{ cards: setB, type: 'set' },
			{ cards: setC, type: 'set' },
			{ cards: setD, type: 'set' }
		];
		expect(validateCloseDeclaration(hand, { melds, discardId: spare.id })).toEqual({
			valid: false,
			reason: 'need at least one set and one sequence'
		});
	});

	it('rejects a hand that is not 15 cards', () => {
		const { hand, melds, discardId } = buildCloseHand();
		expect(validateCloseDeclaration(hand.slice(0, 14), { melds, discardId })).toEqual({
			valid: false,
			reason: 'hand must have 15 cards'
		});
	});

	it('rejects a sequence mislabeled as type set', () => {
		const { hand, melds, discardId } = buildCloseHand();
		const relabeled: Meld[] = melds.map((m) =>
			m.type === 'sequence' ? { ...m, type: 'set' as const } : m
		);
		expect(validateCloseDeclaration(hand, { melds: relabeled, discardId })).toEqual({
			valid: false,
			reason: 'not a set or a sequence'
		});
	});
});

describe('canFormValidClose', () => {
	it('accepts valid hand with sets and sequences (15 cards)', () => {
		// 4 melds (14 cards) + K♥ as spare (no other Kings or consecutive ♥ in hand)
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5), // set of 5s (3)
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♣', 7), // set of 7s (4)
			c('♠', 10),
			c('♠', 11),
			c('♠', 12), // sequence 10-12♠ (3)
			c('♣', 3),
			c('♣', 4),
			c('♣', 5),
			c('♣', 6), // sequence 3-6♣ (4)
			c('♥', 13) // spare K♥
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
		// 4 melds (14 cards) using one joker + second joker as spare
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5), // set of 5s (3)
			c('♠', 7),
			c('♥', 7),
			c('♦', 7),
			c('♣', 7), // set of 7s (4)
			c('♠', 9),
			c('♠', 10),
			joker(), // seq 9-10-[11]♠ via joker (3)
			c('♣', 3),
			c('♣', 4),
			c('♣', 5),
			c('♣', 6), // sequence 3-6♣ (4)
			joker('colored') // spare joker
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
		// 14 cards admit two valid partitions; 15th (J♥) is the spare
		// Partition A: {5s set} {7s set} {9-12♠ seq} {2-4♣ seq}
		// Partition B (via 5♣,6♣): {5♣,6♣,7♣?,..} — drives the algorithm to backtrack
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5),
			c('♣', 5), // set of 5s (4)
			c('♠', 7),
			c('♥', 7),
			c('♦', 7), // set of 7s (3)
			c('♠', 9),
			c('♠', 10),
			c('♠', 11),
			c('♠', 12), // sequence 9-12♠ (4)
			c('♣', 2),
			c('♣', 3),
			c('♣', 4), // sequence 2-4♣ (3)
			c('♥', 11) // spare J♥
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

	it('rejects a close that would need a standalone joker meld', () => {
		// 13 natural cards in valid melds + colored joker + spare: the joker
		// cannot stand alone, and no meld can absorb it without breaking.
		const hand = [
			c('♠', 5),
			c('♥', 5),
			c('♦', 5), // set of 5s (3)
			c('♠', 10),
			c('♠', 11),
			c('♠', 12), // sequence 10-12♠ (3)
			c('♣', 3),
			c('♣', 4),
			c('♣', 5),
			c('♣', 6), // sequence 3-6♣ (4)
			c('♠', 7),
			c('♥', 7),
			c('♦', 8), // 7♠,7♥ + 8♦ fit no meld with the joker (needs ≥2 naturals per meld)
			joker('colored'),
			c('♥', 13) // spare K♥
		];
		expect(canFormValidClose(hand)).toBe(false);
	});
});
