<script lang="ts">
	import type { Card } from '$lib/engine/types';
	import { cardLabel, displayValue, isRed } from '$lib/engine/display';

	let {
		topCard,
		count = 0,
		disabled = false,
		ondraw,
		oncarddrop = undefined
	}: {
		topCard: Card | null;
		count?: number;
		disabled?: boolean;
		ondraw?: () => void;
		oncarddrop?: (e: DragEvent) => void;
	} = $props();

	let dragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		if (!oncarddrop) return;
		e.preventDefault();
		dragOver = true;
	}
</script>

<button
	class="card-lift card-tap-target relative flex h-24 w-16 flex-col items-center justify-center rounded-xl bg-card-50 shadow-card ring-1 ring-black/10 sm:h-28 sm:w-20 {!disabled
		? 'cursor-pointer hover:-translate-y-1 hover:shadow-card-lift'
		: 'cursor-default opacity-60'} {dragOver ? 'ring-2 ring-gold-300' : ''}"
	type="button"
	onclick={ondraw}
	{disabled}
	aria-label={topCard
		? `Discard pile: ${cardLabel(topCard)}. Activate to draw.`
		: 'Empty discard pile'}
	ondragover={handleDragOver}
	ondragleave={() => (dragOver = false)}
	ondrop={(e) => {
		dragOver = false;
		oncarddrop?.(e);
	}}
>
	{#if topCard}
		{#if topCard.isJoker}
			<span class="text-2xl sm:text-3xl" aria-hidden="true">★</span>
			<span class="text-[9px] font-bold tracking-[0.18em] text-slate-500 uppercase">
				{topCard.jokerType === 'colored' ? 'Wild' : 'Joker'}
			</span>
		{:else}
			{@const red = isRed(topCard.suit)}
			<span
				class="absolute top-1 left-1.5 text-xs leading-none font-bold sm:text-sm {red
					? 'text-red-600'
					: 'text-slate-900'}"
				aria-hidden="true">{displayValue(topCard)}</span
			>
			<span
				class="text-2xl sm:text-3xl {red ? 'text-red-600' : 'text-slate-900'}"
				aria-hidden="true"
			>
				{topCard.suit}
			</span>
			<span
				class="absolute right-1.5 bottom-1 rotate-180 text-xs leading-none font-bold sm:text-sm {red
					? 'text-red-600'
					: 'text-slate-900'}"
				aria-hidden="true">{displayValue(topCard)}</span
			>
		{/if}
		{#if count > 1}
			<span
				class="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full border border-gold-300/50 bg-felt-950 px-1.5 text-[11px] font-bold text-gold-200 shadow-card"
			>
				+{count - 1}
			</span>
		{/if}
	{:else}
		<span class="text-2xl text-slate-300" aria-hidden="true">—</span>
		<span class="text-[10px] font-medium text-slate-400">discard</span>
	{/if}
</button>
