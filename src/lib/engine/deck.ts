import type { Card, Suit, Value } from './types';

export const HAND_SIZE = 14;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const VALUES: Value[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function createDeck(): Card[] {
	const cards: Card[] = [];

	for (const suit of SUITS) {
		for (const value of VALUES) {
			cards.push({ suit, value, id: `${suit}-${value}-0`, isJoker: false });
			cards.push({ suit, value, id: `${suit}-${value}-1`, isJoker: false });
		}
	}

	cards.push({ suit: '♠', value: 0, id: 'joker-black-0', isJoker: true, jokerType: 'black' });
	cards.push({ suit: '♠', value: 0, id: 'joker-black-1', isJoker: true, jokerType: 'black' });
	cards.push({ suit: '♥', value: 0, id: 'joker-colored-0', isJoker: true, jokerType: 'colored' });
	cards.push({ suit: '♥', value: 0, id: 'joker-colored-1', isJoker: true, jokerType: 'colored' });

	return cards;
}

export function shuffle(deck: Card[]): Card[] {
	const shuffled = [...deck];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export function deal(deck: Card[], playerCount: number): { hands: Card[][]; remaining: Card[] } {
	if (playerCount < 2 || playerCount > 4) {
		throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
	}
	const shuffled = shuffle(deck);
	const hands: Card[][] = [];
	for (let p = 0; p < playerCount; p++) {
		hands.push(shuffled.slice(p * HAND_SIZE, (p + 1) * HAND_SIZE));
	}
	const remaining = shuffled.slice(playerCount * HAND_SIZE);
	return { hands, remaining };
}
