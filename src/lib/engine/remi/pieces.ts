import type { Color, Piece } from './types';

export const COLORS: Color[] = ['red', 'yellow', 'blue', 'black'];

const VALUES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export type DubleCategory = 'mica' | 'mare' | 'cheie';

/** 104 naturals (4 colours x 13 values x 2 copies) + 2 identical jokers. */
export function createDeck(): Piece[] {
	const deck: Piece[] = [];

	for (const color of COLORS) {
		for (const value of VALUES) {
			for (const copy of [0, 1]) {
				deck.push({ id: `${color}-${value}-${copy}`, isJoker: false, value, color });
			}
		}
	}

	for (const copy of [0, 1]) {
		deck.push({ id: `joker-${copy}`, isJoker: true, value: 0, color: 'black' });
	}

	return deck;
}

/** Fisher-Yates. Pass a seeded `rng` for deterministic tests. */
export function shuffle(deck: Piece[], rng: () => number = Math.random): Piece[] {
	const shuffled = [...deck];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

/**
 * Deals from the given deck order — the caller owns shuffling (see `shuffle`,
 * which takes a seeded rng), which keeps every downstream phase reproducible.
 *
 * Player 0 receives 15 pieces (ropet: the opener starts with one extra), everyone
 * else 14. The atu is lifted from the leftover pile (its last piece) and is no
 * longer part of the stock.
 */
export function deal(
	deck: Piece[],
	playerCount: number
): { racks: Piece[][]; stock: Piece[]; atu: Piece } {
	if (playerCount < 2 || playerCount > 4) {
		throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
	}

	const racks: Piece[][] = [];
	let cursor = 0;
	for (let p = 0; p < playerCount; p++) {
		const size = p === 0 ? 15 : 14;
		racks.push(deck.slice(cursor, cursor + size));
		cursor += size;
	}

	const leftover = deck.slice(cursor);
	if (leftover.length === 0) {
		throw new Error('Not enough pieces to deal.');
	}

	const atu = leftover[leftover.length - 1] as Piece;
	const stock = leftover.slice(0, leftover.length - 1);

	return { racks, stock, atu };
}

/** Duble categories are defined for naturals only. */
export function dubleCategory(piece: Piece): DubleCategory {
	if (piece.isJoker) {
		throw new Error('A joker cannot form a dubla.');
	}
	if (piece.value === 1) return 'cheie';
	return piece.value <= 9 ? 'mica' : 'mare';
}

/** Two identical pieces = same value AND same colour. Jokers never match. */
export function isSamePiece(a: Piece, b: Piece): boolean {
	if (a.isJoker || b.isJoker) return false;
	return a.value === b.value && a.color === b.color;
}

/** First held dublă (two identical naturals), deterministic by piece id. */
export function firstDuble(rack: Piece[]): Piece | null {
	const ordered = [...rack].sort((a, b) => a.id.localeCompare(b.id));
	for (const piece of ordered) {
		if (piece.isJoker) continue;
		const twins = ordered.filter(
			(candidate) =>
				!candidate.isJoker && candidate.value === piece.value && candidate.color === piece.color
		);
		if (twins.length >= 2) return piece;
	}
	return null;
}
