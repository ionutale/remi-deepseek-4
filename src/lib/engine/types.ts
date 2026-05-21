export type Suit = '♠' | '♥' | '♦' | '♣';

export type Value = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
	suit: Suit;
	value: Value;
	id: string;
	isJoker: boolean;
}

export type MeldType = 'set' | 'sequence';

export interface Meld {
	cards: Card[];
	type: MeldType;
}

export interface PlayerState {
	hand: Card[];
	melds: Meld[];
}

export type GamePhase = 'idle' | 'draw' | 'discard' | 'finished';

export interface GameState {
	players: PlayerState[];
	currentPlayerIndex: number;
	drawPile: Card[];
	discardPile: Card[];
	phase: GamePhase;
	winner: number | null;
}

export interface GameConfig {
	playerCount: 2 | 3 | 4;
	humanPlayerIndex: number;
}
