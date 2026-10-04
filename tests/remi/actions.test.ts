import { describe, expect, it } from 'vitest';
import {
	announceAtu,
	breakSir,
	canStricaJocul,
	close,
	createGame,
	declarePeTabla,
	discard,
	drawStock,
	endByStockOut,
	lipi,
	meld,
	nextTurn,
	offerDuble,
	openingDiscard,
	peTablaClose,
	REASON,
	resolveDubleExchange,
	startPlaying,
	stricaJocul,
	swapJoker,
	takeAtu,
	takeLastFromSir,
	withdrawDuble
} from '$lib/engine/remi/actions';
import { createFormation } from '$lib/engine/remi/table';
import type {
	Color,
	FormationType,
	GameState,
	PatternType,
	Piece,
	PlayerState
} from '$lib/engine/remi/types';

let seq = 0;

function n(color: Color, value: number, id?: string): Piece {
	return { id: id ?? `${color}-${value}-${seq++}`, isJoker: false, value, color };
}

function joker(id?: string): Piece {
	return { id: id ?? `joker-${seq++}`, isJoker: true, value: 0, color: 'black' };
}

/** Ids without a sequence suffix, so a run of pieces stays easy to assert on. */
function suiteOf(color: Color, from: number, to: number): Piece[] {
	return Array.from({ length: to - from + 1 }, (_, i) =>
		n(color, from + i, `${color}-${from + i}`)
	);
}

function deckOf(
	racks: Piece[][],
	stock: Piece[] = [],
	atu: Piece = n('black', 13, 'atu')
): Piece[] {
	return [...racks.flat(), ...stock, atu];
}

/**
 * `deal` hands out fixed sizes (15 then 14), so short racks are padded with
 * jokers: they are inert for duble counting and cannot complete a formation, so
 * they never change what a test is asserting.
 */
function padRacks(racks: Piece[][]): Piece[][] {
	return racks.map((rack, index) => {
		const size = index === 0 ? 15 : 14;
		const padding = Array.from({ length: Math.max(0, size - rack.length) }, () => joker());
		return [...rack, ...padding];
	});
}

/** A game already in the `playing` phase, with hand-picked racks and stock. */
function playing(
	racks: Piece[][],
	stock: Piece[] = [],
	extras: Partial<GameState> = {}
): GameState {
	const created = createGame({
		playerCount: racks.length as 2 | 3 | 4,
		deck: deckOf(padRacks(racks), stock)
	});
	return { ...startPlaying(resolveDubleExchange(created)), ...extras };
}

/** Already etalat, with the turn their first meld happened on. */
function meldedAt(turn: number): Partial<PlayerState> {
	return { melded: true, meldedTurn: turn, turnsTaken: turn - 1 };
}

function withRack(state: GameState, rack: Piece[], index = 0): GameState {
	const players = [...state.players];
	players[index] = { ...(players[index] as PlayerState), rack };
	return { ...state, players };
}

function withMelds(state: GameState, melds: GameState['table']['melds']): GameState {
	return { ...state, table: { ...state.table, melds } };
}

function withSir(state: GameState, sir: Piece[]): GameState {
	return { ...state, table: { ...state.table, sir } };
}

function labels(pieces: Piece[]): string[] {
	return pieces.map((piece) => piece.id);
}

/* ------------------------------------------------------------------ *
 * createGame
 * ------------------------------------------------------------------ */

describe('createGame', () => {
	const rack0 = [
		n('red', 3),
		n('red', 4),
		n('red', 5),
		n('red', 6),
		n('red', 7),
		n('red', 8),
		n('red', 9),
		n('red', 10),
		n('red', 11),
		n('red', 12),
		n('red', 13),
		n('yellow', 3),
		n('yellow', 4),
		n('yellow', 5),
		n('yellow', 6)
	];
	const rack1 = [
		n('blue', 3),
		n('blue', 4),
		n('blue', 5),
		n('blue', 6),
		n('blue', 7),
		n('blue', 8),
		n('blue', 9),
		n('blue', 10),
		n('blue', 11),
		n('blue', 12),
		n('blue', 13),
		n('black', 3),
		n('black', 4),
		n('black', 5)
	];
	const stock = [n('black', 7), n('black', 8), n('black', 9)];

	it('deals 15 to the opener, 14 to everyone else', () => {
		const state = createGame({
			playerCount: 2,
			deck: [...rack0, ...rack1, ...stock, n('black', 13)]
		});

		expect(state.players[0]?.rack).toHaveLength(15);
		expect(state.players[1]?.rack).toHaveLength(14);
		expect(state.players[0]?.rack).toEqual(rack0);
	});

	it('deals four players', () => {
		const third = suiteOf('yellow', 7, 13);
		const fourth = [n('black', 1), n('black', 2), n('black', 6), n('black', 10)];
		const state = createGame({
			playerCount: 4,
			deck: deckOf(padRacks([rack0, rack1, third, fourth]), [], n('black', 12))
		});

		expect(state.players.map((player) => player.rack.length)).toEqual([15, 14, 14, 14]);
	});

	it('starts in the duble phase with everything zeroed', () => {
		const state = createGame({
			playerCount: 2,
			deck: [...rack0, ...rack1, ...stock, n('black', 13)]
		});

		expect(state.phase).toBe('duble');
		expect(state.turnNumber).toBe(0);
		expect(state.currentPlayerIndex).toBe(0);
		expect(state.firstPlayerIndex).toBe(0);
		expect(state.revision).toBe(1);
		expect(state.scores).toEqual([]);
		expect(state.sessionTotals).toEqual([0, 0]);
		expect(state.gameWinner).toBeNull();
		expect(state.dubleOffers).toEqual([null, null]);
		expect(state.swappedJokerIds).toEqual([]);
		expect(state.turnState).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
		expect(state.players.map((player) => player.turnsTaken)).toEqual([0, 0]);
		expect(state.players.map((player) => player.melded)).toEqual([false, false]);
		expect(state.players.map((player) => player.peTabla)).toEqual([null, null]);
	});

	it('takes the atu from the leftover pile and leaves the rest as stock', () => {
		const atu = n('black', 13, 'the-atu');
		const state = createGame({ playerCount: 2, deck: [...rack0, ...rack1, ...stock, atu] });

		expect(state.table.atu).toEqual(atu);
		expect(state.table.stock).toEqual(stock);
		expect(state.table.sir).toEqual([]);
		expect(state.table.melds).toEqual([]);
	});

	it('is a joc dublu when the atu is a 1', () => {
		const state = createGame({
			playerCount: 2,
			deck: [...rack0, ...rack1, ...stock, n('red', 1, 'one')]
		});
		expect(state.doubleGame).toBe(true);
	});

	it('is a joc dublu when the atu is a joker', () => {
		const state = createGame({
			playerCount: 2,
			deck: [...rack0, ...rack1, ...stock, joker('joly')]
		});
		expect(state.doubleGame).toBe(true);
	});

	it('is not a joc dublu otherwise', () => {
		const state = createGame({
			playerCount: 2,
			deck: [...rack0, ...rack1, ...stock, n('red', 12, 'twelve')]
		});
		expect(state.doubleGame).toBe(false);
	});

	it('rejects an impossible player count', () => {
		expect(() => createGame({ playerCount: 5 as 4 })).toThrow();
	});
});

/* ------------------------------------------------------------------ *
 * Duble
 * ------------------------------------------------------------------ */

describe('duble exchange', () => {
	const duble = (color: Color, value: number, tag: string): Piece[] => [
		n(color, value, `${tag}a`),
		n(color, value, `${tag}b`)
	];

	function dubleGame(rack0: Piece[], rack1: Piece[]) {
		return createGame({ playerCount: 2, deck: deckOf(padRacks([rack0, rack1])) });
	}

	it('offers a pair the player really holds, leaving it in the rack', () => {
		const pair = duble('red', 5, 'r5');
		const state = offerDuble(
			dubleGame([...pair, n('blue', 3, 'keep')], [n('yellow', 4)]),
			0,
			'r5a'
		);

		expect(state.dubleOffers[0]).toEqual(pair[0]);
		// The pair is only *offered*: both copies stay on the rack until resolved.
		expect(labels(state.players[0]?.rack ?? [])).toEqual(
			expect.arrayContaining(['r5a', 'r5b', 'keep'])
		);
		expect(state.revision).toBe(2);
	});

	it('rejects a piece held only once', () => {
		const state = dubleGame([n('red', 5, 'lonely'), n('blue', 3)], [n('yellow', 4)]);
		expect(() => offerDuble(state, 0, 'lonely')).toThrow(REASON.noDuble);
	});

	it('rejects offering a joker', () => {
		const j = joker('the-joker');
		const state = dubleGame([j, n('blue', 3)], [n('yellow', 4)]);
		expect(() => offerDuble(state, 0, 'the-joker')).toThrow(REASON.jokerCannotBeOffered);
	});

	it('rejects a piece that is not on the rack', () => {
		const state = dubleGame([n('red', 5), n('blue', 3)], [n('yellow', 4)]);
		expect(() => offerDuble(state, 0, 'nope')).toThrow(REASON.pieceNotInRack);
	});

	it('replaces a standing offer', () => {
		const first = duble('red', 5, 'r5');
		const second = duble('blue', 6, 'b6');
		const state = dubleGame([...first, ...second], [n('yellow', 4)]);

		const offered = offerDuble(state, 0, (first[0] as Piece).id);
		const swapped = offerDuble(offered, 0, (second[0] as Piece).id);

		expect(swapped.dubleOffers[0]).toEqual(second[0]);
	});

	it('withdraws an offer', () => {
		const pair = duble('red', 5, 'r5');
		const state = dubleGame([...pair], [n('yellow', 4)]);
		const offered = offerDuble(state, 0, (pair[0] as Piece).id);

		expect(withdrawDuble(offered, 0).dubleOffers[0]).toBeNull();
		expect(() => withdrawDuble(state, 0)).toThrow(REASON.noOffer);
	});

	it('refuses duble actions outside the duble phase', () => {
		const pair = duble('red', 5, 'r5');
		const resolved = resolveDubleExchange(dubleGame([...pair], [n('yellow', 4)]));
		expect(() => offerDuble(resolved, 0, (pair[0] as Piece).id)).toThrow(REASON.notDublePhase);
	});

	it('swaps matched duble between two players, category mica', () => {
		const pairA = duble('red', 5, 'r5');
		const pairB = duble('blue', 6, 'b6');
		const base = dubleGame([...pairA, n('red', 3, 'keep')], [n('yellow', 4, 'keep'), ...pairB]);

		const resolved = resolveDubleExchange(
			offerDuble(offerDuble(base, 0, (pairA[0] as Piece).id), 1, (pairB[0] as Piece).id)
		);

		const rack0 = resolved.players[0]?.rack.map((piece) => piece.id) ?? [];
		expect(rack0).toContain('b6a');
		expect(rack0).toContain('b6b');
		expect(rack0).not.toContain('r5a');
		expect(rack0).toContain('keep');
		expect(resolved.players[1]?.rack.map((piece) => piece.id)).toEqual(
			expect.arrayContaining(['r5a', 'r5b', 'keep'])
		);
		expect(resolved.dubleOffers).toEqual([null, null]);
		expect(resolved.phase).toBe('atu');
	});

	it('swaps key duble (cheie) with each other', () => {
		const pairA = duble('red', 1, 'r1');
		const pairB = duble('black', 1, 'b1');
		const base = dubleGame([...pairA], [...pairB]);

		const resolved = resolveDubleExchange(
			offerDuble(offerDuble(base, 0, (pairA[0] as Piece).id), 1, (pairB[0] as Piece).id)
		);

		expect(labels(resolved.players[0]?.rack ?? [])).toEqual(expect.arrayContaining(['b1a', 'b1b']));
		expect(labels(resolved.players[0]?.rack ?? [])).not.toContain('r1a');
		expect(labels(resolved.players[1]?.rack ?? [])).toEqual(expect.arrayContaining(['r1a', 'r1b']));
		expect(labels(resolved.players[1]?.rack ?? [])).not.toContain('b1a');
	});

	it('never swaps across categories', () => {
		const small = duble('red', 5, 'r5');
		const big = duble('red', 12, 'r12');
		const base = dubleGame([...small], [...big]);

		const resolved = resolveDubleExchange(
			offerDuble(offerDuble(base, 0, (small[0] as Piece).id), 1, (big[0] as Piece).id)
		);

		expect(labels(resolved.players[0]?.rack ?? [])).toEqual(expect.arrayContaining(['r5a', 'r5b']));
		expect(labels(resolved.players[0]?.rack ?? [])).not.toContain('r12a');
		expect(labels(resolved.players[1]?.rack ?? [])).toEqual(
			expect.arrayContaining(['r12a', 'r12b'])
		);
		expect(labels(resolved.players[1]?.rack ?? [])).not.toContain('r5a');
	});

	it('leaves an unpaired offer untouched and clears the slots', () => {
		const p0 = duble('red', 5, 'p0');
		const p1 = duble('blue', 6, 'p1');
		const p2 = duble('red', 7, 'p2');
		const base = createGame({
			playerCount: 3,
			deck: deckOf(padRacks([[...p0], [...p1], [...p2]]))
		});

		const resolved = resolveDubleExchange(
			offerDuble(
				offerDuble(offerDuble(base, 0, (p0[0] as Piece).id), 1, (p1[0] as Piece).id),
				2,
				(p2[0] as Piece).id
			)
		);

		// 0 <-> 1 (both mica), player 2 alone in the queue keeps its own pair.
		expect(labels(resolved.players[0]?.rack ?? [])).toEqual(expect.arrayContaining(['p1a', 'p1b']));
		expect(labels(resolved.players[1]?.rack ?? [])).toEqual(expect.arrayContaining(['p0a', 'p0b']));
		expect(labels(resolved.players[2]?.rack ?? [])).toEqual(expect.arrayContaining(['p2a', 'p2b']));
		expect(labels(resolved.players[2]?.rack ?? [])).not.toContain('p0a');
		expect(resolved.dubleOffers).toEqual([null, null, null]);
	});

	it('pairs offers by ascending index inside each category', () => {
		const micaA = duble('red', 5, 'm0');
		const micaB = duble('blue', 5, 'm1');
		const micaC = duble('yellow', 5, 'm2');
		const micaD = duble('black', 5, 'm3');
		const base = createGame({
			playerCount: 4,
			deck: deckOf(padRacks([[...micaA], [...micaB], [...micaC], [...micaD]]))
		});

		const resolved = resolveDubleExchange(
			offerDuble(offerDuble(offerDuble(offerDuble(base, 0, 'm0a'), 1, 'm1a'), 2, 'm2a'), 3, 'm3a')
		);

		expect(labels(resolved.players[0]?.rack ?? [])).toEqual(expect.arrayContaining(['m1a', 'm1b']));
		expect(labels(resolved.players[1]?.rack ?? [])).toEqual(expect.arrayContaining(['m0a', 'm0b']));
		expect(labels(resolved.players[2]?.rack ?? [])).toEqual(expect.arrayContaining(['m3a', 'm3b']));
		expect(labels(resolved.players[3]?.rack ?? [])).toEqual(expect.arrayContaining(['m2a', 'm2b']));
	});
});

describe('canStricaJocul / stricaJocul', () => {
	const duble = (color: Color, value: number, tag: string): Piece[] => [
		n(color, value, `${tag}a`),
		n(color, value, `${tag}b`)
	];

	it('is offered at three duble', () => {
		const rack = [...duble('red', 5, 'a'), ...duble('blue', 6, 'b'), ...duble('black', 7, 'c')];
		const state = createGame({
			playerCount: 2,
			deck: deckOf(padRacks([rack, [n('yellow', 1, 'x')]]))
		});
		expect(canStricaJocul(state, 0)).toBe(true);
		expect(canStricaJocul(state, 1)).toBe(false);
	});

	it('is not offered at two duble plus junk', () => {
		const rack = [...duble('red', 5, 'a'), ...duble('blue', 6, 'b'), n('black', 7, 'c')];
		const state = createGame({
			playerCount: 2,
			deck: deckOf(padRacks([rack, [n('yellow', 1, 'x')]]))
		});
		expect(canStricaJocul(state, 0)).toBe(false);
	});

	it('redeal resets everything', () => {
		const deck = deckOf(
			padRacks([[n('red', 5)], [n('blue', 6)]]),
			[n('black', 9)],
			n('red', 1, 'atu1')
		);
		const before = createGame({ playerCount: 2, deck });
		const after = stricaJocul({ playerCount: 2, deck });

		expect(after.revision).toBe(1);
		expect(after.phase).toBe('duble');
		expect(after.turnNumber).toBe(0);
		expect(after.scores).toEqual([]);
		expect(after.players.map((player) => player.rack.length)).toEqual([15, 14]);
		expect(after.players.every((player) => !player.melded)).toBe(true);
		expect(after).not.toBe(before);
	});

	it('rejects an unknown player', () => {
		const state = createGame({
			playerCount: 2,
			deck: deckOf(padRacks([[n('red', 5)], [n('blue', 6)]]))
		});
		expect(() => canStricaJocul(state, 7)).toThrow(REASON.unknownPlayer);
	});
});

/* ------------------------------------------------------------------ *
 * Atu / phases
 * ------------------------------------------------------------------ */

describe('announceAtu', () => {
	const atu = n('black', 9, 'atu9');
	const twin = n('black', 9, 'twin9');

	function atuGame(rack1: Piece[]) {
		return resolveDubleExchange(
			createGame({ playerCount: 2, deck: deckOf(padRacks([[n('red', 5, 'a')], rack1]), [], atu) })
		);
	}

	it('is accepted for the player holding the identical piece', () => {
		const state = announceAtu(atuGame([twin, n('blue', 3, 'x')]), 1);

		expect(state.players[1]?.announcedAtu).toBe(true);
		expect(state.players[0]?.announcedAtu).toBe(false);
		expect(state.revision).toBe(3);
	});

	it('is rejected for anyone else', () => {
		expect(() => announceAtu(atuGame([n('blue', 3, 'x')]), 1)).toThrow(REASON.noAtuPiece);
	});

	it('is rejected before the duble exchange is resolved', () => {
		const created = createGame({
			playerCount: 2,
			deck: deckOf(padRacks([[n('red', 5)], [twin]]), [], atu)
		});
		expect(() => announceAtu(created, 1)).toThrow(REASON.notAtuPhase);
	});

	it('is rejected twice by the same player', () => {
		expect(() => announceAtu(announceAtu(atuGame([twin]), 1), 1)).toThrow(REASON.alreadyAnnounced);
	});

	it('is rejected for a joker atu', () => {
		const state = resolveDubleExchange(
			createGame({
				playerCount: 2,
				deck: deckOf(padRacks([[n('red', 5)], [joker('held')]]), [], joker('atuJoker'))
			})
		);
		expect(() => announceAtu(state, 1)).toThrow(REASON.noAtuPiece);
	});

	it('is rejected once the atu is off the table', () => {
		const state = { ...atuGame([twin]), table: { ...atuGame([twin]).table, atu: null } };
		expect(() => announceAtu(state, 1)).toThrow(REASON.noAtuPiece);
	});
});

describe('startPlaying', () => {
	const deck = deckOf(padRacks([[n('red', 5)], [n('blue', 6)]]));

	it('opens turn 1 to the first player', () => {
		const started = startPlaying(resolveDubleExchange(createGame({ playerCount: 2, deck })));

		expect(started.phase).toBe('playing');
		expect(started.turnNumber).toBe(1);
		expect(started.currentPlayerIndex).toBe(0);
		expect(started.turnState).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
		expect(started.revision).toBe(3);
	});

	it('can skip the exchange round entirely', () => {
		expect(startPlaying(createGame({ playerCount: 2, deck })).phase).toBe('playing');
	});

	it('cannot restart a running game', () => {
		const running = startPlaying(resolveDubleExchange(createGame({ playerCount: 2, deck })));
		expect(() => startPlaying(running)).toThrow(REASON.notDublePhase);
	});

	it('cannot restart a finished game', () => {
		const finished = {
			...resolveDubleExchange(createGame({ playerCount: 2, deck })),
			phase: 'finished' as const
		};
		expect(() => startPlaying(finished)).toThrow(REASON.alreadyOver);
	});
});

/* ------------------------------------------------------------------ *
 * Opening discard
 * ------------------------------------------------------------------ */

describe('openingDiscard', () => {
	function openGame() {
		const rack0 = suiteOf('red', 3, 13);
		rack0.push(n('yellow', 1), n('yellow', 2), n('yellow', 3), n('yellow', 4));
		return playing([[...rack0], suiteOf('blue', 3, 13), [n('blue', 1, 'b1')]], []);
	}

	it('lays the first piece sideways as the dead piece and hands the turn over', () => {
		const state = openGame();
		const piece = state.players[0]?.rack[0] as Piece;
		const after = openingDiscard(state, piece.id);

		expect(after.table.sir).toEqual([piece]);
		expect(after.players[0]?.rack).toHaveLength(14);
		expect(after.currentPlayerIndex).toBe(1);
		expect(after.turnNumber).toBe(2);
		expect(after.players[0]?.turnsTaken).toBe(1);
		expect(after.players[1]?.turnsTaken).toBe(0);
		expect(after.turnState).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
		expect(after.revision).toBe(state.revision + 1);
	});

	it('protects the dead piece forever', () => {
		const opened = openingDiscard(openGame(), (openGame().players[0]?.rack[0] as Piece).id);
		expect(() => takeLastFromSir(opened)).toThrow(REASON.sir.sirDeadFirst);
	});

	it('is refused outside turn 1', () => {
		const opened = openingDiscard(openGame(), (openGame().players[0]?.rack[0] as Piece).id);
		const piece = opened.players[1]?.rack[0] as Piece;
		expect(() => openingDiscard(opened, piece.id)).toThrow(REASON.notTheOpening);
	});

	it('is refused for a piece that is not on the rack', () => {
		expect(() => openingDiscard(openGame(), 'nope')).toThrow(REASON.pieceNotInRack);
	});
});

/* ------------------------------------------------------------------ *
 * Draws
 * ------------------------------------------------------------------ */

describe('drawStock', () => {
	it('takes the top of the grămadă', () => {
		const rack0 = [n('red', 3), n('red', 4)];
		const top = n('blue', 11, 'top');
		const state = playing([[...rack0], [n('black', 9, 'x')]], [n('blue', 2, 'bottom'), top]);

		const after = drawStock(state);
		expect(after.players[0]?.rack.at(-1)).toEqual(top);
		expect(after.table.stock.map((piece) => piece.id)).toEqual(['bottom']);
		expect(after.turnState).toEqual({
			hasDrawn: true,
			drawnFrom: 'stock',
			mustUsePieceIds: [],
			pending: []
		});
	});

	it('throws when the grămadă is empty so the caller can end by stock-out', () => {
		const state = playing([[n('red', 3)], [n('black', 9, 'x')]], []);
		expect(() => drawStock(state)).toThrow(REASON.stockIsEmpty);
	});
});

describe('takeLastFromSir', () => {
	function sirGame(sir: Piece[]) {
		const state = playing([[n('red', 3), n('red', 4)], [n('black', 9, 'x')]], []);
		return { ...state, table: { ...state.table, sir } };
	}

	it('takes the last piece and marks it must-be-used', () => {
		const dead = n('blue', 1, 'dead');
		const last = n('yellow', 9, 'last');
		const after = takeLastFromSir(sirGame([dead, last]));

		expect(after.table.sir).toEqual([dead]);
		expect(after.players[0]?.rack).toContainEqual(last);
		expect(after.turnState).toEqual({
			hasDrawn: true,
			drawnFrom: 'sir',
			mustUsePieceIds: ['last'],
			pending: [{ pieceId: 'last', source: 'sir', restoreToSir: ['last'] }]
		});
	});

	it('refuses the dead piece', () => {
		const dead = n('blue', 1, 'dead');
		expect(() => takeLastFromSir(sirGame([dead]))).toThrow(REASON.sir.sirDeadFirst);
	});

	it('refuses an empty șir', () => {
		expect(() => takeLastFromSir(sirGame([]))).toThrow(REASON.sir.sirEmpty);
	});
});

describe('takeAtu', () => {
	it('takes the atu off the table and marks it must-be-used', () => {
		const atu = n('black', 9, 'atu9');
		const state = playing([[n('red', 3)], [n('black', 1, 'x')]], [], {
			table: {
				melds: [],
				sir: [],
				stock: [],
				atu
			}
		});

		const after = takeAtu(state);
		expect(after.table.atu).toBeNull();
		expect(after.players[0]?.rack).toContainEqual(atu);
		expect(after.turnState).toEqual({
			hasDrawn: true,
			drawnFrom: 'atu',
			mustUsePieceIds: ['atu9'],
			pending: [{ pieceId: 'atu9', source: 'atu', restoreToSir: [] }]
		});
	});

	it('refuses when there is no atu left', () => {
		const state = playing([[n('red', 3)], [n('black', 1, 'x')]], [], {
			table: { melds: [], sir: [], stock: [], atu: null }
		});
		expect(() => takeAtu(state)).toThrow(REASON.noAtu);
	});
});

/* ------------------------------------------------------------------ *
 * Breaking the șir
 * ------------------------------------------------------------------ */

describe('breakSir', () => {
	const dead = n('blue', 1, 'dead');

	/** Already etalat, on turn 5, holding a run that can absorb the broken piece. */
	function meldedState(sir: Piece[], rack: Piece[] = meldedRack) {
		const state = playing([[n('red', 3)], [n('black', 9, 'x')]], [], { turnNumber: 5 });
		return withRack(withSir(state, sir), rack);
	}

	const meldedRack = [...suiteOf('red', 9, 13), n('red', 4, 'r4'), n('red', 6, 'r6')];

	function etalat(turn = 5): GameState {
		const state = meldedState([]);
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(turn) };
		return { ...state, players };
	}

	it('picks up the broken piece and everything laid after it', () => {
		const state = { ...etalat(), table: { ...etalat().table, sir: [dead] } };
		const broken = n('red', 5, 'broken5');
		const after = n('red', 7, 'after7');
		const withSirState = withSir(state, [dead, broken, after]);

		const result = breakSir(withSirState, 'broken5');

		expect(result.table.sir).toEqual([dead]);
		expect(labels(result.players[0]?.rack ?? [])).toEqual([
			...labels(meldedRack),
			'broken5',
			'after7'
		]);
		expect(result.turnState).toEqual({
			hasDrawn: true,
			drawnFrom: 'sir',
			mustUsePieceIds: ['broken5'],
			pending: [{ pieceId: 'broken5', source: 'sir', restoreToSir: ['broken5', 'after7'] }]
		});
		expect(result.revision).toBe(withSirState.revision + 1);
	});

	it('requires an existing etalare', () => {
		const state = withSir(meldedState([]), [dead, n('red', 5, 'broken5')]);
		expect(() => breakSir(state, 'broken5')).toThrow(REASON.notMeldedYet);
	});

	it('requires at least three pieces on the rack before breaking', () => {
		const state = withRack(withSir(etalat(), [dead, n('red', 5, 'broken5')]), [
			n('red', 4, 'r4'),
			n('red', 6, 'r6')
		]);
		expect(() => breakSir(state, 'broken5')).toThrow(REASON.rackTooSmallToBreak);
	});

	it('never breaks the dead piece', () => {
		const state = withSir(etalat(), [dead, n('red', 5, 'broken5')]);
		expect(() => breakSir(state, 'dead')).toThrow(REASON.sir.sirDeadFirst);
	});

	it('refuses a piece that is not in the șir', () => {
		const state = withSir(etalat(), [dead, n('red', 5, 'broken5')]);
		expect(() => breakSir(state, 'nope')).toThrow(REASON.sir.pieceNotInSir);
	});

	it('refuses when the rack cannot compose a formation with it', () => {
		const junk = [n('red', 5, 'j1'), n('black', 7, 'j2'), n('blue', 9, 'j3')];
		const state = withSir(etalat(), [dead, n('red', 3, 'lonely3')]);
		const withJunk = withRack(state, junk);

		expect(() => breakSir(withJunk, 'lonely3')).toThrow(REASON.noComposersBreak);
	});

	it('is never allowed for a pe-table player', () => {
		const state = withSir(etalat(), [dead, n('red', 5, 'broken5')]);
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => breakSir({ ...state, players }, 'broken5')).toThrow(REASON.peTablaCannotBreak);
	});

	it('frees the must-use flag once the broken piece is melded', () => {
		const state = withSir(etalat(), [dead, n('red', 5, 'broken5')]);
		const broken = breakSir(state, 'broken5');

		const melded = meld(broken, 0, [
			{ type: 'suite', pieces: [n('red', 4, 'r4'), n('red', 5, 'broken5'), n('red', 6, 'r6')] }
		]);
		expect(melded.turnState.mustUsePieceIds).toEqual([]);
		expect(melded.turnState.pending).toEqual([]);

		// Nothing to send back: the suffix stays on the rack where it was melded.
		const after = discard(melded, 'red-9');
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead', 'red-9']);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('broken5');
	});
});

/* ------------------------------------------------------------------ *
 * Melding
 * ------------------------------------------------------------------ */

describe('meld', () => {
	const opening = () => suiteOf('red', 9, 13);

	function meldGame(rack0: Piece[], extras: Partial<GameState> = {}) {
		return playing([[...rack0], [n('black', 9, 'x')]], [], { turnNumber: 3, ...extras });
	}

	it('is refused during round 1', () => {
		const state = meldGame(opening(), { turnNumber: 2 });
		expect(() => meld(state, 0, [{ type: 'suite', pieces: opening() }])).toThrow(
			REASON.noMeldsFirstRound
		);
	});

	it('is allowed once the round has completed', () => {
		const state = meldGame(opening(), { turnNumber: 3 });
		expect(meld(state, 0, [{ type: 'suite', pieces: opening() }]).table.melds).toHaveLength(1);
	});

	it('is refused for anyone but the player on turn', () => {
		const state = meldGame(opening());
		expect(() => meld(state, 1, [{ type: 'suite', pieces: opening() }])).toThrow(
			REASON.notYourTurn
		);
	});

	it('lays the formation down and records ownership', () => {
		const pieces = opening();
		const state = meldGame(pieces);
		const after = meld(state, 0, [{ type: 'suite', pieces }]);

		expect(after.table.melds).toEqual([
			{
				id: 'm0',
				type: 'suite',
				pieces,
				owner: 0,
				lipitBy: [null, null, null, null, null]
			}
		]);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('red-9');
		expect(after.players[0]?.melded).toBe(true);
		expect(after.players[0]?.meldedTurn).toBe(3);
		expect(after.revision).toBe(state.revision + 1);
	});

	it('mints a fresh id per formation', () => {
		const first = opening();
		const second = suiteOf('blue', 3, 5);
		const state = meldGame([...first, ...second]);
		const after = meld(state, 0, [
			{ type: 'suite', pieces: first },
			{ type: 'suite', pieces: second }
		]);

		expect(after.table.melds.map((entry) => entry.id)).toEqual(['m0', 'm1']);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('blue-3');
	});

	it('enforces the 45 points requirement on the first meld', () => {
		const small = suiteOf('red', 3, 5);
		expect(() => meld(meldGame(small), 0, [{ type: 'suite', pieces: small }])).toThrow(
			'first meld needs at least 45 points'
		);
	});

	it('enforces the suită requirement on the first meld', () => {
		const first = [n('red', 13, 'r13'), n('blue', 13, 'b13'), n('yellow', 13, 'y13')];
		const second = [n('red', 12, 'r12'), n('blue', 12, 'b12'), n('yellow', 12, 'y12')];
		const state = meldGame([...first, ...second]);
		expect(() =>
			meld(state, 0, [
				{ type: 'terta', pieces: first },
				{ type: 'terta', pieces: second }
			])
		).toThrow('first meld needs at least one suite');
	});

	it('lets a terță of 1s open without a suită', () => {
		const terta = [n('red', 1, 'r1'), n('blue', 1, 'b1'), n('yellow', 1, 'y1')];
		const after = meld(meldGame(terta), 0, [{ type: 'terta', pieces: terta }]);

		expect(after.players[0]?.melded).toBe(true);
		expect(after.table.melds).toHaveLength(1);
	});

	it('drops the opening rule once the player is etalat', () => {
		const small = suiteOf('red', 3, 5);
		const state = meldGame(small, { turnNumber: 4 });
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(2) };

		const after = meld({ ...state, players }, 0, [{ type: 'suite', pieces: small }]);
		expect(after.table.melds).toHaveLength(1);
		expect(after.players[0]?.meldedTurn).toBe(2);
	});

	it('rejects an invalid formation', () => {
		const mixed = [n('red', 3, 'a'), n('black', 4, 'b'), n('blue', 5, 'c')];
		expect(() => meld(meldGame(mixed), 0, [{ type: 'suite', pieces: mixed }])).toThrow(
			'all pieces must share one colour'
		);
	});

	it('rejects pieces that are not on the rack', () => {
		const pieces = opening();
		expect(() => meld(meldGame([n('red', 1, 'only')]), 0, [{ type: 'suite', pieces }])).toThrow(
			REASON.pieceNotInRack
		);
	});

	it('rejects the same piece used twice', () => {
		const first = opening();
		const reused = first[first.length - 1] as Piece;
		const other = [n('blue', 13, 'b13'), n('yellow', 13, 'y13')];
		const state = meldGame([...first, ...other]);

		expect(() =>
			meld(state, 0, [
				{ type: 'suite', pieces: first },
				{ type: 'terta', pieces: [reused, ...other] }
			])
		).toThrow(REASON.pieceUsedTwice);
	});

	it('refuses an empty declaration', () => {
		expect(() => meld(meldGame(opening()), 0, [])).toThrow(REASON.noMeldsToDeclare);
	});

	it('is never allowed for a pe-table player', () => {
		const pieces = opening();
		const state = meldGame([...pieces, n('yellow', 1, 'p')]);
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => meld({ ...state, players }, 0, [{ type: 'suite', pieces }])).toThrow(
			REASON.peTablaCannotMeld
		);
	});

	it('frees the must-use pieces it consumed', () => {
		const dead = n('blue', 1, 'dead');
		const taken = n('red', 3, 'r3');
		const run = [n('red', 4, 'r4'), n('red', 5, 'r5')];
		const state = withSir(
			playing([[...opening(), ...run], [n('black', 9, 'x')]], [], { turnNumber: 3 }),
			[dead, taken]
		);

		const drawn = takeLastFromSir(state);
		expect(drawn.turnState.mustUsePieceIds).toEqual(['r3']);

		const after = meld(drawn, 0, [
			{ type: 'suite', pieces: opening() },
			{ type: 'suite', pieces: [taken, ...run] }
		]);

		expect(after.turnState.mustUsePieceIds).toEqual([]);
		expect(after.players[0]?.melded).toBe(true);
	});
});

/* ------------------------------------------------------------------ *
 * Lipire
 * ------------------------------------------------------------------ */

describe('lipi', () => {
	const ownerMeld = () => createFormation('m0', 'suite', suiteOf('red', 5, 7), 0);

	/** Player 0 laid their meld on turn 3, player 1 on turn 4. */
	function lipiGame(turnNumber: number, currentPlayerIndex = 1) {
		const state = playing([[n('red', 8, 'r8')], [n('red', 8, 'b8')]], [], {
			turnNumber,
			currentPlayerIndex
		});
		const players = state.players.map((player, index) => ({
			...player,
			...meldedAt(index === 0 ? 3 : 4)
		}));
		return withMelds({ ...state, players }, [ownerMeld()]);
	}

	it('extends an own meld and tags the piece as lipit', () => {
		const state = lipiGame(4, 0);
		const after = lipi(state, 0, 'm0', 'r8');

		expect(after.table.melds[0]?.pieces.map((piece) => piece.value)).toEqual([5, 6, 7, 8]);
		expect(after.table.melds[0]?.lipitBy).toEqual([null, null, null, 0]);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('r8');
	});

	it('refuses an extension that breaks the formation', () => {
		const state = lipiGame(4, 0);
		expect(() => lipi(withRack(state, [n('blue', 9, 'b9')], 0), 0, 'm0', 'b9')).toThrow();
	});

	it('refuses to lipire before your own etalare', () => {
		const state = lipiGame(4, 0);
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), melded: false, meldedTurn: null };

		expect(() => lipi({ ...state, players }, 0, 'm0', 'r8')).toThrow(REASON.notMeldedToLipi);
	});

	it('refuses an unknown meld', () => {
		expect(() => lipi(lipiGame(4, 0), 0, 'mX', 'r8')).toThrow(REASON.meldNotFound);
	});

	it('refuses a piece that is not on the rack', () => {
		expect(() => lipi(lipiGame(4, 0), 0, 'm0', 'nope')).toThrow(REASON.pieceNotInRack);
	});

	it('refuses anyone but the player on turn', () => {
		expect(() => lipi(lipiGame(6, 0), 1, 'm0', 'b8')).toThrow(REASON.notYourTurn);
	});

	it('refuses an opponent meld in the round it was laid', () => {
		expect(() => lipi(lipiGame(5), 1, 'm0', 'b8')).toThrow(REASON.lipiTooEarly);
	});

	it('allows an opponent meld a full round later', () => {
		const after = lipi(lipiGame(6), 1, 'm0', 'b8');
		expect(after.table.melds[0]?.lipitBy).toEqual([null, null, null, 1]);
	});

	it('never lets a joker go onto an opponent meld', () => {
		const state = lipiGame(6);
		expect(() => lipi(withRack(state, [joker('the-joker')], 1), 1, 'm0', 'the-joker')).toThrow(
			REASON.jokerCannotLipit
		);
	});

	it('allows a joker onto your own meld', () => {
		const state = lipiGame(4, 0);
		const after = lipi(withRack(state, [joker('the-joker')], 0), 0, 'm0', 'the-joker');

		expect(after.table.melds[0]?.lipitBy.at(-1)).toBe(0);
		expect(after.table.melds[0]?.pieces.at(-1)?.id).toBe('the-joker');
	});

	it('never lets a pe-table player lipire onto an opponent', () => {
		const state = lipiGame(6);
		const players = [...state.players];
		players[1] = {
			...(players[1] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => lipi({ ...state, players }, 1, 'm0', 'b8')).toThrow(REASON.peTablaCannotLipit);
	});
});

/* ------------------------------------------------------------------ *
 * Joker swap
 * ------------------------------------------------------------------ */

describe('swapJoker', () => {
	const theJoker = () => joker('the-joker');

	function swapState(
		rack0: Piece[],
		meldPieces: Piece[],
		type: FormationType,
		stock: Piece[] = []
	) {
		const state = playing([[...rack0], [n('black', 9, 'x')]], stock, { turnNumber: 4 });
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(3) };
		return withMelds({ ...state, players }, [createFormation('m0', type, meldPieces, 0)]);
	}

	const jokerSuite = () => [n('red', 4, 'r4'), n('red', 5, 'r5'), theJoker()];

	it('swaps the exact natural into the joker slot and hands the joker over', () => {
		const state = swapState([n('red', 6, 'r6')], jokerSuite(), 'suite');
		const after = swapJoker(state, 0, 'm0', 'the-joker', 'r6');

		expect(after.table.melds[0]?.pieces.map((piece) => piece.id)).toEqual(['r4', 'r5', 'r6']);
		// The replacement is the swapper's piece, so it scores for the swapper.
		expect(after.table.melds[0]?.lipitBy).toEqual([null, null, 0]);
		expect(labels(after.players[0]?.rack ?? [])).toContain('the-joker');
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('r6');
		expect(after.swappedJokerIds).toEqual(['the-joker']);
		expect(after.turnState.mustUsePieceIds).toEqual(['the-joker']);
		expect(after.revision).toBe(state.revision + 1);
	});

	it('leaves an unswappable joker on the rack when the turn ends unused', () => {
		const state = swapState([n('red', 6, 'r6'), n('blue', 3, 'b3')], jokerSuite(), 'suite', [
			n('black', 5, 'stock5')
		]);
		const swapped = swapJoker(drawStock(state), 0, 'm0', 'the-joker', 'r6');

		// The joker has no source to go back to, so it simply stays on the rack.
		const after = discard(swapped, 'b3');
		expect(labels(after.players[0]?.rack ?? [])).toContain('the-joker');
		expect(after.currentPlayerIndex).toBe(1);
	});

	it('rejects a replacement of the wrong value', () => {
		const state = swapState([n('red', 7, 'r7')], jokerSuite(), 'suite');
		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'r7')).toThrow(REASON.wrongReplacement);
	});

	it('rejects a replacement of the wrong colour', () => {
		const state = swapState([n('yellow', 6, 'y6')], jokerSuite(), 'suite');
		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'y6')).toThrow(REASON.wrongReplacement);
	});

	it('rejects a replacement that is not on the rack', () => {
		const state = swapState([], jokerSuite(), 'suite');
		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'r6')).toThrow(REASON.pieceNotInRack);
	});

	it('rejects a joker that is not in the meld', () => {
		const state = swapState(
			[n('red', 7, 'r7')],
			[n('red', 4, 'r4'), n('red', 5, 'r5'), n('red', 6, 'r6')],
			'suite'
		);
		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'r7')).toThrow(REASON.jokerNotInMeld);
	});

	it('swaps a terță joker with any colour the meld is missing', () => {
		// Complete terță: the only legal replacement is the one colour still free.
		const terta = [n('red', 5, 'r5'), n('blue', 5, 'b5'), n('yellow', 5, 'y5'), theJoker()];
		const state = swapState([n('black', 5, 'k5')], terta, 'terta');

		expect(
			swapJoker(state, 0, 'm0', 'the-joker', 'k5').table.melds[0]?.pieces.map((p) => p.id)
		).toEqual(['r5', 'b5', 'y5', 'k5']);
	});

	it('refuses a terță replacement of a colour already in the meld', () => {
		const terta = [n('red', 5, 'r5'), n('blue', 5, 'b5'), n('yellow', 5, 'y5'), theJoker()];
		const state = swapState([n('red', 5, 'r5twin')], terta, 'terta');

		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'r5twin')).toThrow(REASON.wrongReplacement);
	});

	it('locks a joker inside an unfinished terță', () => {
		const terta = [n('red', 5, 'r5'), n('blue', 5, 'b5'), theJoker()];
		const state = swapState([n('black', 5, 'k5')], terta, 'terta');

		expect(() => swapJoker(state, 0, 'm0', 'the-joker', 'k5')).toThrow(
			REASON.jokerInIncompleteTerta
		);
	});

	it('unlocks that joker once the fourth colour completes the terță', () => {
		const terta = [n('red', 5, 'r5'), n('blue', 5, 'b5'), theJoker()];
		const state = swapState([n('yellow', 5, 'y5'), n('black', 5, 'k5')], terta, 'terta');

		const completed = lipi(state, 0, 'm0', 'y5');
		expect(completed.table.melds[0]?.pieces).toHaveLength(4);

		const after = swapJoker(completed, 0, 'm0', 'the-joker', 'k5');
		expect(after.table.melds[0]?.pieces.map((piece) => piece.id)).toEqual(['r5', 'b5', 'k5', 'y5']);
		expect(labels(after.players[0]?.rack ?? [])).toContain('the-joker');
		expect(after.swappedJokerIds).toEqual(['the-joker']);
	});

	it('swaps each joker at most once', () => {
		const state = swapState([n('red', 6, 'r6')], jokerSuite(), 'suite');
		const swapped = swapJoker(state, 0, 'm0', 'the-joker', 'r6');

		expect(() => swapJoker(swapped, 0, 'm0', 'the-joker', 'r6')).toThrow(
			REASON.jokerAlreadySwapped
		);
	});

	it('is never allowed for a pe-table player', () => {
		const state = swapState([n('red', 6, 'r6')], jokerSuite(), 'suite');
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => swapJoker({ ...state, players }, 0, 'm0', 'the-joker', 'r6')).toThrow(
			REASON.peTablaCannotSwapJoker
		);
	});
});

/* ------------------------------------------------------------------ *
 * Discard and turn rotation
 * ------------------------------------------------------------------ */

describe('discard', () => {
	it('is refused before drawing', () => {
		const state = playing(
			[[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 9, 'x')]],
			[n('blue', 2, 'top')]
		);
		expect(() => discard(state, 'r3')).toThrow(REASON.drawFirst);
	});

	it('lays the piece on the șir and hands the turn over', () => {
		const top = n('blue', 2, 'top');
		const state = playing([[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 9, 'x')]], [top]);

		const after = discard(drawStock(state), 'r3');
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['r3']);
		expect(labels(after.players[0]?.rack ?? [])).toContain('r4');
		expect(after.players[0]?.rack.at(-1)).toEqual(top);
		expect(after.currentPlayerIndex).toBe(1);
		expect(after.turnNumber).toBe(2);
		expect(after.players[0]?.turnsTaken).toBe(1);
		expect(after.turnState).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
		expect(after.revision).toBe(state.revision + 2);
	});

	it('is refused for a piece that is not on the rack', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [n('blue', 2, 'top')]);
		expect(() => discard(drawStock(state), 'nope')).toThrow(REASON.pieceNotInRack);
	});

	it('is never allowed for a pe-table player', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [n('blue', 2, 'top')]);
		const drawn = drawStock(state);
		const players = [...drawn.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => discard({ ...drawn, players }, 'r3')).toThrow(REASON.peTablaNoDiscard);
	});

	it('puts an unused atu back on the table when the turn ends', () => {
		const atu = n('black', 9, 'atu9');
		const state = playing([[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 1, 'x')]], [], {
			turnNumber: 3,
			table: { melds: [], sir: [], stock: [], atu }
		});

		const drawn = takeAtu(state);
		expect(drawn.table.atu).toBeNull();

		const after = discard(drawn, 'r3');
		expect(after.table.atu).toEqual(atu);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('atu9');
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['r3']);
		expect(after.currentPlayerIndex).toBe(1);
	});

	it('restores the whole suffix lifted by breaking the șir, in order', () => {
		const dead = n('blue', 1, 'dead');
		const broken = n('red', 5, 'broken5');
		const after7 = n('red', 7, 'after7');
		const after8 = n('black', 8, 'after8');
		const state = withSir(
			withRack(playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [], { turnNumber: 5 }), [
				n('red', 4, 'r4'),
				n('red', 6, 'r6'),
				n('black', 9, 'spare')
			]),
			[dead, n('black', 4, 'before4'), broken, after7, after8]
		);
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(3) };
		const melded = { ...state, players };

		const lifted = breakSir(melded, 'broken5');
		expect(lifted.table.sir.map((piece) => piece.id)).toEqual(['dead', 'before4']);

		const after = discard(lifted, 'r4');
		// The suffix comes back in its original order, below the discarded piece.
		expect(after.table.sir.map((piece) => piece.id)).toEqual([
			'dead',
			'before4',
			'broken5',
			'after7',
			'after8',
			'r4'
		]);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('after8');
	});

	it('leaves the table alone on a plain discard', () => {
		const top = n('blue', 2, 'top');
		const state = playing([[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 9, 'x')]], [top]);

		const after = discard(drawStock(state), 'r3');
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['r3']);
		expect(after.table.atu).toBe(state.table.atu);
		expect(after.players[0]?.rack.at(-1)).toEqual(top);
	});

	it('lets a taken piece that can never be melded be discarded', () => {
		const dead = n('blue', 1, 'dead');
		const taken = n('yellow', 9, 'taken');
		const state = withSir(
			playing([[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 9, 'x')]], [], {
				turnNumber: 3
			}),
			[dead, taken]
		);

		// Round-1 style deadlock: the piece is pending but nothing can be melded.
		const drawn = takeLastFromSir(state);
		expect(drawn.turnState.mustUsePieceIds).toEqual(['taken']);

		const after = discard(drawn, 'r3');
		expect(after.currentPlayerIndex).toBe(1);
		expect(after.turnState.mustUsePieceIds).toEqual([]);
		// The taken piece went back to the șir, below the discarded one.
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead', 'taken', 'r3']);
		expect(labels(after.players[0]?.rack ?? [])).not.toContain('taken');
	});

	it('still clears the pending set when the taken piece is melded', () => {
		const dead = n('blue', 1, 'dead');
		const taken = n('yellow', 9, 'taken');
		const state = withRack(
			withSir(
				playing([[n('red', 3, 'r3'), n('red', 4, 'r4')], [n('black', 9, 'x')]], [], {
					turnNumber: 3
				}),
				[dead, taken]
			),
			[
				n('red', 3, 'r3'),
				n('red', 4, 'r4'),
				n('red', 9, 'r9'),
				n('blue', 9, 'b9'),
				...suiteOf('red', 9, 13)
			]
		);

		const etalat = meld(takeLastFromSir(state), 0, [
			{ type: 'suite', pieces: suiteOf('red', 9, 13) },
			{ type: 'terta', pieces: [n('red', 9, 'r9'), n('blue', 9, 'b9'), taken] }
		]);
		expect(etalat.players[0]?.melded).toBe(true);
		expect(etalat.turnState.mustUsePieceIds).toEqual([]);
		expect(etalat.turnState.pending).toEqual([]);

		const after = discard(etalat, 'r3');
		expect(after.currentPlayerIndex).toBe(1);
		// Melded, so nothing goes back on the șir.
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead', 'r3']);
	});
});

describe('one draw per turn', () => {
	function drawGame() {
		return withSir(
			playing(
				[[n('red', 3, 'r3')], [n('black', 9, 'x')]],
				[n('blue', 3, 'deeper'), n('blue', 2, 'top')],
				{
					table: {
						melds: [],
						sir: [n('blue', 1, 'dead'), n('red', 9, 'lastDiscarded')],
						stock: [n('blue', 3, 'deeper'), n('blue', 2, 'top')],
						atu: n('black', 9, 'the-atu')
					}
				}
			),
			[n('blue', 1, 'dead'), n('red', 9, 'lastDiscarded')]
		);
	}

	it('refuses a second draw from the grămadă', () => {
		expect(() => drawStock(drawStock(drawGame()))).toThrow(REASON.alreadyDrew);
	});

	it('refuses taking the last șir piece after drawing', () => {
		expect(() => takeLastFromSir(drawStock(drawGame()))).toThrow(REASON.alreadyDrew);
	});

	it('refuses taking the atu after drawing', () => {
		expect(() => takeAtu(drawStock(drawGame()))).toThrow(REASON.alreadyDrew);
	});

	it('allows exactly one draw, then the turn ends', () => {
		const drawn = drawStock(drawGame());
		expect(drawn.turnState).toEqual({
			hasDrawn: true,
			drawnFrom: 'stock',
			mustUsePieceIds: [],
			pending: []
		});

		const next = nextTurn(drawn);
		expect(() => drawStock(next)).not.toThrow();
	});
});

describe('nextTurn', () => {
	it('cycles the seat, counts the turn and resets the turn state', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [n('blue', 2, 'top')], {
			turnNumber: 2,
			currentPlayerIndex: 1
		});
		const drawn = drawStock(state);
		const after = nextTurn(drawn);

		expect(after.currentPlayerIndex).toBe(0);
		expect(after.turnNumber).toBe(3);
		expect(after.players[1]?.turnsTaken).toBe(1);
		expect(after.players[0]?.turnsTaken).toBe(0);
		expect(after.turnState).toEqual({ hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] });
		expect(after.revision).toBe(drawn.revision + 1);
	});

	it('wraps around the table', () => {
		const state = playing([[n('red', 3, 'r3')], [n('blue', 4, 'b4')], [n('black', 5, 'k5')]], [], {
			currentPlayerIndex: 2
		});
		expect(nextTurn(state).currentPlayerIndex).toBe(0);
	});
});

/* ------------------------------------------------------------------ *
 * Pe tablă
 * ------------------------------------------------------------------ */

describe('declarePeTabla', () => {
	it('is accepted during the first three turns', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [n('blue', 2, 'top')]);
		const after = declarePeTabla(state, 0, 'bete');

		expect(after.players[0]?.peTabla).toEqual({ pattern: 'bete', declaredTurn: 1 });
	});

	it('is accepted on the third turn boundary (turnsTaken === 2)', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [], { turnNumber: 6 });
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), turnsTaken: 2 };

		expect(declarePeTabla({ ...state, players }, 0, 'simplu').players[0]?.peTabla).not.toBeNull();
	});

	it('closes after the third turn', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [], { turnNumber: 7 });
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), turnsTaken: 3 };

		expect(() => declarePeTabla({ ...state, players }, 0, 'simplu')).toThrow(
			REASON.peTablaWindowClosed
		);
	});

	it('is refused once the player is etalat', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [], { turnNumber: 4 });
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(3) };

		expect(() => declarePeTabla({ ...state, players }, 0, 'simplu')).toThrow(
			REASON.peTablaAfterMeld
		);
	});

	it('is refused twice', () => {
		const state = playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], []);
		const declared = declarePeTabla(state, 0, 'simplu');
		expect(() => declarePeTabla(declared, 0, 'bete')).toThrow(REASON.peTablaAlreadyDeclared);
	});

	it('is refused outside play', () => {
		const created = createGame({
			playerCount: 2,
			deck: deckOf(padRacks([[n('red', 3)], [n('blue', 4)]]))
		});
		expect(() => declarePeTabla(created, 0, 'simplu')).toThrow(REASON.notPlaying);
	});
});

describe('peTablaClose', () => {
	/** The board is the whole rack, so it is built at the real dealing size. */
	function boardGame(pattern: PatternType, board: Piece[]) {
		const state = playing([board, [n('black', 9, 'x')]], [], { turnNumber: 2 });
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern, declaredTurn: 1 }
		};
		return { ...state, players };
	}

	const threeSuites = () => [
		...suiteOf('red', 3, 7),
		...suiteOf('blue', 3, 7),
		...suiteOf('yellow', 3, 7)
	];

	it('closes straight away when the pattern covers the whole rack', () => {
		const board = threeSuites();
		const after = peTablaClose(boardGame('simplu', board), 0, 'unused');

		expect(after.phase).toBe('finished');
		expect(after.players[0]?.peTablaComplete).toBe(true);
		expect(after.players[0]?.rack).toHaveLength(15);
		expect(after.table.sir).toEqual([]);
		expect(after.scores).toEqual([500, -100]);
		expect(after.gameWinner).toBe(0);
		expect(after.sessionTotals).toEqual([500, -100]);
	});

	it('discards the single piece outside the pattern as the closing piece', () => {
		const junk = n('black', 12, 'junk');
		const board = [
			...suiteOf('red', 3, 7),
			...suiteOf('blue', 3, 7),
			...suiteOf('yellow', 3, 6),
			junk
		];
		const after = peTablaClose(boardGame('simplu', board), 0, 'junk');

		expect(after.table.sir.map((piece) => piece.id)).toEqual(['junk']);
		expect(after.players[0]?.rack).toHaveLength(14);
		expect(after.phase).toBe('finished');
		expect(after.players[0]?.peTablaComplete).toBe(true);
	});

	it('refuses when more than one piece sits outside the pattern', () => {
		const board = [
			...suiteOf('red', 3, 7),
			...suiteOf('blue', 3, 6),
			...suiteOf('yellow', 3, 6),
			n('black', 12, 'j1'),
			n('blue', 13, 'j2')
		];
		expect(() => peTablaClose(boardGame('simplu', board), 0, 'j1')).toThrow(
			REASON.peTablaBoardIncomplete
		);
	});

	it('refuses a discard that is not on the board', () => {
		const board = [
			...suiteOf('red', 3, 7),
			...suiteOf('blue', 3, 7),
			...suiteOf('yellow', 3, 6),
			n('black', 12, 'junk')
		];
		expect(() => peTablaClose(boardGame('simplu', board), 0, 'nope')).toThrow(
			REASON.pieceNotInRack
		);
	});

	it('refuses a player who never declared', () => {
		const state = playing(
			[[...suiteOf('red', 3, 7), n('black', 3, 'junk')], [n('black', 9, 'x')]],
			[],
			{ turnNumber: 2 }
		);
		expect(() => peTablaClose(state, 0, 'junk')).toThrow(REASON.peTablaNotDeclared);
	});

	/**
	 * A pe-tablă board one taken piece short of complete: the rack holds `board`
	 * exactly, then the player takes `taken` from the șir (15 pieces total).
	 */
	function boardWithTake(taken: Piece, board: Piece[]) {
		const dead = n('blue', 1, 'dead');
		const state = withSir(
			withRack(playing([[], [n('black', 9, 'x')]], [], { turnNumber: 2 }), board),
			[dead, taken]
		);
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		return takeLastFromSir({ ...state, players });
	}

	/** 14 pieces that already partition into valid formations. */
	const boardOfFourteen = () => [
		...suiteOf('red', 3, 7),
		...suiteOf('blue', 3, 7),
		...suiteOf('yellow', 3, 6)
	];

	it('closes with the taken piece when the taken piece completes the pattern', () => {
		const taken = n('yellow', 7, 'taken7');
		const state = boardWithTake(taken, boardOfFourteen());
		expect(state.turnState.mustUsePieceIds).toEqual(['taken7']);

		const after = peTablaClose(state, 0, 'anything');

		expect(after.phase).toBe('finished');
		expect(after.players[0]?.peTablaComplete).toBe(true);
		expect(after.players[0]?.rack).toHaveLength(15);
		// Nothing was discarded: the șir still only holds the dead opening piece.
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead']);
		expect(after.scores).toEqual([500, -100]);
	});

	it('refuses to close by discarding the taken piece unused', () => {
		// black-12 cannot be arranged with anything on the board, so the only way
		// to close would be to discard the piece just taken from the șir.
		const taken = n('black', 12, 'loot');
		const state = boardWithTake(taken, boardOfFourteen());

		expect(() => peTablaClose(state, 0, 'loot')).toThrow(REASON.mustUseTakenPiece);
	});

	it('closes by discarding an unused piece while the taken piece is on the board', () => {
		const junk = n('black', 12, 'junk');
		const board = [...boardOfFourteen(), junk];
		const state = boardGame('simplu', board);
		// red-3 is on the board and inside a valid formation, so it counts as used.
		const takenState = {
			...state,
			turnState: { hasDrawn: true, drawnFrom: 'sir' as const, mustUsePieceIds: ['red-3'] }
		};

		const after = peTablaClose(takenState, 0, 'junk');

		expect(after.table.sir.map((piece) => piece.id)).toEqual(['junk']);
		expect(after.players[0]?.rack).toHaveLength(14);
		expect(after.phase).toBe('finished');
		expect(after.players[0]?.peTablaComplete).toBe(true);
	});
});

/* ------------------------------------------------------------------ *
 * Closing / end of game
 * ------------------------------------------------------------------ */

describe('close', () => {
	function closingGame(rack: Piece[]) {
		const state = playing([[n('red', 3)], [n('black', 9, 'x')]], [], { turnNumber: 5 });
		const players = state.players.map((player, index) => ({
			...player,
			...(index === 0 ? { ...meldedAt(3), rack } : {})
		}));
		return withMelds({ ...state, players }, [
			createFormation('m0', 'suite', suiteOf('red', 5, 7), 0)
		]);
	}

	it('scores the game with the closing bonus', () => {
		const last = n('black', 9, 'last');
		const state = closingGame([last]);
		const after = close(state, 'last');

		expect(after.phase).toBe('finished');
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['last']);
		expect(after.players[0]?.rack).toHaveLength(0);
		// melded 15 + closing 50 (the rack is empty once the last piece is laid)
		expect(after.scores).toEqual([65, -100]);
		expect(after.gameWinner).toBe(0);
		expect(after.sessionTotals).toEqual([65, -100]);
		expect(after.revision).toBe(state.revision + 2);
	});

	it('refuses while the player still holds pieces', () => {
		const state = closingGame([n('black', 9, 'a'), n('black', 8, 'b')]);
		expect(() => close(state, 'a')).toThrow(REASON.mustDiscardLast);
	});

	it('refuses a discard that is not the last piece', () => {
		const state = closingGame([n('black', 9, 'a'), n('black', 8, 'b')]);
		expect(() => close(state, 'b')).toThrow(REASON.mustDiscardLast);
	});

	/** The taken piece is the only one on the rack — the last stranded edge (#14). */
	function strandedState() {
		const dead = n('blue', 1, 'dead');
		const taken = n('red', 7, 'taken7');
		const base = withSir(
			withRack(playing([[n('red', 3, 'r3')], [n('black', 9, 'x')]], [], { turnNumber: 5 }), []),
			[dead, taken]
		);
		const takenState = takeLastFromSir(base);
		expect(labels(takenState.players[0]?.rack ?? [])).toEqual(['taken7']);
		return takenState;
	}

	it('undoes the take when the taken piece is the only one on the rack', () => {
		const state = strandedState();
		const after = discard(state, 'taken7');

		expect(after.turnNumber).toBe(state.turnNumber + 1);
		expect(after.currentPlayerIndex).toBe(1);
		// Exactly the pre-take table: nothing new landed on the șir.
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead', 'taken7']);
		expect(after.table.atu).toBe(state.table.atu);
		expect(after.players[0]?.rack).toEqual([]);
		expect(after.turnState.mustUsePieceIds).toEqual([]);
	});

	it('undoes an unused atu take when it is the only piece on the rack', () => {
		const atu = n('black', 9, 'atu9');
		const base = withRack(
			playing([[n('red', 3, 'r3')], [n('black', 1, 'x')]], [], {
				turnNumber: 5,
				table: { melds: [], sir: [], stock: [], atu }
			}),
			[]
		);
		const takenState = takeAtu(base);
		expect(labels(takenState.players[0]?.rack ?? [])).toEqual(['atu9']);

		const after = discard(takenState, 'atu9');
		expect(after.table.atu).toEqual(atu);
		expect(after.table.sir).toEqual([]);
		expect(after.players[0]?.rack).toEqual([]);
		expect(after.currentPlayerIndex).toBe(1);
	});

	it('refuses to close while a taken piece is still unused, then lets the turn end', () => {
		const state = strandedState();

		// Not a deadlock: the pending piece goes back, leaving nothing to close with.
		expect(() => close(state, 'taken7')).toThrow(REASON.mustDiscardLast);

		const after = discard(state, 'taken7');
		expect(after.turnNumber).toBe(state.turnNumber + 1);
		expect(after.currentPlayerIndex).toBe(1);
	});

	it('closes with the normal piece once the pending one has been returned', () => {
		const dead = n('blue', 1, 'dead');
		const taken = n('red', 5, 'taken5');
		const spare = n('black', 9, 'spare');
		const terta = [n('red', 9, 'r9'), n('blue', 9, 'b9'), n('yellow', 9, 'y9')];
		const state = withSir(
			withRack(playing([[n('red', 3, 'r3')], [n('black', 1, 'x')]], [], { turnNumber: 4 }), [
				spare,
				...terta
			]),
			[dead, taken]
		);
		const players = [...state.players];
		players[0] = { ...(players[0] as PlayerState), ...meldedAt(3) };

		const etalat = meld(takeLastFromSir({ ...state, players }), 0, [
			{ type: 'terta', pieces: terta }
		]);
		expect(etalat.players[0]?.rack.map((piece) => piece.id)).toEqual(['spare', 'taken5']);
		expect(etalat.turnState.mustUsePieceIds).toEqual(['taken5']);

		const after = close(etalat, 'spare');
		expect(after.phase).toBe('finished');
		expect(after.players[0]?.rack).toEqual([]);
		expect(after.table.sir.map((piece) => piece.id)).toEqual(['dead', 'taken5', 'spare']);
		expect(after.closerIndex).toBe(0);
		// melded terță 15 + closing 50
		expect(after.scores).toEqual([65, -100]);
	});

	it('is never allowed for a pe-table player', () => {
		const state = closingGame([n('black', 9, 'a')]);
		const players = [...state.players];
		players[0] = {
			...(players[0] as PlayerState),
			peTabla: { pattern: 'simplu', declaredTurn: 1 }
		};

		expect(() => close({ ...state, players }, 'a')).toThrow(REASON.peTablaNoDiscard);
	});

	it('refuses to close a finished game twice', () => {
		const state = closingGame([n('black', 9, 'last')]);
		const finished = close(state, 'last');
		expect(() => close(finished, 'last')).toThrow(REASON.alreadyOver);
	});
});

describe('endByStockOut', () => {
	function stockOutState(sessionTotals: [number, number] = [0, 0]) {
		const state = playing([[n('red', 3)], [n('black', 1, 'other')]], [], {
			turnNumber: 5,
			sessionTotals
		});
		const players = state.players.map((player, index) => ({
			...player,
			...(index === 0
				? { ...meldedAt(3), rack: [n('black', 9, 'loot')] }
				: { rack: [n('black', 2, 'junk')] })
		}));
		return withSir(
			withMelds({ ...state, players }, [createFormation('m0', 'suite', suiteOf('red', 5, 7), 0)]),
			[n('blue', 4, 'lastDiscarded')]
		);
	}

	it('scores without any closing bonus', () => {
		const after = endByStockOut(stockOutState());

		expect(after.phase).toBe('finished');
		expect(after.scores).toEqual([10, -100]);
		expect(after.gameWinner).toBe(0);
		expect(after.sessionTotals).toEqual([10, -100]);
	});

	it('adds to an existing session total', () => {
		const after = endByStockOut(stockOutState([120, -60]));
		expect(after.sessionTotals).toEqual([130, -160]);
	});
});

/* ------------------------------------------------------------------ *
 * Purity
 * ------------------------------------------------------------------ */

describe('purity', () => {
	it('never mutates the state it is given', () => {
		const state = playing(
			[[...suiteOf('red', 9, 13), n('red', 4, 'r4'), n('red', 5, 'r5')], [n('black', 9, 'x')]],
			[n('blue', 2, 'top')],
			{ turnNumber: 3 }
		);
		const snapshot = JSON.stringify(state);

		drawStock(state);
		discard(drawStock(state), 'r4');
		meld(state, 0, [{ type: 'suite', pieces: suiteOf('red', 9, 13) }]);

		expect(JSON.stringify(state)).toBe(snapshot);
	});
});
