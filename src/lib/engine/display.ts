import type { Card, Value } from './types';

function valueToString(v: Value): string {
	if (v === 1) return 'A';
	if (v === 11) return 'J';
	if (v === 12) return 'Q';
	if (v === 13) return 'K';
	return String(v);
}

export function cardLabel(card: Pick<Card, 'value' | 'isJoker' | 'suit'>): string {
	if (card.isJoker) return '🃏';
	return `${valueToString(card.value)}${card.suit}`;
}

export function isRed(suit: string): boolean {
	return suit === '♥' || suit === '♦';
}

export function displayValue(card: Pick<Card, 'value' | 'isJoker'>): string {
	if (card.isJoker) return '🃏';
	return valueToString(card.value);
}
