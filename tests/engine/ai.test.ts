import { describe, it, expect } from 'vitest';
import { initMatch } from '$lib/engine/game';
import { autoPlayTurn, findSafestDiscard, shouldDrawFromDiscard } from '$lib/engine/ai';
import { validateCloseDeclaration } from '$lib/engine/meld';
import { clearCombinationsCache } from '$lib/engine/utils';
import type { Card, GameState, Suit, Value } from '$lib/engine/types';

let cardCounter = 0;
function card(suit: Suit, value: Value, isJoker = false): Card {
	return {
		suit,
		value,
		id: `t${cardCounter++}`,
		isJoker,
		...(isJoker ? { jokerType: 'colored' as const } : {})
	};
}

/**
 * A 15-card hand one discard away from a legal close: a set of four 5s, a set
 * of three 7s, a ♠9-10-J-Q sequence, a ♣2-3-4 sequence, and the 2♦ spare.
 */
function closableHand(): Card[] {
	const hand: Card[] = [];
	for (const suit of ['♠', '♥', '♦', '♣'] as Suit[]) hand.push(card(suit, 5 as Value));
	for (const suit of ['♠', '♥', '♦'] as Suit[]) hand.push(card(suit, 7 as Value));
	for (const value of [9, 10, 11, 12] as Value[]) hand.push(card('♠', value));
	for (const value of [2, 3, 4] as Value[]) hand.push(card('♣', value));
	hand.push(card('♦', 2 as Value));
	return hand;
}

function withHand(state: GameState, playerIndex: number, hand: Card[]): GameState {
	return {
		...state,
		players: state.players.map((p, i) => (i === playerIndex ? { ...p, hand } : p)),
		currentPlayerIndex: playerIndex
	};
}

describe('shouldDrawFromDiscard', () => {
	it('takes a colored joker no matter the hand', () => {
		expect(shouldDrawFromDiscard([], card('♥', 0 as Value, true))).toBe(true);
	});

	it('takes a card that completes a meld with the hand', () => {
		const hand = [card('♠', 5 as Value), card('♥', 5 as Value), card('♣', 9 as Value)];
		expect(shouldDrawFromDiscard(hand, card('♦', 5 as Value))).toBe(true);
	});

	it('leaves a card that belongs to no meld at all', () => {
		const hand = [
			card('♠', 2 as Value),
			card('♥', 5 as Value),
			card('♦', 9 as Value),
			card('♠', 8 as Value),
			card('♥', 3 as Value)
		];
		expect(shouldDrawFromDiscard(hand, card('♣', 13 as Value))).toBe(false);
	});
});

describe('findSafestDiscard', () => {
	it('keeps jokers when natural alternatives exist', () => {
		const hand = [
			card('♥', 0 as Value, true),
			card('♠', 2 as Value),
			card('♥', 7 as Value),
			card('♦', 9 as Value)
		];
		expect(findSafestDiscard(hand, []).isJoker).toBe(false);
	});

	it('discards the joker only when the hand holds nothing else', () => {
		const hand = [card('♥', 0 as Value, true)];
		expect(findSafestDiscard(hand, []).isJoker).toBe(true);
	});
});

describe('autoPlayTurn', () => {
	it('closes a fixed 15-card closable hand with a valid declaration', () => {
		const hand = closableHand();
		const state = withHand(initMatch({ playerCount: 2, humanPlayerIndex: 0 }), 0, hand);
		const after = autoPlayTurn({ ...state, phase: 'discard' });

		expect(after.phase).not.toBe('draw');
		expect(after.phase).toBe('round-over');
		const topDiscard = after.discardPile[after.discardPile.length - 1];
		expect(
			validateCloseDeclaration(hand, { melds: after.players[0].melds, discardId: topDiscard.id })
				.valid
		).toBe(true);
	});

	it('never throws and ends in a valid phase over generated hands', () => {
		const phases = ['draw', 'discard', 'round-over', 'finished'];
		for (let i = 0; i < 10; i++) {
			const dealt = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
			const playerIndex = i % 2;
			const state = { ...dealt, currentPlayerIndex: playerIndex };
			let after: GameState;
			expect(() => {
				after = autoPlayTurn(state);
			}).not.toThrow();
			expect(phases).toContain(after!.phase);
		}
	});

	it('plays a full turn within a generous per-turn budget', () => {
		clearCombinationsCache();
		// Warm up JIT/caches so the measured worst is the steady-state cost.
		autoPlayTurn(initMatch({ playerCount: 2, humanPlayerIndex: 0 }));
		let worst = 0;
		for (let i = 0; i < 10; i++) {
			const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
			const t0 = performance.now();
			autoPlayTurn({ ...state, currentPlayerIndex: 1 });
			worst = Math.max(worst, performance.now() - t0);
		}
		expect(worst).toBeLessThan(50);
	});
});
