import { describe, it, expect } from 'vitest';
import { initMatch } from '$lib/engine/game';
import { isTurnExpired, shouldVoidRound } from '$lib/engine/liveness';

const TIMEOUT = 120_000;

describe('isTurnExpired', () => {
	it('expires a draw-phase turn past the budget', () => {
		expect(
			isTurnExpired({ phase: 'draw', turnStartedAt: 1_000 }, 1_000 + TIMEOUT + 1, TIMEOUT)
		).toBe(true);
	});

	it('expires a discard-phase turn past the budget', () => {
		expect(
			isTurnExpired({ phase: 'discard', turnStartedAt: 1_000 }, 1_000 + TIMEOUT + 1, TIMEOUT)
		).toBe(true);
	});

	it('does not expire within the budget', () => {
		expect(
			isTurnExpired({ phase: 'draw', turnStartedAt: 1_000 }, 1_000 + TIMEOUT - 1, TIMEOUT)
		).toBe(false);
	});

	it('does not expire exactly at the boundary', () => {
		expect(isTurnExpired({ phase: 'draw', turnStartedAt: 1_000 }, 1_000 + TIMEOUT, TIMEOUT)).toBe(
			false
		);
	});

	it('never expires round-over or finished states, however stale', () => {
		const ancient = 0;
		const farFuture = ancient + 10 * TIMEOUT;
		expect(isTurnExpired({ phase: 'round-over', turnStartedAt: ancient }, farFuture, TIMEOUT)).toBe(
			false
		);
		expect(isTurnExpired({ phase: 'finished', turnStartedAt: ancient }, farFuture, TIMEOUT)).toBe(
			false
		);
	});

	it('honours an injected timeout (test override)', () => {
		expect(isTurnExpired({ phase: 'draw', turnStartedAt: 0 }, 501, 500)).toBe(true);
		expect(isTurnExpired({ phase: 'draw', turnStartedAt: 0 }, 499, 500)).toBe(false);
	});
});

describe('shouldVoidRound', () => {
	it('voids when the stock is empty and the discard has at most one card', () => {
		const state = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
		expect(
			shouldVoidRound({ ...state, drawPile: [], discardPile: state.discardPile.slice(0, 1) })
		).toBe(true);
		expect(shouldVoidRound({ ...state, drawPile: [], discardPile: [] })).toBe(true);
	});

	it('does not void a fresh deal', () => {
		expect(shouldVoidRound(initMatch({ playerCount: 2, humanPlayerIndex: 0 }))).toBe(false);
	});
});
