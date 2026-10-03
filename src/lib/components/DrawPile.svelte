<script lang="ts">
	let {
		cardCount,
		disabled = false,
		ondraw
	}: {
		cardCount: number;
		disabled?: boolean;
		ondraw?: () => void;
	} = $props();

	let empty = $derived(cardCount === 0);
</script>

<button
	class="card-lift card-tap-target relative h-24 w-16 sm:h-28 sm:w-20 {empty
		? 'cursor-default rounded-xl border-2 border-dashed border-cream-50/20 bg-transparent'
		: disabled
			? 'cursor-default'
			: 'cursor-pointer hover:-translate-y-1'}"
	type="button"
	onclick={ondraw}
	{disabled}
	aria-label={empty ? 'Draw pile is empty' : `Draw pile, ${cardCount} cards remaining`}
>
	{#if empty}
		<span class="flex h-full w-full flex-col items-center justify-center gap-1">
			<span class="text-2xl text-cream-50/25" aria-hidden="true">🂠</span>
			<span class="text-xs font-medium text-cream-50/30">empty</span>
		</span>
	{:else}
		<!-- stacked depth layers -->
		<span
			class="card-back-lattice absolute inset-0 translate-x-1 translate-y-1 rounded-xl opacity-60"
			aria-hidden="true"
		></span>
		<span
			class="card-back-lattice absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-xl opacity-80"
			aria-hidden="true"
		></span>
		<span
			class="card-back-lattice absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl shadow-card"
			aria-hidden="true"
		>
			<span class="text-xl font-black text-gold-300 drop-shadow">◆</span>
			<span class="text-[8px] font-bold tracking-[0.2em] text-gold-300/80 uppercase">Remi</span>
		</span>
		<span
			class="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full border border-gold-300/50 bg-felt-950 px-1.5 text-[11px] font-bold text-gold-200 shadow-card"
		>
			{cardCount}
		</span>
	{/if}
</button>
