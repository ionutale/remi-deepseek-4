import type { GameState, GameConfig, PlayerState, Card, CloseDeclaration } from './types';
import { createDeck, deal, shuffle } from './deck';
import { canFormValidClose, validateCloseDeclaration } from './meld';
import { handPoints, TARGET_SCORE } from './scoring';

export function initMatch(config: GameConfig): GameState {
	const deck = createDeck();
	const { hands, remaining } = deal(deck, config.playerCount);

	const players: PlayerState[] = hands.map((hand) => ({
		hand,
		melds: []
	}));

	const discardPile: Card[] = [remaining[0]];
	const drawPile: Card[] = remaining.slice(1);

	return {
		schemaVersion: 2,
		players,
		currentPlayerIndex: 0,
		drawPile,
		discardPile,
		phase: 'draw',
		round: 1,
		roundStarter: 0,
		scores: new Array(config.playerCount).fill(0),
		roundWinner: null,
		matchWinner: null,
		targetScore: config.targetScore ?? TARGET_SCORE,
		turnStartedAt: Date.now(),
		revision: 1
	};
}

export function dealRound(state: GameState, starterIndex: number): GameState {
	const deck = createDeck();
	const { hands, remaining } = deal(deck, state.players.length);

	const players: PlayerState[] = hands.map((hand) => ({
		hand,
		melds: []
	}));

	const discardPile: Card[] = [remaining[0]];
	const drawPile: Card[] = remaining.slice(1);

	return {
		...state,
		players,
		currentPlayerIndex: starterIndex,
		drawPile,
		discardPile,
		phase: 'draw',
		roundStarter: starterIndex,
		roundWinner: null,
		turnStartedAt: Date.now(),
		revision: state.revision + 1
	};
}

function reshuffleDiscard(discardPile: Card[]): { drawPile: Card[]; discardPile: Card[] } {
	if (discardPile.length <= 1) return { drawPile: [], discardPile };
	const top = discardPile[discardPile.length - 1];
	const rest = discardPile.slice(0, -1);
	return { drawPile: shuffle(rest), discardPile: [top] };
}

export function drawFromPile(state: GameState): GameState {
	if (state.phase !== 'draw') {
		throw new Error('Can only draw during draw phase');
	}

	let drawPile = state.drawPile;
	let discardPile = state.discardPile;

	if (drawPile.length === 0) {
		const reshuffled = reshuffleDiscard(discardPile);
		drawPile = reshuffled.drawPile;
		discardPile = reshuffled.discardPile;
		if (drawPile.length === 0) {
			throw new Error('No cards left to draw');
		}
	}

	const drawnCard = drawPile[drawPile.length - 1];

	const newPlayers = state.players.map((p, i) => {
		if (i !== state.currentPlayerIndex) return p;
		return { ...p, hand: [...p.hand, drawnCard] };
	});

	return {
		...state,
		players: newPlayers,
		drawPile: drawPile.slice(0, -1),
		discardPile,
		phase: 'discard',
		turnStartedAt: Date.now(),
		revision: state.revision + 1
	};
}

export function drawFromDiscard(state: GameState): GameState {
	if (state.phase !== 'draw') {
		throw new Error('Can only draw during draw phase');
	}
	if (state.discardPile.length === 0) {
		throw new Error('Discard pile is empty');
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
		phase: 'discard',
		turnStartedAt: Date.now(),
		revision: state.revision + 1
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

	return nextTurn({
		...state,
		players: newPlayers,
		discardPile: newDiscardPile
	});
}

export function closeGame(state: GameState, declaration: CloseDeclaration): GameState {
	if (state.phase !== 'discard') {
		throw new Error('Can only close during discard phase');
	}

	const player = state.players[state.currentPlayerIndex];
	const validation = validateCloseDeclaration(player.hand, declaration);
	if (!validation.valid) {
		throw new Error(validation.reason);
	}

	// Remove the discarded card from hand and add to discard pile
	const discardCard = player.hand.find((c) => c.id === declaration.discardId)!;
	const newHand = player.hand.filter((c) => c.id !== declaration.discardId);

	const newPlayers = state.players.map((p, i) => {
		if (i !== state.currentPlayerIndex) return p;
		return { ...p, hand: newHand, melds: declaration.melds };
	});

	const newDiscardPile = [...state.discardPile, discardCard];

	// Calculate collected points from opponents' hands
	let collected = 0;
	for (let i = 0; i < newPlayers.length; i++) {
		if (i !== state.currentPlayerIndex) {
			collected += handPoints(newPlayers[i].hand);
		}
	}

	const newScores = [...state.scores];
	newScores[state.currentPlayerIndex] += collected;

	const matchWinner = newScores[state.currentPlayerIndex] >= state.targetScore ? state.currentPlayerIndex : null;

	return {
		...state,
		players: newPlayers,
		discardPile: newDiscardPile,
		scores: newScores,
		roundWinner: state.currentPlayerIndex,
		matchWinner,
		phase: matchWinner === null ? 'round-over' : 'finished',
		revision: state.revision + 1
	};
}

export function nextTurn(state: GameState): GameState {
	const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;

	return {
		...state,
		currentPlayerIndex: nextIndex,
		phase: 'draw',
		turnStartedAt: Date.now(),
		revision: state.revision + 1
	};
}

export function nextRound(state: GameState): GameState {
	if (state.phase !== 'round-over') {
		throw new Error('Can only start next round from round-over phase');
	}

	if (state.roundWinner === null) {
		throw new Error('No round winner to determine next starter');
	}

	const dealt = dealRound(state, state.roundWinner);
	return { ...dealt, round: state.round + 1 };
}

export function isRoundBlocked(state: GameState): boolean {
	return state.drawPile.length === 0 && state.discardPile.length <= 1;
}

export function voidRound(state: GameState): GameState {
	return dealRound(state, state.roundStarter);
}