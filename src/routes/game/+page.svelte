<script lang="ts">
	import TableView, {
		type OpponentInfo,
		type SwapTarget
	} from '$lib/components/remi/TableView.svelte';
	import MeldBuilder, { type PendingFormation } from '$lib/components/remi/MeldBuilder.svelte';
	import DublePanel from '$lib/components/remi/DublePanel.svelte';
	import AtuPanel from '$lib/components/remi/AtuPanel.svelte';
	import PeTablaPanel from '$lib/components/remi/PeTablaPanel.svelte';
	import EndGameSheet from '$lib/components/remi/EndGameSheet.svelte';
	import { analyzeFormation } from '$lib/engine/remi/formations';
	import { validatePattern } from '$lib/engine/remi/patterns';
	import { COLORS } from '$lib/engine/remi/pieces';
	import type { Color, PatternType, Piece } from '$lib/engine/remi/types';
	import {
		canAnnounceAtu,
		HUMAN_INDEX,
		soloAnnounceAtu,
		soloBreakSir,
		soloCanStrica,
		soloClose,
		soloDeclarePeTabla,
		soloDiscard,
		soloDrawStock,
		soloError,
		soloLipi,
		soloMeld,
		soloNextGame,
		soloOfferDuble,
		soloOpeningDiscard,
		soloPeTablaClose,
		soloReset,
		soloResolveDuble,
		soloStartPlaying,
		startSoloGame,
		soloState,
		soloStrica,
		soloSwapJoker,
		soloTakeAtu,
		soloTakeLast,
		soloWithdrawDuble
	} from '$lib/stores/remi/soloStore';

	const COUNTS: readonly (2 | 3 | 4)[] = [2, 3, 4];

	// ---------- Local table state ----------
	let playerCount = $state<2 | 3 | 4>(2);
	let selectedId = $state<string | null>(null);
	let builderSelection = $state<string[]>([]);
	/** Formations staged for this turn; confirmed together in one `soloMeld`. */
	let pendingMelds = $state<PendingFormation[]>([]);
	let builderOpen = $state(false);
	let breakSirMode = $state(false);
	let breakSirTarget = $state<string | null>(null);
	let peTablaOpen = $state(false);
	let pattern = $state<PatternType | null>(null);

	let game = $derived($soloState);
	let rack = $derived(game?.players[HUMAN_INDEX]?.rack ?? []);
	let me = $derived(game?.players[HUMAN_INDEX] ?? null);
	let isMyTurn = $derived(
		game !== null && game.phase === 'playing' && game.currentPlayerIndex === HUMAN_INDEX
	);
	let isFirstMeld = $derived(me !== null && !me.melded);
	let isOpening = $derived(
		game !== null &&
			game.phase === 'playing' &&
			game.turnNumber === 1 &&
			game.table.sir.length === 0
	);
	let mustUse = $derived(game?.turnState.mustUsePieceIds ?? []);
	/** The opening turn: the first player lays a piece down without drawing. */
	let isOpeningTurn = $derived(isMyTurn && isOpening);

	/** Table seats: "Tu" plus numbered calculators (spec §4). */
	let names = $derived(game ? game.players.map((_player, index: number) => seatName(index)) : []);
	function seatName(index: number): string {
		return index === HUMAN_INDEX ? 'Tu' : `Calculator ${index + 1}`;
	}

	let opponents = $derived<OpponentInfo[]>(
		game
			? game.players.map((player, index) => ({
					name: seatName(index),
					pieceCount: player.rack.length,
					isActive: game.currentPlayerIndex === index && game.phase === 'playing',
					announcedAtu: player.announcedAtu,
					peTablaProgress: player.peTabla
						? validatePattern(player.peTabla.pattern, player.rack).progress
						: null
				}))
			: []
	);

	// ---------- Lipi: which melds the selected piece can extend ----------
	let selectedPiece = $derived(rack.find((piece) => piece.id === selectedId) ?? null);

	let lipiCandidateMeldIds = $derived.by((): string[] => {
		if (!selectedPiece || game === null) return [];
		return game.table.melds
			.filter((meld) => {
				if (meld.owner !== HUMAN_INDEX && me?.peTabla) return false;
				if (meld.owner !== HUMAN_INDEX && selectedPiece.isJoker) return false;
				return analyzeFormation(meld.type, [...meld.pieces, selectedPiece]).valid;
			})
			.map((meld) => meld.id);
	});

	// ---------- Joker swap: exact substitutes for a table joker ----------
	let swapTargets = $derived.by((): SwapTarget[] => {
		if (!selectedPiece || selectedPiece.isJoker || game === null || me?.peTabla) return [];
		const targets: SwapTarget[] = [];
		for (const meld of game.table.melds) {
			// `swappedJokerIds` tracks joker pieces, not melds.
			const analysis = analyzeFormation(meld.type, meld.pieces);
			for (const piece of meld.pieces) {
				if (!piece.isJoker) continue;
				if (game.swappedJokerIds.includes(piece.id)) continue;
				const value = analysis.jokerValues[piece.id];
				if (value !== selectedPiece.value) continue;
				if (!substitutableColors(meld).has(selectedPiece.color)) continue;
				// Ropet: a joker in an unfinished terță stays locked.
				if (meld.type === 'terta' && meld.pieces.length < 4) continue;
				targets.push({ meldId: meld.id, jokerPieceId: piece.id });
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
		if (!game || breakSirTarget === null) return 0;
		const index = game.table.sir.findIndex((piece) => piece.id === breakSirTarget);
		return index <= 0 ? 0 : game.table.sir.length - index;
	});

	function toggleBreakSir() {
		breakSirMode = !breakSirMode;
		breakSirTarget = null;
	}

	function confirmBreakSir(pieceId: string) {
		soloBreakSir(pieceId);
		breakSirMode = false;
		breakSirTarget = null;
	}

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

	function confirmMelds(formations: PendingFormation[] = []) {
		const list = formations.length > 0 ? formations : pendingMelds;
		if (list.length === 0) return;
		soloMeld(list);
		closeBuilder();
	}

	// ---------- Turn actions ----------
	function handleSelect(pieceId: string) {
		selectedId = selectedId === pieceId ? null : pieceId;
	}

	function handleDiscard(pieceId: string) {
		if (isOpeningTurn) soloOpeningDiscard(pieceId);
		else soloDiscard(pieceId);
		selectedId = null;
	}

	function handleClose() {
		// The engine returns still-pending taken pieces before closing, so the piece
		// left to discard must be the first one that is NOT awaiting use.
		const piece = rack.find((p) => !mustUse.includes(p.id));
		if (piece) soloClose(piece.id);
	}

	function handlePeTablaClose() {
		// The engine validates the pattern and accepts either "the board covers the
		// whole rack" or "exactly one piece sits outside it".
		const last = rack[0];
		if (last) soloPeTablaClose(last.id);
	}

	/** Lipire uses the rack piece currently selected on the rack. */
	function handleLipi(meldId: string) {
		if (!selectedPiece) return;
		soloLipi(meldId, selectedPiece.id);
	}

	/** Joker swap: the exact substitute is the rack piece currently selected. */
	function handleSwapJoker(meldId: string, jokerPieceId: string) {
		if (!selectedPiece) return;
		soloSwapJoker(meldId, jokerPieceId, selectedPiece.id);
	}

	function handleStrica() {
		soloStrica();
		closeBuilder();
	}

	function handleNextGame() {
		soloNextGame();
		closeBuilder();
		peTablaOpen = false;
		pattern = null;
		selectedId = null;
	}

	// ---------- Notices ----------
	let notice = $derived.by((): string => {
		if (!game || game.phase !== 'playing' || !isMyTurn) return '';
		if (isOpeningTurn) return 'Prima tură: aruncă o piesă ca să deschizi șirul.';
		if (me?.peTabla) return 'Joc pe tablă: trage o piesă și construiește modelul tău.';
		if (mustUse.length > 0)
			return 'Ai luat o piesă: folosește-o într-o formație sau aruncă — dacă nu o folosești, se întoarce.';
		if (!game.turnState.hasDrawn) return 'Trage o piesă: din grămadă, ultima din șir sau atuul.';
		if (rack.length - mustUse.length === 1)
			return 'Îți-a rămas o singură piesă — poți închide jocul.';
		return 'Alege o piesă și etalează, lipește, aruncă sau închide.';
	});

	let errorText = $derived($soloError);
</script>

<svelte:head>
	<title>Remi Etalat · Joc solo</title>
</svelte:head>

{#if !game}
	<!-- Start overlay -->
	<div class="felt-surface relative min-h-screen rounded-none p-3 sm:p-5">
		<div class="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6">
			<div class="glass-panel rounded-3xl p-5 text-center sm:p-7">
				<h1 class="text-3xl font-black tracking-wide text-gold-200 sm:text-4xl">Remi Etalat</h1>
				<p class="mt-2 text-sm text-cream-100/80">
					Joacă împotriva calculatorului: duble, atu, etalare, lipire și pe tablă.
				</p>

				<div class="mt-5">
					<span
						class="mb-2 block text-[11px] font-bold tracking-[0.2em] text-cream-100/70 uppercase"
						id="player-count-label"
					>
						Jucători
					</span>
					<div class="segmented" role="group" aria-labelledby="player-count-label">
						{#each COUNTS as count (count)}
							<button
								type="button"
								class="seg-item"
								aria-pressed={playerCount === count}
								onclick={() => (playerCount = count)}
							>
								{count}
								<span class="text-[0.65rem] opacity-70">jucători</span>
							</button>
						{/each}
					</div>
				</div>

				<button
					type="button"
					class="btn-gold btn mt-6 w-full"
					onclick={() => startSoloGame(playerCount)}
				>
					Începe jocul
				</button>
			</div>
		</div>
	</div>
{:else if game.phase === 'duble'}
	<div class="felt-surface relative min-h-screen rounded-none p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">Remi Etalat · Duble</h1>
			{#if errorText}
				<p class="glass-panel rounded-xl px-3 py-2 text-sm text-rose-200" role="alert">
					{errorText}
				</p>
			{/if}
			<DublePanel
				pieces={rack}
				myIndex={HUMAN_INDEX}
				playerNames={names}
				offers={game.dubleOffers}
				onoffer={(pieceId) => soloOfferDuble(pieceId)}
				onwithdraw={soloWithdrawDuble}
				onstrica={handleStrica}
				canStrica={soloCanStrica(game)}
			/>
			<div class="flex justify-end">
				<button
					type="button"
					class="btn border-gold-400 bg-gold-400 font-bold text-felt-950 btn-sm hover:bg-gold-300"
					onclick={soloResolveDuble}
				>
					Continuă
				</button>
			</div>
		</div>
	</div>
{:else if game.phase === 'atu'}
	<div class="felt-surface relative min-h-screen rounded-none p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">Remi Etalat · Atu</h1>
			{#if errorText}
				<p class="glass-panel rounded-xl px-3 py-2 text-sm text-rose-200" role="alert">
					{errorText}
				</p>
			{/if}
			<AtuPanel
				atu={game.table.atu}
				playerNames={names}
				canAnnounce={canAnnounceAtu(game)}
				announced={me?.announcedAtu ?? false}
				onannounce={soloAnnounceAtu}
				oncontinue={soloStartPlaying}
			/>
			<p class="text-center text-xs text-cream-100/60">
				Apasă <span class="font-bold text-gold-200">Continuă jocul</span> ca să înceapă prima tură.
			</p>
		</div>
	</div>
{:else if game.phase === 'playing'}
	<TableView
		title="Remi Etalat · joc solo"
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
		{lipiCandidateMeldIds}
		{swapTargets}
		showBreakSir={breakSirMode}
		onselectpiece={handleSelect}
		ondrawstock={isMyTurn && !isOpeningTurn ? soloDrawStock : undefined}
		ontakelast={isMyTurn && !isOpeningTurn && game.table.sir.length > 1 ? soloTakeLast : undefined}
		ontakeatu={isMyTurn && !isOpeningTurn && game.table.atu !== null ? soloTakeAtu : undefined}
		ondiscard={isMyTurn && !me?.peTabla ? handleDiscard : undefined}
		onmeld={isMyTurn && !me?.peTabla && game.turnNumber > game.players.length
			? openBuilder
			: undefined}
		onlipi={isMyTurn && (me?.melded ?? false) && selectedPiece ? handleLipi : undefined}
		onswapjoker={isMyTurn && !me?.peTabla && swapTargets.length > 0 ? handleSwapJoker : undefined}
		onbreaksir={canBreakSir && breakSirMode ? (pieceId) => (breakSirTarget = pieceId) : undefined}
		onclose={isMyTurn && !me?.peTabla && rack.length - mustUse.length === 1
			? handleClose
			: undefined}
		onpeTabla={isMyTurn && !me?.peTabla && !me?.melded && (me?.turnsTaken ?? 9) < 3
			? () => (peTablaOpen = true)
			: undefined}
	/>

	{#if errorText}
		<p
			class="glass-panel fixed inset-x-3 bottom-3 z-20 mx-auto max-w-md rounded-xl px-3 py-2 text-sm text-rose-200 sm:inset-x-0"
			role="alert"
		>
			{errorText}
		</p>
	{/if}

	<div class="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">
		<!-- Rupe șirul -->
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
								rupi șirul la <strong>{target.isJoker ? 'joker' : target.value}</strong> și primești
								{breakSirPickedUp}
								{breakSirPickedUp === 1 ? 'piesă' : 'piese'}.
							{/if}
						</p>
						<div class="mt-2 flex flex-wrap gap-2">
							<button
								type="button"
								class="btn border-amber-300/60 font-bold text-amber-100 btn-outline btn-xs hover:bg-amber-400/20"
								onclick={() => confirmBreakSir(breakSirTarget ?? '')}
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

		<!-- Meld builder -->
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
				onconfirm={() => pattern && soloDeclarePeTabla(pattern)}
				onclose={handlePeTablaClose}
				canDeclare={isMyTurn && !me?.peTabla && !me?.melded && (me?.turnsTaken ?? 9) < 3}
			/>
		{/if}
	</div>
{:else}
	<!-- End of game -->
	<div class="felt-surface relative min-h-screen rounded-none p-3 sm:p-5">
		<div class="mx-auto max-w-4xl space-y-4">
			<h1 class="text-lg font-black tracking-wide text-gold-200 sm:text-xl">
				Remi Etalat · Rezultate
			</h1>
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
			<button type="button" class="btn-quiet btn w-full" onclick={soloReset}>Părăsește masa</button>
		</div>
	</div>
{/if}

<style>
	.segmented {
		display: flex;
		gap: 0.4rem;
		padding: 0.28rem;
		border-radius: 0.9rem;
		border: 1px solid rgba(232, 197, 106, 0.18);
		background-color: rgba(2, 22, 14, 0.5);
	}

	.seg-item {
		flex: 1;
		display: inline-flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.5rem 0.3rem;
		border: 0;
		border-radius: 0.65rem;
		background: transparent;
		color: rgba(246, 239, 224, 0.72);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.seg-item:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #f8f1e0;
	}

	.seg-item[aria-pressed='true'] {
		background-image: linear-gradient(180deg, #f3dda0, #cfa84f);
		color: #241704;
	}

	.seg-item:focus-visible {
		outline: 2px solid rgba(243, 221, 160, 0.85);
		outline-offset: 2px;
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

	.btn-gold:hover {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}

	.btn-quiet {
		border: 1px solid rgba(232, 197, 106, 0.3);
		background-color: rgba(255, 255, 255, 0.05);
		color: #f6efe0;
	}

	.btn-quiet:hover {
		border-color: rgba(232, 197, 106, 0.6);
	}

	.btn:focus-visible {
		outline: 2px solid rgba(243, 221, 160, 0.9);
		outline-offset: 2px;
	}
</style>
