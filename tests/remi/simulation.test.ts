import { describe, expect, it } from 'vitest';
import { autoPlayPreGame, playTurn } from '$lib/engine/remi/ai';
import { createGame, endByStockOut } from '$lib/engine/remi/actions';
import { analyzeFormation } from '$lib/engine/remi/formations';
import { createDeck, shuffle } from '$lib/engine/remi/pieces';
import type { GameState } from '$lib/engine/remi/types';

const TURN_CAP = 1000;
const WALL_BUDGET_MS = 120_000;

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

const CANON = createDeck()
	.map((p) => p.id)
	.sort();

function checkInvariants(state: GameState): void {
	// Piece conservation: every one of the 106 ids exactly once.
	const ids: string[] = [];
	for (const player of state.players) ids.push(...player.rack.map((p) => p.id));
	for (const meld of state.table.melds) ids.push(...meld.pieces.map((p) => p.id));
	ids.push(...state.table.sir.map((p) => p.id));
	ids.push(...state.table.stock.map((p) => p.id));
	if (state.table.atu) ids.push(state.table.atu.id);
	expect(ids.sort()).toEqual(CANON);

	// Every table formation is valid at all times.
	for (const meld of state.table.melds) {
		expect(analyzeFormation(meld.type, meld.pieces).valid).toBe(true);
	}

	// Rack sizes: normal players hold at most 14 after their turn;
	// the AI never declares pe-tablă in these simulations.
	for (const player of state.players) {
		expect(player.peTabla).toBe(null);
		expect(player.rack.length).toBeLessThanOrEqual(14);
	}
}

function runGame(playerCount: 2 | 3 | 4, seed: number): { turns: number; closed: boolean } {
	const rng = mulberry32(seed);
	let state = autoPlayPreGame(createGame({ playerCount, deck: shuffle(createDeck(), rng) }));
	expect(state.phase).toBe('playing');

	let turns = 0;
	let closed = true;
	while (state.phase === 'playing') {
		if (turns >= TURN_CAP) {
			throw new Error(`game did not end within ${TURN_CAP} turns (seed ${seed})`);
		}
		expect(state.turnState.hasDrawn).toBe(false);
		if (state.table.stock.length === 0) {
			state = endByStockOut(state);
			closed = false;
			break;
		}
		state = playTurn(state);
		checkInvariants(state);
		turns++;
	}

	expect(state.phase).toBe('finished');
	for (const score of state.scores) {
		expect(Number.isFinite(score)).toBe(true);
	}
	expect(state.gameWinner).toBeGreaterThanOrEqual(0);
	expect(state.gameWinner).toBeLessThan(playerCount);
	return { turns, closed };
}

describe('remi self-play simulations', () => {
	it('plays seeded full games without illegal states', { timeout: WALL_BUDGET_MS }, () => {
		const plan: { players: 2 | 3 | 4; games: number; baseSeed: number }[] = [
			{ players: 2, games: 80, baseSeed: 1_000 },
			{ players: 3, games: 70, baseSeed: 2_000 },
			{ players: 4, games: 50, baseSeed: 3_000 }
		];
		const start = performance.now();
		let totalTurns = 0;
		let closed = 0;
		let stockOut = 0;
		let games = 0;
		for (const batch of plan) {
			for (let g = 0; g < batch.games; g++) {
				const result = runGame(batch.players, batch.baseSeed + g);
				totalTurns += result.turns;
				if (result.closed) closed++;
				else stockOut++;
				games++;
			}
		}
		const elapsed = performance.now() - start;
		console.log(
			`simulation: ${games} games, ${totalTurns} turns, ` +
				`closed ${closed}, stock-out ${stockOut}, ` +
				`avg ${(totalTurns / games).toFixed(1)} turns/game, ` +
				`${elapsed.toFixed(0)} ms total (${(elapsed / games).toFixed(1)} ms/game)`
		);
		expect(elapsed).toBeLessThan(WALL_BUDGET_MS);
	});
});
