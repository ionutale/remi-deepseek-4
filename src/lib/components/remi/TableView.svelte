<script lang="ts">
	import type { Formation, GamePhase, Piece } from '$lib/engine/remi/types';
	import PieceTile from './Piece.svelte';
	import Rack from './Rack.svelte';

	export type OpponentInfo = {
		name: string;
		pieceCount: number;
		isActive: boolean;
		announcedAtu?: boolean;
		peTablaProgress?: number | null;
	};

	let {
		title = 'Remi Etalat',
		notice = '',
		opponents,
		myLabel,
		rack,
		melds,
		sir,
		stockCount,
		atu,
		phase,
		isMyTurn,
		selectedId = null,
		mustUsePieceIds = [],
		turnStartedAt,
		turnTimeoutMs,
		onselectpiece,
		ondrawstock,
		ontakelast,
		ontakeatu,
		ondiscard,
		onmeld,
		onlipi,
		onclose,
		onpeTabla,
		onstrica
	}: {
		title?: string;
		notice?: string;
		opponents: OpponentInfo[];
		myLabel: string;
		rack: Piece[];
		melds: Formation[];
		sir: Piece[];
		stockCount: number;
		atu: Piece | null;
		phase: GamePhase;
		isMyTurn: boolean;
		selectedId?: string | null;
		mustUsePieceIds?: string[];
		turnStartedAt?: number;
		turnTimeoutMs?: number;
		onselectpiece?: (id: string) => void;
		ondrawstock?: () => void;
		ontakelast?: () => void;
		ontakeatu?: () => void;
		ondiscard?: (id: string) => void;
		onmeld?: () => void;
		onlipi?: (meldId: string) => void;
		onclose?: () => void;
		onpeTabla?: () => void;
		onstrica?: () => void;
	} = $props();

	let now = $state(Date.now());
	$effect(() => {
		if (turnStartedAt === undefined || turnTimeoutMs === undefined) return;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	let remaining = $derived(
		turnStartedAt !== undefined && turnTimeoutMs !== undefined
			? Math.max(0, turnTimeoutMs - (now - turnStartedAt))
			: null
	);
	let clock = $derived(
		remaining === null
			? null
			: `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`
	);

	let mustUse = $derived((mustUsePieceIds ?? []).length > 0);
	let lastSir = $derived(sir.length > 0 ? sir[sir.length - 1] : null);
	let deadSir = $derived(sir.length > 0 ? sir[0] : null);

	const OWNER_NAMES = ['A', 'B', 'C', 'D'];
	function ownerTagOf(meld: Formation, i: number): string | null {
		const v = meld.lipitBy?.[i];
		if (v === null || v === undefined) return null;
		return OWNER_NAMES[v] ?? String(v);
	}
</script>

<div class="felt-surface relative min-h-screen rounded-none p-3 sm:p-5">
	<!-- HUD -->
	<header class="glass-panel mb-3 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
		<h1 class="text-lg font-black tracking-wide text-gold-200">{title}</h1>
		<span
			class="rounded-full px-3 py-1 text-xs font-black tracking-wider uppercase {isMyTurn
				? 'bg-gold-400 text-felt-950'
				: 'bg-black/40 text-cream-100/80'}"
			role="status"
		>
			{isMyTurn ? 'Rândul tău' : 'Așteaptă'}
		</span>
		{#if clock}
			<span
				class="rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-cream-50 tabular-nums"
				aria-label="Timp rămas"
			>
				{clock}
			</span>
		{/if}
		{#if phase === 'playing'}
			<span class="text-xs text-cream-100/70">Faza: joc</span>
		{:else if phase === 'duble'}
			<span class="text-xs text-cream-100/70">Faza: duble</span>
		{:else if phase === 'atu'}
			<span class="text-xs text-cream-100/70">Faza: atu</span>
		{:else}
			<span class="text-xs text-cream-100/70">Faza: terminat</span>
		{/if}
		{#if notice}
			<p class="w-full text-sm text-gold-200/90" role="status">{notice}</p>
		{/if}
	</header>

	<!-- Opponents -->
	<section class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Adversari">
		{#each opponents as opp}
			<div
				class="glass-panel rounded-xl px-3 py-2 {opp.isActive ? 'seat-active-pulse' : ''}"
				class:ring-2={opp.isActive}
				class:ring-gold-400={opp.isActive}
			>
				<p class="truncate text-sm font-bold text-cream-50">{opp.name}</p>
				<p class="text-xs text-cream-100/70">
					{opp.pieceCount} piese
					{#if opp.pieceCount <= 2}
						<span class="ml-1 font-bold text-gold-300">· Mai are {opp.pieceCount} piese</span>
					{/if}
				</p>
				<div class="mt-1 flex flex-wrap gap-1">
					{#if opp.announcedAtu}
						<span class="rounded bg-gold-400/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-200"
							>Atu</span
						>
					{/if}
					{#if opp.peTablaProgress !== null && opp.peTablaProgress !== undefined}
						<span class="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
							Pe tablă {Math.round(opp.peTablaProgress * 100)}%
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</section>

	<!-- Shared table -->
	<main class="grid gap-3 lg:grid-cols-[1fr_220px]">
		<section class="glass-panel rounded-2xl p-3 sm:p-4" aria-label="Masa comună">
			<h2 class="mb-2 text-sm font-bold tracking-wider text-gold-200 uppercase">Masa comună</h2>

			{#if melds.length === 0}
				<p
					class="mb-3 rounded-xl bg-black/30 px-3 py-4 text-center text-sm text-cream-100/60 italic"
				>
					Nicio formație etalată încă.
				</p>
			{:else}
				<ul class="mb-3 space-y-2">
					{#each melds as meld (meld.id)}
						<li class="rounded-xl bg-black/30 px-2.5 py-2">
							<div class="mb-1.5 flex items-center gap-2">
								<span
									class="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-cream-100/80 uppercase"
								>
									{meld.type === 'suite' ? 'Suită' : 'Terță'}
								</span>
								{#if onlipi}
									<button
										type="button"
										class="rounded bg-emerald-500/25 px-2 py-0.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-40"
										onclick={() => onlipi(meld.id)}
										disabled={!isMyTurn}
									>
										Lipește
									</button>
								{/if}
							</div>
							<div class="flex flex-wrap gap-1">
								{#each meld.pieces as piece, i (piece.id + '-' + i)}
									<PieceTile {piece} size="sm" ownerTag={ownerTagOf(meld, i)} />
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="grid gap-2 sm:grid-cols-3">
				<!-- Stock -->
				<div class="rounded-xl bg-black/30 p-2.5 text-center">
					<p class="mb-1 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">
						Grămadă
					</p>
					<div
						class="card-back-lattice mx-auto flex h-16 w-12 items-center justify-center rounded-lg"
					>
						<span class="text-lg font-black text-gold-300">{stockCount}</span>
					</div>
					{#if ondrawstock}
						<button
							type="button"
							class="btn mt-2 border-gold-400 bg-gold-400 font-bold text-felt-950 btn-xs hover:bg-gold-300 disabled:opacity-40"
							onclick={ondrawstock}
							disabled={!isMyTurn}
						>
							Trage din grămadă
						</button>
					{/if}
				</div>

				<!-- Șir -->
				<div class="rounded-xl bg-black/30 p-2.5">
					<p
						class="mb-1 text-center text-[11px] font-bold tracking-wider text-cream-100/70 uppercase"
					>
						Șir ({sir.length})
					</p>
					{#if sir.length === 0}
						<p class="py-3 text-center text-xs text-cream-100/50 italic">Șirul este gol.</p>
					{:else}
						<div class="flex flex-wrap items-start justify-center gap-1">
							{#if deadSir}
								<div class="flex flex-col items-center gap-0.5">
									<div class="flex h-12 w-16 items-center justify-center">
										<div class="rotate-90">
											<PieceTile piece={deadSir} size="sm" />
										</div>
									</div>
									<span class="max-w-16 text-center text-[9px] leading-tight text-rose-200/90">
										nu poate fi folosită
									</span>
								</div>
							{/if}
							{#if lastSir && sir.length > 1}
								<div class="flex flex-col items-center gap-0.5">
									<PieceTile piece={lastSir} size="sm" />
									{#if ontakelast}
										<button
											type="button"
											class="rounded bg-sky-500/25 px-2 py-0.5 text-[11px] font-bold text-sky-100 hover:bg-sky-500/40 disabled:opacity-40"
											onclick={ontakelast}
											disabled={!isMyTurn}
										>
											Ia ultima din șir
										</button>
									{/if}
								</div>
							{:else if lastSir && sir.length === 1}
								<span class="text-[10px] text-cream-100/50 italic">(doar piesa moartă)</span>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Atu -->
				<div class="rounded-xl bg-black/30 p-2.5 text-center">
					<p class="mb-1 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">Atu</p>
					{#if atu}
						<div class="flex justify-center">
							<PieceTile piece={atu} size="sm" />
						</div>
						{#if ontakeatu}
							<button
								type="button"
								class="btn mt-2 border-gold-400 bg-transparent font-bold text-gold-200 btn-xs hover:bg-gold-400/20 disabled:opacity-40"
								onclick={ontakeatu}
								disabled={!isMyTurn}
							>
								Ia atu
							</button>
						{/if}
					{:else}
						<p class="py-3 text-xs text-cream-100/50 italic">Atu luat.</p>
					{/if}
				</div>
			</div>
		</section>

		<!-- Actions -->
		<aside class="glass-panel flex flex-col gap-2 rounded-2xl p-3" aria-label="Acțiuni">
			<h2 class="text-sm font-bold tracking-wider text-gold-200 uppercase">{myLabel}</h2>
			{#if mustUse}
				<p class="rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs text-amber-200" role="note">
					Folosește piesa luată într-o formație
				</p>
			{/if}
			{#if onmeld}
				<button
					type="button"
					class="btn border-gold-400 bg-gold-400 font-bold text-felt-950 btn-sm hover:bg-gold-300 disabled:opacity-40"
					onclick={onmeld}
					disabled={!isMyTurn}
				>
					Etalează
				</button>
			{/if}
			{#if ondiscard}
				<button
					type="button"
					class="btn border-rose-300/60 font-bold text-rose-100 btn-outline btn-sm hover:bg-rose-400/20 disabled:opacity-40"
					onclick={() => selectedId && ondiscard(selectedId)}
					disabled={!isMyTurn || !selectedId || mustUse}
					title={mustUse
						? 'Folosește piesa luată într-o formație'
						: 'Alege o piesă din tablă, apoi aruncă'}
				>
					Aruncă{selectedId ? '' : ' · alege piesa'}
				</button>
			{/if}
			{#if onclose}
				<button
					type="button"
					class="btn border-emerald-300/60 font-bold text-emerald-100 btn-outline btn-sm hover:bg-emerald-400/20 disabled:opacity-40"
					onclick={onclose}
					disabled={!isMyTurn}
				>
					Închide
				</button>
			{/if}
			{#if onpeTabla}
				<button
					type="button"
					class="btn border-sky-300/60 font-bold text-sky-100 btn-outline btn-sm hover:bg-sky-400/20 disabled:opacity-40"
					onclick={onpeTabla}
					disabled={!isMyTurn}
				>
					Pe tablă
				</button>
			{/if}
			{#if onstrica}
				<button
					type="button"
					class="btn text-cream-100/80 btn-ghost btn-sm hover:text-cream-50"
					onclick={onstrica}
				>
					Strică jocul
				</button>
			{/if}
		</aside>
	</main>

	<!-- Own rack -->
	<section class="mt-3" aria-label="Tabla proprie">
		<Rack pieces={rack} {selectedId} disabled={!isMyTurn} onselect={onselectpiece} />
	</section>
</div>
