import { finalPieceValue } from './formations';
import { PATTERN_BONUS } from './patterns';
import type { GameState } from './types';

export type PlayerBreakdown = {
	/** Table formations owned by the player, minus anything someone lipit. */
	meldedPoints: number;
	/** Pieces lipit onto any formation, owned or not. */
	lipitPoints: number;
	rackPenalty: number;
	closingBonus: number;
	atuBonus: number;
	peTablaBonus: number;
	nonMelderPenalty: number;
	/** 1, 2 (joc dublu and/or joker close) or 4. */
	multiplier: number;
	total: number;
};

export const CLOSING_BONUS = 50;
export const ATU_BONUS = 50;
export const NON_MELDER_PENALTY = -100;

/**
 * End-of-game scoring (spec §1.9).
 *
 * `closerIndex` is the player who discarded the last piece, or null when the
 * stock ran out (nobody gets the closing bonus). The closing piece is the last
 * piece of the șir.
 */
export function scoreGame(
	state: GameState,
	closerIndex: number | null
): { scores: number[]; breakdowns: PlayerBreakdown[] } {
	const sir = state.table.sir;
	const closingPiece = closerIndex !== null && sir.length > 0 ? sir[sir.length - 1] : undefined;
	const closerDiscardedJoker = closerIndex !== null && closingPiece?.isJoker === true;

	const breakdowns: PlayerBreakdown[] = state.players.map((player, index) => {
		const breakdown: PlayerBreakdown = {
			meldedPoints: 0,
			lipitPoints: 0,
			rackPenalty: 0,
			closingBonus: 0,
			atuBonus: player.announcedAtu ? ATU_BONUS : 0,
			peTablaBonus: 0,
			nonMelderPenalty: 0,
			multiplier: 1,
			total: 0
		};

		const declaredPattern = player.peTabla?.pattern ?? null;

		if (player.peTablaComplete && declaredPattern) {
			// Board completion replaces the whole melded/lipit/rack arithmetic.
			breakdown.peTablaBonus = PATTERN_BONUS[declaredPattern];
		} else if (!player.melded) {
			// Never etalat — including a declared pe-tablă board left incomplete.
			breakdown.nonMelderPenalty = NON_MELDER_PENALTY;
		} else {
			for (const meld of state.table.melds) {
				meld.pieces.forEach((piece, i) => {
					if (meld.owner === index && (meld.lipitBy[i] ?? null) === null) {
						breakdown.meldedPoints += finalPieceValue(piece);
					}
				});
			}

			for (const meld of state.table.melds) {
				meld.pieces.forEach((piece, i) => {
					if ((meld.lipitBy[i] ?? null) === index) {
						breakdown.lipitPoints += finalPieceValue(piece);
					}
				});
			}

			const rackValue = player.rack.reduce((sum, piece) => sum + finalPieceValue(piece), 0);
			breakdown.rackPenalty = rackValue === 0 ? 0 : -rackValue;

			if (closerIndex === index) breakdown.closingBonus = CLOSING_BONUS;
		}

		const base =
			breakdown.meldedPoints +
			breakdown.lipitPoints +
			breakdown.rackPenalty +
			breakdown.closingBonus +
			breakdown.atuBonus +
			breakdown.peTablaBonus +
			breakdown.nonMelderPenalty;

		let multiplier = 1;
		if (state.doubleGame) multiplier *= 2;
		if (closerIndex === index && closerDiscardedJoker) multiplier *= 2;

		breakdown.multiplier = multiplier;
		breakdown.total = base * multiplier;

		return breakdown;
	});

	return { scores: breakdowns.map((breakdown) => breakdown.total), breakdowns };
}

/** Most points wins; ties go to the lowest index. */
export function pickWinner(scores: number[]): number | null {
	if (scores.length === 0) return null;
	let winner = 0;
	for (let i = 1; i < scores.length; i++) {
		if ((scores[i] as number) > (scores[winner] as number)) winner = i;
	}
	return winner;
}
