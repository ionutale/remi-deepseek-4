/**
 * Remi Etalat — solo game store (human vs. AI, one seat: player 0).
 *
 * The engine is pure and the AI plays whole turns (`playTurn`), so this store is
 * a thin orchestration layer:
 *
 *  1. every human action runs through the real engine action — no rule lives here;
 *  2. an engine rejection becomes a Romanian message in `soloError` (one central
 *     dictionary, generic fallback);
 *  3. whenever the turn actually passes to the AI seats, `playTurn` runs until
 *     seat 0 is up again (or the game is over), bounded by a safety cap so a
 *     pathological board can never hang the UI.
 *
 * The pre-game phases are human-driven: the AI seats offer duble immediately and
 * announce atu as soon as the phase allows it, but only the human presses
 * "Continuă" — the same two steps the panel copy describes.
 */

import { get, writable, type Writable } from 'svelte/store';
import {
	announceAtu,
	breakSir,
	canStricaJocul,
	close,
	createGame,
	declarePeTabla,
	discard,
	drawStock,
	endByStockOut,
	lipi,
	meld,
	offerDuble,
	nextTurn,
	openingDiscard,
	peTablaClose,
	REASON,
	resolveDubleExchange,
	startPlaying,
	stricaJocul,
	swapJoker,
	takeAtu,
	takeLastFromSir,
	withdrawDuble
} from '$lib/engine/remi/actions';
import { playTurn } from '$lib/engine/remi/ai';
import { firstDuble, isSamePiece } from '$lib/engine/remi/pieces';
import type { FormationType, GameState, PatternType, Piece } from '$lib/engine/remi/types';

/** The human always sits at index 0; every AI seat is 1..n-1. */
export const HUMAN_INDEX = 0;

/** Upper bound on AI turns played after one human action. Never reached in practice. */
const MAX_AI_TURNS = 200;

/** Engine reason strings → Romanian copy deck (spec §4). */
export const SOLO_ERROR_COPY: Record<string, string> = {
	// setup / phases
	[REASON.unknownPlayer]: 'Jucător necunoscut.',
	[REASON.notDublePhase]: 'Schimbul de duble se face înainte de începerea jocului.',
	[REASON.notAtuPhase]: 'Anunțul de atu se face înainte de începerea jocului.',
	[REASON.alreadyOver]: 'Jocul s-a terminat.',
	[REASON.notPlaying]: 'Jocul nu este în desfășurare.',
	'you need at least 3 duble to strica jocul': 'Ai nevoie de cel puțin 3 duble ca să strici jocul.',
	// duble
	[REASON.noDuble]: 'Trebuie să ai ambele copii ale piesei ca să o oferi.',
	[REASON.jokerCannotBeOffered]: 'Un joker nu poate fi oferit ca dublă.',
	[REASON.noOffer]: 'Nu ai nicio dublă oferită.',
	// atu
	[REASON.noAtu]: 'Nu mai este atu de luat.',
	[REASON.noAtuPiece]: 'Nu ai piesa identică cu atuul.',
	[REASON.alreadyAnnounced]: 'Ai anunțat deja atu.',
	// turn structure
	[REASON.notYourTurn]: 'Nu este rândul tău.',
	[REASON.notTheOpening]: 'Prima aruncare o face doar jucătorul care începe.',
	[REASON.noDrawOnOpening]: 'Prima tură este doar o aruncare — nu se trage piesă.',
	[REASON.drawFirst]: 'Trage mai întâi o piesă.',
	[REASON.alreadyDrew]: 'Ai tras deja o piesă în această tură.',
	[REASON.stockIsEmpty]: 'Grămada este goală.',
	[REASON.pieceNotInRack]: 'Piesa aceea nu se află pe tabla ta.',
	// melding
	[REASON.noMeldsFirstRound]: 'Etalarea începe după ce s-a încheiat prima tură.',
	[REASON.noMeldsToDeclare]: 'Nu ai nicio formație de etalat.',
	[REASON.invalidFormation]: 'Formație invalidă.',
	[REASON.firstMeldRejected]: 'Prima etalare a fost respinsă.',
	[REASON.pieceUsedTwice]: 'O piesă poate fi folosită o singură dată.',
	[REASON.notMeldedYet]: 'Trebuie să te etalezi înainte să rupi șirul.',
	[REASON.rackTooSmallToBreak]: 'Ai nevoie de cel puțin 3 piese pe tablă ca să rupi șirul.',
	[REASON.noComposersBreak]: 'Ai nevoie de piese pe tablă ca să compui o formație cu piesa ruptă.',
	// lipire
	[REASON.notMeldedToLipi]: 'Trebuie să te etalezi înainte să lipești.',
	[REASON.meldNotFound]: 'Formația nu mai există pe masă.',
	[REASON.lipiTooEarly]: 'Nu poți lipi la o formație a unui adversar încă.',
	[REASON.jokerCannotLipit]: 'Jokerii nu pot fi lipiți la formațiile adversarilor.',
	// joker swap
	[REASON.jokerNotInMeld]: 'Jokerul respectiv nu se află în acea formație.',
	[REASON.jokerAlreadySwapped]: 'Jokerul respectiv a fost deja înlocuit o dată.',
	[REASON.jokerInIncompleteTerta]: 'Jokerul nu poate fi folosit până când terța nu se completează.',
	[REASON.jokerNotTertaCompleter]: 'Doar jucătorul care a completat terța poate folosi jokerul.',
	[REASON.wrongReplacement]:
		'Înlocuirea trebuie făcută cu piesa exactă pe care o substituie jokerul.',
	// discards / closing
	[REASON.mustUseTakenPiece]: 'Folosește piesa luată într-o formație înainte să arunci.',
	[REASON.peTablaNoDiscard]: 'Un jucător pe tablă nu aruncă piese.',
	[REASON.mustDiscardLast]: 'Poți închide doar aruncând ultima piesă de pe tablă.',
	[REASON.notMeldedToClose]: 'Trebuie să te etalezi înainte să închizi.',
	// pe tablă
	[REASON.peTablaAlreadyDeclared]: 'Ai declarat deja jocul pe tablă.',
	[REASON.peTablaWindowClosed]: 'Fereastra de declarare pe tablă s-a închis.',
	[REASON.peTablaAfterMeld]: 'Nu poți declara pe tablă după ce te-ai etalat.',
	[REASON.peTablaNotDeclared]: 'Nu ai declarat joc pe tablă.',
	[REASON.peTablaBoardIncomplete]: 'Modelul de pe tabla ta nu este încă complet.',
	[REASON.peTablaCannotMeld]: 'Un jucător pe tablă nu etalează.',
	[REASON.peTablaCannotBreak]: 'Un jucător pe tablă nu rupe șirul.',
	[REASON.peTablaCannotLipit]: 'Un jucător pe tablă nu lipește la adversari.',
	[REASON.peTablaCannotSwapJoker]: 'Un jucător pe tablă nu folosește jokerii de pe masă.',
	[REASON.peTablaAlreadyComplete]: 'Modelul tău pe tablă este deja complet.',
	// formations (raised through `analyzeFormation` during `meld` / `lipi`)
	'at least 3 pieces': 'Ai nevoie de cel puțin 3 piese.',
	'all pieces must share one colour': 'Toate piesele trebuie să aibă aceeași culoare (suită).',
	'values must be consecutive': 'Valorile trebuie să fie consecutive.',
	'the 1 can only be used in 1-2-3 or 12-13-1':
		'Piesa 1 poate fi folosită doar în 1-2-3 sau 12-13-1.',
	'all natural pieces must share one value':
		'Toate piesele trebuie să aibă aceeași valoare (terță).',
	'terta colours must differ': 'Culorile terței trebuie să fie diferite.',
	'max 2 jokers': 'Maxim 2 jokeri într-o formație.',
	'a joker needs at least 2 natural pieces': 'Un joker are nevoie de cel puțin 2 piese naturale.',
	'two jokers need at least 4 natural pieces':
		'Doi jokeri au nevoie de cel puțin 4 piese naturale.',
	'two jokers cannot be adjacent': 'Cei doi jokeri nu pot fi alăturați.',
	// first meld (raised through `canOpen` during `meld`)
	'first meld not valid': 'Prima etalare conține o formație invalidă.',
	'first meld needs at least 45 points': 'Prima etalare are nevoie de 45 de puncte și o suită.',
	'first meld needs at least one suite': 'Prima etalare are nevoie de 45 de puncte și o suită.',
	// șir (table.ts)
	'the sir is empty': 'Șirul este gol.',
	'the first piece of the sir can never be taken':
		'Prima piesă a șirului nu poate fi luată niciodată.',
	[REASON.sir.pieceNotInSir]: 'Piesa aceea nu se află în șir.',
	// store-level
	noGame: 'Nu există niciun joc în desfășurare.',
	'the current game is not finished': 'Jocul curent nu s-a terminat.'
};

const GENERIC_ERROR = 'Mutație invalidă.';

/** Maps any thrown value to Romanian copy; never leaks a raw engine string. */
function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return SOLO_ERROR_COPY[message] ?? GENERIC_ERROR;
}

/** The engine state, or null when no solo game is running. */
export const soloState: Writable<GameState | null> = writable(null);

/** The last rejected action, in Romanian. Cleared on every successful action. */
export const soloError: Writable<string | null> = writable(null);

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/**
 * Runs `fn` against the current state. On rejection the state is left untouched
 * and the reason lands in `soloError`; on success the error is cleared.
 */
function act(fn: (state: GameState) => GameState): void {
	soloState.update((state) => {
		if (!state) {
			soloError.set(SOLO_ERROR_COPY.noGame ?? GENERIC_ERROR);
			return null;
		}
		try {
			const next = fn(state);
			soloError.set(null);
			return next;
		} catch (error) {
			soloError.set(errorMessage(error));
			return state;
		}
	});
}

/** Runs an engine action on a throwaway call and reports whether it was legal. */
function isLegal(attempt: () => GameState): boolean {
	try {
		attempt();
		return true;
	} catch {
		return false;
	}
}

/**
 * Whether the player on turn still has a legal draw: stock, last șir piece, atu,
 * or (for an etalat player) a șir break. When none is left the game is over.
 */
function hasLegalDraw(state: GameState): boolean {
	if (state.phase !== 'playing') return true;
	if (state.turnState.hasDrawn) return true;

	if ([drawStock, takeLastFromSir, takeAtu].some((action) => isLegal(() => action(state)))) {
		return true;
	}

	const player = state.players[state.currentPlayerIndex];
	if (!player || player.peTabla || !player.melded || player.rack.length < 3) return false;
	// `sir[0]` is dead, so only the later pieces can ever be broken.
	return state.table.sir.slice(1).some((piece) => isLegal(() => breakSir(state, piece.id)));
}

/**
 * Ends the game when the player on turn can no longer draw at all — spec §1.8:
 * the stock running out ends the game and nobody gets the closing bonus.
 */
function exhaustStock(state: GameState): GameState {
	if (hasLegalDraw(state)) return state;
	return endByStockOut(state);
}

/** Plays every AI seat out until the human is on turn again (or the game ends). */
function runAiTurns(state: GameState): GameState {
	let current = state;
	let guard = 0;
	while (
		current.phase === 'playing' &&
		current.currentPlayerIndex !== HUMAN_INDEX &&
		guard < MAX_AI_TURNS
	) {
		const before = current.revision;
		current = playTurn(current);
		// `playTurn` returns the entry state when it cannot find any legal line:
		// stop rather than spin on an unmovable seat.
		if (current.revision === before) break;
		guard++;
	}
	return exhaustStock(current);
}

/**
 * A draw action. A pe-tablă player's draw ends their turn (interpretation #11),
 * so the AI seats play immediately; for a normal player the turn continues.
 */
function actAndAdvanceIfPeTabla(fn: (state: GameState) => GameState): void {
	act((state) => {
		const drawn = fn(state);
		const player = state.players[HUMAN_INDEX];
		return player?.peTabla ? runAiTurns(nextTurn(drawn)) : drawn;
	});
}

/** Human action that hands the turn over: run the AI seats, then check the stock. */
function actAndAdvance(fn: (state: GameState) => GameState): void {
	act((state) => {
		const next = fn(state);
		return next.phase === 'playing' ? runAiTurns(next) : next;
	});
}

/** The pieces of the human rack matching `pieceIds`, in the given order. */
function piecesOf(state: GameState, pieceIds: string[]): Piece[] {
	const rack = state.players[HUMAN_INDEX]?.rack ?? [];
	return pieceIds.map((id) => {
		const piece = rack.find((candidate) => candidate.id === id);
		if (!piece) throw new Error(REASON.pieceNotInRack);
		return piece;
	});
}

/**
 * Every AI seat puts a dublă up straight away, without revealing values — the
 * blind exchange pairs them by category inside the engine.
 */
function aiOfferDuble(state: GameState): GameState {
	let current = state;
	for (let seat = 1; seat < current.players.length; seat++) {
		const duble = firstDuble(current.players[seat]?.rack ?? []);
		if (!duble) continue;
		try {
			current = offerDuble(current, seat, duble.id);
		} catch {
			// A seat that cannot offer simply stays out of the exchange.
		}
	}
	return current;
}

/** Every AI seat holding the identical piece announces atu (+50). */
function aiAnnounceAtu(state: GameState): GameState {
	let current = state;
	for (let seat = 1; seat < current.players.length; seat++) {
		try {
			current = announceAtu(current, seat);
		} catch {
			// The seat does not hold the atu piece — no announcement.
		}
	}
	return current;
}

/** A fresh deal (or a redeal via `stricaJocul`), AI duble offers already in place. */
function prepare(dealt: GameState, sessionTotals?: number[], firstPlayerIndex?: number): GameState {
	return aiOfferDuble({
		...dealt,
		...(sessionTotals ? { sessionTotals: [...sessionTotals] } : {}),
		...(firstPlayerIndex === undefined ? {} : { firstPlayerIndex })
	});
}

/* ------------------------------------------------------------------ *
 * Pre-game
 * ------------------------------------------------------------------ */

/** Deals a brand new solo game and seats the AI duble offers. */
export function startSoloGame(playerCount: 2 | 3 | 4): void {
	try {
		soloError.set(null);
		soloState.set(prepare(createGame({ playerCount })));
	} catch (error) {
		soloError.set(errorMessage(error));
	}
}

/** Puts one of the human's duble up for the blind exchange. */
export function soloOfferDuble(pieceId: string): void {
	act((state) => offerDuble(state, HUMAN_INDEX, pieceId));
}

/** Takes the human's standing offer back. */
export function soloWithdrawDuble(): void {
	act((state) => withdrawDuble(state, HUMAN_INDEX));
}

/** Cancels the deal and redeals — available with 3+ duble held. */
export function soloStrica(): void {
	act((state) => {
		// The same gate the server enforces: the human must hold 3 dube.
		if (!canStricaJocul(state, HUMAN_INDEX)) {
			throw new Error('you need at least 3 duble to strica jocul');
		}
		const playerCount = state.players.length as 2 | 3 | 4;
		return prepare(stricaJocul({ playerCount }), state.sessionTotals);
	});
}

/** Whether the human may offer "strica jocul" right now. */
export function soloCanStrica(state: GameState | null): boolean {
	if (!state) return false;
	try {
		return canStricaJocul(state, HUMAN_INDEX);
	} catch {
		return false;
	}
}

/**
 * Whether the human holds the piece identical to the atu — the only case where
 * the announcement is legal (and worth +50).
 */
export function canAnnounceAtu(state: GameState | null): boolean {
	if (!state || state.phase !== 'atu') return false;
	const atu = state.table.atu;
	if (!atu || atu.isJoker) return false;
	const player = state.players[HUMAN_INDEX];
	if (!player || player.announcedAtu) return false;
	return player.rack.some((piece) => isSamePiece(piece, atu));
}

/** Runs the blind exchange and moves to the atu phase, AI announcements included. */
export function soloResolveDuble(): void {
	act((state) => aiAnnounceAtu(resolveDubleExchange(state)));
}

/** Human atu announcement (+50 if they hold the identical piece). */
export function soloAnnounceAtu(): void {
	act((state) => announceAtu(state, HUMAN_INDEX));
}

/** Starts play. The AI runs first when the opening seat is not the human's. */
export function soloStartPlaying(): void {
	act((state) => {
		const started = startPlaying(state);
		return started.currentPlayerIndex === HUMAN_INDEX ? started : runAiTurns(started);
	});
}

/* ------------------------------------------------------------------ *
 * Turn actions
 * ------------------------------------------------------------------ */

/** Turn 1: the opener discards without drawing; that piece is dead forever. */
export function soloOpeningDiscard(pieceId: string): void {
	actAndAdvance((state) => openingDiscard(state, pieceId));
}

/**
 * Draws from the stock (the grămadă).
 *
 * A pe-tablă player draws once per turn and keeps everything (interpretation
 * #11), so for them the draw IS the end of the turn; a normal player still has
 * to meld/discard before the AI seats move.
 */
export function soloDrawStock(): void {
	actAndAdvanceIfPeTabla((state) => drawStock(state));
}

/** Takes the last piece of the șir — melded this same turn, or kept on a board. */
export function soloTakeLast(): void {
	actAndAdvanceIfPeTabla((state) => takeLastFromSir(state));
}

/** Takes the atu off the table — melded this same turn, or kept on a board. */
export function soloTakeAtu(): void {
	actAndAdvanceIfPeTabla((state) => takeAtu(state));
}

/** Breaks the șir: the piece and everything after it come to the rack. */
export function soloBreakSir(pieceId: string): void {
	act((state) => breakSir(state, pieceId));
}

/** Etalează one or more formations built from the human's rack. */
export function soloMeld(formations: { type: FormationType; pieceIds: string[] }[]): void {
	act((state) =>
		meld(
			state,
			HUMAN_INDEX,
			formations.map((formation) => ({
				type: formation.type,
				pieces: piecesOf(state, formation.pieceIds)
			}))
		)
	);
}

/** Lipire: extends any table formation (own or opponents') with a rack piece. */
export function soloLipi(meldId: string, pieceId: string): void {
	act((state) => lipi(state, HUMAN_INDEX, meldId, pieceId));
}

/** Replaces a table joker with the exact piece it substitutes. */
export function soloSwapJoker(
	meldId: string,
	jokerPieceId: string,
	replacementPieceId: string
): void {
	act((state) => swapJoker(state, HUMAN_INDEX, meldId, jokerPieceId, replacementPieceId));
}

/** Ends the human turn by laying a piece on the șir. */
export function soloDiscard(pieceId: string): void {
	actAndAdvance((state) => discard(state, pieceId));
}

/** Closes the game: the last rack piece is the closing piece. */
export function soloClose(pieceId: string): void {
	actAndAdvance((state) => close(state, pieceId));
}

/* ------------------------------------------------------------------ *
 * Pe tablă
 * ------------------------------------------------------------------ */

/** Declares "joc pe tablă" for a model, inside the first three turns. */
export function soloDeclarePeTabla(pattern: PatternType): void {
	act((state) => declarePeTabla(state, HUMAN_INDEX, pattern));
}

/** Closes with a completed board; `pieceId` is the single piece outside it. */
export function soloPeTablaClose(pieceId: string): void {
	actAndAdvance((state) => peTablaClose(state, HUMAN_INDEX, pieceId));
}

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

/**
 * Deals the next game in the session: session totals carry over and the previous
 * game's winner opens (interpretation #9 — single game per score).
 */
export function soloNextGame(): void {
	act((state) => {
		// Only once the current game has ended — a mid-game call would
		// throw away all the progress on the table.
		if (state.phase !== 'finished') {
			throw new Error('the current game is not finished');
		}
		const playerCount = state.players.length as 2 | 3 | 4;
		// Single game per score: the previous winner opens the next one.
		return prepare(createGame({ playerCount }), state.sessionTotals, state.gameWinner ?? 0);
	});
}

/** Leaves the table: clears the game and any pending error. */
export function soloReset(): void {
	soloState.set(null);
	soloError.set(null);
}

/** Convenience for pages that need the state outside a component. */
export function getSoloState(): GameState | null {
	return get(soloState);
}
