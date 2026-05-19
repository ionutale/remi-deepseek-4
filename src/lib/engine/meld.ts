import type { Card, Meld } from './types';

export function isValidSet(cards: Card[]): boolean {
	if (cards.length < 3) return false;

	const nonJokers = cards.filter((c) => !c.isJoker);

	if (nonJokers.length === 0) return false;

	const value = nonJokers[0].value;
	const suits = new Set<string>();

	for (const c of nonJokers) {
		if (c.value !== value) return false;
		if (suits.has(c.suit)) return false;
		suits.add(c.suit);
	}

	return true;
}

export function isValidSequence(cards: Card[]): boolean {
	if (cards.length < 3) return false;

	const nonJokers = cards.filter((c) => !c.isJoker);

	if (nonJokers.length === 0) return false;

	const suit = nonJokers[0].suit;
	const values = new Set<number>();

	for (const c of nonJokers) {
		if (c.suit !== suit) return false;
		if (values.has(c.value)) return false;
		values.add(c.value);
	}

	const sorted = [...values].sort((a, b) => a - b);
	const range = sorted[sorted.length - 1] - sorted[0] + 1;

	return range <= cards.length;
}

export function isValidMeld(cards: Card[]): boolean {
	return isValidSet(cards) || isValidSequence(cards);
}

function combinations(arr: Card[], size: number): Card[][] {
	if (size === 0) return [[]];
	if (arr.length < size) return [];

	const result: Card[][] = [];
	const [first, ...rest] = arr;

	for (const combo of combinations(rest, size - 1)) {
		result.push([first, ...combo]);
	}
	for (const combo of combinations(rest, size)) {
		result.push(combo);
	}

	return result;
}

function findAllMelds(hand: Card[]): Meld[] {
	const melds: Meld[] = [];
	const seen = new Set<string>();

	for (let size = 3; size <= hand.length; size++) {
		for (const combo of combinations(hand, size)) {
			const key = combo
				.map((c) => c.id)
				.sort()
				.join(',');
			if (seen.has(key)) continue;
			seen.add(key);

			if (isValidSet(combo)) {
				melds.push({ cards: combo, type: 'set' });
			} else if (isValidSequence(combo)) {
				melds.push({ cards: combo, type: 'sequence' });
			}
		}
	}

	return melds;
}

function partitionHand(remaining: Set<string>, allMelds: Meld[], current: Meld[]): Meld[][] | null {
	if (remaining.size === 0) {
		return [current];
	}

	const firstId = remaining.values().next().value;

	for (const meld of allMelds) {
		if (!meld.cards.some((c) => c.id === firstId)) continue;
		if (meld.cards.some((c) => !remaining.has(c.id))) continue;

		for (const c of meld.cards) {
			remaining.delete(c.id);
		}
		current.push(meld);

		const result = partitionHand(remaining, allMelds, current);
		if (result) return result;

		for (const c of meld.cards) {
			remaining.add(c.id);
		}
		current.pop();
	}

	return null;
}

export function findBestMelds(
	hand: Card[],
	requiredSet?: boolean,
	requiredSequence?: boolean
): Meld[][] | null {
	const allMelds = findAllMelds(hand);
	const cardIds = new Set(hand.map((c) => c.id));
	const partition = partitionHand(cardIds, allMelds, []);

	if (!partition) return null;

	const melds = partition[0];
	if (requiredSet && !melds.some((m) => m.type === 'set')) return null;
	if (requiredSequence && !melds.some((m) => m.type === 'sequence')) return null;

	return partition;
}

export function canFormValidClose(hand: Card[]): boolean {
	if (hand.length !== 15) return false;

	const result = findBestMelds(hand, true, true);
	return result !== null;
}
