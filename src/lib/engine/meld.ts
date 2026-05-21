import type { Card, Meld } from './types';
import { combinations } from './utils';
import { HAND_SIZE } from './deck';

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

/**
 * Backtracking search to partition a hand into valid melds.
 *
 * This is inherently exponential (worst case O(2^n) in the number of melds)
 * because for each card we may need to try every meld that contains it.
 * For a standard 15-card hand this is acceptable, but do not call on large
 * collections of cards without a timeout or pruning strategy.
 */
function partitionHand(
	remaining: Set<string>,
	allMelds: Meld[],
	current: Meld[],
	hasSet: boolean,
	hasSequence: boolean,
	requireSet: boolean,
	requireSequence: boolean
): Meld[][] | null {
	if (remaining.size === 0) {
		if ((!requireSet || hasSet) && (!requireSequence || hasSequence)) {
			return [current];
		}
		return null;
	}

	const firstId = remaining.values().next().value;

	for (const meld of allMelds) {
		if (!meld.cards.some((c) => c.id === firstId)) continue;
		if (meld.cards.some((c) => !remaining.has(c.id))) continue;

		for (const c of meld.cards) {
			remaining.delete(c.id);
		}
		current.push(meld);

		const result = partitionHand(
			remaining,
			allMelds,
			current,
			hasSet || meld.type === 'set',
			hasSequence || meld.type === 'sequence',
			requireSet,
			requireSequence
		);
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
	const requireSet = requiredSet ?? false;
	const requireSequence = requiredSequence ?? false;
	const partition = partitionHand(cardIds, allMelds, [], false, false, requireSet, requireSequence);
	return partition;
}

export function canFormValidClose(hand: Card[]): boolean {
	if (hand.length !== HAND_SIZE + 1) return false;

	const result = findBestMelds(hand, true, true);
	return result !== null;
}
