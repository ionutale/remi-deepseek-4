import { describe, it, expect } from 'vitest';
import {
	initGame,
	drawFromPile,
	drawFromDiscard,
	discardCard,
	closeGame,
	nextTurn
} from '$lib/engine/game';
import type { Card, GameState, Suit, Value } from '$lib/engine/types';

function card(suit: Suit, value: Value, id: string): Card {
	return { suit, value, id, isJoker: false };
}

describe('initGame', () => {
	it('creates GameState with 4 players each having 14 cards', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		expect(state.players).toHaveLength(4);
		state.players.forEach((p) => expect(p.hand).toHaveLength(14));
		expect(state.phase).toBe('draw');
		expect(state.currentPlayerIndex).toBe(0);
		expect(state.winner).toBeNull();
	});

	it('has correct draw pile and discard pile', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		expect(state.drawPile.length).toBe(108 - 4 * 14 - 1);
		expect(state.discardPile).toHaveLength(1);
	});
});

describe('drawFromPile', () => {
	it('adds a card to current player hand', () => {
		let state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const pileSize = state.drawPile.length;
		state = drawFromPile(state);
		expect(state.players[0].hand).toHaveLength(15);
		expect(state.drawPile).toHaveLength(pileSize - 1);
		expect(state.phase).toBe('discard');
	});

	it('throws if phase is not draw', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const afterDraw = drawFromPile(state);
		expect(() => drawFromPile(afterDraw)).toThrow();
	});
});

describe('drawFromDiscard', () => {
	it('takes top card from discard pile', () => {
		let state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromDiscard(state);
		expect(state.players[0].hand).toHaveLength(15);
		expect(state.discardPile).toHaveLength(0);
		expect(state.phase).toBe('discard');
	});

	it('throws if phase is not draw', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const afterDraw = drawFromPile(state);
		expect(() => drawFromDiscard(afterDraw)).toThrow();
	});
});

describe('discardCard', () => {
	it('removes card from hand and adds to discard pile', () => {
		let state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromPile(state);
		const cardToDiscard = state.players[0].hand[0];
		const discardSize = state.discardPile.length;
		state = discardCard(state, cardToDiscard.id);
		expect(state.players[0].hand).toHaveLength(14);
		expect(state.discardPile).toHaveLength(discardSize + 1);
	});

	it('throws if card not in hand', () => {
		let state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromPile(state);
		expect(() => discardCard(state, 'nonexistent-id')).toThrow();
	});
});

describe('nextTurn', () => {
	it('advances to next player', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		const next = nextTurn(state);
		expect(next.currentPlayerIndex).toBe(1);
		expect(next.phase).toBe('draw');
	});

	it('cycles back to player 0 after player 3', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		const stateAt3 = { ...state, currentPlayerIndex: 3 };
		const next = nextTurn(stateAt3);
		expect(next.currentPlayerIndex).toBe(0);
	});
});

describe('closeGame', () => {
	it('wins when hand is valid', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const validHand: Card[] = [
			card('♠', 5, 't1'),
			card('♥', 5, 't2'),
			card('♦', 5, 't3'),
			card('♠', 7, 't4'),
			card('♥', 7, 't5'),
			card('♦', 7, 't6'),
			card('♠', 9, 't7'),
			card('♥', 9, 't8'),
			card('♦', 9, 't9'),
			card('♠', 10, 't10'),
			card('♠', 11, 't11'),
			card('♠', 12, 't12'),
			card('♣', 2, 't13'),
			card('♣', 3, 't14'),
			card('♣', 4, 't15')
		];
		state.players[0].hand = validHand;
		(state as GameState).phase = 'discard';

		const result = closeGame(state);
		expect(result.winner).toBe(0);
		expect(result.phase).toBe('finished');
	});

	it('throws when hand is invalid', () => {
		const state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		const invalidHand: Card[] = Array.from({ length: 15 }, (_, i) =>
			card('♠', ((i % 13) + 1) as Value, `x${i}`)
		);
		state.players[0].hand = invalidHand;
		(state as GameState).phase = 'discard';

		expect(() => closeGame(state)).toThrow();
	});
});

describe('full game flow', () => {
	it('plays a complete turn: draw → discard → next turn', () => {
		let state = initGame({ playerCount: 2, humanPlayerIndex: 0 });
		expect(state.currentPlayerIndex).toBe(0);
		expect(state.phase).toBe('draw');

		state = drawFromPile(state);
		expect(state.phase).toBe('discard');

		const cardId = state.players[0].hand[0].id;
		state = discardCard(state, cardId);
		expect(state.currentPlayerIndex).toBe(1);
		expect(state.phase).toBe('draw');
	});

	it('reshuffles discard pile when draw pile is empty', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [
			...Array.from({ length: 5 }, (_, i) => ({
				suit: '♠' as Suit,
				value: (i + 1) as Value,
				id: `discard-${i}`,
				isJoker: false
			})),
			{ suit: '♠' as Suit, value: 10 as Value, id: 'top-card', isJoker: false }
		];

		const result = drawFromPile(state);

		expect(result.drawPile.length).toBe(4);
		expect(result.discardPile).toHaveLength(1);
		expect(result.discardPile[0].id).toBe('top-card');
		expect(result.players[0].hand).toHaveLength(15);
	});

	it('throws when both piles are empty', () => {
		const state = initGame({ playerCount: 4, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [{ suit: '♠' as Suit, value: 10 as Value, id: 'last', isJoker: false }];

		expect(() => drawFromPile(state)).toThrow('No cards left to draw');
	});
});
