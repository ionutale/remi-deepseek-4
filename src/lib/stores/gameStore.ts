import { writable, derived } from 'svelte/store';
import type { GameState, GameConfig } from '$lib/engine/types';
import { initGame, drawFromPile, drawFromDiscard, discardCard, closeGame } from '$lib/engine/game';
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

export const winner = derived(gameState, ($state) => $state?.winner ?? null);

export function startGame(config: GameConfig) {
	const state = initGame(config);
	gameState.set(state);
}

export function playerDrawPile() {
	gameState.update((state) => {
		if (!state) return state;
		let newState = drawFromPile(state);
		newState = runAITurns(newState);
		return newState;
	});
}

export function playerDrawDiscard() {
	gameState.update((state) => {
		if (!state) return state;
		let newState = drawFromDiscard(state);
		newState = runAITurns(newState);
		return newState;
	});
}

export function playerDiscard(cardId: string) {
	gameState.update((state) => {
		if (!state) return state;
		let newState = discardCard(state, cardId);
		if (newState.phase === 'finished') return newState;
		newState = runAITurns(newState);
		return newState;
	});
}

export function playerClose() {
	gameState.update((state) => {
		if (!state) return state;
		const newState = closeGame(state);
		return newState;
	});
}

function runAITurns(state: GameState): GameState {
	let current = { ...state };
	let safety = 0;
	while (current.currentPlayerIndex !== 0 && current.phase !== 'finished' && safety < 20) {
		current = aiTurn(current);
		safety++;
	}
	return current;
}

export function resetGame() {
	gameState.set(null);
}
