import { describe, it, expect } from 'vitest';
import {
	initMatch,
	drawFromPile,
	drawFromDiscard,
	discardCard,
	closeGame,
	nextTurn,
	nextRound,
	isRoundBlocked,
	voidRound
} from '$lib/engine/game';
import type { Card, GameState, Meld, Suit, Value } from '$lib/engine/types';

let cardCounter = 0;
function card(suit: Suit, value: Value, isJoker = false): Card {
	return { suit, value, id: `g${cardCounter++}`, isJoker };
}
function joker(colored = false): Card {
	return {
		suit: colored ? '♥' : '♠',
		value: 0 as Value,
		id: `g${cardCounter++}`,
		isJoker: true,
		jokerType: colored ? 'colored' : 'black'
	};
}

/** 15-card closeable hand: set(5s) + set(7s) + seq(9-11♠) + seq(2-6♣) + J♥ spare. */
function closeHand(): { hand: Card[]; melds: Meld[]; discardId: string } {
	const set5 = [card('♠', 5), card('♥', 5), card('♦', 5)];
	const set7 = [card('♠', 7), card('♥', 7), card('♦', 7)];
	const seqS = [card('♠', 9), card('♠', 10), card('♠', 11)];
	const seqC = [card('♣', 2), card('♣', 3), card('♣', 4), card('♣', 5), card('♣', 6)];
	const spare = card('♥', 11);
	return {
		hand: [...set5, ...set7, ...seqS, ...seqC, spare],
		melds: [
			{ cards: set5, type: 'set' },
			{ cards: set7, type: 'set' },
			{ cards: seqS, type: 'sequence' },
			{ cards: seqC, type: 'sequence' }
		],
		discardId: spare.id
	};
}

/** State in discard phase with player 0 holding a closeable 15-card hand. */
function closeableState(): { state: GameState; melds: Meld[]; discardId: string } {
	let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
	state = drawFromPile(state);
	const { hand, melds, discardId } = closeHand();
	state.players[0].hand = hand;
	return { state, melds, discardId };
}

describe('initMatch', () => {
	it('creates GameState with 4 players each having 14 cards', () => {
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
		expect(state.players).toHaveLength(4);
		state.players.forEach((p) => expect(p.hand).toHaveLength(14));
		expect(state.phase).toBe('draw');
		expect(state.currentPlayerIndex).toBe(0);
	});

	it('initializes match fields', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(state.schemaVersion).toBe(2);
		expect(state.scores).toEqual([0, 0]);
		expect(state.round).toBe(1);
		expect(state.roundStarter).toBe(0);
		expect(state.roundWinner).toBeNull();
		expect(state.matchWinner).toBeNull();
		expect(state.targetScore).toBe(500);
		expect(state.revision).toBe(1);
	});

	it('respects a custom targetScore', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0, targetScore: 100 });
		expect(state.targetScore).toBe(100);
	});

	it('has correct draw pile and discard pile', () => {
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
		expect(state.drawPile.length).toBe(106 - 4 * 14 - 1);
		expect(state.discardPile).toHaveLength(1);
	});
});

describe('drawFromPile', () => {
	it('adds a card to current player hand', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		const pileSize = state.drawPile.length;
		state = drawFromPile(state);
		expect(state.players[0].hand).toHaveLength(15);
		expect(state.drawPile).toHaveLength(pileSize - 1);
		expect(state.phase).toBe('discard');
	});

	it('increments revision', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(drawFromPile(state).revision).toBe(state.revision + 1);
	});

	it('throws if phase is not draw', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		const afterDraw = drawFromPile(state);
		expect(() => drawFromPile(afterDraw)).toThrow();
	});
});

describe('drawFromDiscard', () => {
	it('takes top card from discard pile', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromDiscard(state);
		expect(state.players[0].hand).toHaveLength(15);
		expect(state.discardPile).toHaveLength(0);
		expect(state.phase).toBe('discard');
	});

	it('throws if phase is not draw', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		const afterDraw = drawFromPile(state);
		expect(() => drawFromDiscard(afterDraw)).toThrow();
	});
});

describe('discardCard', () => {
	it('removes card from hand and adds to discard pile', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromPile(state);
		const cardToDiscard = state.players[0].hand[0];
		const discardSize = state.discardPile.length;
		state = discardCard(state, cardToDiscard.id);
		expect(state.players[0].hand).toHaveLength(14);
		expect(state.discardPile).toHaveLength(discardSize + 1);
	});

	it('increments revision', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromPile(state);
		const before = state.revision;
		state = discardCard(state, state.players[0].hand[0].id);
		expect(state.revision).toBe(before + 1);
	});

	it('throws if card not in hand', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state = drawFromPile(state);
		expect(() => discardCard(state, 'nonexistent-id')).toThrow();
	});
});

describe('nextTurn', () => {
	it('advances to next player', () => {
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
		const next = nextTurn(state);
		expect(next.currentPlayerIndex).toBe(1);
		expect(next.phase).toBe('draw');
	});

	it('cycles back to player 0 after player 3', () => {
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
		const stateAt3 = { ...state, currentPlayerIndex: 3 };
		const next = nextTurn(stateAt3);
		expect(next.currentPlayerIndex).toBe(0);
	});
});

describe('closeGame', () => {
	it('scores opponents hands, reveals melds, ends the round', () => {
		const { state, melds, discardId } = closeableState();
		// A=10, K=10, 5=5, joker=25, 3=3 → 53
		state.players[1].hand = [card('♠', 1), card('♥', 13), card('♦', 5), joker(), card('♣', 3)];
		const discardSize = state.discardPile.length;

		const result = closeGame(state, { melds, discardId });

		expect(result.scores).toEqual([53, 0]);
		expect(result.players[0].melds).toEqual(melds);
		expect(result.players[0].hand).toHaveLength(14);
		expect(result.discardPile).toHaveLength(discardSize + 1);
		expect(result.discardPile[result.discardPile.length - 1].id).toBe(discardId);
		expect(result.phase).toBe('round-over');
		expect(result.roundWinner).toBe(0);
		expect(result.matchWinner).toBeNull();
	});

	it('scores colored jokers at 25 like black jokers', () => {
		const { state, melds, discardId } = closeableState();
		state.players[1].hand = [joker(true), card('♠', 4)];
		const result = closeGame(state, { melds, discardId });
		expect(result.scores).toEqual([29, 0]);
	});

	it('finishes the match when the closer reaches 500', () => {
		const { state, melds, discardId } = closeableState();
		state.scores = [480, 0];
		state.players[1].hand = [joker()];
		const result = closeGame(state, { melds, discardId });
		expect(result.scores).toEqual([505, 0]);
		expect(result.phase).toBe('finished');
		expect(result.roundWinner).toBe(0);
		expect(result.matchWinner).toBe(0);
	});

	it('honors a custom targetScore', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0, targetScore: 50 });
		state = drawFromPile(state);
		const { hand, melds, discardId } = closeHand();
		state.players[0].hand = hand;
		state.players[1].hand = [joker(), joker(true)];
		const result = closeGame(state, { melds, discardId });
		expect(result.phase).toBe('finished');
		expect(result.matchWinner).toBe(0);
	});

	it('increments revision', () => {
		const { state, melds, discardId } = closeableState();
		expect(closeGame(state, { melds, discardId }).revision).toBe(state.revision + 1);
	});

	it('throws on the wrong phase', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(state.phase).toBe('draw');
		const { melds, discardId } = closeHand();
		expect(() => closeGame(state, { melds, discardId })).toThrow(
			'Can only close during discard phase'
		);
	});

	it('throws on an invalid declaration', () => {
		const { state } = closeableState();
		const { hand } = closeHand();
		state.players[0].hand = hand;
		// Melds cover only 3 cards instead of 14
		const badMelds: Meld[] = [{ cards: hand.slice(0, 3), type: 'set' }];
		expect(() => closeGame(state, { melds: badMelds, discardId: hand[14].id })).toThrow(
			'melds must cover exactly 14 cards, each exactly once'
		);
	});
});

describe('nextRound', () => {
	it('keeps scores and starts with the previous roundWinner', () => {
		const { state, melds, discardId } = closeableState();
		state.players[1].hand = [card('♠', 4)];
		const closed = closeGame(state, { melds, discardId });
		expect(closed.phase).toBe('round-over');

		const next = nextRound(closed);
		expect(next.scores).toEqual(closed.scores);
		expect(next.currentPlayerIndex).toBe(0);
		expect(next.roundStarter).toBe(0);
		expect(next.roundWinner).toBeNull();
		expect(next.round).toBe(closed.round + 1);
		expect(next.phase).toBe('draw');
		next.players.forEach((p) => expect(p.hand).toHaveLength(14));
	});

	it('increments revision', () => {
		const { state, melds, discardId } = closeableState();
		const closed = closeGame(state, { melds, discardId });
		expect(nextRound(closed).revision).toBe(closed.revision + 1);
	});

	it('throws when phase is not round-over', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(() => nextRound(state)).toThrow();
	});
});

describe('isRoundBlocked', () => {
	it('is true when stock is empty and discard has 1 card', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [card('♠', 10)];
		expect(isRoundBlocked(state)).toBe(true);
	});

	it('is true when both piles are empty', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [];
		expect(isRoundBlocked(state)).toBe(true);
	});

	it('is false when stock has cards', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(isRoundBlocked(state)).toBe(false);
	});

	it('is false when discard has more than 1 card', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [card('♠', 10), card('♥', 11)];
		expect(isRoundBlocked(state)).toBe(false);
	});
});

describe('voidRound', () => {
	it('keeps scores, round number and roundStarter with a fresh deal', () => {
		const { state, melds, discardId } = closeableState();
		const closed = closeGame(state, { melds, discardId });
		const blocked: GameState = {
			...closed,
			drawPile: [],
			discardPile: [card('♠', 10)],
			scores: [53, 10]
		};
		expect(isRoundBlocked(blocked)).toBe(true);

		const fresh = voidRound(blocked);
		expect(fresh.scores).toEqual([53, 10]);
		expect(fresh.round).toBe(blocked.round);
		expect(fresh.roundStarter).toBe(blocked.roundStarter);
		expect(fresh.currentPlayerIndex).toBe(blocked.roundStarter);
		expect(fresh.phase).toBe('draw');
		fresh.players.forEach((p) => {
			expect(p.hand).toHaveLength(14);
			expect(p.melds).toEqual([]);
		});
	});
});

describe('full game flow', () => {
	it('plays a complete turn: draw → discard → next turn', () => {
		let state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
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
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
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
		const state = initMatch({ playerCount: 4, humanPlayerIndex: 0 });
		state.drawPile = [];
		state.discardPile = [{ suit: '♠' as Suit, value: 10 as Value, id: 'last', isJoker: false }];

		expect(() => drawFromPile(state)).toThrow('No cards left to draw');
	});
});
