/**
 * Remi Etalat — shared table primitives (spec §3.1).
 *
 * Everything here is a pure helper on plain data: no rules decisions, no state
 * machine. `actions.ts` owns the flow and composes these.
 */

import { isSamePiece } from './pieces';
import type { Formation, FormationType, GameState, Piece, TurnState } from './types';

/** Reason strings raised by the șir helpers — single source, re-exported by `actions`. */
export const TABLE_REASON = {
	sirEmpty: 'the sir is empty',
	sirDeadFirst: 'the first piece of the sir can never be taken',
	pieceNotInSir: 'the piece is not in the sir',
	meldNotFound: 'meld not found'
} as const;

export function freshTurnState(): TurnState {
	return { hasDrawn: false, drawnFrom: null, mustUsePieceIds: [] };
}

/**
 * Structural clone.
 *
 * Hand-rolled rather than `structuredClone` because Svelte 5 wraps reactive state
 * in proxies, which `structuredClone` rejects. `Piece`s are treated as immutable
 * values and are therefore shared by reference.
 */
export function cloneState(state: GameState): GameState {
	return {
		...state,
		players: state.players.map((player) => ({
			...player,
			rack: [...player.rack],
			peTabla: player.peTabla ? { ...player.peTabla } : null
		})),
		table: {
			melds: state.table.melds.map((meld) => ({
				...meld,
				pieces: [...meld.pieces],
				lipitBy: [...meld.lipitBy]
			})),
			sir: [...state.table.sir],
			stock: [...state.table.stock],
			atu: state.table.atu
		},
		dubleOffers: [...state.dubleOffers],
		turnState: { ...state.turnState, mustUsePieceIds: [...state.turnState.mustUsePieceIds] },
		swappedJokerIds: [...state.swappedJokerIds],
		scores: [...state.scores],
		sessionTotals: [...state.sessionTotals]
	};
}

/* ------------------------------------------------------------------ *
 * șir — `sir[0]` is the dead first piece (spec §1.4)
 * ------------------------------------------------------------------ */

export function appendToSir(sir: Piece[], piece: Piece): Piece[] {
	return [...sir, piece];
}

/** Removes the last șir piece. The caller must reject the dead piece first. */
export function takeLastFromSir(sir: Piece[]): { sir: Piece[]; piece: Piece } {
	if (sir.length === 0) throw new Error(TABLE_REASON.sirEmpty);
	const piece = sir[sir.length - 1] as Piece;
	return { sir: sir.slice(0, -1), piece };
}

/**
 * Removes `pieceId` and everything laid after it (the "break the șir" pickup).
 * Rejects index 0 — the first piece is dead for the whole game.
 */
export function takeFromSir(
	sir: Piece[],
	pieceId: string
): { sir: Piece[]; piece: Piece; taken: Piece[]; index: number } {
	const index = sir.findIndex((piece) => piece.id === pieceId);
	if (index === -1) throw new Error(TABLE_REASON.pieceNotInSir);
	if (index === 0) throw new Error(TABLE_REASON.sirDeadFirst);
	const piece = sir[index] as Piece;
	return { sir: sir.slice(0, index), piece, taken: sir.slice(index), index };
}

/* ------------------------------------------------------------------ *
 * Melds
 * ------------------------------------------------------------------ */

export function findMeld(melds: Formation[], meldId: string): Formation {
	const meld = melds.find((candidate) => candidate.id === meldId);
	if (!meld) throw new Error(TABLE_REASON.meldNotFound);
	return meld;
}

/** Meld ids are positional and stable: nothing is ever removed from the meld table. */
export function nextMeldIds(melds: Formation[], count: number): string[] {
	return Array.from({ length: count }, (_, i) => `m${melds.length + i}`);
}

export function createFormation(
	id: string,
	type: FormationType,
	pieces: Piece[],
	owner: number
): Formation {
	return { id, type, pieces: [...pieces], owner, lipitBy: pieces.map(() => null) };
}

/* ------------------------------------------------------------------ *
 * Piece collections
 * ------------------------------------------------------------------ */

export function findPiece(pieces: Piece[], pieceId: string): Piece | undefined {
	return pieces.find((piece) => piece.id === pieceId);
}

export function hasPiece(pieces: Piece[], pieceId: string): boolean {
	return pieces.some((piece) => piece.id === pieceId);
}

export function removePieces(pieces: Piece[], pieceIds: Iterable<string>): Piece[] {
	const removed = new Set(pieceIds);
	return pieces.filter((piece) => !removed.has(piece.id));
}

/** The rack copies of a offered dublă (the offer is a representative; both copies live in the rack). */
export function pairOf(rack: Piece[], offered: Piece): Piece[] {
	return rack.filter((piece) => isSamePiece(piece, offered));
}

/** How many complete duble the rack holds — `canStricaJocul` needs three. */
export function countDublePairs(pieces: Piece[]): number {
	const counts = new Map<string, number>();
	for (const piece of pieces) {
		if (piece.isJoker) continue;
		const key = `${piece.color}-${piece.value}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
}
