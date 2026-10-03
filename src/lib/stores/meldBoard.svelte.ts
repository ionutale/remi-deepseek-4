import type { Card, CloseDeclaration, MeldType } from '$lib/engine/types';
import {
	findBestMelds,
	suggestMelds,
	validateCloseDeclaration,
	validateMeld
} from '$lib/engine/meld';
import { cardPoints } from '$lib/engine/scoring';

/** Slots the board always shows, even when empty. */
export const MIN_SLOTS = 4;
/** Hard cap on board size. */
export const MAX_SLOTS = 8;

function emptySlots(count: number): Card[][] {
	return Array.from({ length: count }, () => []);
}

export interface SlotStatus {
	valid: boolean;
	reason?: string;
	type?: MeldType;
}

/**
 * Shared meld-board controller for the solo table and the room page.
 *
 * The board is a staging area: cards live in `slots` while the player builds
 * melds, and go back to the hand on remove/sync. All pure validation lives in
 * `$lib/engine/meld` so it stays unit-testable without runes; this class only
 * owns staged state and derives the close declaration.
 */
export class MeldBoard {
	slots = $state<Card[][]>(emptySlots(MIN_SLOTS));

	/** Ids of every card currently staged on the board. */
	get assignedIds(): Set<string> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived snapshot, never stored in $state
		return new Set(this.slots.flat().map((card) => card.id));
	}

	/** Hand cards that are not staged anywhere. */
	remainingHand(hand: Card[]): Card[] {
		const assigned = this.assignedIds;
		return hand.filter((card) => !assigned.has(card.id));
	}

	/**
	 * Drop staged cards that are no longer held (discarded, drawn to a pile, or
	 * a fresh deal). Also keeps at least MIN_SLOTS slots.
	 */
	sync(hand: Card[]): void {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup, never stored in $state
		const held = new Set(hand.map((card) => card.id));
		const next = this.slots.map((slot) => slot.filter((card) => held.has(card.id)));
		while (next.length < MIN_SLOTS) next.push([]);
		this.slots = next;
	}

	/** Stage a hand card into a slot. Fails if it is not held or already staged. */
	place(cardId: string, slotIndex: number, hand: Card[]): boolean {
		if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.slots.length) {
			return false;
		}
		const card = hand.find((c) => c.id === cardId);
		if (!card) return false;
		if (this.assignedIds.has(cardId)) return false;

		this.slots = this.slots.map((slot, i) => (i === slotIndex ? [...slot, card] : slot));
		return true;
	}

	/** Return a staged card to the hand. */
	remove(cardId: string): boolean {
		const from = this.slots.findIndex((slot) => slot.some((card) => card.id === cardId));
		if (from === -1) return false;

		this.slots = this.slots.map((slot, i) =>
			i === from ? slot.filter((card) => card.id !== cardId) : slot
		);
		return true;
	}

	/** Move a staged card to another slot. Hand cards are never moved by this. */
	moveCard(cardId: string, toSlotIndex: number): boolean {
		if (!Number.isInteger(toSlotIndex) || toSlotIndex < 0 || toSlotIndex >= this.slots.length) {
			return false;
		}
		const from = this.slots.findIndex((slot) => slot.some((card) => card.id === cardId));
		if (from === -1) return false;

		const card = this.slots[from].find((c) => c.id === cardId);
		if (!card) return false;

		this.slots = this.slots.map((slot, i) => {
			if (i === from) return slot.filter((c) => c.id !== cardId);
			if (i === toSlotIndex) return [...slot, card];
			return slot;
		});
		return true;
	}

	/** Swap two slots wholesale (drag-and-drop of whole melds). */
	swapSlots(a: number, b: number): void {
		const len = this.slots.length;
		if (!Number.isInteger(a) || !Number.isInteger(b)) return;
		if (a < 0 || b < 0 || a >= len || b >= len || a === b) return;

		const next = [...this.slots];
		[next[a], next[b]] = [next[b], next[a]];
		this.slots = next;
	}

	/**
	 * Fill the board with the cheapest complete close partition of the hand
	 * (cheapest = lowest cardPoints for the card left out). When no close
	 * partition exists, fall back to the greedy `suggestMelds` suggestions.
	 */
	organize(hand: Card[]): void {
		this.clear();

		const spares = [...hand].sort((a, b) => cardPoints(a) - cardPoints(b));
		for (const spare of spares) {
			const rest = hand.filter((card) => card.id !== spare.id);
			// findBestMelds returns a list of partitions; the solver yields at most one.
			const partitions = findBestMelds(rest, true, true);
			const partition = partitions?.[0];
			if (!partition) continue;

			this.fillSlots(partition.map((meld) => meld.cards));
			return;
		}

		this.fillSlots(suggestMelds(hand));
	}

	/** Empty every slot, keeping the current board size. */
	clear(): void {
		this.slots = emptySlots(this.slots.length);
	}

	/** Grow the board by one slot, up to MAX_SLOTS. */
	addSlot(): void {
		if (this.slots.length >= MAX_SLOTS) return;
		this.slots = [...this.slots, []];
	}

	/** Validation for one slot; null when the slot is empty or out of range. */
	slotStatus(index: number): SlotStatus | null {
		const slot = this.slots[index];
		if (!slot || slot.length === 0) return null;

		const validation = validateMeld(slot);
		return { valid: validation.valid, reason: validation.reason, type: validation.type };
	}

	/**
	 * The close declaration for the staged board, or null when the board is not
	 * a legal declaration (hand not 15 cards, coverage wrong, missing a set or
	 * a sequence, invalid meld).
	 */
	declaration(hand: Card[]): CloseDeclaration | null {
		const remaining = this.remainingHand(hand);
		if (remaining.length !== 1) return null;

		const declaration: CloseDeclaration = {
			melds: this.slots
				.filter((slot) => slot.length > 0)
				.map((cards) => ({ cards, type: validateMeld(cards).type as MeldType })),
			discardId: remaining[0].id
		};

		return validateCloseDeclaration(hand, declaration).valid ? declaration : null;
	}

	/** One card left in hand outside the board and a legal declaration. */
	isCloseReady(hand: Card[]): boolean {
		return this.remainingHand(hand).length === 1 && this.declaration(hand) !== null;
	}

	/** Back to a fresh board. */
	reset(): void {
		this.slots = emptySlots(MIN_SLOTS);
	}

	private fillSlots(groups: Card[][]): void {
		const next = groups.slice(0, MAX_SLOTS).map((group) => [...group]);
		while (next.length < MIN_SLOTS) next.push([]);
		this.slots = next;
	}
}
