import type { Card, GameState } from './types';
import { isValidMeld, canFormValidClose } from './meld';
import { drawFromDiscard, drawFromPile, discardCard, closeGame } from './game';
import { combinations } from './utils';

function hasMeldContaining(cards: Card[], target: Card): boolean {
	for (let size = 3; size <= cards.length; size++) {
		for (const combo of combinations(cards, size)) {
			if (!combo.some((c) => c.id === target.id)) continue;
			if (isValidMeld(combo)) return true;
		}
	}
	return false;
}

export function shouldDrawFromDiscard(hand: Card[], discardTop: Card): boolean {
	if (discardTop.isJoker && discardTop.jokerType === 'colored') return true;
	const newHand = [...hand, discardTop];
	return hasMeldContaining(newHand, discardTop);
}

function countMeldableCards(cards: Card[]): number {
	const melded = new Set<string>();
	for (let size = 3; size <= cards.length; size++) {
		for (const combo of combinations(cards, size)) {
			if (isValidMeld(combo)) {
				for (const c of combo) {
					melded.add(c.id);
				}
			}
		}
	}
	return melded.size;
}

export function findWorstCard(hand: Card[]): Card {
	let worstCard = hand[0];
	let maxMeldable = -1;

	for (const card of hand) {
		const remaining = hand.filter((c) => c.id !== card.id);
		const meldable = countMeldableCards(remaining);
		if (meldable > maxMeldable) {
			maxMeldable = meldable;
			worstCard = card;
		}
	}

	return worstCard;
}

export function aiTurn(state: GameState): GameState {
	let current = state;
	const player = current.players[current.currentPlayerIndex];

	if (current.phase === 'draw') {
		if (canFormValidClose(player.hand)) {
			return closeGame(current);
		}

		if (
			current.discardPile.length > 0 &&
			shouldDrawFromDiscard(player.hand, current.discardPile[current.discardPile.length - 1])
		) {
			current = drawFromDiscard(current);
		} else {
			current = drawFromPile(current);
		}
	}

	if (current.phase === 'discard') {
		const currentPlayer = current.players[current.currentPlayerIndex];
		if (canFormValidClose(currentPlayer.hand)) {
			return closeGame(current);
		}

		const worst = findWorstCard(currentPlayer.hand);
		current = discardCard(current, worst.id);
	}

	return current;
}
