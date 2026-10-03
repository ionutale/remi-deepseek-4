import { writable, derived } from 'svelte/store';
import type { GameState, GameConfig, CloseDeclaration } from '$lib/engine/types';
import {
	initMatch,
	drawFromPile,
	drawFromDiscard,
	discardCard,
	closeGame,
	nextRound
} from '$lib/engine/game';
import { aiTurn } from '$lib/engine/ai';

export const gameState = writable<GameState | null>(null);

export const currentHand = derived(gameState, ($state) =>
	$state ? $state.players[$state.currentPlayerIndex].hand : []
);

export const isHumanTurn = derived(
	gameState,
	($state) => $state !== null && $state.phase !== 'finished' && $state.currentPlayerIndex === 0
);

export const gamePhase = derived(gameState, ($state) => $state?.phase ?? 'idle');

export const winner = derived(gameState, ($state) => $state?.matchWinner ?? null);

export function startGame(config: GameConfig) {
	const state = initMatch(config);
	gameState.set(state);
}

export function playerDrawPile() {
	gameState.update((state) => {
		if (!state) return state;
		try {
			let newState = drawFromPile(state);
			newState = runAITurns(newState);
			return newState;
		} catch {
			return state;
		}
	});
}

export function playerDrawDiscard() {
	gameState.update((state) => {
		if (!state) return state;
		try {
			let newState = drawFromDiscard(state);
			newState = runAITurns(newState);
			return newState;
		} catch {
			return state;
		}
	});
}

export function playerDiscard(cardId: string) {
	gameState.update((state) => {
		if (!state) return state;
		try {
			let newState = discardCard(state, cardId);
			newState = runAITurns(newState);
			return newState;
		} catch {
			return state;
		}
	});
}

export function playerClose(declaration: CloseDeclaration) {
	gameState.update((state) => {
		if (!state) return state;
		try {
			return closeGame(state, declaration);
		} catch {
			return state;
		}
	});
}

export function playerNextRound() {
	gameState.update((state) => {
		if (!state) return state;
		try {
			let newState = nextRound(state);
			newState = runAITurns(newState);
			return newState;
		} catch {
			return state;
		}
	});
}

function runAITurns(state: GameState): GameState {
	let current = { ...state };
	let safety = 0;
	while (
		current.currentPlayerIndex !== 0 &&
		current.phase !== 'finished' &&
		current.phase !== 'round-over' &&
		safety < 20
	) {
		current = aiTurn(current);
		safety++;
	}
	return current;
}

export function resetGame() {
	gameState.set(null);
}
