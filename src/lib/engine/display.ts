import type { Card } from './types';

export function cardLabel(card: Pick<Card, 'value' | 'isJoker' | 'suit'>): string {
	if (card.isJoker) return '🃏';
	const value =
		card.value === 1 ? 'A' :
		card.value === 11 ? 'J' :
		card.value === 12 ? 'Q' :
		card.value === 13 ? 'K' :
		String(card.value);
	return `${value}${card.suit}`;
}

export function isRed(suit: string): boolean {
	return suit === '♥' || suit === '♦';
}

export function displayValue(card: Pick<Card, 'value' | 'isJoker'>): string {
	if (card.isJoker) return '🃏';
	return card.value === 1 ? 'A' :
		card.value === 11 ? 'J' :
		card.value === 12 ? 'Q' :
		card.value === 13 ? 'K' :
		String(card.value);
}
