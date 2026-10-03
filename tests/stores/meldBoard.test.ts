import { describe, it, expect } from 'vitest';
import { MeldBoard, MIN_SLOTS, MAX_SLOTS } from '$lib/stores/meldBoard.svelte';
import type { Card, Suit, Value } from '$lib/engine/types';

function card(id: string, suit: Suit, value: Value): Card {
	return { id, suit, value, isJoker: false };
}

/** 15 cards that partition into a legal close when ♠9 is left out. */
const closeHand: Card[] = [
	card('s2', '♠', 2),
	card('d2', '♦', 2),
	card('c2', '♣', 2),
	card('h4', '♥', 4),
	card('h5', '♥', 5),
	card('h6', '♥', 6),
	card('h7', '♥', 7),
	card('s7', '♠', 7),
	card('d7', '♦', 7),
	card('c7', '♣', 7),
	card('s9', '♠', 9),
	card('s10', '♠', 10),
	card('s11', '♠', 11),
	card('s12', '♠', 12),
	card('s13', '♠', 13)
];

/** 15 cards with no possible set+sequence partition (no 3-of-a-kind, no runs of 3). */
const looseHand: Card[] = [
	card('l-s5', '♠', 5),
	card('l-h5', '♥', 5),
	card('l-d8', '♦', 8),
	card('l-c8', '♣', 8),
	card('l-h2', '♥', 2),
	card('l-c2', '♣', 2),
	card('l-s3', '♠', 3),
	card('l-s4', '♠', 4),
	card('l-d11', '♦', 11),
	card('l-d12', '♦', 12),
	card('l-s7', '♠', 7),
	card('l-h13', '♥', 13),
	card('l-c4', '♣', 4),
	card('l-d9', '♦', 9),
	card('l-c13', '♣', 13)
];

describe('MeldBoard place/remove', () => {
	it('starts with 4 empty slots', () => {
		const board = new MeldBoard();
		expect(board.slots.length).toBe(MIN_SLOTS);
		expect(board.assignedIds.size).toBe(0);
	});

	it('places a held card and reports it as assigned', () => {
		const board = new MeldBoard();
		expect(board.place('s2', 0, closeHand)).toBe(true);
		expect(board.slots[0].map((c) => c.id)).toEqual(['s2']);
		expect(board.assignedIds.has('s2')).toBe(true);
		expect(board.remainingHand(closeHand).length).toBe(closeHand.length - 1);
	});

	it('rejects a card that is not in the hand', () => {
		const board = new MeldBoard();
		expect(board.place('nope', 0, closeHand)).toBe(false);
		expect(board.assignedIds.size).toBe(0);
	});

	it('rejects a card that is already staged', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		expect(board.place('s2', 1, closeHand)).toBe(false);
		expect(board.slots[1].length).toBe(0);
	});

	it('rejects an out-of-range slot index', () => {
		const board = new MeldBoard();
		expect(board.place('s2', 4, closeHand)).toBe(false);
		expect(board.place('s2', -1, closeHand)).toBe(false);
	});

	it('removes a staged card back to the hand', () => {
		const board = new MeldBoard();
		board.place('s2', 2, closeHand);
		expect(board.remove('s2')).toBe(true);
		expect(board.slots[2].length).toBe(0);
		expect(board.assignedIds.size).toBe(0);
	});

	it('reports false when removing a card that is not staged', () => {
		const board = new MeldBoard();
		expect(board.remove('s2')).toBe(false);
	});
});

describe('MeldBoard sync', () => {
	it('drops staged cards that are no longer held', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		board.place('d2', 0, closeHand);

		const shrunk = closeHand.filter((c) => c.id !== 'd2');
		board.sync(shrunk);

		expect(board.slots[0].map((c) => c.id)).toEqual(['s2']);
		expect(board.assignedIds.has('d2')).toBe(false);
	});

	it('keeps the card object identity from the new hand', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		const fresh: Card[] = [{ ...card('s2', '♠', 2), suit: '♠' }];
		board.sync(fresh);
		expect(board.slots[0].length).toBe(1);
	});

	it('never shrinks below 4 slots', () => {
		const board = new MeldBoard();
		board.addSlot();
		board.addSlot();
		expect(board.slots.length).toBe(MIN_SLOTS + 2);

		board.sync(closeHand);
		expect(board.slots.length).toBe(MIN_SLOTS + 2);
		expect(board.slots.length).toBeGreaterThanOrEqual(MIN_SLOTS);
	});
});

describe('MeldBoard moveCard', () => {
	it('moves a staged card between slots', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		expect(board.moveCard('s2', 3)).toBe(true);
		expect(board.slots[0].length).toBe(0);
		expect(board.slots[3].map((c) => c.id)).toEqual(['s2']);
		expect(board.assignedIds.size).toBe(1);
	});

	it('refuses to move a card that is not staged', () => {
		const board = new MeldBoard();
		expect(board.moveCard('s2', 1)).toBe(false);
		expect(board.assignedIds.size).toBe(0);
	});

	it('refuses an out-of-range target slot', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		expect(board.moveCard('s2', 9)).toBe(false);
		expect(board.slots[0].length).toBe(1);
	});
});

describe('MeldBoard swapSlots', () => {
	it('swaps two slots', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		board.place('d2', 3, closeHand);

		board.swapSlots(0, 3);

		expect(board.slots[0].map((c) => c.id)).toEqual(['d2']);
		expect(board.slots[3].map((c) => c.id)).toEqual(['s2']);
	});

	it('ignores invalid indices', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		board.swapSlots(0, 0);
		board.swapSlots(-1, 2);
		board.swapSlots(0, 42);
		expect(board.slots[0].map((c) => c.id)).toEqual(['s2']);
	});
});

describe('MeldBoard slot cap', () => {
	it('grows one slot at a time and stops at 8', () => {
		const board = new MeldBoard();
		for (let i = 0; i < 10; i++) board.addSlot();

		expect(board.slots.length).toBe(MAX_SLOTS);
	});

	it('places into the last slot but not beyond it', () => {
		const board = new MeldBoard();
		for (let i = 0; i < 10; i++) board.addSlot();

		expect(board.place('s2', MAX_SLOTS - 1, closeHand)).toBe(true);
		expect(board.place('d2', MAX_SLOTS, closeHand)).toBe(false);
	});
});

describe('MeldBoard organize', () => {
	it('stages a complete close partition and leaves one card out', () => {
		const board = new MeldBoard();
		board.place('c7', 1, closeHand);
		board.organize(closeHand);

		expect(board.assignedIds.size).toBe(closeHand.length - 1);
		expect(board.remainingHand(closeHand).length).toBe(1);
		expect(board.isCloseReady(closeHand)).toBe(true);
	});

	it('fills slots contiguously with valid melds', () => {
		const board = new MeldBoard();
		board.organize(closeHand);

		const filledIndexes = board.slots.flatMap((slot, i) => (slot.length > 0 ? [i] : []));
		expect(filledIndexes.length).toBeGreaterThanOrEqual(2);
		expect(filledIndexes).toEqual([...filledIndexes].sort((a, b) => a - b));
		expect(Math.max(...filledIndexes)).toBe(filledIndexes.length - 1);
		for (const i of filledIndexes) {
			expect(board.slotStatus(i)?.valid).toBe(true);
		}
	});

	it('clears previously staged cards first', () => {
		const board = new MeldBoard();
		board.place('c7', 2, closeHand);
		board.organize(closeHand);
		expect(board.slots[2].some((c) => c.id === 'c7')).toBe(true);
		expect(board.assignedIds.size).toBe(closeHand.length - 1);
	});

	it('falls back to suggestions when no close partition exists', () => {
		const board = new MeldBoard();
		board.organize(looseHand);

		expect(board.isCloseReady(looseHand)).toBe(false);
		expect(board.declaration(looseHand)).toBeNull();

		const filled = board.slots.filter((s) => s.length > 0);
		expect(filled.length).toBeGreaterThan(0);
		expect(board.slots.length).toBeGreaterThanOrEqual(MIN_SLOTS);
		expect(board.slots.length).toBeLessThanOrEqual(MAX_SLOTS);
		for (const slot of filled) {
			expect(slot.length).toBeGreaterThanOrEqual(2);
		}
		expect(board.assignedIds.size).toBe(looseHand.length - board.remainingHand(looseHand).length);
	});
});

describe('MeldBoard declaration', () => {
	function stageCloseBoard(): MeldBoard {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		board.place('d2', 0, closeHand);
		board.place('c2', 0, closeHand);
		board.place('h5', 1, closeHand);
		board.place('h6', 1, closeHand);
		board.place('h7', 1, closeHand);
		board.place('s7', 2, closeHand);
		board.place('d7', 2, closeHand);
		board.place('c7', 2, closeHand);
		board.place('s9', 3, closeHand);
		board.place('s10', 3, closeHand);
		board.place('s11', 3, closeHand);
		board.place('s12', 3, closeHand);
		board.place('s13', 3, closeHand);
		return board;
	}

	it('builds a valid declaration for a staged close', () => {
		const board = stageCloseBoard();
		const declaration = board.declaration(closeHand);

		expect(declaration).not.toBeNull();
		expect(declaration?.discardId).toBe('h4');
		expect(declaration?.melds.map((m) => m.type).sort()).toEqual([
			'sequence',
			'sequence',
			'set',
			'set'
		]);
		expect(declaration?.melds.flatMap((m) => m.cards).length).toBe(14);
	});

	it('reports close readiness exactly when one card is left out', () => {
		const board = stageCloseBoard();
		expect(board.isCloseReady(closeHand)).toBe(true);

		board.remove('s13');
		expect(board.isCloseReady(closeHand)).toBe(false);
		expect(board.remainingHand(closeHand).length).toBe(2);
	});

	it('returns null when the hand is not 15 cards', () => {
		const board = stageCloseBoard();
		expect(board.declaration(closeHand.slice(0, 14))).toBeNull();
	});

	it('returns null when a meld needs a sequence and none is staged', () => {
		const board = new MeldBoard();
		board.organize(closeHand);
		// collapse everything into one slot set: coverage stays 14 but only sets remain
		for (let i = 1; i < board.slots.length; i++) {
			for (const c of board.slots[i]) board.moveCard(c.id, 0);
		}
		expect(board.declaration(closeHand)).toBeNull();
	});
});

describe('MeldBoard slotStatus', () => {
	it('returns null for an empty slot and for out-of-range slots', () => {
		const board = new MeldBoard();
		expect(board.slotStatus(0)).toBeNull();
		expect(board.slotStatus(99)).toBeNull();
	});

	it('reports a reason for an incomplete slot', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		const status = board.slotStatus(0);
		expect(status?.valid).toBe(false);
		expect(typeof status?.reason).toBe('string');
	});

	it('reports the meld type for a valid set', () => {
		const board = new MeldBoard();
		board.place('s2', 0, closeHand);
		board.place('d2', 0, closeHand);
		board.place('c2', 0, closeHand);
		expect(board.slotStatus(0)?.valid).toBe(true);
		expect(board.slotStatus(0)?.type).toBe('set');
	});
});

describe('MeldBoard clear and reset', () => {
	it('clears cards but keeps the board size', () => {
		const board = new MeldBoard();
		board.addSlot();
		board.place('s2', 0, closeHand);

		board.clear();

		expect(board.slots.length).toBe(MIN_SLOTS + 1);
		expect(board.assignedIds.size).toBe(0);
	});

	it('reset returns a fresh 4-slot board', () => {
		const board = new MeldBoard();
		board.addSlot();
		board.place('s2', 0, closeHand);

		board.reset();

		expect(board.slots.length).toBe(MIN_SLOTS);
		expect(board.assignedIds.size).toBe(0);
		expect(board.isCloseReady(closeHand)).toBe(false);
	});
});
