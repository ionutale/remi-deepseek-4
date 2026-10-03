import type { GameState } from './types';
import { isRoundBlocked } from './game';

/**
 * Pure turn-expiry decision for the multiplayer liveness tick: has the
 * server-owned turn budget elapsed? `now` and `timeoutMs` are injected so the
 * cleanup tick (`roomService.autoPlayExpiredTurns`) stays unit-testable.
 *
 * Only live play phases can expire — round-over/finished states wait for a
 * human to advance the match, never for a turn timer.
 */
export function isTurnExpired(
	state: Pick<GameState, 'phase' | 'turnStartedAt'>,
	now: number,
	timeoutMs: number
): boolean {
	if (state.phase !== 'draw' && state.phase !== 'discard') return false;
	return now - state.turnStartedAt > timeoutMs;
}

/**
 * Blocked-round (void) decision for the same tick: no drawable cards left and
 * nothing useful to take from the discard pile. Kept beside `isTurnExpired`
 * so the tick's two branches read as one policy; the implementation is the
 * engine's `isRoundBlocked` predicate.
 */
export function shouldVoidRound(state: GameState): boolean {
	return isRoundBlocked(state);
}
