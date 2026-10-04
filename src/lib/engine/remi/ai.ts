/**
 * Remi Etalat — AI (spec §3.5).
 *
 * Etalat + pe-tablă play on top of the real action functions from `actions.ts`.
 * The AI never duplicates validation logic: every candidate move is executed
 * through the engine, and anything the engine rejects is skipped via try/catch.
 * Formation search reuses `findFormationsContaining` (bounded, deterministic)
 * with a module-level memo so the pre-take simulation and the post-draw replay
 * share results.
 */

import {
	announceAtu,
	breakSir,
	close,
	discard,
	drawStock,
	lipi,
	meld,
	nextTurn,
	offerDuble,
	openingDiscard,
	peTablaClose,
	resolveDubleExchange,
	startPlaying,
	swapJoker,
	takeAtu,
	takeLastFromSir
} from './actions';
import {
	analyzeFormation,
	canOpen,
	finalPieceValue,
	findFormationsContaining,
	type PieceFormation
} from './formations';
import { validatePattern, PATTERN_BONUS } from './patterns';
import { COLORS } from './pieces';
import type { Color, Formation, GameState, PatternType, Piece } from './types';

const PATTERNS: PatternType[] = ['simplu', 'bete', 'mozaic', 'bicolor', 'duble', 'monocolor'];
/** Minimum `validatePattern(...).progress` for a pattern to look promising. */
const PATTERN_PROMISE_THRESHOLD = 0.75;

/** Memo caps — cleared (not grown) past the cap, so memory stays bounded. */
const FORMATION_MEMO_CAP = 20_000;
const PATTERN_MEMO_CAP = 5_000;

const formationMemo = new Map<string, PieceFormation[]>();
const patternMemo = new Map<string, { valid: boolean; progress: number }>();

const rackKey = (rack: Piece[]): string =>
	rack
		.map((p) => p.id)
		.sort()
		.join(',');

function formationsFor(rack: Piece[], anchor: Piece): PieceFormation[] {
	const key = `${rackKey(rack)}>${anchor.id}`;
	const cached = formationMemo.get(key);
	if (cached) return cached;
	let found: PieceFormation[];
	try {
		found = [...findFormationsContaining(rack, anchor)].sort(compareFormations);
	} catch {
		found = [];
	}
	if (formationMemo.size > FORMATION_MEMO_CAP) formationMemo.clear();
	formationMemo.set(key, found);
	return found;
}

const idsKey = (pieces: Piece[]): string =>
	pieces
		.map((p) => p.id)
		.sort()
		.join(',');

const jokersIn = (formation: PieceFormation): number =>
	formation.pieces.filter((p) => p.isJoker).length;

function compareFormations(a: PieceFormation, b: PieceFormation): number {
	if (b.pieces.length !== a.pieces.length) return b.pieces.length - a.pieces.length;
	if (jokersIn(a) !== jokersIn(b)) return jokersIn(a) - jokersIn(b);
	if (a.type !== b.type) return a.type === 'suite' ? -1 : 1;
	return idsKey(a.pieces).localeCompare(idsKey(b.pieces));
}

function cachedPattern(pattern: PatternType, rack: Piece[]): { valid: boolean; progress: number } {
	const key = `${pattern}:${rackKey(rack)}`;
	const cached = patternMemo.get(key);
	if (cached) return cached;
	let result: { valid: boolean; progress: number };
	try {
		const checked = validatePattern(pattern, rack);
		result = { valid: checked.valid, progress: checked.progress };
	} catch {
		result = { valid: false, progress: 0 };
	}
	if (patternMemo.size > PATTERN_MEMO_CAP) patternMemo.clear();
	patternMemo.set(key, result);
	return result;
}

function me(state: GameState) {
	const player = state.players[state.currentPlayerIndex];
	if (!player) throw new Error('unknown player');
	return player;
}

function canOpenOk(formations: PieceFormation[]): boolean {
	try {
		return canOpen(formations).ok;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * Meld planning
 * ------------------------------------------------------------------ */

/**
 * Greedy plan: first cover every `mustIds` piece (taken from the șir / atu or
 * received through a joker swap — the engine forces their use this turn), then
 * extend with every other formation the rack affords. Returns null when a
 * mandatory piece cannot be placed. Deterministic for a given input.
 */
function greedyPlan(rack: Piece[], mustIds: string[]): PieceFormation[] | null {
	let remaining = [...rack];
	const plan: PieceFormation[] = [];
	const take = (formation: PieceFormation): void => {
		const used = new Set(formation.pieces.map((p) => p.id));
		remaining = remaining.filter((p) => !used.has(p.id));
		plan.push(formation);
	};

	for (const id of mustIds) {
		const anchor = remaining.find((p) => p.id === id);
		if (!anchor) continue;
		const candidates = formationsFor(remaining, anchor);
		if (candidates.length === 0) return null;
		take(candidates[0] as PieceFormation);
	}

	for (const anchor of [...remaining]) {
		if (!remaining.some((p) => p.id === anchor.id)) continue;
		const candidates = formationsFor(remaining, anchor);
		if (candidates.length === 0) continue;
		take(candidates[0] as PieceFormation);
	}

	return plan;
}

const usedIds = (plan: PieceFormation[]): Set<string> =>
	new Set(plan.flatMap((formation) => formation.pieces.map((p) => p.id)));

/**
 * A turn must end with a discard or a close, so the plan must leave at least
 * one piece on the rack. Drops trailing formations without mandatory pieces;
 * reports (via the return value still covering the rack) when even the
 * mandatory core strands the turn.
 */
function trimPlan(rack: Piece[], plan: PieceFormation[], mustIds: string[]): PieceFormation[] {
	const mandatory = new Set(mustIds);
	while (plan.length > 0 && usedIds(plan).size >= rack.length) {
		let drop = -1;
		for (let i = plan.length - 1; i >= 0; i--) {
			if (!(plan[i] as PieceFormation).pieces.some((p) => mandatory.has(p.id))) {
				drop = i;
				break;
			}
		}
		if (drop === -1) break;
		plan.splice(drop, 1);
	}
	return plan;
}

const leavesDiscard = (rack: Piece[], plan: PieceFormation[]): boolean =>
	usedIds(plan).size < rack.length;

/* ------------------------------------------------------------------ *
 * Draw selection
 * ------------------------------------------------------------------ */

function enablesFormation(rack: Piece[], piece: Piece): boolean {
	return formationsFor([...rack, piece], piece).length > 0;
}

/** Would taking `piece` still allow a legal (first-)meld covering it? */
function canOpenWith(rack: Piece[], piece: Piece): boolean {
	const plan = greedyPlan(rack, [piece.id]);
	if (!plan || plan.length === 0) return false;
	const trimmed = trimPlan(rack, [...plan], [piece.id]);
	if (!leavesDiscard(rack, trimmed)) return false;
	return canOpenOk(trimmed);
}

/**
 * Breaks the șir only when clearly beneficial: the second-to-last piece (a
 * single extra piece rides along) that completes a formation with the rack.
 */
function chooseBreak(state: GameState, rack: Piece[]): string | null {
	const sir = state.table.sir;
	if (sir.length < 3) return null;
	const index = sir.length - 2;
	const piece = sir[index] as Piece;
	if (enablesFormation(rack, piece)) return piece.id;
	return null;
}

function doDraw(state: GameState): GameState {
	const player = me(state);
	const rack = player.rack;
	if (state.turnNumber > state.players.length) {
		const last =
			state.table.sir.length > 1 ? (state.table.sir[state.table.sir.length - 1] as Piece) : null;
		if (
			last &&
			(player.melded ? enablesFormation(rack, last) : canOpenWith([...rack, last], last))
		) {
			try {
				return takeLastFromSir(state);
			} catch {
				// fall through to the next source
			}
		}
		const atu = state.table.atu;
		if (atu && (player.melded ? enablesFormation(rack, atu) : canOpenWith([...rack, atu], atu))) {
			try {
				return takeAtu(state);
			} catch {
				// fall through to the next source
			}
		}
		if (player.melded && rack.length >= 3) {
			const target = chooseBreak(state, rack);
			if (target) {
				try {
					return breakSir(state, target);
				} catch {
					// fall through to the stock
				}
			}
		}
	}
	return drawStock(state);
}

/* ------------------------------------------------------------------ *
 * Discard selection
 * ------------------------------------------------------------------ */

function hasFriend(piece: Piece, others: Piece[]): boolean {
	if (piece.isJoker) return true;
	return others.some(
		(other) =>
			other.isJoker ||
			other.value === piece.value ||
			(other.color === piece.color && Math.abs(other.value - piece.value) <= 2)
	);
}

/**
 * Lower = rather discard. Jokers are virtually never discarded; pieces with a
 * friend (a forming run/set) are kept; among junk, high rack-penalty pieces go
 * first. Note the meld phase already melds every formable piece, so leftovers
 * are junk by construction — the friend bonus only guards paths (round 1,
 * unreachable opens) where melding was skipped.
 */
function usefulness(piece: Piece, rack: Piece[]): number {
	if (piece.isJoker) return 1000;
	let score = -finalPieceValue(piece);
	if (
		hasFriend(
			piece,
			rack.filter((p) => p.id !== piece.id)
		)
	)
		score += 10;
	return score;
}

function chooseDiscardId(rack: Piece[]): string {
	const ordered = [...rack].sort((a, b) => a.id.localeCompare(b.id));
	let best = ordered[0] as Piece;
	let bestScore = Infinity;
	for (const piece of ordered) {
		const score = usefulness(piece, rack);
		if (score < bestScore) {
			bestScore = score;
			best = piece;
		}
	}
	return best.id;
}

/* ------------------------------------------------------------------ *
 * Meld / lipi / joker-swap phases
 * ------------------------------------------------------------------ */

function meldPhase(s0: GameState): GameState {
	const s = s0;
	const idx = s.currentPlayerIndex;
	const player = me(s);
	const must = [...s.turnState.mustUsePieceIds];
	const plan = greedyPlan(player.rack, must) ?? [];
	const trimmed = trimPlan(player.rack, [...plan], must);
	if (trimmed.length === 0 || !leavesDiscard(player.rack, trimmed)) return s;
	// No legal meld: do not throw — the discard safety valve (#14) sends an
	// unused taken piece back to its source, so the turn can still end.
	if (!player.melded && !canOpenOk(trimmed)) return s;
	return meld(s, idx, trimmed);
}

function tryLipiPiece(s0: GameState, pieceId: string): GameState | null {
	const s = s0;
	const idx = s.currentPlayerIndex;
	const ordered = [...s.table.melds].sort(
		(a, b) => (a.owner === idx ? 0 : 1) - (b.owner === idx ? 0 : 1)
	);
	for (const target of ordered) {
		try {
			return lipi(s, idx, target.id, pieceId);
		} catch {
			// try the next meld
		}
	}
	return null;
}

function lipiPhase(s0: GameState): GameState {
	let s = s0;
	if (!me(s).melded) return s;
	for (const piece of [...me(s).rack]) {
		if (me(s).rack.length < 2) break;
		if (piece.isJoker) continue;
		s = tryLipiPiece(s, piece.id) ?? s;
	}
	return s;
}

/** The naturals a table joker could legally be substituted by (engine-derived). */
function jokerSubstitutes(meld: Formation, jokerId: string): { value: number; color: Color }[] {
	const analysis = analyzeFormation(meld.type, meld.pieces);
	const value = analysis.jokerValues[jokerId];
	if (value === undefined) return [];
	const naturals = meld.pieces.filter((p) => !p.isJoker);
	if (meld.type === 'suite') {
		if (!naturals[0]) return [];
		return [{ value, color: (naturals[0] as Piece).color }];
	}
	const taken = new Set(naturals.map((p) => p.color));
	return COLORS.filter((color) => !taken.has(color)).map((color) => ({ value, color }));
}

/** Swaps only when the joker is consumed in a formation that same turn. */
function trySwapAndUse(
	s: GameState,
	idx: number,
	meldId: string,
	jokerId: string,
	replacementId: string
): GameState | null {
	let swapped: GameState;
	try {
		swapped = swapJoker(s, idx, meldId, jokerId, replacementId);
	} catch {
		return null;
	}
	const rack = (swapped.players[idx] as NonNullable<GameState['players'][number]>).rack;
	const plan = greedyPlan(rack, [jokerId]);
	if (plan) {
		const trimmed = trimPlan(rack, [...plan], [jokerId]);
		const owner = (swapped.players[idx] as NonNullable<GameState['players'][number]>).melded;
		if (trimmed.length > 0 && leavesDiscard(rack, trimmed) && (owner || canOpenOk(trimmed))) {
			try {
				const melded = meld(swapped, idx, trimmed);
				if (
					melded.turnState.mustUsePieceIds.length === 0 &&
					(melded.players[melded.currentPlayerIndex]?.rack.length ?? 0) >= 1
				) {
					return lipiPhase(melded);
				}
			} catch {
				// fall through to the lipi attempt
			}
		}
	}
	for (const target of swapped.table.melds.filter((m) => m.owner === idx)) {
		try {
			const lipit = lipi(swapped, idx, target.id, jokerId);
			if (
				lipit.turnState.mustUsePieceIds.length === 0 &&
				(lipit.players[lipit.currentPlayerIndex]?.rack.length ?? 0) >= 1
			) {
				return lipit;
			}
		} catch {
			// try the next own meld
		}
	}
	return null;
}

function swapPhase(s0: GameState): GameState {
	let s = s0;
	const idx = s.currentPlayerIndex;
	const meldIds = s.table.melds.map((m) => m.id);
	const jokerIds = s.table.melds.map((m) => m.pieces.map((p) => p.id));
	for (let i = 0; i < meldIds.length; i++) {
		for (const jokerId of jokerIds[i] ?? []) {
			const live = s.table.melds.find((m) => m.id === meldIds[i]);
			const joker = live?.pieces.find((p) => p.id === jokerId && p.isJoker);
			if (!live || !joker) continue;
			if (s.swappedJokerIds.includes(joker.id)) continue;
			for (const sub of jokerSubstitutes(live, joker.id)) {
				const replacement = me(s).rack.find(
					(p) => !p.isJoker && p.value === sub.value && p.color === sub.color
				);
				if (!replacement) continue;
				const attempt = trySwapAndUse(s, idx, live.id, joker.id, replacement.id);
				if (attempt) {
					s = attempt;
					break;
				}
			}
		}
	}
	return s;
}

function midTurn(s0: GameState): GameState {
	let s = s0;
	if (s.turnNumber > s.players.length) {
		s = meldPhase(s);
		s = lipiPhase(s);
		s = swapPhase(s);
	}
	const rack = me(s).rack;
	if (rack.length === 0) throw new Error('an empty rack cannot end the turn');
	// An unused taken piece is not a failure: `discard` returns it to the șir or
	// the atu (interpretation #14) and ends the turn anyway.
	if (rack.length === 1) return close(s, (rack[0] as Piece).id);
	return discard(s, chooseDiscardId(rack));
}

function normalTurn(s0: GameState): GameState {
	let s = s0;
	if (!s.turnState.hasDrawn) {
		if (
			s.turnNumber === 1 &&
			s.table.sir.length === 0 &&
			s.currentPlayerIndex === s.firstPlayerIndex
		) {
			return openingDiscard(s, chooseDiscardId(me(s).rack));
		}
		s = doDraw(s);
	}
	return midTurn(s);
}

/* ------------------------------------------------------------------ *
 * Pe-tablă turns (interpretation #11: draw, keep everything, no discard)
 * ------------------------------------------------------------------ */

function peTablaTurn(entry: GameState): GameState {
	let s = entry;
	const idx = s.currentPlayerIndex;
	const player = me(s);
	const pattern = (player.peTabla as NonNullable<typeof player.peTabla>).pattern;

	if (!s.turnState.hasDrawn) {
		let drew = false;
		const last = s.table.sir.length > 1 ? (s.table.sir[s.table.sir.length - 1] as Piece) : null;
		if (last && s.table.stock.length > 0) {
			const before = cachedPattern(pattern, me(s).rack).progress;
			const after = cachedPattern(pattern, [...me(s).rack, last]).progress;
			if (after >= before) {
				try {
					s = takeLastFromSir(s);
					drew = true;
				} catch {
					drew = false;
				}
			}
		}
		if (!drew) {
			if (s.table.stock.length === 0) return entry;
			s = drawStock(s);
		}
	}

	const rack = me(s).rack;
	if (rack.length > 0 && s.turnState.mustUsePieceIds.length === 0) {
		try {
			if (cachedPattern(pattern, rack).valid) {
				return peTablaClose(s, idx, (rack[0] as Piece).id);
			}
			for (const piece of rack) {
				if (
					cachedPattern(
						pattern,
						rack.filter((p) => p.id !== piece.id)
					).valid
				) {
					return peTablaClose(s, idx, piece.id);
				}
			}
		} catch {
			// fall through to advancing the turn
		}
	}
	return nextTurn(s);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Last-resort legal line: a stock draw plus a discard, from the entry state. */
function safeFallback(entry: GameState): GameState {
	try {
		if (entry.phase !== 'playing') return entry;
		const player = entry.players[entry.currentPlayerIndex];
		if (!player) return entry;
		if (player.peTabla) return nextTurn(entry);
		if (entry.turnState.hasDrawn) {
			try {
				return midTurn(entry);
			} catch {
				return entry;
			}
		}
		if (
			entry.turnNumber === 1 &&
			entry.table.sir.length === 0 &&
			entry.currentPlayerIndex === entry.firstPlayerIndex
		) {
			try {
				return openingDiscard(entry, chooseDiscardId(player.rack));
			} catch {
				return entry;
			}
		}
		if (entry.table.stock.length === 0) return entry;
		try {
			return midTurn(drawStock(entry));
		} catch {
			return entry;
		}
	} catch {
		return entry;
	}
}

/**
 * Plays ONE full legal turn for `state.currentPlayerIndex`:
 * draw (stock preferred; last șir / atu only when immediately usable in a
 * formation; conservative șir breaks), meld respecting the round-1 and
 * first-meld rules, lipi clearly beneficial pieces, immediate-payoff joker
 * swaps, then a discard — or a close when the rack can be emptied. Pe-tablă
 * players draw and keep everything, closing on completion. Never throws on a
 * legal state: a legal draw + discard is the fallback.
 */
export function playTurn(state: GameState): GameState {
	try {
		if (state.phase !== 'playing') return state;
		const player = state.players[state.currentPlayerIndex];
		if (!player) return state;
		if (player.peTablaComplete) return state;
		if (player.peTabla) return peTablaTurn(state);
		return normalTurn(state);
	} catch {
		return safeFallback(state);
	}
}

/** First held dublă (two identical naturals), deterministic by piece id. */
function firstDuble(rack: Piece[]): Piece | null {
	const ordered = [...rack].sort((a, b) => a.id.localeCompare(b.id));
	for (const piece of ordered) {
		if (piece.isJoker) continue;
		if (
			ordered.filter((p) => !p.isJoker && p.value === piece.value && p.color === piece.color)
				.length >= 2
		) {
			return piece;
		}
	}
	return null;
}

/**
 * Drives the duble/atu pre-game phases for AI seats: offers a held dublă,
 * resolves the blind exchange, announces the atu when holding the identical
 * piece, then starts play. Safe to call repeatedly until `phase === 'playing'`.
 */
export function autoPlayPreGame(state: GameState): GameState {
	let s = state;
	if (s.phase === 'duble') {
		for (let i = 0; i < s.players.length; i++) {
			const player = s.players[i];
			if (!player) continue;
			const duble = firstDuble(player.rack);
			if (!duble) continue;
			try {
				s = offerDuble(s, i, duble.id);
			} catch {
				// seat cannot offer — leave it out of the exchange
			}
		}
		try {
			s = resolveDubleExchange(s);
		} catch {
			return s;
		}
	}
	if (s.phase === 'atu') {
		for (let i = 0; i < s.players.length; i++) {
			try {
				s = announceAtu(s, i);
			} catch {
				// seat does not hold the atu piece — no announcement
			}
		}
		try {
			s = startPlaying(s);
		} catch {
			// already playing / finished — nothing to do
		}
	}
	return s;
}

/**
 * Picks the pe-tablă pattern most worth declaring for the rack. A valid
 * (complete) board always wins — progress alone cannot distinguish it, since a
 * complete monocolor board also covers every simplu/mozaic slot. Otherwise the
 * highest `validatePattern(...).progress` wins; null when nothing looks
 * promising (best < 0.75).
 */
export function choosePeTablaPattern(rack: Piece[]): PatternType | null {
	let best: PatternType | null = null;
	let bestProgress = -1;
	let bestValid: PatternType | null = null;
	let bestValidScore = -1;
	for (const pattern of PATTERNS) {
		const result = cachedPattern(pattern, rack);
		if (result.progress > bestProgress) {
			bestProgress = result.progress;
			best = pattern;
		}
		if (result.valid) {
			const score = result.progress * 10_000 + PATTERN_BONUS[pattern];
			if (score > bestValidScore) {
				bestValidScore = score;
				bestValid = pattern;
			}
		}
	}
	if (bestValid) return bestValid;
	return bestProgress >= PATTERN_PROMISE_THRESHOLD ? best : null;
}
