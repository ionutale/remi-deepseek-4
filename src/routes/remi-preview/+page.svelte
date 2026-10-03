<script lang="ts">
	import TableView from '$lib/components/remi/TableView.svelte';
	import MeldBuilder from '$lib/components/remi/MeldBuilder.svelte';
	import PieceTile from '$lib/components/remi/Piece.svelte';
	import DublePanel from '$lib/components/remi/DublePanel.svelte';
	import AtuPanel from '$lib/components/remi/AtuPanel.svelte';
	import PeTablaPanel from '$lib/components/remi/PeTablaPanel.svelte';
	import EndGameSheet from '$lib/components/remi/EndGameSheet.svelte';
	import type { Formation, PatternType, Piece } from '$lib/engine/remi/types';
	import type { PlayerBreakdown } from '$lib/engine/remi/scoring';

	let n = 0;
	const p = (color: Piece['color'], value: number): Piece => ({
		id: `prev-${color}-${value}-${n++}`,
		isJoker: false,
		value,
		color
	});
	const joker = (): Piece => ({ id: `prev-joker-${n++}`, isJoker: true, value: 0, color: 'black' });

	const COLORS: Piece['color'][] = ['red', 'yellow', 'blue', 'black'];
	const gridPieces: Piece[] = [
		...COLORS.flatMap((c) => [1, 5, 9, 11, 13].map((v) => p(c, v))),
		joker(),
		joker()
	];

	const rack: Piece[] = [
		p('red', 4),
		p('red', 5),
		p('red', 6),
		p('blue', 7),
		p('yellow', 7),
		p('black', 7),
		p('yellow', 1),
		p('yellow', 2),
		p('yellow', 3),
		p('black', 11),
		p('black', 12),
		p('black', 13),
		p('blue', 9),
		joker(),
		joker()
	];

	const melds: Formation[] = [
		{
			id: 'm-suite',
			type: 'suite',
			owner: 0,
			pieces: [p('red', 7), p('red', 8), p('red', 9), p('red', 10)],
			lipitBy: [null, null, null, 2]
		},
		{
			id: 'm-terta',
			type: 'terta',
			owner: 1,
			pieces: [p('red', 12), p('blue', 12), p('black', 12)],
			lipitBy: [null, null, null]
		},
		{
			id: 'm-joker',
			type: 'suite',
			owner: 0,
			pieces: [p('blue', 4), p('blue', 5), joker()],
			lipitBy: [null, null, null]
		}
	];

	const sir: Piece[] = [p('blue', 3), p('yellow', 9), p('black', 5), p('red', 2), p('blue', 11)];
	const atu: Piece = p('red', 1);

	const builderPieces: Piece[] = [p('blue', 4), p('blue', 5), p('blue', 6), p('red', 9), joker()];
	let builderSelected: string[] = $state([
		builderPieces[0]!.id,
		builderPieces[1]!.id,
		builderPieces[2]!.id
	]);
	let selectedId: string | null = $state(rack[0]!.id);
	let noop = () => {};

	// ---------- Faza pre-joc: duble ----------
	const playerNames = ['Ana', 'Andrei', 'Maria', 'Vlad'];
	const myIndex = 0;

	const dublePieces: Piece[] = [
		p('red', 4),
		p('red', 4),
		p('blue', 7),
		p('blue', 7),
		p('yellow', 9),
		p('yellow', 9),
		p('black', 11),
		p('black', 11),
		p('yellow', 12),
		p('yellow', 12),
		p('red', 1),
		p('red', 1),
		p('blue', 5),
		p('black', 13),
		joker()
	];

	let dubleOffers = $state<(Piece | null)[]>([
		null,
		{ id: 'offer-andrei', isJoker: false, value: 6, color: 'red' },
		null,
		{ id: 'offer-vlad', isJoker: false, value: 1, color: 'blue' }
	]);

	function offerDuble(pieceId: string) {
		const found = dublePieces.find((piece) => piece.id === pieceId) ?? null;
		dubleOffers = dubleOffers.map((offer, i) => (i === myIndex ? found : offer));
	}

	function withdrawOffer() {
		dubleOffers = dubleOffers.map((offer, i) => (i === myIndex ? null : offer));
	}

	// ---------- Faza pre-joc: atu ----------
	const atuDouble: Piece = joker();
	const atuNormal: Piece = p('red', 5);
	let atuVariant = $state<'dublu' | 'normal'>('dublu');
	let atuAnnounced = $state(false);
	let atuPiece = $derived(atuVariant === 'dublu' ? atuDouble : atuNormal);

	// ---------- Pe tablă ----------
	const partialBoard: Piece[] = [
		p('red', 4),
		p('red', 5),
		p('red', 6),
		p('blue', 7),
		p('blue', 8),
		p('yellow', 2),
		p('yellow', 2),
		p('black', 13),
		p('yellow', 9),
		joker()
	];

	const completeDubleBoard: Piece[] = [
		p('red', 5),
		p('red', 5),
		p('blue', 7),
		p('blue', 7),
		p('yellow', 3),
		p('yellow', 3),
		p('black', 11),
		p('black', 11),
		p('red', 9),
		p('red', 9),
		p('yellow', 2),
		p('yellow', 2),
		p('blue', 13),
		p('blue', 13)
	];

	let pickPattern = $state<PatternType | null>(null);
	let pickDeclared = $state(false);
	let boardPattern = $state<PatternType | null>('duble');

	// ---------- Final de joc ----------
	const blank: PlayerBreakdown = {
		meldedPoints: 0,
		lipitPoints: 0,
		rackPenalty: 0,
		closingBonus: 0,
		atuBonus: 0,
		peTablaBonus: 0,
		nonMelderPenalty: 0,
		multiplier: 1,
		total: 0
	};
	const bd = (over: Partial<PlayerBreakdown>): PlayerBreakdown => ({ ...blank, ...over });

	const endNames = ['Ana', 'Andrei', 'Maria', 'Vlad'];
	const endBreakdowns: PlayerBreakdown[] = [
		bd({
			meldedPoints: 150,
			lipitPoints: 40,
			rackPenalty: -30,
			atuBonus: 50,
			multiplier: 2,
			total: 420
		}),
		bd({ meldedPoints: 90, rackPenalty: -55, multiplier: 2, total: 70 }),
		bd({ peTablaBonus: 1300, multiplier: 2, total: 2600 }),
		bd({ nonMelderPenalty: -100, atuBonus: 50, multiplier: 2, total: -100 })
	];
	const endScores = [420, 70, 2600, -100];
	const endSession = [1420, 980, 4600, 1250];

	const stockNames = ['Ana', 'Vlad'];
	const stockBreakdowns: PlayerBreakdown[] = [
		bd({ meldedPoints: 120, lipitPoints: 20, rackPenalty: -55, total: 85 }),
		bd({ meldedPoints: 40, rackPenalty: -70, atuBonus: 50, total: 20 })
	];
	const stockScores = [85, 20];
	const stockSession = [340, 210];
</script>

<svelte:head>
	<title>Previzualizare Remi Etalat</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 p-3 sm:p-5">
	<TableView
		title="Remi Etalat · previzualizare"
		notice="Mostră vizuală temporară — toate stările componentelor."
		opponents={[
			{ name: 'Andrei', pieceCount: 12, isActive: false, announcedAtu: true },
			{ name: 'Maria', pieceCount: 2, isActive: true, peTablaProgress: 0.64 },
			{ name: 'Vlad', pieceCount: 9, isActive: false },
			{ name: 'Ioana', pieceCount: 14, isActive: false, announcedAtu: false }
		]}
		myLabel="Tu (14 piese)"
		{rack}
		{melds}
		{sir}
		stockCount={48}
		{atu}
		phase="playing"
		isMyTurn={true}
		{selectedId}
		mustUsePieceIds={[]}
		turnStartedAt={Date.now() - 45000}
		turnTimeoutMs={120000}
		onselectpiece={(id) => (selectedId = id)}
		ondrawstock={noop}
		ontakelast={noop}
		ontakeatu={noop}
		ondiscard={noop}
		onmeld={noop}
		onlipi={noop}
		onclose={noop}
		onpeTabla={noop}
		onstrica={noop}
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<MeldBuilder
			pieces={builderPieces}
			selectedIds={builderSelected}
			onselect={(id) =>
				(builderSelected = builderSelected.includes(id)
					? builderSelected.filter((x) => x !== id)
					: [...builderSelected, id])}
			onconfirm={noop}
			oncancel={() => (builderSelected = [])}
			isFirstMeld={true}
		/>
		<section class="glass-panel rounded-2xl p-4" aria-label="Toate tipurile de piese">
			<h3 class="mb-2 text-sm font-bold tracking-wide text-gold-200 uppercase">
				Toate tipurile de piese
			</h3>
			<div class="flex flex-wrap gap-1.5">
				{#each gridPieces as piece (piece.id)}
					<PieceTile {piece} size="sm" />
				{/each}
			</div>
			<h4 class="mt-3 mb-2 text-xs font-bold tracking-wide text-cream-100/70 uppercase">
				Mărimi: sm / md / lg + selectat + proprietar
			</h4>
			<div class="flex flex-wrap items-end gap-2">
				<PieceTile piece={gridPieces[1]!} size="sm" />
				<PieceTile piece={gridPieces[5]!} size="md" selected />
				<PieceTile piece={gridPieces[10]!} size="lg" />
				<PieceTile piece={gridPieces[gridPieces.length - 1]!} size="md" ownerTag="B" selected />
			</div>
		</section>
	</div>

	<!-- Faza pre-joc + final de joc -->
	<section
		class="felt-surface relative space-y-5 rounded-3xl p-3 sm:p-5"
		aria-label="Faza pre-joc și finalul jocului"
	>
		<header>
			<h2 class="text-sm font-black tracking-[0.2em] text-gold-200 uppercase">
				Faza pre-joc și final de joc
			</h2>
			<p class="text-xs text-cream-100/70">
				Duble, atu, pe tablă și foaia de rezultate — cu date de exemplu.
			</p>
		</header>

		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-bold tracking-wider text-cream-100/70 uppercase">Model atu:</span>
			<button
				type="button"
				class="btn font-bold btn-xs {atuVariant === 'dublu'
					? 'border-gold-400 bg-gold-400 text-felt-950 hover:bg-gold-300'
					: 'border-gold-400/40 bg-transparent text-gold-200 hover:bg-gold-400/15'}"
				onclick={() => (atuVariant = 'dublu')}
			>
				1 / joker (joc dublu)
			</button>
			<button
				type="button"
				class="btn font-bold btn-xs {atuVariant === 'normal'
					? 'border-gold-400 bg-gold-400 text-felt-950 hover:bg-gold-300'
					: 'border-gold-400/40 bg-transparent text-gold-200 hover:bg-gold-400/15'}"
				onclick={() => (atuVariant = 'normal')}
			>
				5 (fără dublu)
			</button>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<DublePanel
				pieces={dublePieces}
				{myIndex}
				{playerNames}
				offers={dubleOffers}
				onoffer={offerDuble}
				onwithdraw={withdrawOffer}
				onstrica={noop}
				canStrica={true}
			/>
			<AtuPanel
				atu={atuPiece}
				{playerNames}
				canAnnounce={!atuAnnounced}
				announced={atuAnnounced}
				onannounce={() => (atuAnnounced = true)}
				oncontinue={noop}
			/>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 class="text-xs font-black tracking-[0.2em] text-gold-200 uppercase">Pe tablă</h3>
			<button
				type="button"
				class="btn text-cream-100/70 btn-ghost btn-xs hover:text-cream-50"
				onclick={() => {
					pickPattern = null;
					pickDeclared = false;
				}}
			>
				Resetează declararea
			</button>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<PeTablaPanel
				pattern={pickPattern}
				pieces={partialBoard}
				onselect={(key) => (pickPattern = key)}
				onconfirm={() => (pickDeclared = true)}
				onclose={noop}
				canDeclare={!pickDeclared}
			/>
			<PeTablaPanel
				pattern={boardPattern}
				pieces={completeDubleBoard}
				onselect={(key) => (boardPattern = key)}
				onconfirm={noop}
				onclose={noop}
				canDeclare={false}
			/>
		</div>

		<h3 class="text-xs font-black tracking-[0.2em] text-gold-200 uppercase">Rezultate</h3>

		<div class="grid gap-4 lg:grid-cols-2">
			<EndGameSheet
				playerNames={endNames}
				breakdowns={endBreakdowns}
				scores={endScores}
				sessionTotals={endSession}
				gameWinner={2}
				closerIndex={2}
				stockOut={false}
				doubleGame={true}
				onnext={noop}
			/>
			<EndGameSheet
				playerNames={stockNames}
				breakdowns={stockBreakdowns}
				scores={stockScores}
				sessionTotals={stockSession}
				gameWinner={0}
				closerIndex={null}
				stockOut={true}
				doubleGame={false}
				onnext={noop}
			/>
		</div>
	</section>
</div>
