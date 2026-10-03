export type Suit = '♠' | '♥' | '♦' | '♣';

export type Value = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type JokerType = 'black' | 'colored';

export interface Card {
	suit: Suit;
	value: Value;
	id: string;
	isJoker: boolean;
	jokerType?: JokerType;
}

export type MeldType = 'set' | 'sequence';

export interface Meld {
	cards: Card[];
	type: MeldType;
}

export interface CloseDeclaration {
	melds: Meld[];
	discardId: string;
}

export interface PlayerState {
	hand: Card[];
	melds: Meld[];
}

export type GamePhase = 'draw' | 'discard' | 'round-over' | 'finished';

export interface GameState {
	schemaVersion: 2;
	players: PlayerState[];
	currentPlayerIndex: number;
	drawPile: Card[];
	discardPile: Card[];
	phase: GamePhase;
	round: number;
	roundStarter: number;
	scores: number[];
	roundWinner: number | null;
	matchWinner: number | null;
	targetScore: number;
	turnStartedAt: number;
	revision: number;
}

export interface GameConfig {
	playerCount: 2 | 3 | 4;
	humanPlayerIndex: number;
	targetScore?: number;
}