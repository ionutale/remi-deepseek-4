/**
 * Remi Etalat — engine types (schemaVersion 3).
 *
 * The rules of record are the Remi Etalat deck, not the previous game: every
 * type below belongs to this engine alone. `src/lib/engine/types.ts` belongs to
 * the older close-mode implementation, which is still in the tree, so the two
 * engines deliberately share no types and nothing in here imports from it.
 */

import type { PlayerBreakdown } from './scoring';

export type Color = 'red' | 'yellow' | 'blue' | 'black';

export type Piece = {
	id: string;
	isJoker: boolean;
	/** 1..13 for naturals, 0 for jokers. */
	value: number;
	/** Jokers use 'black' as a placeholder — always branch on `isJoker` first. */
	color: Color;
};

export type FormationType = 'suite' | 'terta';

export type Formation = {
	id: string;
	type: FormationType;
	/** Ordered for `suite`; order-independent for `terta`. */
	pieces: Piece[];
	/** Player index who laid the formation down. */
	owner: number;
	/** Parallel to `pieces`: null = original, else the index of the player who lipește it. */
	lipitBy: (number | null)[];
	/**
	 * Terță only: who completed it by adding the last piece. Only that player may
	 * use (swap) a joker that finished the terță — ropet: "jucătorul care lipește
	 * a patra piesă poate folosi joly-ul" (spec §1.6).
	 */
	tertaCompleter?: number | null;
};

export type PatternType = 'simplu' | 'bete' | 'mozaic' | 'bicolor' | 'duble' | 'monocolor';

export type GamePhase = 'duble' | 'atu' | 'playing' | 'finished';

export type PlayerState = {
	rack: Piece[];
	/** Performed their first etalare. */
	melded: boolean;
	/** `turnNumber` of the first etalare, null while not melded. Gates lipire onto others' melds. */
	meldedTurn: number | null;
	/** Completed turns — the pe-tablă declaration window is `turnsTaken < 3`. */
	turnsTaken: number;
	announcedAtu: boolean;
	peTabla: { pattern: PatternType; declaredTurn: number } | null;
	peTablaComplete: boolean;
	/**
	 * Server projection only (`projectRoomFor`): the true rack length. Opponent
	 * racks arrive emptied, so the UI reads `rackCount ?? rack.length`.
	 */
	rackCount?: number;
	/**
	 * Server projection only (`projectRoomFor`): `validatePattern` progress
	 * computed from the real rack. Lets the UI show opponents' pe-tablă
	 * progress without ever receiving their tiles.
	 */
	peTablaProgress?: number | null;
};

/**
 * A piece taken this turn that must be used in a formation before discarding.
 * Interpretation #14: if the turn ends without using it, it goes back where it
 * came from, so a player can never be locked out of ending their turn.
 */
export type PendingUse = {
	pieceId: string;
	/** Where it came from; `null` when there is nothing to send it back to. */
	source: 'sir' | 'atu' | null;
	/**
	 * șir ids to put back, in their original order. A take-last returns the one
	 * piece; a break-sir lifted a whole suffix, so all of it goes back.
	 */
	restoreToSir: string[];
};

/** Per-turn draw bookkeeping, reset by `nextTurn`. */
export type TurnState = {
	hasDrawn: boolean;
	drawnFrom: 'stock' | 'sir' | 'atu' | null;
	/** Ids taken from the șir / atu / received through a joker swap — must be melded before discarding. */
	mustUsePieceIds: string[];
	/**
	 * Where each pending piece came from. Optional so hand-built states keep
	 * compiling; when absent the safety valve simply leaves pieces on the rack.
	 */
	pending?: PendingUse[];
};

export type GameState = {
	schemaVersion: 3;
	phase: GamePhase;
	players: PlayerState[];
	currentPlayerIndex: number;
	table: {
		melds: Formation[];
		/** `sir[0]` is the dead first piece. */
		sir: Piece[];
		stock: Piece[];
		atu: Piece | null;
	};
	/** Pre-game blind exchange slots, parallel to `players`. */
	dubleOffers: (Piece | null)[];
	/**
	 * Server projection only (`projectRoomFor`): per-seat "has offered",
	 * parallel to `dubleOffers`. Opponent offer pieces arrive nulled, so the
	 * UI reads wait-state from here without learning values.
	 */
	dubleOffered?: boolean[];
	/**
	 * Server projection only (`projectRoomFor`): the true stock length. The
	 * projected `table.stock` arrives emptied, so the UI reads
	 * `stockCount ?? table.stock.length`.
	 */
	stockCount?: number;
	/** Reset at the start of every turn. */
	turnState: TurnState;
	/** Jokers already swapped once — a joker is played, swapped and reused at most. */
	swappedJokerIds: string[];
	/** 1-based global turn counter. */
	turnNumber: number;
	firstPlayerIndex: number;
	/** Atu is a 1 or a joker. */
	doubleGame: boolean;
	/** Per game. */
	scores: number[];
	sessionTotals: number[];
	gameWinner: number | null;
	turnStartedAt: number;
	revision: number;

	/** Why the game ended — populated by `close` / `peTablaClose` / `endByStockOut`. */
	endReason?: EndReason | null;
	/** The player who discarded the closing piece; null when the stock ran out. */
	closerIndex?: number | null;
	/** Per-player scoring detail, so the end sheet does not have to recompute it. */
	lastBreakdowns?: PlayerBreakdown[];
};

export type EndReason = 'close' | 'stock-out';
