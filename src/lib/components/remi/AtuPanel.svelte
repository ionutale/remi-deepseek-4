<script lang="ts">
	import type { Piece } from '$lib/engine/remi/types';
	import PieceTile from './Piece.svelte';

	let {
		atu,
		playerNames,
		canAnnounce,
		announced,
		onannounce,
		oncontinue
	}: {
		atu: Piece | null;
		playerNames: string[];
		canAnnounce: boolean;
		announced: boolean;
		onannounce: () => void;
		oncontinue: () => void;
	} = $props();

	/** Atu is a 1 or a joker → every score is doubled. */
	let isDouble = $derived(atu !== null && (atu.isJoker || atu.value === 1));
</script>

<section class="glass-panel min-w-0 rounded-2xl p-4" aria-label="Atu">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-bold tracking-wide text-gold-200 uppercase">Atu</h3>
		{#if announced}
			<span
				class="rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-xs font-bold text-emerald-100"
				role="status"
			>
				Ai anunțat atu · +50
			</span>
		{:else if !canAnnounce}
			<span class="rounded-full bg-black/40 px-2.5 py-0.5 text-xs text-cream-100/70" role="status">
				Nu poți anunța atu
			</span>
		{/if}
	</div>

	{#if isDouble}
		<div
			class="joc-dublu seat-active-pulse mb-3 rounded-xl px-3 py-3 text-center"
			role="status"
			aria-label="Joc dublu"
		>
			<p class="text-xl font-black tracking-[0.18em] text-felt-950 uppercase">Joc dublu!</p>
			<p class="text-xs font-bold text-felt-900/90">
				Atuul este 1 sau joker — toate punctajele se înmulțesc cu 2
			</p>
		</div>
	{/if}

	<div class="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-black/30 p-3">
		<div class="wood-surface rounded-xl border border-wood-600/60 p-2">
			{#if atu}
				<PieceTile piece={atu} size="md" />
			{:else}
				<span
					class="flex h-20 w-14 items-center justify-center text-[10px] text-cream-100/60 italic"
				>
					fără atu
				</span>
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<p class="mb-1 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">
				Piesa de atu
			</p>
			<p
				class="rounded-lg border border-gold-400/40 bg-gold-400/10 px-2.5 py-1.5 text-sm font-bold text-gold-200"
			>
				Anunță atu: +50 puncte la final
			</p>
			<p class="mt-1.5 text-xs leading-relaxed text-cream-100/75">
				Cine are piesa identică cu atuul o poate anunța la început, înainte de prima tragere.
			</p>
		</div>
	</div>

	<div class="flex flex-wrap gap-2">
		{#if canAnnounce && !announced}
			<button
				type="button"
				class="btn border-gold-400 bg-gold-400 font-bold text-felt-950 btn-sm hover:bg-gold-300"
				onclick={onannounce}
			>
				Anunță atu
			</button>
		{/if}
		<button
			type="button"
			class="btn border-gold-400/50 font-bold text-gold-200 btn-outline btn-sm hover:bg-gold-400/15"
			onclick={oncontinue}
		>
			Continuă jocul
		</button>
	</div>

	<div class="mt-3">
		<h4 class="mb-1.5 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">
			Jucători la masă
		</h4>
		<ul class="flex flex-wrap gap-1.5">
			{#each playerNames as name, i (i)}
				<li class="rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-cream-50">
					{name}
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	.joc-dublu {
		background: linear-gradient(115deg, #f8e7b8 0%, #e7bd5b 45%, #d4a017 100%);
		border: 1px solid #a97c0f;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.6),
			0 6px 16px -8px rgb(0 0 0 / 0.7);
	}
</style>
