<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TableView, {
		type OpponentInfo,
		type SwapTarget
	} from '$lib/components/remi/TableView.svelte';
	import MeldBuilder, { type PendingFormation } from '$lib/components/remi/MeldBuilder.svelte';
	import DublePanel from '$lib/components/remi/DublePanel.svelte';
	import AtuPanel from '$lib/components/remi/AtuPanel.svelte';
	import PeTablaPanel from '$lib/components/remi/PeTablaPanel.svelte';
	import EndGameSheet from '$lib/components/remi/EndGameSheet.svelte';
	import { canStricaJocul } from '$lib/engine/remi/actions';
	import { analyzeFormation } from '$lib/engine/remi/formations';
	import { validatePattern } from '$lib/engine/remi/patterns';
	import { COLORS, isSamePiece } from '$lib/engine/remi/pieces';
	import type { Color, PatternType, Piece } from '$lib/engine/remi/types';
	import {
		getStoredRemiSession,
		hydrateRemiRoom,
		joinRemiRoom,
		leaveRemiRoom,
		nextRemiGame,
		remiConnectionLost,
		remiError,
		remiGameState,
		remiPlayerId,
		remiRoom,
		remiStatus,
		resetRemi,
		sendRemiIntent,
		startRemiGame,
		stopRemiPolling,
		type RemiIntent
	} from '$lib/stores/remi/roomStore';
	import { recordResult } from '$lib/stores/matchStore';

	/** Mirrors `TURN_TIMEOUT_MS` in the room service — expired turns are auto-played. */
	const TURN_TIMEOUT_MS = 120_000;
	const RECONNECTING = 'Se reconectează…';
	const CONFLICT_NOTICE = 'Starea s-a actualizat — încearcă din nou';
	const GENERIC_ERROR = 'Acțiune respinsă — încearcă din nou.';
	/** A conflict/rejection banner must not outlive the turn it refers to. */
	const NOTICE_TTL_MS = 6000;

	/**
	 * Engine + API reason strings (stable English, see `REASON` in the engine)
	 * mapped to the Romanian copy deck (spec §4).
	 */
	const RO_ERROR: Record<string, string> = {
		// setup / phases
		'unknown player': 'Jucător necunoscut.',
		'the duble exchange happens before play starts':
			'Schimbul de duble are loc înainte de începerea jocului.',
		'the atu announcement happens before play starts':
			'Anunțul de atu are loc înainte de începerea jocului.',
		'the game is already over': 'Jocul s-a terminat deja.',
		'the game is not in play': 'Jocul nu este în desfășurare.',
		'you must hold both copies of that piece to offer it':
			'Trebuie să deții ambele piese identice ca să o oferi.',
		'a joker cannot be offered as a duble': 'Jokerul nu poate fi oferit la schimb.',
		'that player has no duble on offer': 'Acel jucător nu are nicio dublă oferită.',
		'there is no atu to take': 'Nu mai există atu pe masă.',
		'you do not hold a piece identical to the atu': 'Nu deții piesa identică cu atuul.',
		'you have already announced the atu': 'Ai anunțat deja atuul.',
		'you need at least 3 duble to strica jocul':
			'Ai nevoie de cel puțin 3 duble ca să strici jocul.',
		// turn structure
		'it is not your turn': 'Nu este rândul tău.',
		'Not your turn': 'Nu este rândul tău.',
		'only the opening player can open the game':
			'Doar jucătorul care deschide jocul poate face prima aruncare.',
		'draw first': 'Trage întâi o piesă.',
		'you already drew this turn': 'Ai tras deja o piesă în această tură.',
		'stock is empty': 'Grămada este goală.',
		'that piece is not on your rack': 'Piesa nu este pe tabla ta.',
		'the sir is empty': 'Șirul este gol.',
		'the first piece of the sir can never be taken': 'Prima piesă din șir nu poate fi luată.',
		'the piece is not in the sir': 'Piesa nu mai este în șir.',
		'meld not found': 'Formația nu mai există pe masă.',
		// etalare
		'melding starts after the first round': 'Etalarea începe abia după prima tură.',
		'there are no formations to meld': 'Nu ai nicio formație de etalat.',
		'invalid formation': 'Formație invalidă.',
		'first meld rejected': 'Prima etalare are nevoie de 45 de puncte și o suită.',
		'first meld not valid': 'Formația pentru prima etalare nu este validă.',
		'first meld needs at least 45 points': 'Prima etalare are nevoie de 45 de puncte.',
		'first meld needs at least one suite': 'Prima etalare are nevoie de o suită.',
		'a piece can only be used once': 'O piesă poate fi folosită o singură dată.',
		'you must meld before breaking the sir': 'Trebuie să etalezi înainte de a rupe șirul.',
		'you need at least 3 pieces on the rack to break the sir':
			'Ai nevoie de cel puțin 3 piese pe tablă ca să rupi șirul.',
		'you need pieces on the rack to compose a formation with it':
			'Nu ai piese cu care să compui o formație cu piesa ruptă.',
		// lipire
		'you must meld before you can lipi': 'Trebuie să etalezi înainte de a lipi.',
		'you cannot lipi to an opponent meld yet': 'Nu poți lipi la adversari încă.',
		'jokers cannot be lipit to opponents melds': 'Jokerii nu se lipesc la formațiile adversarilor.',
		// joker swap
		'that joker is not in that meld': 'Acel joker nu mai este în formație.',
		'that joker was already swapped': 'Acel joker a fost deja înlocuit o dată.',
		'the joker cannot be used until the terta is completed':
			'Jokerul poate fi folosit abia când terța este completă.',
		'the replacement must be the exact piece the joker substitutes':
			'Înlocuirea trebuie să fie exact piesa pe care o reprezintă jokerul.',
		// aruncare / închidere
		'you must use the taken piece in a formation this turn':
			'Folosește piesa luată într-o formație înainte să arunci.',
		'a pe tabla player does not discard': 'Un jucător pe tablă nu aruncă piese.',
		'you can only close by discarding your last piece': 'Poți închide doar aruncând ultima piesă.',
		// pe tablă
		'you have already declared pe tabla': 'Ai declarat deja joc pe tablă.',
		'the pe tabla window has closed': 'Fereastra de declarare (primele 3 ture) s-a închis.',
		'you cannot declare pe tabla after melding': 'Nu mai poți declara pe tablă după etalare.',
		'you have not declared pe tabla': 'Nu ai declarat joc pe tablă.',
		'the pattern on your board is not complete yet': 'Modelul de pe tablă nu este complet.',
		'a pe tabla player never melds': 'Un jucător pe tablă nu etalează niciodată.',
		'a pe tabla player never breaks the sir': 'Un jucător pe tablă nu rupe șirul niciodată.',
		'a pe tabla player cannot lipi to opponents':
			'Un jucător pe tablă nu poate lipi la formațiile adversarilor.',
		'a pe tabla player cannot use table jokers':
			'Un jucător pe tablă nu poate folosi jokerii de pe masă.',
		'your pe tabla pattern is already complete': 'Modelul tău este deja complet.',
		// formații
		'at least 3 pieces': 'Ai nevoie de cel puțin 3 piese.',
		'all pieces must share one colour': 'Toate piesele trebuie să aibă aceeași culoare (suită).',
		'values must be consecutive': 'Valorile trebuie să fie consecutive.',
		'the 1 can only be used in 1-2-3 or 12-13-1':
			'Piesa 1 poate fi folosită doar în 1-2-3 sau 12-13-1.',
		'all natural pieces must share one value':
			'Toate piesele naturale trebuie să aibă aceeași valoare (terță).',
		'terta colours must differ': 'Culorile terței trebuie să fie diferite.',
		'max 2 jokers': 'Maxim 2 jokeri într-o formație.',
		'a joker needs at least 2 natural pieces': 'Un joker are nevoie de cel puțin 2 piese naturale.',
		'two jokers need at least 4 natural pieces':
			'Doi jokeri au nevoie de cel puțin 4 piese naturale.',
		'two jokers cannot be adjacent': 'Cei doi jokeri nu pot fi alături.',
		// API
		'Revision mismatch': CONFLICT_NOTICE,
		'state reset': 'Starea jocului a fost resetată.',
		Unauthorized: 'Nu ai dreptul să faci această acțiune.',
		'Room not found': 'Camera nu mai există.',
		'Not a player in this room': 'Nu ești jucător în această cameră.',
		'No game in progress': 'Jocul nu a început încă.',
		'Only owner can start': 'Doar gazda poate începe jocul.',
		'Need at least 2 players': 'Sunt necesari cel puțin 2 jucători.',
		'Game already started': 'Jocul a început deja.',
		'Room is full': 'Camera este plină.',
		'Name required': 'Numele este obligatoriu.',
		'Unknown intent': 'Acțiune necunoscută.',
		'intent required': 'Acțiune lipsă.',
		'pieceId required': 'Alege o piesă.',
		'meldId required': 'Alege formația.',
		'jokerPieceId required': 'Alege jokerul.',
		'replacementPieceId required': 'Alege piesa de înlocuire.',
		'No room loaded': 'Camera nu este încărcată.',
		'Game not finished': 'Jocul nu s-a terminat încă.',
		'No winner': 'Nu există un câștigător.',
		'Only 1v1 matches are rated': 'Doar meciurile 1 vs 1 sunt punctate.',
		'Result not recorded': 'Rezultatul nu a putut fi înregistrat.',
		'Failed to record match result': 'Rezultatul nu a putut fi înregistrat.'
	};

	function roError(message?: string | null): string {
		if (!message) return GENERIC_ERROR;
		return RO_ERROR[message] ?? GENERIC_ERROR;
	}

	// ---------- Room identity ----------
	let code = $derived(($page.params.code ?? '').toUpperCase());
	let joined = $derived($remiRoom !== null && $remiRoom.code.toUpperCase() === code);
	let myIndex = $derived(
		$remiRoom && $remiPlayerId ? $remiRoom.players.findIndex((p) => p.id === $remiPlayerId) : -1
	);
	let isOwner = $derived($remiRoom !== null && $remiRoom.ownerId === $remiPlayerId);
	let game = $derived($remiGameState);
	let names = $derived($remiRoom ? $remiRoom.players.map((p) => p.name) : []);
	let playerCount = $derived($remiRoom?.players.length ?? 0);

	/** Lobby seats: filled rows plus empty placeholders up to the room max. */
	let seats = $derived.by(() => {
		const players = $remiRoom?.players ?? [];
		const max = Math.max($remiRoom?.maxPlayers ?? 0, players.length, 1);
		return Array.from({ length: max }, (_, i) => players[i] ?? null);
	});

	// ---------- My seat ----------
	let rack = $derived(game !== null && myIndex >= 0 ? (game.players[myIndex]?.rack ?? []) : []);
	let me = $derived(game !== null && myIndex >= 0 ? (game.players[myIndex] ?? null) : null);
	let isMyTurn = $derived(
		game !== null && game.phase === 'playing' && game.currentPlayerIndex === myIndex
	);
	let isFirstMeld = $derived(me !== null && !me.melded);
	/** Turn 1: the opener discards without drawing — that uses `opening-discard`. */
	let isOpeningTurn = $derived(
		game !== null &&
			game.phase === 'playing' &&
			game.turnNumber === 1 &&
			game.table.sir.length === 0 &&
			isMyTurn
	);
	let mustUse = $derived(game?.turnState.mustUsePieceIds ?? []);

	/** Every seat but mine, with the badges TableView renders (spec §3.3). */
	let opponents = $derived.by((): OpponentInfo[] => {
		const state = game;
		const room = $remiRoom;
		if (!state || !room || myIndex < 0) return [];
		return room.players
			.map((player, index) => ({ player, index }))
			.filter(({ index }) => index !== myIndex)
			.map(({ player, index }) => {
				const seat = state.players[index];
				return {
					name: player.name,
					pieceCount: seat?.rack.length ?? 0,
					isActive: state.currentPlayerIndex === index && state.phase === 'playing',
					announcedAtu: seat?.announcedAtu ?? false,
					peTablaProgress:
						seat?.peTabla != null ? validatePattern(seat.peTabla.pattern, seat.rack).progress : null
				};
			});
	});

	// ---------- Local table state (mirrors the solo page) ----------
	let selectedId = $state<string | null>(null);
	let builderSelection = $state<string[]>([]);
	/** Formations staged for this turn; confirmed together in one `meld` intent. */
	let pendingMelds = $state<PendingFormation[]>([]);
	let builderOpen = $state(false);
	let breakSirMode = $state(false);
	let breakSirTarget = $state<string | null>(null);
	let peTablaOpen = $state(false);
	let pattern = $state<PatternType | null>(null);

	// ---------- Notices ----------
	let intentError = $state<string | null>(null);
	let conflict = $state(false);

	let hint = $derived.by((): string => {
		const state = game;
		if (!state || state.phase !== 'playing') return '';
		if (!isMyTurn) {
			const turnName = names[state.currentPlayerIndex];
			return turnName ? `Așteaptă — este rândul lui ${turnName}.` : 'Așteaptă-ți rândul.';
		}
		if (isOpeningTurn) return 'Prima tură: aruncă o piesă ca să deschizi șirul.';
		if (me?.peTabla) return 'Joc pe tablă: trage o piesă și construiește modelul tău.';
		if (mustUse.length > 0) return 'Folosește piesa luată într-o formație înainte să arunci.';
		if (!state.turnState.hasDrawn) return 'Trage o piesă: din grămadă, ultima din șir sau atuul.';
		if (rack.length === 1) return 'Îți-a rămas o singură piesă — poți închide jocul.';
		return 'Alege o piesă și etalează, lipește, aruncă sau închide.';
	});

	let storeNotice = $derived($remiError ? roError($remiError) : '');
	let notice = $derived.by((): string => {
		if ($remiConnectionLost) return RECONNECTING;
		if (intentError) return intentError;
		if (conflict) return CONFLICT_NOTICE;
		if (storeNotice) return storeNotice;
		return hint;
	});
	let isErrorNotice = $derived(notice !== '' && notice !== hint);

	// ---------- Lipi: which melds the selected piece can extend ----------
	let selectedPiece = $derived(rack.find((piece) => piece.id === selectedId) ?? null);

	let lipiCandidateMeldIds = $derived.by((): string[] => {
		const state = game;
		const piece = selectedPiece;
		if (!state || !piece) return [];
		return state.table.melds
			.filter((meld) => {
				if (meld.owner !== myIndex && me?.peTabla) return false;
				if (meld.owner !== myIndex && piece.isJoker) return false;
				return analyzeFormation(meld.type, [...meld.pieces, piece]).valid;
			})
			.map((meld) => meld.id);
	});

	// ---------- Joker swap: exact substitutes for a table joker ----------
	let swapTargets = $derived.by((): SwapTarget[] => {
		const state = game;
		const piece = selectedPiece;
		if (!state || !piece || piece.isJoker || me?.peTabla) return [];
		const targets: SwapTarget[] = [];
		for (const meld of state.table.melds) {
			// `swappedJokerIds` tracks joker pieces, not melds.
			const analysis = analyzeFormation(meld.type, meld.pieces);
			for (const joker of meld.pieces) {
				if (!joker.isJoker) continue;
				if (state.swappedJokerIds.includes(joker.id)) continue;
				const value = analysis.jokerValues[joker.id];
				if (value !== piece.value) continue;
				if (!substitutableColors(meld).has(piece.color)) continue;
				// Ropet: a joker in an unfinished terță stays locked.
				if (meld.type === 'terta' && meld.pieces.length < 4) continue;
				targets.push({ meldId: meld.id, jokerPieceId: joker.id });
			}
		}
		return targets;
	});

	/** Colours a joker inside this meld could legally stand for. */
	function substitutableColors(meld: { type: 'suite' | 'terta'; pieces: Piece[] }): Set<Color> {
		const naturals = meld.pieces.filter((piece) => !piece.isJoker);
		if (meld.type === 'suite') {
			const colour = naturals[0]?.color;
			return new Set<Color>(colour ? [colour] : []);
		}
		const taken = new Set(naturals.map((piece) => piece.color));
		return new Set<Color>(COLORS.filter((colour) => !taken.has(colour)));
	}

	// ---------- Rupe șirul ----------
	/** Ropet: already etalat, ≥3 pieces on the rack, and not a pe-tablă player. */
	let canBreakSir = $derived(
		isMyTurn &&
			me !== null &&
			me.melded &&
			!me.peTabla &&
			rack.length >= 3 &&
			!game?.turnState.hasDrawn &&
			(game?.table.sir.length ?? 0) > 1
	);

	let breakSirPickedUp = $derived.by((): number => {
		const state = game;
		if (!state || breakSirTarget === null) return 0;
		const index = state.table.sir.findIndex((piece) => piece.id === breakSirTarget);
		return index <= 0 ? 0 : state.table.sir.length - index;
	});

	function toggleBreakSir() {
		breakSirMode = !breakSirMode;
		breakSirTarget = null;
	}

	async function confirmBreakSir(pieceId: string) {
		if (!pieceId) return;
		await act({ kind: 'break-sir', pieceId });
		breakSirMode = false;
		breakSirTarget = null;
	}

	// ---------- Pre-game ----------
	let canStrica = $derived.by((): boolean => {
		const state = game;
		if (!state || state.phase !== 'duble' || myIndex < 0) return false;
		try {
			return canStricaJocul(state, myIndex);
		} catch {
			return false;
		}
	});

	/** Only the holder of the piece identical to the atu may announce it. */
	let canAnnounce = $derived.by((): boolean => {
		const state = game;
		if (!state || state.phase !== 'atu' || myIndex < 0) return false;
		const atu = state.table.atu;
		if (!atu || atu.isJoker) return false;
		const player = state.players[myIndex];
		if (!player || player.announcedAtu) return false;
		return player.rack.some((piece) => isSamePiece(piece, atu));
	});
	let announcedAtu = $derived(me?.announcedAtu ?? false);

	// ---------- Meld builder ----------
	function openBuilder() {
		builderSelection = [];
		pendingMelds = [];
		builderOpen = true;
	}

	function closeBuilder() {
		builderOpen = false;
		builderSelection = [];
		pendingMelds = [];
	}

	function toggleBuilderPiece(pieceId: string) {
		builderSelection = builderSelection.includes(pieceId)
			? builderSelection.filter((id: string) => id !== pieceId)
			: [...builderSelection, pieceId];
	}

	function addFormation(formation: PendingFormation) {
		pendingMelds = [...pendingMelds, formation];
		builderSelection = [];
	}

	function removeFormation(index: number) {
		pendingMelds = pendingMelds.filter((_, i: number) => i !== index);
	}

	async function confirmMelds(formations: PendingFormation[] = []) {
		const list = formations.length > 0 ? formations : pendingMelds;
		if (list.length === 0) return;
		await act({
			kind: 'meld',
			formations: list.map((formation) => ({
				type: formation.type,
				pieceIds: formation.pieceIds
			}))
		});
		closeBuilder();
	}

	// ---------- Intents ----------
	let noticeTimer: ReturnType<typeof setTimeout> | null = null;

	function clearNoticeTimer(): void {
		if (noticeTimer !== null) {
			clearTimeout(noticeTimer);
			noticeTimer = null;
		}
	}

	/** Conflict/rejection banners expire on their own — the 2s poll keeps the state fresh. */
	function expireNotice(): void {
		clearNoticeTimer();
		noticeTimer = setTimeout(() => {
			noticeTimer = null;
			conflict = false;
			intentError = null;
		}, NOTICE_TTL_MS);
	}

	async function applyResult(res: {
		ok: boolean;
		conflict?: boolean;
		error?: string;
	}): Promise<boolean> {
		if (res.ok) {
			intentError = null;
			conflict = false;
			clearNoticeTimer();
			return true;
		}
		if (res.conflict) {
			conflict = true;
			intentError = null;
		} else {
			intentError = roError(res.error);
			conflict = false;
			console.error('Remi intent failed:', res.error);
		}
		expireNotice();
		return false;
	}

	async function act(intent: RemiIntent): Promise<boolean> {
		try {
			return applyResult(await sendRemiIntent(intent));
		} catch (e) {
			// Offline / server unreachable: the 2s poll raises `remiConnectionLost`,
			// whose "Se reconectează…" notice wins the priority order.
			console.error('Remi intent request failed:', e);
			return false;
		}
	}

	// ---------- Turn actions ----------
	function handleSelect(pieceId: string) {
		selectedId = selectedId === pieceId ? null : pieceId;
	}

	async function handleDiscard(pieceId: string) {
		if (isOpeningTurn) await act({ kind: 'opening-discard', pieceId });
		else await act({ kind: 'discard', pieceId });
		selectedId = null;
	}

	async function handleClose() {
		const piece = rack[0];
		if (piece) await act({ kind: 'close', pieceId: piece.id });
	}

	async function handlePeTablaClose() {
		const state = game;
		const player = me;
		if (!state || !player?.peTabla || rack.length === 0) return;
		// The engine accepts "the board covers the whole rack" or "exactly one
		// piece sits outside it" — prefer the piece whose removal completes it.
		const patternType: PatternType = player.peTabla.pattern;
		const outside = rack.find(
			(piece) =>
				validatePattern(
					patternType,
					rack.filter((candidate) => candidate.id !== piece.id)
				).valid
		);
		await act({ kind: 'pe-tabla-close', pieceId: (outside ?? rack[0]).id });
	}

	/** Lipire uses the rack piece currently selected on the rack. */
	async function handleLipi(meldId: string) {
		if (!selectedPiece) return;
		await act({ kind: 'lipi', meldId, pieceId: selectedPiece.id });
	}

	/** Joker swap: the exact substitute is the rack piece currently selected. */
	async function handleSwapJoker(meldId: string, jokerPieceId: string) {
		if (!selectedPiece) return;
		await act({
			kind: 'swap-joker',
			meldId,
			jokerPieceId,
			replacementPieceId: selectedPiece.id
		});
	}

	async function handleNextGame() {
		try {
			await applyResult(await nextRemiGame());
		} catch (e) {
			console.error('Next game request failed:', e);
		}
		closeBuilder();
		peTablaOpen = false;
		pattern = null;
		selectedId = null;
		breakSirMode = false;
		breakSirTarget = null;
	}

	// ---------- Per-turn / per-phase UI reset ----------
	let lastSignal = '';
	$effect(() => {
		const signal = `${game?.phase ?? ''}:${game?.turnNumber ?? 0}`;
		if (signal === lastSignal) return;
		lastSignal = signal;
		selectedId = null;
		builderOpen = false;
		builderSelection = [];
		pendingMelds = [];
		breakSirMode = false;
		breakSirTarget = null;
		peTablaOpen = false;
		pattern = null;
	});

	// ---------- MMR (1v1 quick matches only; idempotent server-side) ----------
	let mmrResult = $state<{ winnerMMR: number; loserMMR: number } | null>(null);
	let mmrRequested = false;

	$effect(() => {
		if (game?.phase !== 'finished') {
			mmrRequested = false;
			mmrResult = null;
			return;
		}
		if (mmrRequested || !code || playerCount !== 2) return;
		mmrRequested = true;
		recordResult(code)
			.then((r) => {
				if (r) mmrResult = r;
			})
			.catch((e) => console.error('Failed to record match result:', e));
	});

	// ---------- Seat reclaim (refresh / HMR / deep link / quick match) ----------
	let hydrating = $state(false);
	let hydrateFailed = $state(false);

	/**
	 * A refresh, an HMR update or a quick-match navigation lands here with an
	 * empty store but a matching seat in `sessionStorage`. Fetch the room
	 * instead of asking for a name — a running room rejects a second join.
	 * The join card only renders when there is genuinely no session left.
	 */
	async function reclaimSeat(): Promise<void> {
		const stored = getStoredRemiSession();
		if (!stored || stored.code.toUpperCase() !== code || $remiRoom !== null) return;
		hydrating = true;
		try {
			await hydrateRemiRoom(code);
		} catch (e) {
			console.error('Failed to reclaim remi seat:', e);
		} finally {
			hydrating = false;
		}
		const after = getStoredRemiSession();
		hydrateFailed = $remiRoom === null && after !== null && after.code.toUpperCase() === code;
	}

	onMount(() => {
		void reclaimSeat();
	});

	// ---------- Join / leave / copy ----------
	let joinName = $state('');
	let joining = $state(false);
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function handleJoin() {
		const name = joinName.trim();
		if (!name || joining) return;
		joining = true;
		try {
			const result = await joinRemiRoom(code, name);
			if (result.error) return;
			joinName = '';
		} catch (e) {
			console.error('Failed to join room:', e);
		} finally {
			joining = false;
		}
	}

	async function handleLeave() {
		try {
			await leaveRemiRoom();
		} catch (e) {
			console.error('Failed to leave room:', e);
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto('/');
	}

	async function copyCode() {
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1600);
		} catch (e) {
			console.error('Failed to copy room code:', e);
		}
	}

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
		clearNoticeTimer();
		stopRemiPolling();
		resetRemi();
	});
</script>

<svelte:head>
	<title>Remi Etalat · Cameră {code}</title>
</svelte:head>

{#snippet noticeBar()}
	{#if notice}
		<p
			class="glass-panel rounded-xl px-3 py-2 text-sm {notice === RECONNECTING
				? 'text-amber-200'
				: 'text-rose-200'}"
			role={notice === RECONNECTING ? 'status' : 'alert'}
		>
			{notice}
		</p>
	{/if}
{/snippet}

{#if !joined && hydrating}
	<!-- ── Seat reclaim: a stored session for this code is being restored ── -->
	<div class="felt-surface relative flex min-h-dvh w-full items-center justify-center p-4">
		<section class="glass-panel w-full max-w-md rounded-2xl p-5 text-center" role="status">
			<p class="eyebrow">Remi Etalat</p>
			<h1 class="mt-2 text-2xl font-black tracking-wide text-gold-200">Cameră {code}</h1>
			<p class="mt-3 text-sm text-cream-100/75">Se recuperează locul tău la masă…</p>
		</section>
	</div>
{:else if !joined}
	<!-- ── No stored session for this code: join by name ─────────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full items-center justify-center p-4">
		<section class="glass-panel w-full max-w-md rounded-2xl p-5">
			<p class="eyebrow">Remi Etalat</p>
			<h1 class="mt-2 text-2xl font-black tracking-wide text-gold-200">Cameră {code}</h1>
			<p class="mt-1 text-sm text-cream-100/75">
				Intră în cameră ca să iei loc la masă. Dacă nu ai încă un nume, scrie-l mai jos.
			</p>

			<label
				for="join-name"
				class="mt-4 block text-[11px] font-bold tracking-[0.18em] text-cream-100/70 uppercase"
			>
				Numele tău
			</label>
			<input
				id="join-name"
				type="text"
				class="mt-1.5 w-full rounded-xl border border-gold-400/40 bg-black/40 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-100/40 focus:border-gold-300 focus:outline-none"
				bind:value={joinName}
				maxlength="20"
				placeholder="Numele tău"
				onkeydown={(e) => {
					if (e.key === 'Enter') void handleJoin();
				}}
			/>

			{#if storeNotice}
				<p class="mt-2 text-sm text-rose-200" role="alert">{storeNotice}</p>
			{:else if hydrateFailed}
				<p class="mt-2 text-sm text-rose-200" role="alert">
					Locul nu a putut fi recuperat — intră din nou în cameră.
				</p>
			{/if}

			<button
				type="button"
				class="btn-gold btn mt-4 w-full"
				onclick={handleJoin}
				disabled={!joinName.trim() || joining}
			>
				Intră în cameră
			</button>
			<button type="button" class="btn-quiet btn mt-2 w-full" onclick={handleLeave}>
				Înapoi acasă
			</button>
		</section>
	</div>
{:else if $remiStatus === 'waiting'}
	<!-- ── Lobby: code, seats, host controls ──────────────────────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full flex-col">
		<div class="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8 sm:py-12">
			<section class="glass-panel rounded-2xl px-5 py-6 text-center">
				<p class="eyebrow">Remi Etalat</p>
				<h1 class="mt-2 text-2xl font-black tracking-wide text-gold-200">Cameră</h1>
				<div class="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
					<span class="text-sm font-semibold tracking-[0.2em] text-cream-100/55 uppercase">
						Cod:
					</span>
					<span
						class="font-mono text-3xl font-extrabold tracking-[0.22em] text-cream-50 sm:text-4xl"
					>
						{code}
					</span>
				</div>
				<div class="mt-4 flex items-center justify-center gap-2">
					<button type="button" class="pill-btn" onclick={copyCode}>
						{copied ? 'Copiat!' : 'Copiază codul'}
					</button>
				</div>
				<p class="mt-3 text-xs text-cream-100/60">
					Trimite codul prietenilor ca să intre și ei la masă.
				</p>
			</section>

			{@render noticeBar()}

			<section class="glass-panel rounded-2xl px-4 py-4" aria-label="Locuri la masă">
				<header class="flex items-center justify-between gap-2">
					<span class="eyebrow">Locuri la masă</span>
					<span
						class="rounded-full bg-black/30 px-2.5 py-1 text-[0.7rem] font-bold text-cream-100/75 tabular-nums"
					>
						{playerCount} / {$remiRoom?.maxPlayers ?? playerCount}
					</span>
				</header>
				<ul class="mt-3 flex flex-col gap-2">
					{#each seats as seat, i (i)}
						{#if seat}
							<li
								class="flex items-center gap-3 rounded-xl border border-gold-300/15 bg-black/25 px-3 py-2"
							>
								<span
									class="w-5 text-center text-[0.7rem] font-bold text-cream-100/45 tabular-nums"
								>
									{i + 1}
								</span>
								<span class="min-w-0 flex-1 truncate text-sm font-semibold text-cream-50">
									{seat.name}
								</span>
								{#if $remiRoom?.ownerId === seat.id}
									<span
										class="rounded-full border border-gold-300/50 bg-gold-300/10 px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-gold-200 uppercase"
									>
										Gazdă
									</span>
								{/if}
								{#if seat.id === $remiPlayerId}
									<span
										class="rounded-full border border-cream-50/25 px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-cream-100/70 uppercase"
									>
										Tu
									</span>
								{/if}
							</li>
						{:else}
							<li
								class="flex items-center gap-3 rounded-xl border border-dashed border-cream-100/15 px-3 py-2 text-cream-100/40"
							>
								<span class="w-5 text-center text-[0.7rem] font-bold tabular-nums">{i + 1}</span>
								<span class="flex-1 text-sm">Loc liber</span>
							</li>
						{/if}
					{/each}
				</ul>
			</section>

			<section class="glass-panel flex flex-col gap-3 rounded-2xl px-4 py-4">
				{#if isOwner}
					<button
						type="button"
						class="btn-gold btn w-full"
						onclick={() => void startRemiGame()}
						disabled={playerCount < 2}
					>
						Începe jocul
					</button>
					{#if playerCount < 2}
						<p class="text-center text-xs text-cream-100/60">
							Așteaptă cel puțin 2 jucători la masă…
						</p>
					{/if}
				{:else}
					<p class="text-center text-xs text-cream-100/60">Așteaptă ca gazda să înceapă jocul…</p>
				{/if}
				<button type="button" class="btn-quiet btn w-full" onclick={handleLeave}>
					Părăsește camera
				</button>
			</section>
		</div>
	</div>
{:else if !game}
	<div class="mx-auto max-w-md px-4 pt-20 text-center text-cream-100/60">
		<p>Se încarcă camera…</p>
	</div>
{:else if game.phase === 'duble'}
	<!-- ── Duble: blind exchange (any member can resolve) ─────────────────── -->
	<div class="felt-surface relative min-h-dvh w-full p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">Remi Etalat · Duble</h1>
			{@render noticeBar()}
			<DublePanel
				pieces={rack}
				{myIndex}
				playerNames={names}
				offers={game.dubleOffers}
				onoffer={(pieceId) => void act({ kind: 'duble-offer', pieceId })}
				onwithdraw={() => void act({ kind: 'duble-withdraw' })}
				onstrica={() => void act({ kind: 'strica' })}
				{canStrica}
			/>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs text-cream-100/60">
					Când ești gata, apasă <span class="font-bold text-gold-200">Continuă</span> — schimbul are loc
					când toți au ales.
				</p>
				<button
					type="button"
					class="btn-gold btn"
					onclick={() => void act({ kind: 'duble-resolve' })}
				>
					Continuă
				</button>
			</div>
		</div>
	</div>
{:else if game.phase === 'atu'}
	<!-- ── Atu: announce the identical piece, then start play ─────────────── -->
	<div class="felt-surface relative min-h-dvh w-full p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">Remi Etalat · Atu</h1>
			{@render noticeBar()}
			<AtuPanel
				atu={game.table.atu}
				playerNames={names}
				{canAnnounce}
				announced={announcedAtu}
				onannounce={() => void act({ kind: 'atu-announce' })}
				oncontinue={() => void act({ kind: 'start-playing' })}
			/>
			<p class="text-center text-xs text-cream-100/60">
				Apasă <span class="font-bold text-gold-200">Continuă jocul</span> ca să înceapă prima tură.
			</p>
		</div>
	</div>
{:else if game.phase === 'playing'}
	<!-- ── Table: every interaction goes through `sendRemiIntent` ─────────── -->
	<TableView
		title="Remi Etalat · Cameră {code}"
		{notice}
		{opponents}
		myLabel="Tu ({rack.length} piese)"
		{rack}
		melds={game.table.melds}
		sir={game.table.sir}
		stockCount={game.table.stock.length}
		atu={game.table.atu}
		phase="playing"
		{isMyTurn}
		{selectedId}
		mustUsePieceIds={mustUse}
		turnStartedAt={game.turnStartedAt}
		turnTimeoutMs={TURN_TIMEOUT_MS}
		{lipiCandidateMeldIds}
		{swapTargets}
		showBreakSir={breakSirMode}
		onselectpiece={handleSelect}
		ondrawstock={isMyTurn && !isOpeningTurn ? () => void act({ kind: 'draw-stock' }) : undefined}
		ontakelast={isMyTurn && !isOpeningTurn && game.table.sir.length > 1
			? () => void act({ kind: 'take-last' })
			: undefined}
		ontakeatu={isMyTurn && !isOpeningTurn && game.table.atu !== null
			? () => void act({ kind: 'take-atu' })
			: undefined}
		ondiscard={isMyTurn && !me?.peTabla ? handleDiscard : undefined}
		onmeld={isMyTurn && !me?.peTabla && game.turnNumber > game.players.length
			? openBuilder
			: undefined}
		onlipi={isMyTurn && (me?.melded ?? false) && selectedPiece ? handleLipi : undefined}
		onswapjoker={isMyTurn && !me?.peTabla && swapTargets.length > 0 ? handleSwapJoker : undefined}
		onbreaksir={canBreakSir && breakSirMode ? (pieceId) => (breakSirTarget = pieceId) : undefined}
		onclose={isMyTurn && !me?.peTabla && rack.length === 1 && mustUse.length === 0
			? handleClose
			: undefined}
		onpeTabla={isMyTurn && !me?.peTabla && !me?.melded && (me?.turnsTaken ?? 9) < 3
			? () => (peTablaOpen = true)
			: undefined}
	/>

	{#if isErrorNotice}
		<p
			class="glass-panel fixed inset-x-3 bottom-3 z-20 mx-auto max-w-md rounded-xl px-3 py-2 text-sm text-rose-200 sm:inset-x-0"
			role="alert"
		>
			{notice}
		</p>
	{/if}

	<div class="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">
		<!-- Rupe șirul: explain, pick, then confirm -->
		{#if canBreakSir}
			<section class="glass-panel rounded-2xl p-3 sm:p-4" aria-label="Rupe șirul">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 class="text-sm font-bold tracking-wider text-gold-200 uppercase">Rupe șirul</h2>
						<p class="text-xs text-cream-100/75">
							Poți lua piesa și pe toate cele puse după ea. Piesa ruptă trebuie etalată în această
							tură.
						</p>
					</div>
					<button
						type="button"
						class="btn border-amber-300/60 font-bold text-amber-100 btn-outline btn-sm hover:bg-amber-400/20"
						onclick={toggleBreakSir}
					>
						{breakSirMode ? 'Renunță' : 'Alege piesa din șir'}
					</button>
				</div>

				{#if breakSirMode}
					<p class="mt-2 text-xs text-amber-200" role="note">
						Alege o piesă din șir, de pe masa comună. Prima piesă (așezată lateral) nu poate fi
						ruptă niciodată.
					</p>
				{/if}
				{#if breakSirTarget}
					{@const target = game.table.sir.find((piece) => piece.id === breakSirTarget)}
					<div
						class="mt-3 rounded-xl bg-amber-500/10 p-3"
						role="alertdialog"
						aria-label="Confirmă ruperea șirului"
					>
						<p class="text-sm text-amber-100">
							{#if target}
								rupi șirul la <strong>{target.isJoker ? 'joker' : target.value}</strong> și primești {breakSirPickedUp}
								{breakSirPickedUp === 1 ? 'piesă' : 'piese'}.
							{/if}
						</p>
						<div class="mt-2 flex flex-wrap gap-2">
							<button
								type="button"
								class="btn border-amber-300/60 font-bold text-amber-100 btn-outline btn-xs hover:bg-amber-400/20"
								onclick={() => void confirmBreakSir(breakSirTarget ?? '')}
							>
								Confirmă
							</button>
							<button
								type="button"
								class="btn text-cream-100 btn-ghost btn-xs"
								onclick={() => (breakSirTarget = null)}
							>
								Renunță
							</button>
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Meld builder: multiple formations staged for one `meld` intent -->
		{#if builderOpen}
			<MeldBuilder
				pieces={rack}
				selectedIds={builderSelection}
				onselect={toggleBuilderPiece}
				onconfirm={confirmMelds}
				oncancel={closeBuilder}
				{isFirstMeld}
				{pendingMelds}
				onaddformation={addFormation}
				onremovemeld={removeFormation}
			/>
		{/if}

		<!-- Pe tablă -->
		{#if peTablaOpen || me?.peTabla}
			<PeTablaPanel
				pattern={me?.peTabla?.pattern ?? pattern}
				pieces={rack}
				onselect={(key) => (pattern = key)}
				onconfirm={() => {
					if (pattern) void act({ kind: 'declare-pe-tabla', pattern });
				}}
				onclose={handlePeTablaClose}
				canDeclare={isMyTurn && !me?.peTabla && !me?.melded && (me?.turnsTaken ?? 9) < 3}
			/>
		{/if}

		<div class="flex flex-wrap items-center justify-between gap-2 pb-6">
			<p class="text-[0.7rem] tracking-[0.2em] text-cream-100/45 uppercase">
				Cameră {code}
			</p>
			<button type="button" class="btn-quiet btn" onclick={handleLeave}> Părăsește camera </button>
		</div>
	</div>
{:else}
	<!-- ── Finished: breakdown sheet, MMR, next game / home ───────────────── -->
	<div class="felt-surface relative min-h-dvh w-full p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4 py-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">
				Remi Etalat · Rezultate
			</h1>
			{@render noticeBar()}
			<EndGameSheet
				playerNames={names}
				breakdowns={game.lastBreakdowns ?? []}
				scores={game.scores}
				sessionTotals={game.sessionTotals}
				gameWinner={game.gameWinner}
				closerIndex={game.closerIndex ?? null}
				stockOut={game.endReason === 'stock-out'}
				doubleGame={game.doubleGame}
				onnext={handleNextGame}
			/>

			{#if mmrResult && game.gameWinner !== null && names.length === 2}
				<div class="flex flex-wrap justify-center gap-2" aria-label="MMR actualizat">
					<span
						class="rounded-full border border-gold-400/40 bg-black/40 px-3 py-1 text-xs font-bold text-gold-200"
					>
						{names[game.gameWinner] ?? 'Câștigător'} · MMR {mmrResult.winnerMMR}
					</span>
					<span
						class="rounded-full border border-gold-400/40 bg-black/40 px-3 py-1 text-xs font-bold text-cream-100/80"
					>
						{names[game.gameWinner === 0 ? 1 : 0] ?? 'Adversar'} · MMR {mmrResult.loserMMR}
					</span>
				</div>
			{/if}

			<button type="button" class="btn-quiet btn w-full" onclick={handleLeave}>
				Înapoi acasă
			</button>
		</div>
	</div>
{/if}

<style>
	.eyebrow {
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: rgb(243 216 148 / 0.75);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.85rem;
		padding: 0.65rem 1rem;
		font-size: 0.92rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease;
	}

	.btn-gold {
		border: 1px solid rgba(255, 244, 214, 0.55);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
	}

	.btn-gold:hover:not(:disabled) {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}

	.btn-gold:disabled {
		cursor: default;
		opacity: 0.5;
		filter: none;
		transform: none;
	}

	.btn-quiet {
		border: 1px solid rgba(232, 197, 106, 0.3);
		background-color: rgba(255, 255, 255, 0.05);
		color: #f6efe0;
	}

	.btn-quiet:hover {
		border-color: rgba(232, 197, 106, 0.6);
		background-color: rgba(255, 255, 255, 0.1);
	}

	.pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 1px solid rgba(232, 197, 106, 0.45);
		background-color: rgba(255, 255, 255, 0.06);
		color: #f6efe0;
		padding: 0.4rem 0.9rem;
		border-radius: 0.85rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.pill-btn:hover {
		border-color: rgba(243 216 148 / 0.75);
		background-color: rgba(255, 255, 255, 0.1);
	}

	.btn:focus-visible,
	.pill-btn:focus-visible {
		outline: 2px solid rgb(243 221 160 / 0.9);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn,
		.pill-btn {
			transition: none;
		}

		.btn-gold:hover:not(:disabled) {
			transform: none;
		}
	}
</style>
