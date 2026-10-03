import { json } from '@sveltejs/kit';
import {
	getRoom,
	joinRoom,
	startGame,
	restartGame,
	closeRoom,
	pingPlayer,
	saveGameState,
	resetStaleGameState,
	createNextGame
} from '$lib/server/roomService';
import { createSession, verifySession, destroySession, sanitizeName } from '$lib/server/auth';
import {
	announceAtu,
	breakSir,
	canStricaJocul,
	close,
	declarePeTabla,
	discard,
	drawStock,
	endByStockOut,
	lipi,
	meld,
	offerDuble,
	openingDiscard,
	peTablaClose,
	resolveDubleExchange,
	startPlaying,
	stricaJocul,
	swapJoker,
	takeAtu,
	takeLastFromSir,
	withdrawDuble
} from '$lib/engine/remi/actions';
import type { GameState, PatternType } from '$lib/engine/remi/types';
import type { RemiIntent } from '$lib/stores/remi/roomStore';

export async function GET({ params, url }) {
	const room = await getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (room.gameState && (room.gameState as GameState).schemaVersion !== 3) {
		await resetStaleGameState(params.code);
		const refreshed = await getRoom(params.code);
		return json(refreshed);
	}
	const playerId = url.searchParams.get('playerId');
	if (playerId) await pingPlayer(params.code, playerId);
	return json(room);
}

export async function PATCH({ params, request }) {
	const { action, playerId, playerName, sessionToken } = await request.json();
	const code = params.code;

	switch (action) {
		case 'join': {
			if (typeof playerName !== 'string' || sanitizeName(playerName).length === 0) {
				return json({ error: 'Name required' }, { status: 400 });
			}
			const result = await joinRoom(code, sanitizeName(playerName));
			if ('error' in result) return json(result, { status: 400 });
			const token = await createSession(result.playerId);
			return json({ ...result, sessionToken: token });
		}
		case 'start': {
			if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await startGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'restart': {
			if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await restartGame(code, playerId);
			if (result.error) return json(result, { status: 400 });
			return json({ ok: true });
		}
		case 'close': {
			if (!playerId || !sessionToken) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
			const result = await closeRoom(code, playerId, sessionToken);
			if (result.error) return json(result, { status: 400 });
			await destroySession(playerId);
			return json({ ok: true });
		}
		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}
}

/* ------------------------------------------------------------------ *
 * Intent-based play (Remi Etalat). The server never trusts client state:
 * the client sends an intent + baseRevision, the server applies the matching
 * engine action to the STORED state and returns the authoritative result.
 * ------------------------------------------------------------------ */

/** Intents any room member may send (no turn ownership). */
const ANY_MEMBER_INTENTS = new Set(['duble-resolve', 'start-playing', 'next-game']);
/** Pre-play intents acting on the sender's own seat (no turn concept yet). */
const OWN_SEAT_INTENTS = new Set(['duble-offer', 'duble-withdraw', 'strica', 'atu-announce']);

const PATTERNS: PatternType[] = ['simplu', 'bete', 'mozaic', 'bicolor', 'duble', 'monocolor'];

function needPieceId(intent: RemiIntent & { pieceId?: unknown }): string {
	if (typeof intent.pieceId !== 'string' || intent.pieceId.length === 0) {
		throw new Error('pieceId required');
	}
	return intent.pieceId;
}

function applyIntent(stored: GameState, senderIndex: number, intent: RemiIntent): GameState {
	switch (intent.kind) {
		case 'duble-offer':
			return offerDuble(stored, senderIndex, needPieceId(intent));
		case 'duble-withdraw':
			return withdrawDuble(stored, senderIndex);
		case 'duble-resolve':
			return resolveDubleExchange(stored);
		case 'strica': {
			if (stored.phase !== 'duble')
				throw new Error('the duble exchange happens before play starts');
			if (!canStricaJocul(stored, senderIndex)) {
				throw new Error('you need at least 3 duble to strica jocul');
			}
			const fresh = stricaJocul({ playerCount: stored.players.length as 2 | 3 | 4 });
			fresh.sessionTotals = [...stored.sessionTotals];
			fresh.firstPlayerIndex = stored.firstPlayerIndex;
			fresh.currentPlayerIndex = stored.firstPlayerIndex;
			fresh.turnStartedAt = Date.now();
			return fresh;
		}
		case 'atu-announce':
			return announceAtu(stored, senderIndex);
		case 'start-playing': {
			const next = startPlaying(stored);
			next.turnStartedAt = Date.now();
			return next;
		}
		case 'next-game': {
			if (stored.phase !== 'finished') throw new Error('the game is not over yet');
			return createNextGame(stored);
		}
		case 'opening-discard':
			return openingDiscard(stored, needPieceId(intent));
		case 'draw-stock': {
			// The engines leave empty-stock games to the caller (spec §1.8).
			if (stored.table.stock.length === 0) return endByStockOut(stored);
			return drawStock(stored);
		}
		case 'take-last':
			return takeLastFromSir(stored);
		case 'take-atu':
			return takeAtu(stored);
		case 'break-sir':
			return breakSir(stored, needPieceId(intent));
		case 'meld': {
			if (!Array.isArray(intent.formations) || intent.formations.length === 0) {
				throw new Error('there are no formations to meld');
			}
			const rack = stored.players[senderIndex]?.rack ?? [];
			const formations = intent.formations.map((formation) => {
				if (formation.type !== 'suite' && formation.type !== 'terta') {
					throw new Error('invalid formation');
				}
				if (!Array.isArray(formation.pieceIds) || formation.pieceIds.length === 0) {
					throw new Error('invalid formation');
				}
				const pieces = formation.pieceIds.map((id) => {
					const piece = rack.find((candidate) => candidate.id === id);
					if (!piece) throw new Error('that piece is not on your rack');
					return piece;
				});
				return { type: formation.type, pieces };
			});
			return meld(stored, senderIndex, formations);
		}
		case 'lipi': {
			if (typeof intent.meldId !== 'string' || !intent.meldId) throw new Error('meldId required');
			return lipi(stored, senderIndex, intent.meldId, needPieceId(intent));
		}
		case 'swap-joker': {
			if (typeof intent.meldId !== 'string' || !intent.meldId) throw new Error('meldId required');
			if (typeof intent.jokerPieceId !== 'string' || !intent.jokerPieceId) {
				throw new Error('jokerPieceId required');
			}
			if (typeof intent.replacementPieceId !== 'string' || !intent.replacementPieceId) {
				throw new Error('replacementPieceId required');
			}
			return swapJoker(
				stored,
				senderIndex,
				intent.meldId,
				intent.jokerPieceId,
				intent.replacementPieceId
			);
		}
		case 'discard':
			return discard(stored, needPieceId(intent));
		case 'close':
			return close(stored, needPieceId(intent));
		case 'declare-pe-tabla': {
			if (!PATTERNS.includes(intent.pattern as PatternType)) throw new Error('unknown pattern');
			return declarePeTabla(stored, senderIndex, intent.pattern);
		}
		case 'pe-tabla-close':
			return peTablaClose(stored, senderIndex, needPieceId(intent));
		default:
			throw new Error('Unknown intent');
	}
}

export async function PUT({ params, request }) {
	const { playerId, sessionToken, baseRevision, intent } = await request.json();
	if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}
	const room = await getRoom(params.code);
	if (!room) return json({ error: 'Room not found' }, { status: 404 });
	if (!room.players.some((p) => p.id === playerId)) {
		return json({ error: 'Not a player in this room' }, { status: 403 });
	}
	if (room.gameState && (room.gameState as GameState).schemaVersion !== 3) {
		await resetStaleGameState(params.code);
		return json({ error: 'state reset' }, { status: 409 });
	}
	const stored = room.gameState;
	if (!stored) return json({ error: 'No game in progress' }, { status: 400 });
	if (typeof baseRevision !== 'number' || baseRevision !== stored.revision) {
		return json({ error: 'Revision mismatch', gameState: stored }, { status: 409 });
	}
	const typed = intent as RemiIntent | null;
	if (!typed || typeof typed.kind !== 'string') {
		return json({ error: 'intent required' }, { status: 400 });
	}
	const senderIndex = room.players.findIndex((p) => p.id === playerId);
	if (
		!ANY_MEMBER_INTENTS.has(typed.kind) &&
		!OWN_SEAT_INTENTS.has(typed.kind) &&
		senderIndex !== stored.currentPlayerIndex
	) {
		return json({ error: 'Not your turn' }, { status: 403 });
	}
	let next: GameState;
	try {
		next = applyIntent(stored, senderIndex, typed);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Invalid intent' }, { status: 400 });
	}
	await saveGameState(params.code, next);
	return json({ ok: true, revision: next.revision, gameState: next });
}
