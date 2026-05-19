<script lang="ts">
	import type { Card } from '$lib/engine/types';

	let {
		topCard,
		disabled = false,
		ondraw
	}: {
		topCard: Card | null;
		disabled?: boolean;
		ondraw?: () => void;
	} = $props();
</script>

<button
	class="flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white shadow-md transition-all sm:h-24 sm:w-16 {!disabled
		? 'cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-lg'
		: 'cursor-default opacity-60'}"
	onclick={ondraw}
	{disabled}
>
	{#if topCard}
		{#if topCard.isJoker}
			<span class="text-2xl sm:text-3xl">🃏</span>
		{:else}
			<span
				class="text-xs font-bold sm:text-sm {topCard.suit === '♥' || topCard.suit === '♦'
					? 'text-red-500'
					: 'text-gray-900'}">{topCard.suit}</span
			>
			<span
				class="text-lg sm:text-xl {topCard.suit === '♥' || topCard.suit === '♦'
					? 'text-red-500'
					: 'text-gray-900'}"
			>
				{topCard.value === 1
					? 'A'
					: topCard.value === 11
						? 'J'
						: topCard.value === 12
							? 'Q'
							: topCard.value === 13
								? 'K'
								: topCard.value}
			</span>
		{/if}
	{:else}
		<span class="text-2xl text-gray-300">○</span>
	{/if}
</button>
