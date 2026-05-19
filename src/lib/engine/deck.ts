import type { Card, Suit, Value } from './types'

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const VALUES: Value[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export function createDeck(): Card[] {
	const cards: Card[] = []

	for (const suit of SUITS) {
		for (const value of VALUES) {
			cards.push({ suit, value, id: `${suit}-${value}-0`, isJoker: false })
			cards.push({ suit, value, id: `${suit}-${value}-1`, isJoker: false })
		}
	}

	for (let i = 0; i < 4; i++) {
		cards.push({ suit: '♠', value: 0 as unknown as Value, id: `joker-${i}`, isJoker: true })
	}

	return cards
}

export function shuffle(deck: Card[]): Card[] {
	const shuffled = [...deck]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
	}
	return shuffled
}

export function deal(
	deck: Card[],
	playerCount: number
): { hands: Card[][]; remaining: Card[] } {
	const shuffled = shuffle(deck)
	const hands: Card[][] = []
	for (let p = 0; p < playerCount; p++) {
		hands.push(shuffled.slice(p * 15, (p + 1) * 15))
	}
	const remaining = shuffled.slice(playerCount * 15)
	return { hands, remaining }
}
