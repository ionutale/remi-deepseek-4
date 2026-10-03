import type { Card, GameState, CloseDeclaration, Meld } from './types';
import { validateMeld, findBestMelds } from './meld';
import { drawFromDiscard, drawFromPile, discardCard, closeGame } from './game';
import { combinations } from './utils';
import { cardPoints } from './scoring';
import { HAND_SIZE } from './deck';

/** Shortest possible meld. */
const MIN_MELD_SIZE = 3;
/**
 * Longest meld considered when scoring coverage. A full one-suit run is 13 cards,
 * but sequences longer than 7 are vanishingly rare in a 15-card hand and every
 * extra size multiplies the enumeration cost — so we prune here (#spec §4.1 perf pass).
 */
const MAX_MELD_SIZE = 7;
/**
 * Melds larger than this are still possible (a full one-suit run is 13 cards), so
 * the completeness checks below enumerate up to here. Enumeration is structural,
 * so widening it costs almost nothing.
 */
const MAX_MELD_SIZE_EXHAUSTIVE = 13;
/** Weight of the discard-pile danger heuristic when scoring a discard. */
const DANGER_WEIGHT = 5;
/**
 * Larger than any coverage gain a hand can produce (≤ 15 cards), so a joker is only
 * ever discarded when the hand holds nothing else.
 */
const JOKER_DISCARD_PENALTY = 100;

/**
 * Composition-only identity of a card set. Coverage depends purely on which cards
 * are held, never on their ids, so this is also a safe memo key.
 */
function meldKey(cards: Card[]): string {
	return cards
		.map((c) => `${c.isJoker ? 'J' : c.suit}${c.value}`)
		.sort()
		.join(' ');
}

function jokerCount(meld: Meld): number {
	return meld.cards.reduce((n, c) => n + (c.isJoker ? 1 : 0), 0);
}

/**
 * Enumerates every meld that can be built from `cards` with at most `maxSize` cards.
 *
 * Unlike a blind combination scan this walks the structure of a meld directly:
 * sets are subsets of one value bucket, sequences are fixed windows of a suit's
 * value range with at most one gap for a joker. That keeps a 15-card hand in the
 * low hundreds of candidates instead of tens of thousands, so the completeness
 * checks can afford the full `maxSize` range.
 */
function enumerateCandidateMelds(cards: Card[], maxSize = MAX_MELD_SIZE): Meld[] {
	const jokers = cards.filter((c) => c.isJoker);
	const naturals = cards.filter((c) => !c.isJoker);
	const melds: Meld[] = [];
	const seen = new Set<string>();

	const add = (candidates: Card[]): void => {
		const validation = validateMeld(candidates);
		if (!validation.valid || !validation.type) return;
		const key = meldKey(candidates);
		if (seen.has(key)) return;
		seen.add(key);
		melds.push({ cards: candidates, type: validation.type });
	};

	// --- Sets: same value, distinct suits, at most one joker ---
	const byValue = new Map<number, Card[]>();
	for (const card of naturals) {
		const bucket = byValue.get(card.value) ?? [];
		if (!bucket.some((c) => c.suit === card.suit)) bucket.push(card);
		byValue.set(card.value, bucket);
	}
	for (const bucket of byValue.values()) {
		const maxSetSize = Math.min(4, bucket.length, maxSize - 1);
		for (let size = 2; size <= maxSetSize; size++) {
			for (const subset of combinations(bucket, size)) {
				if (size >= MIN_MELD_SIZE) add(subset);
				for (const joker of jokers) add([...subset, joker]);
			}
		}
	}

	// --- Sequences: one suit, consecutive values, at most one joker filling a gap ---
	const bySuit = new Map<string, Card[]>();
	for (const card of naturals) {
		const bucket = bySuit.get(card.suit) ?? [];
		if (!bucket.some((c) => c.value === card.value)) bucket.push(card);
		bySuit.set(card.suit, bucket);
	}
	for (const bucket of bySuit.values()) {
		const sorted = [...bucket].sort((a, b) => a.value - b.value);
		const maxLength = Math.min(maxSize, sorted.length + jokers.length);
		for (const start of sorted) {
			for (let length = MIN_MELD_SIZE; length <= maxLength; length++) {
				const window = sorted.filter(
					(c) => c.value >= start.value && c.value < start.value + length
				);
				if (window.length < 2) continue;
				const missing = length - window.length;
				if (missing === 0) {
					add(window);
				} else if (missing === 1) {
					for (const joker of jokers) add([...window, joker]);
				}
			}
		}
	}

	return melds;
}

const coverageCache = new Map<string, number>();
const MAX_COVERAGE_CACHE = 4096;

/**
 * How many of `cards` can be grouped into disjoint valid melds.
 *
 * Candidates are taken largest-first (preferring joker-free melds) and greedily
 * taken while they stay disjoint. This is the AI's stand-in for "how close is this
 * hand to a declaration": a hand that can be fully partitioned is one card away
 * from closing, a scattered one is not.
 */
export function coverageScore(cards: Card[]): number {
	const key = `${cards.length}|${meldKey(cards)}`;
	const cached = coverageCache.get(key);
	if (cached !== undefined) return cached;

	let covered = 0;
	if (cards.length >= MIN_MELD_SIZE) {
		const candidates = enumerateCandidateMelds(cards);
		candidates.sort((a, b) => {
			if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
			const jokers = jokerCount(a) - jokerCount(b);
			if (jokers !== 0) return jokers;
			const ka = meldKey(a.cards);
			const kb = meldKey(b.cards);
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});

		const used = new Set<string>();
		for (const meld of candidates) {
			if (meld.cards.some((c) => used.has(c.id))) continue;
			for (const card of meld.cards) used.add(card.id);
			covered += meld.cards.length;
		}
	}

	if (coverageCache.size >= MAX_COVERAGE_CACHE) coverageCache.clear();
	coverageCache.set(key, covered);
	return covered;
}

/**
 * Necessary condition for partitioning: every card has to belong to *some* valid
 * meld. Cheap (one structural pass) and it rules out most hands before the far more
 * expensive `findBestMelds` backtracking search runs.
 */
function everyCardBelongsToAMeld(cards: Card[]): boolean {
	if (cards.length < MIN_MELD_SIZE) return false;
	const melds = enumerateCandidateMelds(cards, MAX_MELD_SIZE_EXHAUSTIVE);
	const seen = new Set<string>();
	for (const meld of melds) {
		for (const card of meld.cards) seen.add(card.id);
	}
	return cards.every((card) => seen.has(card.id));
}

function hasMeldContaining(cards: Card[], target: Card): boolean {
	const maxSize = Math.min(cards.length, MAX_MELD_SIZE_EXHAUSTIVE);
	for (let size = MIN_MELD_SIZE; size <= maxSize; size++) {
		for (const combo of combinations(cards, size)) {
			if (!combo.some((c) => c.id === target.id)) continue;
			if (validateMeld(combo).valid) return true;
		}
	}
	return false;
}

export function shouldDrawFromDiscard(hand: Card[], discardTop: Card): boolean {
	if (discardTop.isJoker && discardTop.jokerType === 'colored') return true;
	const newHand = [...hand, discardTop];
	return hasMeldContaining(newHand, discardTop);
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

/**
 * Picks the card to throw that damages the hand least: the hand it leaves behind
 * should keep the highest possible meld coverage, and the card itself should be as
 * uninteresting as possible to opponents picking it up.
 *
 * Jokers are held onto at almost any cost — they are the scarce wildcards that turn
 * loose pairs into melds — so they are only dropped when nothing else is left.
 */
export function findSafestDiscard(hand: Card[], discardPile: Card[]): Card {
	const scoreOf = (card: Card): number =>
		coverageScore(hand.filter((c) => c.id !== card.id)) +
		countDiscardOverlaps(card, discardPile) * DANGER_WEIGHT;

	const bestOf = (pool: Card[]): Card => {
		let best = pool[0];
		let bestScore = -Infinity;
		for (const card of pool) {
			const score = scoreOf(card);
			if (score > bestScore) {
				bestScore = score;
				best = card;
			}
		}
		return best;
	};

	const naturals = hand.filter((c) => !c.isJoker);
	return naturals.length > 0 ? bestOf(naturals) : bestOf(hand);
}

/**
 * Builds the closing declaration for a 15-card hand: 14 cards partitioned into valid
 * melds (≥1 set and ≥1 sequence) with the cheapest remaining card as the closing
 * discard. This is the constructive form of `canFormValidClose` — it runs the same
 * search once and keeps the partition it found.
 */
function findCloseDeclaration(hand: Card[]): CloseDeclaration | null {
	if (hand.length !== HAND_SIZE + 1) return null;

	const spares = [...hand].sort(
		(a, b) => cardPoints(a) - cardPoints(b) || a.id.localeCompare(b.id)
	);

	for (const spare of spares) {
		const remaining = hand.filter((c) => c.id !== spare.id);
		// Cheap necessary condition first — the backtracking search is expensive.
		if (!everyCardBelongsToAMeld(remaining)) continue;

		const partition = findBestMelds(remaining, true, true)?.[0];
		if (!partition || partition.length === 0) continue;

		const melds: Meld[] = partition.map((meld) => ({
			cards: meld.cards,
			type: validateMeld(meld.cards).type ?? meld.type
		}));
		return { melds, discardId: spare.id };
	}

	return null;
}

/**
 * Plays one full turn for the current player: draw (discard pile when it helps,
 * otherwise the stock), then close if the drawn hand can be declared, otherwise
 * discard the safest card.
 *
 * Throws only when no card can be drawn at all (the caller is expected to check
 * `isRoundBlocked` first and void the round instead).
 */
export function autoPlayTurn(state: GameState): GameState {
	let current = state;

	if (current.phase === 'draw') {
		const hand = current.players[current.currentPlayerIndex].hand;
		const discardTop = current.discardPile[current.discardPile.length - 1];
		current =
			discardTop && shouldDrawFromDiscard(hand, discardTop)
				? drawFromDiscard(current)
				: drawFromPile(current);
	}

	if (current.phase === 'discard') {
		const hand = current.players[current.currentPlayerIndex].hand;

		const declaration = findCloseDeclaration(hand);
		if (declaration) return closeGame(current, declaration);

		current = discardCard(current, findSafestDiscard(hand, current.discardPile).id);
	}

	return current;
}

/** Alias kept for the solo store: an AI turn is just an auto-played turn. */
export function aiTurn(state: GameState): GameState {
	return autoPlayTurn(state);
}
