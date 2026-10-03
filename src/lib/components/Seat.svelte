<script lang="ts">
	let {
		name,
		cardCount,
		active = false,
		you = false
	}: {
		name: string;
		cardCount: number;
		active?: boolean;
		you?: boolean;
	} = $props();

	// Cap the rendered fan so 15-card hands stay compact; the count badge shows the truth.
	let shownBacks = $derived(Math.min(cardCount, 7));
	let backs = $derived(Array.from({ length: shownBacks }, (_, i) => i));
</script>

<div
	class="flex min-w-20 flex-col items-center gap-1.5 rounded-2xl px-3 py-2 {active
		? 'seat-active-pulse rounded-2xl'
		: 'ring-1 ring-cream-50/10'}"
	role="status"
	aria-label="{name}{you ? ' (you)' : ''}, {cardCount} cards{active ? ', active turn' : ''}"
>
	<div class="flex items-center gap-1.5">
		<span class="max-w-24 truncate text-xs font-semibold text-cream-50">{name}</span>
		{#if you}
			<span
				class="rounded-full border border-gold-400/60 px-1.5 text-[9px] font-bold tracking-wider text-gold-300 uppercase"
			>
				You
			</span>
		{/if}
		{#if active}
			<span class="h-2 w-2 rounded-full bg-gold-300" aria-hidden="true"></span>
		{/if}
	</div>
	<div class="flex" aria-hidden="true">
		{#each backs as i (i)}
			<div
				class="card-back-lattice flex h-10 w-7 items-center justify-center rounded-md sm:h-12 sm:w-9"
				style="margin: 0 -0.3rem; transform: rotate({(i - (shownBacks - 1) / 2) * 6}deg);"
			>
				<span class="text-[10px] font-black text-gold-300/90">◆</span>
			</div>
		{/each}
		{#if shownBacks === 0}
			<div
				class="flex h-10 w-7 items-center justify-center rounded-md border border-dashed border-cream-50/25 sm:h-12 sm:w-9"
			>
				<span class="text-[10px] text-cream-50/30">0</span>
			</div>
		{/if}
	</div>
	<span
		class="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-cream-50/80 tabular-nums"
	>
		{cardCount}
		{cardCount === 1 ? 'card' : 'cards'}
	</span>
</div>
