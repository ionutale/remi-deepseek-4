/**
 * Remi Etalat — turn and setup actions (spec §1.2–§1.8, interpretations §2).
 *
 * Every action is pure: it takes a `GameState` and returns a NEW one. Rejected
 * transitions throw and leave the input untouched. Accepted transitions bump
 * `revision`.
 */

import { analyzeFormation, canOpen, findFormationsContaining } from './formations';
import { validatePattern } from './patterns';
import { COLORS, createDeck, deal, dubleCategory, isSamePiece, shuffle } from './pieces';
import { pickWinner, scoreGame } from './scoring';
import {
	appendToSir,
	cloneState,
	countDublePairs,
	createFormation,
	findMeld,
	findPiece,
	freshTurnState,
	hasPiece,
	nextMeldIds,
	pairOf,
	removePieces,
	takeFromSir,
	takeLastFromSir as takeLastPiece,
	TABLE_REASON
} from './table';
import type {
	EndReason,
	Formation,
	FormationType,
	GameState,
	PatternType,
	PendingUse,
	Piece,
	PlayerState,
	TurnState
} from './types';

/** Exact, stable reason strings. The UI maps these to the Romanian copy deck (spec §4). */
export const REASON = {
	// setup / phases
	unknownPlayer: 'unknown player',
	notDublePhase: 'the duble exchange happens before play starts',
	notAtuPhase: 'the atu announcement happens before play starts',
	alreadyOver: 'the game is already over',
	notPlaying: 'the game is not in play',
	noDuble: 'you must hold both copies of that piece to offer it',
	jokerCannotBeOffered: 'a joker cannot be offered as a duble',
	noOffer: 'that player has no duble on offer',
	noAtu: 'there is no atu to take',
	noAtuPiece: 'you do not hold a piece identical to the atu',
	alreadyAnnounced: 'you have already announced the atu',
	// turn structure
	notYourTurn: 'it is not your turn',
	notTheOpening: 'only the opening player can open the game',
	drawFirst: 'draw first',
	alreadyDrew: 'you already drew this turn',
	stockIsEmpty: 'stock is empty',
	pieceNotInRack: 'that piece is not on your rack',
	sir: TABLE_REASON,
	// melding
	noMeldsFirstRound: 'melding starts after the first round',
	noMeldsToDeclare: 'there are no formations to meld',
	invalidFormation: 'invalid formation',
	firstMeldRejected: 'first meld rejected',
	pieceUsedTwice: 'a piece can only be used once',
	notMeldedYet: 'you must meld before breaking the sir',
	rackTooSmallToBreak: 'you need at least 3 pieces on the rack to break the sir',
	noComposersBreak: 'you need pieces on the rack to compose a formation with it',
	// lipire
	notMeldedToLipi: 'you must meld before you can lipi',
	meldNotFound: TABLE_REASON.meldNotFound,
	lipiTooEarly: 'you cannot lipi to an opponent meld yet',
	jokerCannotLipit: 'jokers cannot be lipit to opponents melds',
	// joker swap
	jokerNotInMeld: 'that joker is not in that meld',
	jokerAlreadySwapped: 'that joker was already swapped',
	jokerInIncompleteTerta: 'the joker cannot be used until the terta is completed',
	wrongReplacement: 'the replacement must be the exact piece the joker substitutes',
	// discards / closing
	mustUseTakenPiece: 'you must use the taken piece in a formation this turn',
	peTablaNoDiscard: 'a pe tabla player does not discard',
	mustDiscardLast: 'you can only close by discarding your last piece',
	// pe tabla
	peTablaAlreadyDeclared: 'you have already declared pe tabla',
	peTablaWindowClosed: 'the pe tabla window has closed',
	peTablaAfterMeld: 'you cannot declare pe tabla after melding',
	peTablaNotDeclared: 'you have not declared pe tabla',
	peTablaBoardIncomplete: 'the pattern on your board is not complete yet',
	peTablaCannotMeld: 'a pe tabla player never melds',
	peTablaCannotBreak: 'a pe tabla player never breaks the sir',
	peTablaCannotLipit: 'a pe tabla player cannot lipi to opponents',
	peTablaCannotSwapJoker: 'a pe tabla player cannot use table jokers',
	peTablaAlreadyComplete: 'your pe tabla pattern is already complete'
} as const;

const MIN_RACK_TO_BREAK_SIR = 3;
const MIN_RACK_COMPOSERS = 2;
const PE_TABLA_WINDOW_TURNS = 3;
const STRICA_JOCUL_DUBLES = 3;
/** Ropet §1.5: a terță holds at most 4 pieces. */
const MAX_TERTA_SIZE = 4;

function bump(state: GameState, patch: Partial<GameState> = {}): GameState {
	return { ...state, ...patch, revision: state.revision + 1 };
}

function playerOf(state: GameState, index: number): PlayerState {
	const player = state.players[index];
	if (!player) throw new Error(REASON.unknownPlayer);
	return player;
}

const ids = (pieces: Piece[]): string[] => pieces.map((piece) => piece.id);

/** Turn state after a draw: `pending` and the flat id list are always built together. */
function drawnTurn(from: 'stock' | 'sir' | 'atu', pending: PendingUse[] = []): TurnState {
	return {
		hasDrawn: true,
		drawnFrom: from,
		pending,
		mustUsePieceIds: pending.map((p) => p.pieceId)
	};
}

/** Drops the pending entries for pieces that were used in a formation. */
function withoutPending(state: GameState, pieceIds: Iterable<string>): TurnState {
	const used = new Set(pieceIds);
	const pending = (state.turnState.pending ?? []).filter((entry) => !used.has(entry.pieceId));
	return {
		...state.turnState,
		pending,
		mustUsePieceIds: pending.map((entry) => entry.pieceId)
	};
}

/**
 * Interpretation #14 — the safety valve. Taken pieces that were never used in a
 * formation go back where they came from, so a turn can always end even when no
 * legal meld exists (round 1 blocks melding, the first meld needs 45 points plus
 * a suită, or the piece simply does not fit anything).
 *
 * șir pieces are restored in their original order, so a break-sir suffix goes
 * back exactly as it was lifted; the atu goes back on the table.
 */
function returnPendingPieces(state: GameState): {
	rack: Piece[];
	sir: Piece[];
	atu: Piece | null;
} {
	const index = state.currentPlayerIndex;
	const rack = playerOf(state, index).rack;
	const pending = state.turnState.pending ?? [];
	if (pending.length === 0) {
		return { rack: [...rack], sir: [...state.table.sir], atu: state.table.atu };
	}

	const restored: string[] = [];
	const returned = new Set<string>();
	let atu: Piece | null = state.table.atu;

	for (const entry of pending) {
		if (entry.source === 'sir') {
			restored.push(...entry.restoreToSir);
			for (const id of entry.restoreToSir) returned.add(id);
		} else if (entry.source === 'atu') {
			returned.add(entry.pieceId);
			atu = findPiece(rack, entry.pieceId) ?? state.table.atu;
		}
	}

	const sir = [
		...state.table.sir,
		...restored
			.map((id) => findPiece(rack, id))
			.filter((piece): piece is Piece => piece !== undefined)
	];

	return { rack: removePieces(rack, returned), sir, atu };
}

/* ------------------------------------------------------------------ *
 * Setup / phases
 * ------------------------------------------------------------------ */

/**
 * Deals a fresh game. Pass a pre-shuffled `deck` (see `shuffle`, which takes a
 * seeded rng) for deterministic tests.
 */
export function createGame(config: { playerCount: 2 | 3 | 4; deck?: Piece[] }): GameState {
	const deck = config.deck ?? shuffle(createDeck());
	const { racks, stock, atu } = deal(deck, config.playerCount);

	return {
		schemaVersion: 3,
		phase: 'duble',
		players: racks.map((rack) => ({
			rack,
			melded: false,
			meldedTurn: null,
			turnsTaken: 0,
			announcedAtu: false,
			peTabla: null,
			peTablaComplete: false
		})),
		currentPlayerIndex: 0,
		table: { melds: [], sir: [], stock, atu },
		dubleOffers: racks.map(() => null),
		turnState: freshTurnState(),
		swappedJokerIds: [],
		turnNumber: 0,
		firstPlayerIndex: 0,
		doubleGame: atu.isJoker || atu.value === 1,
		scores: [],
		sessionTotals: racks.map(() => 0),
		gameWinner: null,
		turnStartedAt: 0,
		revision: 1,
		endReason: null,
		closerIndex: null,
		lastBreakdowns: undefined
	};
}

function requireDublePhase(state: GameState): void {
	if (state.phase !== 'duble') throw new Error(REASON.notDublePhase);
}

/** Puts a dublă up for the blind exchange. The pair stays in the rack until resolved. */
export function offerDuble(state: GameState, playerIdx: number, pieceId: string): GameState {
	requireDublePhase(state);
	const player = playerOf(state, playerIdx);
	const piece = findPiece(player.rack, pieceId);
	if (!piece) throw new Error(REASON.pieceNotInRack);
	if (piece.isJoker) throw new Error(REASON.jokerCannotBeOffered);
	if (pairOf(player.rack, piece).length < 2) throw new Error(REASON.noDuble);

	const dubleOffers = [...state.dubleOffers];
	dubleOffers[playerIdx] = piece;
	return bump(state, { dubleOffers });
}

export function withdrawDuble(state: GameState, playerIdx: number): GameState {
	requireDublePhase(state);
	playerOf(state, playerIdx);
	if (!state.dubleOffers[playerIdx]) throw new Error(REASON.noOffer);

	const dubleOffers = [...state.dubleOffers];
	dubleOffers[playerIdx] = null;
	return bump(state, { dubleOffers });
}

/**
 * Blind swap of offered duble, category by category, mica then mare then cheie.
 * Offers are paired in ascending player index; an unpaired offer is left alone
 * (its pair stays in the rack). Values are never inspected here — the UI hides
 * them, the engine only matches categories.
 */
export function resolveDubleExchange(state: GameState): GameState {
	requireDublePhase(state);

	const racks = state.players.map((player) => [...player.rack]);
	const offers = state.players.map((player, index) => {
		const offered = state.dubleOffers[index];
		return offered ? dubleCategory(offered) : null;
	});

	for (const category of ['mica', 'mare', 'cheie'] as const) {
		const holders = offers
			.map((offer, index) => ({ offer, index }))
			.filter((entry) => entry.offer === category)
			.map((entry) => entry.index);

		for (let i = 0; i + 1 < holders.length; i += 2) {
			const a = holders[i] as number;
			const b = holders[i + 1] as number;
			const pairA = pairOf(racks[a] as Piece[], state.dubleOffers[a] as Piece);
			const pairB = pairOf(racks[b] as Piece[], state.dubleOffers[b] as Piece);
			racks[a] = [
				...removePieces(removePieces(racks[a] as Piece[], ids(pairA)), ids(pairB)),
				...pairB
			];
			racks[b] = [
				...removePieces(removePieces(racks[b] as Piece[], ids(pairB)), ids(pairA)),
				...pairA
			];
		}
	}

	return bump(state, {
		players: state.players.map((player, index) => ({ ...player, rack: racks[index] as Piece[] })),
		dubleOffers: state.players.map(() => null),
		phase: 'atu'
	});
}

export function canStricaJocul(state: GameState, playerIdx: number): boolean {
	return countDublePairs(playerOf(state, playerIdx).rack) >= STRICA_JOCUL_DUBLES;
}

/** Cancels the deal and reshuffles: a brand new `createGame` from the same config. */
export function stricaJocul(config: { playerCount: 2 | 3 | 4; deck?: Piece[] }): GameState {
	return createGame(config);
}

export function announceAtu(state: GameState, playerIdx: number): GameState {
	if (state.phase !== 'atu') throw new Error(REASON.notAtuPhase);
	const player = playerOf(state, playerIdx);
	if (player.announcedAtu) throw new Error(REASON.alreadyAnnounced);

	const atu = state.table.atu;
	if (!atu || atu.isJoker) throw new Error(REASON.noAtuPiece);
	if (!player.rack.some((piece) => isSamePiece(piece, atu))) throw new Error(REASON.noAtuPiece);

	const players = [...state.players];
	players[playerIdx] = { ...player, announcedAtu: true };
	return bump(state, { players });
}

export function startPlaying(state: GameState): GameState {
	if (state.phase === 'playing') throw new Error(REASON.notDublePhase);
	if (state.phase === 'finished') throw new Error(REASON.alreadyOver);

	return bump(state, {
		phase: 'playing',
		turnNumber: 1,
		currentPlayerIndex: state.firstPlayerIndex,
		turnState: freshTurnState()
	});
}

/* ------------------------------------------------------------------ *
 * Turn flow
 * ------------------------------------------------------------------ */

function requirePlaying(state: GameState): void {
	if (state.phase === 'finished') throw new Error(REASON.alreadyOver);
	if (state.phase !== 'playing') throw new Error(REASON.notPlaying);
}

/**
 * Spec §1.4: every turn but the opening is "draw one piece, optionally meld,
 * then discard one piece". Stock, last șir piece and atu are alternative draws,
 * never two of them in the same turn.
 */
function claimDraw(state: GameState): void {
	if (state.turnState.hasDrawn) throw new Error(REASON.alreadyDrew);
}

/** The current player's copy of `pieceId`. */
function rackPiece(state: GameState, pieceId: string): Piece {
	const piece = findPiece(playerOf(state, state.currentPlayerIndex).rack, pieceId);
	if (!piece) throw new Error(REASON.pieceNotInRack);
	return piece;
}

/** Turns the seat and resets the turn bookkeeping, without touching `revision`. */
function cycleTurn(state: GameState): GameState {
	const index = state.currentPlayerIndex;
	const player = playerOf(state, index);
	const players = [...state.players];
	players[index] = { ...player, turnsTaken: player.turnsTaken + 1 };

	return {
		...state,
		players,
		currentPlayerIndex: (index + 1) % state.players.length,
		turnNumber: state.turnNumber + 1,
		turnState: freshTurnState(),
		turnStartedAt: Date.now()
	};
}

/** Applies a mid-turn patch and then hands the turn over — a single revision bump. */
function endOfTurn(state: GameState, patch: Partial<GameState>): GameState {
	return cycleTurn(bump(state, patch));
}

/** Advances the turn. Exported so callers can drive turn boundaries explicitly. */
export function nextTurn(state: GameState): GameState {
	return bump(cycleTurn(state));
}

/**
 * Turn 1: the opener discards without drawing. That piece becomes `sir[0]` — the
 * dead piece nobody may ever take.
 */
export function openingDiscard(state: GameState, pieceId: string): GameState {
	requirePlaying(state);
	if (state.turnNumber !== 1 || state.currentPlayerIndex !== state.firstPlayerIndex) {
		throw new Error(REASON.notTheOpening);
	}
	if (state.table.sir.length > 0) throw new Error(REASON.notTheOpening);
	const piece = rackPiece(state, pieceId);

	const index = state.currentPlayerIndex;
	const players = [...state.players];
	players[index] = {
		...playerOf(state, index),
		rack: removePieces(playerOf(state, index).rack, [piece.id])
	};

	return endOfTurn(state, {
		players,
		table: { ...state.table, sir: appendToSir(state.table.sir, piece) }
	});
}

export function drawStock(state: GameState): GameState {
	requirePlaying(state);
	claimDraw(state);
	if (state.table.stock.length === 0) throw new Error(REASON.stockIsEmpty);

	const index = state.currentPlayerIndex;
	const piece = state.table.stock[state.table.stock.length - 1] as Piece;
	const players = [...state.players];
	players[index] = { ...playerOf(state, index), rack: [...playerOf(state, index).rack, piece] };

	return bump(state, {
		players,
		table: { ...state.table, stock: state.table.stock.slice(0, -1) },
		turnState: drawnTurn('stock')
	});
}

/** Takes the last șir piece (never the dead first one). Must be melded this turn. */
export function takeLastFromSir(state: GameState): GameState {
	requirePlaying(state);
	claimDraw(state);
	// `sir[0]` is dead for the whole game, so it is never "the last piece".
	if (state.table.sir.length === 0) throw new Error(REASON.sir.sirEmpty);
	if (state.table.sir.length === 1) throw new Error(REASON.sir.sirDeadFirst);
	const { sir, piece } = takeLastPiece(state.table.sir);

	const index = state.currentPlayerIndex;
	const players = [...state.players];
	players[index] = { ...playerOf(state, index), rack: [...playerOf(state, index).rack, piece] };

	return bump(state, {
		players,
		table: { ...state.table, sir },
		turnState: drawnTurn('sir', [
			...(state.turnState.pending ?? []),
			{ pieceId: piece.id, source: 'sir', restoreToSir: [piece.id] }
		])
	});
}

export function takeAtu(state: GameState): GameState {
	requirePlaying(state);
	claimDraw(state);
	const atu = state.table.atu;
	if (!atu) throw new Error(REASON.noAtu);

	const index = state.currentPlayerIndex;
	const players = [...state.players];
	players[index] = { ...playerOf(state, index), rack: [...playerOf(state, index).rack, atu] };

	return bump(state, {
		players,
		table: { ...state.table, atu: null },
		turnState: drawnTurn('atu', [
			...(state.turnState.pending ?? []),
			{ pieceId: atu.id, source: 'atu', restoreToSir: [] }
		])
	});
}

/**
 * "A rupe șirul" (spec §1.4 + interpretation #4): already melded, ≥3 pieces on the
 * rack before breaking, ≥2 rack pieces to compose a formation with the broken
 * piece. The broken piece and everything after it come to the rack; the broken
 * piece must be melded this turn.
 */
export function breakSir(state: GameState, pieceId: string): GameState {
	requirePlaying(state);
	claimDraw(state);
	const index = state.currentPlayerIndex;
	const player = playerOf(state, index);

	if (player.peTabla) throw new Error(REASON.peTablaCannotBreak);
	if (!player.melded) throw new Error(REASON.notMeldedYet);
	if (player.rack.length < MIN_RACK_TO_BREAK_SIR) throw new Error(REASON.rackTooSmallToBreak);

	const { sir, piece, taken } = takeFromSir(state.table.sir, pieceId);
	// Ropet states the "at least 2 pieces to compose the formation" clause
	// separately from the 3-piece rack minimum; both are checked.
	if (player.rack.length < MIN_RACK_COMPOSERS) throw new Error(REASON.noComposersBreak);

	// ...and the broken piece must actually be meldable with what is already held.
	const composable = findFormationsContaining([...player.rack, piece], piece);
	if (composable.length === 0) throw new Error(REASON.noComposersBreak);

	const players = [...state.players];
	players[index] = { ...player, rack: [...player.rack, ...taken] };

	return bump(state, {
		players,
		table: { ...state.table, sir },
		turnState: drawnTurn('sir', [
			...(state.turnState.pending ?? []),
			{ pieceId: piece.id, source: 'sir', restoreToSir: ids(taken) }
		])
	});
}

/* ------------------------------------------------------------------ *
 * Melding, lipire, joker swap
 * ------------------------------------------------------------------ */

function requireCurrentPlayer(state: GameState, playerIdx: number): PlayerState {
	if (playerIdx !== state.currentPlayerIndex) throw new Error(REASON.notYourTurn);
	return playerOf(state, playerIdx);
}

function consumeRack(player: PlayerState, pieceIds: string[]): Piece[] {
	return removePieces(player.rack, pieceIds);
}

/**
 * Melds one or more formations. Melding is off during round 1 (interpretation #8)
 * and the player's first meld must pass `canOpen` (spec §1.6).
 */
export function meld(
	state: GameState,
	playerIdx: number,
	formations: { type: FormationType; pieces: Piece[] }[]
): GameState {
	requirePlaying(state);
	const player = requireCurrentPlayer(state, playerIdx);
	if (player.peTabla) throw new Error(REASON.peTablaCannotMeld);
	if (state.turnNumber <= state.players.length) throw new Error(REASON.noMeldsFirstRound);
	if (formations.length === 0) throw new Error(REASON.noMeldsToDeclare);

	const used = new Set<string>();
	for (const formation of formations) {
		const analysis = analyzeFormation(formation.type, formation.pieces);
		if (!analysis.valid) throw new Error(analysis.reason ?? REASON.invalidFormation);
		for (const piece of formation.pieces) {
			if (!hasPiece(player.rack, piece.id)) throw new Error(REASON.pieceNotInRack);
			if (used.has(piece.id)) throw new Error(REASON.pieceUsedTwice);
			used.add(piece.id);
		}
	}

	if (!player.melded) {
		const opening = canOpen(formations);
		if (!opening.ok) throw new Error(opening.reason ?? REASON.firstMeldRejected);
	}

	const ids = nextMeldIds(state.table.melds, formations.length);
	const melds = [
		...state.table.melds,
		...formations.map((formation, i) =>
			createFormation(ids[i] as string, formation.type, formation.pieces, playerIdx)
		)
	];

	const players = [...state.players];
	players[playerIdx] = {
		...player,
		rack: consumeRack(player, [...used]),
		melded: true,
		meldedTurn: player.meldedTurn ?? state.turnNumber
	};

	return bump(state, {
		players,
		table: { ...state.table, melds },
		turnState: withoutPending(state, used)
	});
}

/** Whether `playerIdx` may lipi onto the meld owned by `owner`. */
function canLipire(state: GameState, playerIdx: number, owner: number): boolean {
	if (playerIdx === owner) return true;
	const ownerState = state.players[owner];
	if (!ownerState || ownerState.meldedTurn === null) return false;
	return state.turnNumber > ownerState.meldedTurn + state.players.length;
}

export function lipi(
	state: GameState,
	playerIdx: number,
	meldId: string,
	pieceId: string
): GameState {
	requirePlaying(state);
	const player = requireCurrentPlayer(state, playerIdx);
	if (!player.melded) throw new Error(REASON.notMeldedToLipi);

	const meld = findMeld(state.table.melds, meldId);
	const piece = findPiece(player.rack, pieceId);
	if (!piece) throw new Error(REASON.pieceNotInRack);

	if (meld.owner !== playerIdx) {
		if (player.peTabla) throw new Error(REASON.peTablaCannotLipit);
		if (!canLipire(state, playerIdx, meld.owner)) throw new Error(REASON.lipiTooEarly);
		if (piece.isJoker) throw new Error(REASON.jokerCannotLipit);
	}

	const extended = [...meld.pieces, piece];
	const analysis = analyzeFormation(meld.type, extended);
	if (!analysis.valid) throw new Error(analysis.reason ?? REASON.invalidFormation);

	const melds = state.table.melds.map((candidate) =>
		candidate.id === meldId
			? { ...candidate, pieces: extended, lipitBy: [...candidate.lipitBy, playerIdx] }
			: candidate
	);

	const players = [...state.players];
	players[playerIdx] = { ...player, rack: removePieces(player.rack, [piece.id]) };

	return bump(state, {
		players,
		table: { ...state.table, melds },
		turnState: withoutPending(state, [piece.id])
	});
}

/**
 * The naturals a joker could legally be substituted by, resolved from the engine
 * rather than the caller: a suită takes the meld's colour, a terță takes any
 * colour no natural in the meld already holds.
 */
function substitutedPieces(meld: Formation, jokerId: string): Piece[] {
	const analysis = analyzeFormation(meld.type, meld.pieces);
	const value = analysis.jokerValues[jokerId];
	if (value === undefined) return [];

	const naturals = meld.pieces.filter((piece) => !piece.isJoker);
	if (meld.type === 'suite') {
		const colour = naturals[0]?.color;
		return colour === undefined
			? []
			: [{ id: `sub-${jokerId}`, isJoker: false, value, color: colour }];
	}

	const taken = new Set(naturals.map((piece) => piece.color));
	return COLORS.filter((color) => !taken.has(color)).map((color) => ({
		id: `sub-${jokerId}`,
		isJoker: false,
		value,
		color
	}));
}

/**
 * Replaces a table joker with the exact natural it substitutes. Once per joker,
 * ever (interpretation #6 + spec §1.6). The joker goes to the swapper's rack and
 * must be used in a formation that same turn.
 */
export function swapJoker(
	state: GameState,
	playerIdx: number,
	meldId: string,
	jokerPieceId: string,
	replacementPieceId: string
): GameState {
	requirePlaying(state);
	const player = requireCurrentPlayer(state, playerIdx);
	if (player.peTabla) throw new Error(REASON.peTablaCannotSwapJoker);

	const meld = findMeld(state.table.melds, meldId);
	// "Once ever" is checked first: the joker has already left the meld by then.
	if (state.swappedJokerIds.includes(jokerPieceId)) throw new Error(REASON.jokerAlreadySwapped);
	const slot = meld.pieces.findIndex((piece) => piece.id === jokerPieceId);
	if (slot === -1) throw new Error(REASON.jokerNotInMeld);
	if (!(meld.pieces[slot] as Piece).isJoker) throw new Error(REASON.jokerNotInMeld);

	// Ropet §1.6: a joker inside an unfinished terță (joker + 2 naturals) is
	// locked until the fourth colour completes it. The player who adds that
	// fourth piece may then use the joker — no extra bookkeeping needed.
	if (meld.type === 'terta' && meld.pieces.length < MAX_TERTA_SIZE) {
		throw new Error(REASON.jokerInIncompleteTerta);
	}

	const replacement = findPiece(player.rack, replacementPieceId);
	if (!replacement) throw new Error(REASON.pieceNotInRack);
	if (replacement.isJoker) throw new Error(REASON.wrongReplacement);

	// The substituted value comes from the engine, not from the caller.
	const legal = substitutedPieces(meld, jokerPieceId).some(
		(candidate) => candidate.value === replacement.value && candidate.color === replacement.color
	);
	if (!legal) throw new Error(REASON.wrongReplacement);

	const joker = meld.pieces[slot] as Piece;
	const swapped = [...meld.pieces];
	swapped[slot] = replacement;
	// The replacement is the swapper's piece, sitting in someone else's meld: it
	// counts for the swapper (spec §1.6 lipit ownership).
	const lipitBy = [...meld.lipitBy];
	lipitBy[slot] = playerIdx;

	const melds = state.table.melds.map((candidate) =>
		candidate.id === meldId ? { ...candidate, pieces: swapped, lipitBy } : candidate
	);

	const players = [...state.players];
	players[playerIdx] = {
		...player,
		rack: [...removePieces(player.rack, [replacement.id]), joker]
	};

	return bump(state, {
		players,
		table: { ...state.table, melds },
		swappedJokerIds: [...state.swappedJokerIds, jokerPieceId],
		turnState: {
			...state.turnState,
			pending: [
				...(state.turnState.pending ?? []),
				{ pieceId: jokerPieceId, source: null, restoreToSir: [] }
			],
			mustUsePieceIds: [...state.turnState.mustUsePieceIds, jokerPieceId]
		}
	});
}

/* ------------------------------------------------------------------ *
 * Discards, closing, end of game
 * ------------------------------------------------------------------ */

function finalize(state: GameState, closerIdx: number | null, reason: EndReason): GameState {
	const { scores, breakdowns } = scoreGame(state, closerIdx);
	return bump(state, {
		phase: 'finished',
		scores,
		lastBreakdowns: breakdowns,
		endReason: reason,
		closerIndex: closerIdx,
		gameWinner: pickWinner(scores),
		sessionTotals: state.sessionTotals.map((total, i) => total + (scores[i] ?? 0))
	});
}

/**
 * Lays a piece on the șir and ends the turn. Pieces taken this turn and never
 * used in a formation go back where they came from first (interpretation #14),
 * so this action never fails because of an unusable taken piece.
 *
 * Choosing a piece that is itself pending undoes the take completely: everything
 * goes back to its source and the turn passes with nothing discarded, which is
 * the only way out when the taken piece is the last one on the rack.
 */
export function discard(state: GameState, pieceId: string): GameState {
	requirePlaying(state);
	const index = state.currentPlayerIndex;
	const player = playerOf(state, index);
	if (!state.turnState.hasDrawn) throw new Error(REASON.drawFirst);
	if (player.peTabla) throw new Error(REASON.peTablaNoDiscard);

	const pending = state.turnState.pending ?? [];
	const pendingIds = new Set(
		pending.length > 0 ? pending.map((entry) => entry.pieceId) : state.turnState.mustUsePieceIds
	);

	const returned = returnPendingPieces(state);
	const players = [...state.players];

	if (pendingIds.has(pieceId)) {
		players[index] = { ...player, rack: returned.rack };
		return endOfTurn(state, {
			players,
			table: { ...state.table, sir: returned.sir, atu: returned.atu }
		});
	}

	const piece = findPiece(returned.rack, pieceId);
	if (!piece) throw new Error(REASON.pieceNotInRack);
	players[index] = { ...player, rack: removePieces(returned.rack, [piece.id]) };

	return endOfTurn(state, {
		players,
		table: {
			...state.table,
			// Returned pieces first, so the discarded piece lands on top.
			sir: appendToSir(returned.sir, piece),
			atu: returned.atu
		}
	});
}

/** Declaration window: the first three turns of the player's own game (spec §1.7). */
export function declarePeTabla(
	state: GameState,
	playerIdx: number,
	pattern: PatternType
): GameState {
	requirePlaying(state);
	const player = playerOf(state, playerIdx);
	if (player.peTabla) throw new Error(REASON.peTablaAlreadyDeclared);
	if (player.melded) throw new Error(REASON.peTablaAfterMeld);
	if (player.turnsTaken >= PE_TABLA_WINDOW_TURNS) throw new Error(REASON.peTablaWindowClosed);

	const players = [...state.players];
	players[playerIdx] = { ...player, peTabla: { pattern, declaredTurn: state.turnNumber } };
	return bump(state, { players });
}

/**
 * Closes a completed pe-tablă board. The board may cover the whole rack, in
 * which case there is nothing to discard; otherwise exactly one piece sits
 * outside the pattern and is discarded as the closing piece.
 *
 * A piece taken from the șir or the atu this turn counts as used once it sits in
 * a validated pattern (spec §2 #3 sends last-șir pieces to the board), so only
 * *discarding* an unused taken piece is rejected.
 */
export function peTablaClose(state: GameState, playerIdx: number, pieceId: string): GameState {
	requirePlaying(state);
	const player = playerOf(state, playerIdx);
	if (!player.peTabla) throw new Error(REASON.peTablaNotDeclared);
	if (player.peTablaComplete) throw new Error(REASON.peTablaAlreadyComplete);

	const pattern = player.peTabla.pattern;
	const completes = validatePattern(pattern, player.rack).valid;
	if (completes)
		return finalize(bump(state, { players: withComplete(playerIdx, state) }), playerIdx, 'close');

	// One piece outside the pattern is discarded as the closing piece.
	const discarded = findPiece(player.rack, pieceId);
	if (!discarded) throw new Error(REASON.pieceNotInRack);
	// You may not close by discarding a piece you just took and never used.
	if (state.turnState.mustUsePieceIds.includes(discarded.id)) {
		throw new Error(REASON.mustUseTakenPiece);
	}
	const remaining = removePieces(player.rack, [discarded.id]);
	if (!validatePattern(pattern, remaining).valid) throw new Error(REASON.peTablaBoardIncomplete);

	const players = [...state.players];
	players[playerIdx] = { ...player, rack: remaining, peTablaComplete: true };

	return finalize(
		bump(state, {
			players,
			table: { ...state.table, sir: appendToSir(state.table.sir, discarded) }
		}),
		playerIdx,
		'close'
	);
}

function withComplete(playerIdx: number, state: GameState): PlayerState[] {
	const players = [...state.players];
	players[playerIdx] = { ...playerOf(state, playerIdx), peTablaComplete: true };
	return players;
}

/**
 * Closing the game: the current player discards their last rack piece, which is
 * the closing piece. Every other piece they hold is already on the table.
 *
 * A piece taken this turn and never used goes back to its source first
 * (interpretation #14), so the closing piece is always a normal one. If that
 * leaves anything other than a single piece, the close is refused — the player
 * ends the turn with `discard` (which undoes the take if needed) and closes on a
 * later turn.
 */
export function close(state: GameState, pieceId: string): GameState {
	requirePlaying(state);

	const index = state.currentPlayerIndex;
	const player = playerOf(state, index);
	if (player.peTabla) throw new Error(REASON.peTablaNoDiscard);

	const returned = returnPendingPieces(state);
	if (returned.rack.length !== 1) throw new Error(REASON.mustDiscardLast);

	const piece = findPiece(returned.rack, pieceId);
	if (!piece) throw new Error(REASON.pieceNotInRack);

	const players = [...state.players];
	players[index] = { ...player, rack: [] };

	return finalize(
		bump(state, {
			players,
			table: {
				...state.table,
				sir: appendToSir(returned.sir, piece),
				atu: returned.atu
			}
		}),
		index,
		'close'
	);
}

/** The stock ran out: nobody gets the closing bonus (spec §1.8). */
export function endByStockOut(state: GameState): GameState {
	requirePlaying(state);
	return finalize(state, null, 'stock-out');
}

/** Re-exported so callers can copy a state before experimenting with it. */
export { cloneState };
