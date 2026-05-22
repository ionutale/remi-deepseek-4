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

function countDiscardOverlaps(card: Card, discardPile: Card[]): number {
	let count = 0;
	for (const d of discardPile) {
		if (d.id === card.id) continue;
		if (d.suit === card.suit && Math.abs(d.value - card.value) <= 2) count++;
		if (d.value === card.value && d.suit !== card.suit) count++;
	}
	return count;
}

export function findSafestDiscard(hand: Card[], discardPile: Card[]): Card {
	let best = hand[0];
	let bestScore = -Infinity;

	for (const card of hand) {
		const remaining = hand.filter((c) => c.id !== card.id);
		const meldable = countMeldableCards(remaining);

		const danger = countDiscardOverlaps(card, discardPile);
		const score = meldable + danger * 5;
		if (score > bestScore) {
			bestScore = score;
			best = card;
		}
	}

	return best;
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

		const worst = findSafestDiscard(currentPlayer.hand, current.discardPile);
		current = discardCard(current, worst.id);
	}

	return current;
}
