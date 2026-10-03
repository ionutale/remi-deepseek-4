import type { Card } from './types';

export const TARGET_SCORE = 500;

export function cardPoints(card: Card): number {
	if (card.isJoker) return 25;
	if (card.value === 1 || card.value >= 11) return 10; // A=1, J=11, Q=12, K=13
	return card.value;
}

export function handPoints(cards: Card[]): number {
	return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}