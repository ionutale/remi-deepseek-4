import { describe, it, expect, beforeEach } from 'vitest';
import { aiTurn, shouldDrawFromDiscard, findSafestDiscard } from '$lib/engine/ai';
import type { Card } from '$lib/engine/types';
import { initGame } from '$lib/engine/game';
import { clearCombinationsCache } from '$lib/engine/utils';

beforeEach(() => clearCombinationsCache());

describe('shouldDrawFromDiscard', () => {
	it('returns true when discard completes a set', () => {
		const hand: Card[] = [
			{ suit: '♠', value: 5, id: 'h1', isJoker: false },
			{ suit: '♥', value: 5, id: 'h2', isJoker: false },
			{ suit: '♠', value: 10, id: 'h3', isJoker: false }
		];
		const discardTop: Card = { suit: '♦', value: 5, id: 'd1', isJoker: false };
		expect(shouldDrawFromDiscard(hand, discardTop)).toBe(true);
	});

	it('returns true when discard completes a sequence', () => {
		const hand: Card[] = [
			{ suit: '♠', value: 5, id: 'h1', isJoker: false },
			{ suit: '♠', value: 6, id: 'h2', isJoker: false }
		];
		const discardTop: Card = { suit: '♠', value: 7, id: 'd1', isJoker: false };
		expect(shouldDrawFromDiscard(hand, discardTop)).toBe(true);
	});

	it('returns false when discard does not help', () => {
		const hand: Card[] = [
			{ suit: '♠', value: 5, id: 'h1', isJoker: false },
			{ suit: '♥', value: 8, id: 'h2', isJoker: false }
		];
		const discardTop: Card = { suit: '♣', value: 2, id: 'd1', isJoker: false };
		expect(shouldDrawFromDiscard(hand, discardTop)).toBe(false);
	});
});

describe('findSafestDiscard', () => {
	it('returns card not part of any meld and with high discard overlap', () => {
		const hand: Card[] = [
			{ suit: '♠', value: 5, id: 'h1', isJoker: false },
			{ suit: '♥', value: 5, id: 'h2', isJoker: false },
			{ suit: '♦', value: 5, id: 'h3', isJoker: false },
			{ suit: '♠', value: 9, id: 'h4', isJoker: false }
		];
		const discardPile: Card[] = [
			{ suit: '♠', value: 8, id: 'd1', isJoker: false },
			{ suit: '♠', value: 10, id: 'd2', isJoker: false }
		];
		const worst = findSafestDiscard(hand, discardPile);
		// h4 (♠9) is safest: not meldable + many nearby spades in discard
		expect(worst.id).toBe('h4');
	});
});

describe('aiTurn', () => {
	it('draws 1 card and discards 1 card (net hand unchanged)', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const aiState = { ...state, currentPlayerIndex: 1 };
		const initialCount = aiState.players[1].hand.length;
		const drawPileCount = aiState.drawPile.length;

		const result = aiTurn(aiState);

		expect(result.players[1].hand).toHaveLength(initialCount);
		expect(result.currentPlayerIndex).toBe(0);
		expect(result.phase).toBe('draw');
		// AI may draw from pile or discard; either way one card was consumed
		expect(result.drawPile.length + result.discardPile.length).toBe(
			drawPileCount + state.discardPile.length
		);
	});

	it('closes the game when hand is winning', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		// 4 melds (14 cards) + K♥ spare — valid Romanian close
		const winningHand: Card[] = [
			{ suit: '♠', value: 5, id: 'i1', isJoker: false },
			{ suit: '♥', value: 5, id: 'i2', isJoker: false },
			{ suit: '♦', value: 5, id: 'i3', isJoker: false },
			{ suit: '♣', value: 5, id: 'i4', isJoker: false },  // set of 5s (4)
			{ suit: '♠', value: 7, id: 'i5', isJoker: false },
			{ suit: '♥', value: 7, id: 'i6', isJoker: false },
			{ suit: '♦', value: 7, id: 'i7', isJoker: false },   // set of 7s (3)
			{ suit: '♠', value: 10, id: 'i8', isJoker: false },
			{ suit: '♠', value: 11, id: 'i9', isJoker: false },
			{ suit: '♠', value: 12, id: 'i10', isJoker: false },  // sequence 10-12♠ (3)
			{ suit: '♣', value: 3, id: 'i11', isJoker: false },
			{ suit: '♣', value: 4, id: 'i12', isJoker: false },
			{ suit: '♣', value: 5, id: 'i13', isJoker: false },
			{ suit: '♣', value: 6, id: 'i14', isJoker: false },   // sequence 3-6♣ (4)
			{ suit: '♥', value: 13, id: 'i15', isJoker: false }   // spare K♥
		];
		state.players[1].hand = winningHand;
		state.currentPlayerIndex = 1;
		state.phase = 'draw';

		const result = aiTurn(state);
		expect(result.phase).toBe('finished');
		expect(result.winner).toBe(1);
	});
});
