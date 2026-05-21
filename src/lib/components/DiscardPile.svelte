<script lang="ts">
	import type { Card } from '$lib/engine/types';
	import { cardLabel, isRed } from '$lib/engine/display';

	let {
		topCard,
		count = 0,
		disabled = false,
		ondraw
	}: {
		topCard: Card | null;
		count?: number;
		disabled?: boolean;
		ondraw?: () => void;
	} = $props();
</script>

<button
	class="relative flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white shadow-md transition-all sm:h-24 sm:w-16 {!disabled
		? 'cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-lg'
		: 'cursor-default opacity-60'}"
	onclick={ondraw}
	{disabled}
	aria-label={topCard ? `Discard pile: ${cardLabel(topCard)}` : 'Empty discard pile'}
>
	{#if topCard}
		<span
			class="text-lg sm:text-xl {topCard.isJoker
				? ''
				: isRed(topCard.suit)
					? 'text-red-500'
					: 'text-gray-900'}"
		>
			{cardLabel(topCard)}
		</span>
		{#if count > 1}
			<span
				class="absolute -top-1.5 -right-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gray-700 px-1 text-[9px] font-bold text-white"
			>
				+{count - 1}
			</span>
		{/if}
	{:else}
		<span class="text-2xl text-gray-300" aria-hidden="true">—</span>
	{/if}
</button>
