/**
 * Smoke tests for the solo store.
 *
 * The store deals random decks, so these assert STRUCTURAL invariants (phase
 * transitions, rack sizes, turn ownership, blind-exchange consistency) rather
 * than exact pieces.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	HUMAN_INDEX,
	soloAnnounceAtu,
	soloClose,
	soloDiscard,
	soloDrawStock,
	soloError,
	soloMeld,
	soloNextGame,
	soloOpeningDiscard,
	soloReset,
	soloResolveDuble,
	soloStartPlaying,
	soloState,
	soloStrica,
	startSoloGame
} from '$lib/stores/remi/soloStore';
import { createGame, resolveDubleExchange, startPlaying } from '$lib/engine/remi/actions';
import { COLORS, isSamePiece } from '$lib/engine/remi/pieces';
import type { Color, GameState, Piece } from '$lib/engine/remi/types';

let seq = 0;

function n(color: Color, value: number): Piece {
	return { id: `${color}-${value}-${seq++}`, isJoker: false, value, color };
}

function jokerPiece(): Piece {
	return { id: `j${seq++}`, isJoker: true, value: 0, color: 'black' };
}

/** `deal` hands out 15/14 pieces; short racks are padded with inert jokers. */
function pad(rack: Piece[], size: number): Piece[] {
	return [...rack, ...Array.from({ length: Math.max(0, size - rack.length) }, () => jokerPiece())];
}

/** Deals, resolves duble and starts play — the store's "game is running" entry point. */
function playingGame(playerCount: 2 | 3 | 4 = 2): GameState {
	startSoloGame(playerCount);
	soloResolveDuble();
	soloStartPlaying();
	const state = get(soloState);
	if (!state) throw new Error('solo game did not start');
	return state;
}

/** Plays the human turn to completion, whichever way it has to end. */
function playHumanTurn(state: GameState): GameState {
	const current = get(soloState);
	if (!current) throw new Error('no game');

	if (state.turnNumber === 1 && state.table.sir.length === 0 && current.players[0]) {
		soloOpeningDiscard((current.players[HUMAN_INDEX]?.rack[0] as { id: string }).id);
		return get(soloState) as GameState;
	}
	soloDrawStock();
	const afterDraw = get(soloState) as GameState;
	const rack = afterDraw.players[HUMAN_INDEX]?.rack ?? [];
	if (rack.length === 1) soloClose((rack[0] as { id: string }).id);
	else soloDiscard((rack[0] as { id: string }).id);
	return get(soloState) as GameState;
}

beforeEach(() => {
	soloReset();
});

describe('soloStore — pre-game', () => {
	it('starts null and deals into the duble phase', () => {
		expect(get(soloState)).toBeNull();

		startSoloGame(3);

		const state = get(soloState) as GameState;
		expect(state.phase).toBe('duble');
		expect(state.players).toHaveLength(3);
		expect(state.players.map((player) => player.rack.length)).toEqual([15, 14, 14]);
		expect(state.table.sir).toEqual([]);
		expect(state.table.melds).toEqual([]);
		expect(state.scores).toEqual([]);
		expect(state.sessionTotals).toEqual([0, 0, 0]);
		expect(get(soloError)).toBeNull();
	});

	it('has AI seats offer their duble immediately, without revealing values', () => {
		startSoloGame(3);

		const state = get(soloState) as GameState;
		// Seat 0 never offers on its own — the human drives that choice.
		expect(state.dubleOffers[HUMAN_INDEX]).toBeNull();

		for (let seat = 1; seat < state.players.length; seat++) {
			const offer = state.dubleOffers[seat];
			if (!offer) continue;
			// A blind offer is always a pair the seat really holds.
			const twins = (state.players[seat]?.rack ?? []).filter(
				(piece) => !piece.isJoker && piece.value === offer.value && piece.color === offer.color
			);
			expect(twins).toHaveLength(2);
		}
	});

	it('walks duble → atu → playing', () => {
		startSoloGame(2);
		expect((get(soloState) as GameState).phase).toBe('duble');

		soloResolveDuble();
		expect((get(soloState) as GameState).phase).toBe('atu');

		soloStartPlaying();
		const state = get(soloState) as GameState;
		expect(state.phase).toBe('playing');
		expect(state.turnNumber).toBe(1);
		expect(state.currentPlayerIndex).toBe(HUMAN_INDEX);
		expect(state.turnState.hasDrawn).toBe(false);
	});

	it('only announces atu for a seat holding the identical piece', () => {
		startSoloGame(2);
		soloResolveDuble();
		const state = get(soloState) as GameState;
		const atu = state.table.atu;

		// The human may only announce when holding the exact twin of the atu.
		const holds = atu !== null && state.players[HUMAN_INDEX]!.rack.some((p) => isSamePiece(p, atu));
		soloAnnounceAtu();

		const after = get(soloState) as GameState;
		expect(after.players[HUMAN_INDEX]?.announcedAtu).toBe(holds);
		// Either way the state stays intact — a rejection never mutates it.
		expect(after.table.atu).toEqual(atu);
	});
});

describe('soloStore — turn flow', () => {
	it('opens the game with a sideways piece and hands the turn to the AI', () => {
		const opening = playingGame(2);
		const discarded = opening.players[HUMAN_INDEX]?.rack[0] as { id: string };

		soloOpeningDiscard(discarded.id);
		const after = get(soloState) as GameState;

		expect(after.phase).toBe('playing');
		// The discarded piece opens the șir; the AI seats added their discards after it.
		expect(after.table.sir[0]?.id).toBe(discarded.id);
		expect(after.players[HUMAN_INDEX]?.rack).toHaveLength(14);
		// The AI seats played out their turns, so it is the human's move again.
		expect(after.currentPlayerIndex).toBe(HUMAN_INDEX);
	});

	it('advances the turn and keeps the șir and stock consistent', () => {
		let state = playingGame(2);
		state = playHumanTurn(state);

		const total =
			state.players.reduce((sum, player) => sum + player.rack.length, 0) +
			state.table.melds.reduce((sum, meld) => sum + meld.pieces.length, 0) +
			state.table.sir.length +
			state.table.stock.length +
			(state.table.atu ? 1 : 0);

		// 106 pieces: every one of them is either on a rack, on the table or the atu.
		expect(total).toBe(106);
		expect(state.turnNumber).toBeGreaterThan(1);
		expect(state.phase).toBe('playing');
	});

	it('never leaves the AI mid-turn, and clears the error on success', () => {
		playingGame(2);
		playHumanTurn(get(soloState) as GameState);
		playHumanTurn(get(soloState) as GameState);

		const after = get(soloState) as GameState;
		expect([after.currentPlayerIndex, after.phase]).not.toEqual([1, 'playing']);
		expect(get(soloError)).toBeNull();
	});
});

describe('soloStore — melding', () => {
	it('melds several formations in one turn', () => {
		// 30 points for the suită plus 30 for the terță clears the 45-point bar.
		const suite = [n('red', 10), n('red', 11), n('red', 12)];
		const terta = [n('red', 12), n('blue', 12), n('black', 12)];
		const deck = [
			...pad([...suite, ...terta], 15),
			...pad([n('blue', 3)], 14),
			n('yellow', 7),
			n('black', 1)
		];
		const base = startPlaying(resolveDubleExchange(createGame({ playerCount: 2, deck })));
		soloState.set({
			...base,
			turnNumber: 5,
			table: { ...base.table, stock: [n('yellow', 7)] },
			turnState: { hasDrawn: true, drawnFrom: 'stock', mustUsePieceIds: [] }
		});

		soloMeld([
			{ type: 'suite', pieceIds: suite.map((piece) => piece.id) },
			{ type: 'terta', pieceIds: terta.map((piece) => piece.id) }
		]);

		const after = get(soloState) as GameState;
		expect(after.table.melds).toHaveLength(2);
		expect(after.players[HUMAN_INDEX]?.melded).toBe(true);
		expect(get(soloError)).toBeNull();
	});
});

describe('soloStore — strica jocul', () => {
	it('rejects the redeal when the human holds fewer than 3 dube', () => {
		// 52 distinct naturals: no seat holds a pair, so the human has
		// no dube at all — far short of the 3-dublă bar.
		const deck: Piece[] = [];
		for (const color of COLORS) {
			for (let value = 1; value <= 13; value++) {
				deck.push(n(color, value));
			}
		}
		const base = resolveDubleExchange(createGame({ playerCount: 2, deck }));
		soloState.set(base);

		soloStrica();

		const after = get(soloState) as GameState;
		expect(after).toBe(base);
		expect(get(soloError)).toBe('Ai nevoie de cel puțin 3 duble ca să strici jocul.');
	});

	it('redeals and carries the session totals when the human holds 3 dube', () => {
		// Three pairs lead the deck, so the human's 15 pieces hold exactly
		// 3 dube; every later piece is distinct.
		const deck: Piece[] = [
			n('red', 1),
			n('red', 1),
			n('blue', 2),
			n('blue', 2),
			n('yellow', 3),
			n('yellow', 3)
		];
		for (const color of COLORS) {
			for (let value = 4; value <= 13; value++) {
				deck.push(n(color, value));
			}
		}
		const base = resolveDubleExchange(createGame({ playerCount: 2, deck }));
		soloState.set({ ...base, sessionTotals: [20, 5] });

		soloStrica();

		const after = get(soloState) as GameState;
		expect(after.phase).toBe('duble');
		expect(after.sessionTotals).toEqual([20, 5]);
		expect(get(soloError)).toBeNull();
	});
});

describe('soloStore — errors', () => {
	it('reports a rejected action in Romanian and leaves the state untouched', () => {
		const state = playingGame(2);

		// Discarding before drawing is illegal.
		const piece = state.players[HUMAN_INDEX]?.rack[0] as { id: string };
		soloDiscard(piece.id);

		const after = get(soloState) as GameState;
		expect(after).toBe(state);
		expect(get(soloError)).toBe('Trage mai întâi o piesă.');
	});

	it('clears the error once a legal action follows', () => {
		const opened = playingGame(2);
		// Turn 1 is the opener's discard-only turn (spec §1.4), so the human has to
		// open before any draw is legal.
		soloOpeningDiscard((opened.players[HUMAN_INDEX]?.rack[0] as { id: string }).id);

		const before = get(soloState) as GameState;
		expect(before.turnNumber).toBeGreaterThan(1);

		// Discarding before drawing is still illegal.
		soloDiscard((before.players[HUMAN_INDEX]?.rack[0] as { id: string }).id);
		expect(get(soloError)).not.toBeNull();

		soloDrawStock();
		expect(get(soloError)).toBeNull();
	});
});

describe('soloStore — session', () => {
	it('rejects the next game while a game is still in progress', () => {
		const state = playingGame(2);

		soloNextGame();

		const after = get(soloState) as GameState;
		expect(after).toBe(state);
		expect(get(soloError)).toBe('Jocul curent nu s-a terminat.');
	});

	it('rotates the first player to the previous winner and keeps session totals', () => {
		startSoloGame(2);
		soloResolveDuble();
		soloStartPlaying();
		const finished: GameState = {
			...(get(soloState) as GameState),
			phase: 'finished',
			gameWinner: 1,
			scores: [10, 40],
			sessionTotals: [10, 40],
			endReason: 'close',
			closerIndex: 1
		};
		soloState.set(finished);

		soloNextGame();
		const next = get(soloState) as GameState;

		expect(next.phase).toBe('duble');
		expect(next.firstPlayerIndex).toBe(1);
		expect(next.sessionTotals).toEqual([10, 40]);
		expect(next.scores).toEqual([]);
		expect(next.gameWinner).toBeNull();
		expect(next.turnNumber).toBe(0);
		expect(next.players.map((player) => player.rack.length)).toEqual([15, 14]);
	});

	it('starts the first game from seat 0 when there is no previous winner', () => {
		startSoloGame(3);
		soloResolveDuble();
		soloStartPlaying();
		expect((get(soloState) as GameState).firstPlayerIndex).toBe(0);
	});

	it('resets to no game at all', () => {
		playingGame(2);
		soloReset();

		expect(get(soloState)).toBeNull();
		expect(get(soloError)).toBeNull();
	});
});
