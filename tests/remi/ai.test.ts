import { describe, expect, it } from 'vitest';
import { autoPlayPreGame, choosePeTablaPattern, playTurn } from '$lib/engine/remi/ai';
import { analyzeFormation } from '$lib/engine/remi/formations';
import { createDeck, shuffle } from '$lib/engine/remi/pieces';
import { createGame, declarePeTabla } from '$lib/engine/remi/actions';
import type { Color, GameState, Piece } from '$lib/engine/remi/types';

let seq = 1000;

function n(color: Color, value: number, id?: string): Piece {
	return { id: id ?? `t-${color}-${value}-${seq++}`, isJoker: false, value, color };
}

function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A real 2-player game driven into `playing`, ready for rack overrides. */
function freshPlaying(): GameState {
	const deck = shuffle(createDeck(), mulberry32(7));
	return autoPlayPreGame(createGame({ playerCount: 2, deck }));
}

function withRack(state: GameState, idx: number, rack: Piece[]): GameState {
	return {
		...state,
		players: state.players.map((p, i) => (i === idx ? { ...p, rack } : p))
	};
}

function withStockTop(state: GameState, top: Piece): GameState {
	return { ...state, table: { ...state.table, stock: [...state.table.stock, top] } };
}

/** Junk that forms nothing with itself: scattered values, no triples. */
function junk(count: number): Piece[] {
	const pool: [Color, number][] = [
		['black', 1],
		['yellow', 1],
		['black', 2],
		['yellow', 4],
		['black', 6],
		['yellow', 8],
		['black', 10],
		['black', 13],
		['yellow', 13],
		['blue', 2],
		['blue', 4],
		['blue', 6],
		['yellow', 11]
	];
	return pool.slice(0, count).map(([color, value]) => n(color, value));
}

function collectIds(state: GameState): string[] {
	const ids: string[] = [];
	for (const player of state.players) ids.push(...player.rack.map((p) => p.id));
	for (const meld of state.table.melds) ids.push(...meld.pieces.map((p) => p.id));
	ids.push(...state.table.sir.map((p) => p.id));
	ids.push(...state.table.stock.map((p) => p.id));
	if (state.table.atu) ids.push(state.table.atu.id);
	return ids.sort();
}

describe('ai turns', () => {
	it('never closes a player who never etalat', () => {
		// ropet: closing means you etalat everything, so the AI keeps discarding.
		let state = freshPlaying();
		for (let i = 0; i < 8 && state.phase === 'playing'; i++) state = playTurn(state);
		expect(state.phase).toBe('playing');

		const players = state.players.map((p) => ({
			...p,
			melded: false,
			rack: [n('black', 9, 'last-one')]
		}));
		const stranded: GameState = { ...state, players, turnNumber: 12 };
		const after = playTurn(stranded);

		expect(after.phase).toBe('playing');
		expect(after.turnNumber).toBe(13);
		// It drew and discarded instead of closing.
		expect(after.players[0]?.rack).toHaveLength(1);
		expect(after.players[0]?.melded).toBe(false);
	});

	it('plays the opening discard', () => {
		let state = freshPlaying();
		expect(state.turnNumber).toBe(1);
		const stock = state.table.stock.length;
		state = playTurn(state);
		expect(state.table.sir.length).toBe(1);
		expect(state.turnNumber).toBe(2);
		expect(state.currentPlayerIndex).toBe(1);
		expect(state.players[0]?.rack.length).toBe(14);
		// Spec §1.4: the opener draws nothing, so the grămadă is untouched.
		expect(state.table.stock.length).toBe(stock);
		expect(state.players[0]?.turnsTaken).toBe(1);
	});

	it('draws and discards legally on a normal turn', () => {
		let state = freshPlaying();
		state = playTurn(state);
		const stockBefore = state.table.stock.length;
		state = playTurn(state);
		expect(state.turnNumber).toBe(3);
		expect(state.currentPlayerIndex).toBe(0);
		expect(state.table.stock.length).toBe(stockBefore - 1);
		expect(state.table.sir.length).toBe(2);
	});

	it('never melds during round 1', () => {
		let state = freshPlaying();
		state = playTurn(state); // opening discard
		state = withRack(state, 1, [
			n('red', 5, 'r5'),
			n('red', 6, 'r6'),
			n('red', 7, 'r7'),
			...junk(11)
		]);
		state = playTurn(state);
		expect(state.table.melds.length).toBe(0);
		expect(state.players[1]?.melded).toBe(false);
		expect(state.turnNumber).toBe(3);
	});

	it('respects the first-meld minimum', () => {
		let state = freshPlaying();
		state = playTurn(state);
		state = playTurn(state);
		expect(state.turnNumber).toBe(3);
		// A lone 15-point terță must stay on the rack.
		state = withRack(state, 0, [
			n('blue', 5, 'b5'),
			n('yellow', 5, 'y5'),
			n('black', 5, 'k5'),
			...junk(11)
		]);
		state = withStockTop(state, n('black', 7, 'junk-top'));
		state = { ...state, table: { ...state.table, atu: n('black', 9, 'junk-atu') } };
		state = playTurn(state);
		expect(state.table.melds.length).toBe(0);
		expect(state.players[0]?.melded).toBe(false);
		expect(state.phase).toBe('playing');
	});

	it('opens when the rack affords 45+ with a suita', () => {
		let state = freshPlaying();
		state = playTurn(state);
		state = playTurn(state);
		state = withRack(state, 0, [
			n('red', 5, 'o-r5'),
			n('red', 6, 'o-r6'),
			n('red', 7, 'o-r7'),
			n('blue', 10, 'o-b10'),
			n('blue', 11, 'o-b11'),
			n('blue', 12, 'o-b12'),
			...junk(8)
		]);
		state = withStockTop(state, n('black', 6, 'o-top'));
		state = { ...state, table: { ...state.table, atu: n('black', 9, 'o-atu') } };
		state = playTurn(state);
		expect(state.players[0]?.melded).toBe(true);
		expect(state.table.melds.length).toBeGreaterThanOrEqual(2);
		expect(state.table.melds.some((m) => m.type === 'suite')).toBe(true);
		for (const meld of state.table.melds) {
			expect(analyzeFormation(meld.type, meld.pieces).valid).toBe(true);
		}
	});

	it('lipeste a fitting piece onto its own meld', () => {
		let state = freshPlaying();
		const r5 = n('red', 5, 'l-r5');
		const r6 = n('red', 6, 'l-r6');
		const r7 = n('red', 7, 'l-r7');
		const r8 = n('red', 8, 'l-r8');
		state = {
			...state,
			turnNumber: 5,
			currentPlayerIndex: 0,
			players: state.players.map((p, i) =>
				i === 0
					? { ...p, melded: true, meldedTurn: 2, rack: [r8, ...junk(13)] }
					: { ...p, rack: junk(13).map((q) => ({ ...q, id: `${q.id}-p1` })) }
			),
			table: {
				...state.table,
				melds: [
					{ id: 'm0', type: 'suite', pieces: [r5, r6, r7], owner: 0, lipitBy: [null, null, null] }
				],
				sir: [n('black', 3, 'l-dead'), n('yellow', 5, 'l-filler')],
				atu: n('black', 7, 'l-atu')
			}
		};
		state = withStockTop(state, n('black', 9, 'l-top'));
		state = playTurn(state);
		const meld = state.table.melds.find((m) => m.id === 'm0');
		expect(meld?.pieces.length).toBe(4);
		expect(state.players[0]?.rack.some((p) => p.id === 'l-r8')).toBe(false);
		expect(state.phase).toBe('playing');
	});

	it('closes when the rack can be emptied', () => {
		let state = freshPlaying();
		state = {
			...state,
			turnNumber: 5,
			currentPlayerIndex: 0,
			players: state.players.map((p, i) =>
				i === 0
					? {
							...p,
							melded: true,
							meldedTurn: 2,
							rack: [
								n('red', 5, 'c-r5'),
								n('red', 6, 'c-r6'),
								n('red', 7, 'c-r7'),
								n('blue', 9, 'c-b9')
							]
						}
					: p
			),
			table: {
				...state.table,
				melds: [],
				sir: [n('black', 3, 'c-dead'), n('yellow', 5, 'c-filler')],
				stock: [n('black', 2, 'c-under'), n('red', 8, 'c-r8')],
				atu: n('black', 7, 'c-atu')
			}
		};
		state = playTurn(state);
		expect(state.phase).toBe('finished');
		expect(state.gameWinner).toBe(0);
	});

	it('pe-tabla keeps pieces without discarding, then closes on completion', () => {
		let state = freshPlaying();
		state = declarePeTabla(state, 0, 'duble');
		const sirBefore = state.table.sir.length;
		state = playTurn(state);
		expect(state.phase).toBe('playing');
		expect(state.table.sir.length).toBe(sirBefore);
		expect(state.currentPlayerIndex).toBe(1);

		// Six pairs plus one single; the stock top is the single's mate.
		const pairs: Piece[] = [];
		const specs: [Color, number][] = [
			['red', 5],
			['yellow', 7],
			['blue', 2],
			['black', 9],
			['red', 11],
			['yellow', 3]
		];
		for (const [color, value] of specs) {
			pairs.push(n(color, value), n(color, value));
		}
		const single = n('black', 4, 'pb-single');
		state = {
			...state,
			currentPlayerIndex: 0,
			players: state.players.map((p, i) => (i === 0 ? { ...p, rack: [...pairs, single] } : p)),
			table: { ...state.table, sir: [], stock: [n('black', 4, 'pb-mate')] }
		};
		state = playTurn(state);
		expect(state.phase).toBe('finished');
		expect(state.players[0]?.peTablaComplete).toBe(true);
	});

	it('autoPlayPreGame reaches playing and is idempotent', () => {
		const deck = shuffle(createDeck(), mulberry32(21));
		let state = createGame({ playerCount: 3, deck });
		expect(state.phase).toBe('duble');
		state = autoPlayPreGame(state);
		expect(state.phase).toBe('playing');
		expect(state.turnNumber).toBe(1);
		const again = autoPlayPreGame(state);
		expect(again.phase).toBe('playing');
	});

	it('never produces an illegal state (spot cases)', () => {
		const deck = shuffle(createDeck(), mulberry32(99));
		let state = autoPlayPreGame(createGame({ playerCount: 2, deck }));
		for (let turn = 0; turn < 12 && state.phase === 'playing'; turn++) {
			const before = collectIds(state);
			state = playTurn(state);
			expect(collectIds(state)).toEqual(before);
			for (const meld of state.table.melds) {
				expect(analyzeFormation(meld.type, meld.pieces).valid).toBe(true);
			}
			for (const player of state.players) {
				if (!player.peTabla) expect(player.rack.length).toBeLessThanOrEqual(14);
			}
			if (state.phase === 'playing') {
				expect(state.turnState.hasDrawn).toBe(false);
				expect(state.turnState.mustUsePieceIds).toEqual([]);
			}
		}
	});

	it('escapes a round-1 take-last that no meld can use', () => {
		// Round 1 blocks melding entirely, so a piece taken from the șir can never
		// be used in a formation: the turn must still end (interpretation #14).
		let state = freshPlaying();
		state = playTurn(state); // opening discard, turn 1 -> 2
		const dead = state.table.sir[0] as Piece;
		const taken = n('black', 12, 'round1-loot');
		const takenState: GameState = {
			...state,
			table: { ...state.table, sir: [dead, taken] },
			turnState: {
				hasDrawn: true,
				drawnFrom: 'sir',
				mustUsePieceIds: ['round1-loot'],
				pending: [{ pieceId: 'round1-loot', source: 'sir', restoreToSir: ['round1-loot'] }]
			}
		};
		// Hand the piece to the player on turn so the state is physically consistent.
		const withIt = withRack(takenState, 1, [...(state.players[1]?.rack ?? []), taken]);
		expect(withIt.turnNumber).toBeLessThanOrEqual(2);

		const after = playTurn(withIt);

		expect(after.turnNumber).toBe(withIt.turnNumber + 1);
		expect(after.currentPlayerIndex).toBe(0);
		expect(after.table.sir.map((piece) => piece.id)).toContain('round1-loot');
		expect(after.turnState.mustUsePieceIds).toEqual([]);
		expect(collectIds(after)).toEqual(collectIds(withIt));
	});

	it('plays a turn well under 50 ms typical', () => {
		const deck = shuffle(createDeck(), mulberry32(5));
		let state = autoPlayPreGame(createGame({ playerCount: 4, deck }));
		const start = performance.now();
		let turns = 0;
		for (; turns < 30 && state.phase === 'playing'; turns++) {
			if (state.table.stock.length === 0) break;
			state = playTurn(state);
		}
		const avg = (performance.now() - start) / Math.max(1, turns);
		console.log(`ai perf: ${turns} turns, avg ${avg.toFixed(2)} ms/turn`);
		expect(avg).toBeLessThan(50);
	});
});

describe('choosePeTablaPattern', () => {
	it('picks monocolor for a complete one-colour run', () => {
		const rack: Piece[] = [];
		for (let value = 1; value <= 13; value++) rack.push(n('red', value, `mc-${value}-0`));
		rack.push(n('red', 1, 'mc-1-1'));
		expect(choosePeTablaPattern(rack)).toBe('monocolor');
	});

	it('picks duble for seven identical pairs', () => {
		const rack: Piece[] = [];
		const specs: [Color, number][] = [
			['red', 5],
			['yellow', 7],
			['blue', 2],
			['black', 9],
			['red', 11],
			['yellow', 3],
			['blue', 12]
		];
		for (const [color, value] of specs) {
			rack.push(n(color, value), n(color, value));
		}
		expect(choosePeTablaPattern(rack)).toBe('duble');
	});

	it('returns null when nothing looks promising', () => {
		const rack: Piece[] = [
			n('red', 2, 'u-1'),
			n('yellow', 2, 'u-2'),
			n('blue', 3, 'u-3'),
			n('black', 3, 'u-4'),
			n('red', 4, 'u-5'),
			n('yellow', 4, 'u-6'),
			n('blue', 5, 'u-7'),
			n('black', 5, 'u-8'),
			n('red', 6, 'u-9'),
			n('yellow', 6, 'u-10'),
			n('blue', 7, 'u-11'),
			n('black', 7, 'u-12'),
			n('red', 8, 'u-13'),
			n('yellow', 8, 'u-14')
		];
		expect(choosePeTablaPattern(rack)).toBe(null);
	});
});
