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
	if (cards.length === 1 && cards[0].isJoker && cards[0].jokerType === 'colored') return true;
	return isValidSet(cards) || isValidSequence(cards);
}

function findAllMelds(hand: Card[]): Meld[] {
	const melds: Meld[] = [];
	const seen = new Set<string>();

	// Colored joker = standalone wild meld (counts as an entire group)
	for (const card of hand) {
		if (card.isJoker && card.jokerType === 'colored') {
			melds.push({ cards: [card], type: 'joker-meld' });
		}
	}

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

/**
 * Greedy meld suggester. Returns card groups to populate meld slots:
 * 1. Complete valid melds (≥3 cards), largest first.
 * 2. Incomplete sets: 2+ cards of the same value.
 * 3. Incomplete sequences: 2+ consecutive cards of the same suit.
 * Cards already accounted for in step N are excluded from step N+1.
 */
export function suggestMelds(hand: Card[]): Card[][] {
	const groups: Card[][] = [];
	const used = new Set<string>();

	// Colored jokers are standalone wild melds — show them in their own slot
	for (const card of hand) {
		if (card.isJoker && card.jokerType === 'colored') {
			groups.push([card]);
			used.add(card.id);
		}
	}

	// Step 1 — complete valid melds, greedy largest-first
	const allValid = findAllMelds(hand);
	allValid.sort((a, b) => b.cards.length - a.cards.length);
	for (const meld of allValid) {
		if (meld.cards.some((c) => used.has(c.id))) continue;
		groups.push([...meld.cards]);
		for (const c of meld.cards) used.add(c.id);
	}

	// Step 2 — incomplete sets: 2+ of same value
	const remaining = hand.filter((c) => !used.has(c.id) && !c.isJoker);
	const byValue = new Map<number, Card[]>();
	for (const c of remaining) {
		const bucket = byValue.get(c.value) ?? [];
		bucket.push(c);
		byValue.set(c.value, bucket);
	}
	for (const [, cards] of byValue) {
		if (cards.length >= 2) {
			groups.push(cards);
			for (const c of cards) used.add(c.id);
		}
	}

	// Step 3 — incomplete sequences: 2+ consecutive same-suit
	const leftover = hand.filter((c) => !used.has(c.id) && !c.isJoker);
	const bySuit = new Map<string, Card[]>();
	for (const c of leftover) {
		const bucket = bySuit.get(c.suit) ?? [];
		bucket.push(c);
		bySuit.set(c.suit, bucket);
	}
	for (const [, cards] of bySuit) {
		const sorted = [...cards].sort((a, b) => a.value - b.value);
		let run: Card[] = [sorted[0]];
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].value === run[run.length - 1].value + 1) {
				run.push(sorted[i]);
			} else {
				if (run.length >= 2) {
					groups.push(run);
					for (const c of run) used.add(c.id);
				}
				run = [sorted[i]];
			}
		}
		if (run.length >= 2) {
			groups.push(run);
			for (const c of run) used.add(c.id);
		}
	}

	return groups;
}

/**
 * Romanian Remi closing rule: 14 of the 15 cards (after drawing) must form
 * valid melds (≥1 set + ≥1 sequence). The leftover card is discarded on close.
 */
export function canFormValidClose(hand: Card[]): boolean {
	if (hand.length !== HAND_SIZE + 1) return false;
	for (let i = 0; i < hand.length; i++) {
		const remaining = hand.filter((_, j) => j !== i);
		if (findBestMelds(remaining, true, true) !== null) return true;
	}
	return false;
}
