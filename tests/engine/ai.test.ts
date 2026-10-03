import { describe, it, expect, beforeEach } from 'vitest';
import { initMatch } from '$lib/engine/game';
import { autoPlayTurn, coverageScore, shouldDrawFromDiscard } from '$lib/engine/ai';
import { clearCombinationsCache } from '$lib/engine/utils';
import type { Card, GameState, Suit, Value } from '$lib/engine/types';

let cardCounter = 0;
function card(suit: Suit, value: Value, isJoker = false): Card {
	return {
		suit,
		value,
		id: `a${cardCounter++}`,
		isJoker,
		...(isJoker ? { jokerType: 'colored' as const } : {})
	};
}

describe('probe', () => {
	it('times turns', () => {
		clearCombinationsCache();
		let worst = 0;
		let total = 0;
		for (let i = 0; i < 30; i++) {
			let state: GameState = initMatch({ playerCount: 2, humanPlayerIndex: 0 });
			state = { ...state, currentPlayerIndex: 1 };
			const t0 = performance.now();
			state = autoPlayTurn(state);
			const dt = performance.now() - t0;
			total += dt;
			worst = Math.max(worst, dt);
			expect(state.phase).toBe('draw');
		}
		const hand = initMatch({ playerCount: 2, humanPlayerIndex: 0 }).players[0].hand;
		const t1 = performance.now();
		for (const c of hand) coverageScore(hand.filter((h) => h.id !== c.id));
		const covMs = performance.now() - t1;
		const top = initMatch({ playerCount: 2, humanPlayerIndex: 0 }).discardPile[0];
		const t2 = performance.now();
		for (let i = 0; i < 5; i++) shouldDrawFromDiscard(hand, top);
		const drawMs = (performance.now() - t2) / 5;

		// worst case: discard top belongs to no meld at all → full scan
		const hardHand: Card[] = [
			...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
				(i) => ({ suit: '♠' as Suit, value: (i + 2) as Value, id: `p${i}`, isJoker: false })
			),
			{ suit: '♥' as Suit, value: 7 as Value, id: 'px', isJoker: false }
		];
		clearCombinationsCache();
		const hardTop: Card = { suit: '♣', value: 4, id: 'ptop', isJoker: false };
		const t3 = performance.now();
		let hardResult = true;
		for (let i = 0; i < 3; i++) hardResult = shouldDrawFromDiscard(hardHand, hardTop);
		const hardMs = (performance.now() - t3) / 3;
		// eslint-disable-next-line no-console
		console.log(
			`PROBE worst ${worst.toFixed(1)}ms total ${total.toFixed(1)}ms coverage14 ${covMs.toFixed(2)}ms shouldDraw ${drawMs.toFixed(2)}ms hardScan ${hardMs.toFixed(2)}ms res ${hardResult}`
		);
		expect(true).toBe(true);
	});
});
