import type { GameState, GameConfig, PlayerState, Card } from './types';
import { createDeck, deal } from './deck';
import { canFormValidClose } from './meld';

export function initGame(config: GameConfig): GameState {
	const deck = createDeck();
	const { hands, remaining } = deal(deck, config.playerCount);

	const players: PlayerState[] = hands.map((hand) => ({
		hand,
		melds: [],
		hasOpened: false
	}));

	const discardPile: Card[] = [remaining[0]];
	const drawPile: Card[] = remaining.slice(1);

	return {
		players,
		currentPlayerIndex: 0,
		drawPile,
		discardPile,
		phase: 'draw',
		winner: null
	};
}

export function drawFromPile(state: GameState): GameState {
	if (state.phase !== 'draw') {
		throw new Error('Can only draw during draw phase');
	}

	const drawnCard = state.drawPile[state.drawPile.length - 1];

	const newPlayers = state.players.map((p, i) => {
		if (i !== state.currentPlayerIndex) return p;
		return { ...p, hand: [...p.hand, drawnCard] };
	});

	return {
		...state,
		players: newPlayers,
		drawPile: state.drawPile.slice(0, -1),
		phase: 'discard'
	};
}

export function drawFromDiscard(state: GameState): GameState {
	if (state.phase !== 'draw') {
		throw new Error('Can only draw during draw phase');
	}

	const drawnCard = state.discardPile[state.discardPile.length - 1];

	const newPlayers = state.players.map((p, i) => {
		if (i !== state.currentPlayerIndex) return p;
		return { ...p, hand: [...p.hand, drawnCard] };
	});

	return {
		...state,
		players: newPlayers,
		discardPile: state.discardPile.slice(0, -1),
		phase: 'discard'
	};
}

export function discardCard(state: GameState, cardId: string): GameState {
	if (state.phase !== 'discard') {
		throw new Error('Can only discard during discard phase');
	}

	const player = state.players[state.currentPlayerIndex];
	const cardIndex = player.hand.findIndex((c) => c.id === cardId);

	if (cardIndex === -1) {
		throw new Error('Card not found in hand');
	}

	const discardedCard = player.hand[cardIndex];
	const newHand = [...player.hand.slice(0, cardIndex), ...player.hand.slice(cardIndex + 1)];

	const newPlayers = state.players.map((p, i) => {
		if (i !== state.currentPlayerIndex) return p;
		return { ...p, hand: newHand };
	});

	const newDiscardPile = [...state.discardPile, discardedCard];

	if (newHand.length === 0) {
		return closeGame({
			...state,
			players: newPlayers,
			discardPile: newDiscardPile
		});
	}

	return nextTurn({
		...state,
		players: newPlayers,
		discardPile: newDiscardPile
	});
}

export function closeGame(state: GameState): GameState {
	const player = state.players[state.currentPlayerIndex];

	if (!canFormValidClose(player.hand)) {
		throw new Error('Hand cannot form a valid close');
	}

	return {
		...state,
		winner: state.currentPlayerIndex,
		phase: 'finished'
	};
}

export function nextTurn(state: GameState): GameState {
	const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;

	return {
		...state,
		currentPlayerIndex: nextIndex,
		phase: 'draw'
	};
}
