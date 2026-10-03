/**
 * Remi Etalat — engine types (schemaVersion 3).
 *
 * Deliberately separate from `src/lib/engine/types.ts`: the shipped close-mode
 * engine is frozen and keeps its own `Card`/`Meld` shapes. Nothing in the new
 * engine imports the old one.
 */

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
};

/** Per-turn draw bookkeeping, reset by `nextTurn`. */
export type TurnState = {
	hasDrawn: boolean;
	drawnFrom: 'stock' | 'sir' | 'atu' | null;
	/** Ids taken from the șir / atu / received through a joker swap — must be melded before discarding. */
	mustUsePieceIds: string[];
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
};
