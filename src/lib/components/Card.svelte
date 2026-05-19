<script lang="ts">
	import type { Card } from '$lib/engine/types';

	let {
		card,
		faceDown = false,
		selected = false,
		clickable = false,
		onselect
	}: {
		card: Card;
		faceDown?: boolean;
		selected?: boolean;
		clickable?: boolean;
		onselect?: (cardId: string) => void;
	} = $props();

	let isRed = $derived(card.suit === '♥' || card.suit === '♦');

	let displayValue = $derived(
		card.isJoker
			? '🃏'
			: card.value === 1
				? 'A'
				: card.value === 11
					? 'J'
					: card.value === 12
						? 'Q'
						: card.value === 13
							? 'K'
							: String(card.value)
	);
</script>

<button
	class="relative flex h-20 w-14 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white shadow-md transition-all sm:h-24 sm:w-16 {selected
		? 'scale-105 ring-3 ring-primary ring-offset-2'
		: ''} {clickable
		? 'cursor-pointer hover:-translate-y-1 hover:shadow-lg'
		: 'cursor-default'} {!clickable ? 'opacity-60' : ''}"
	onclick={() => onselect?.(card.id)}
	disabled={!clickable}
>
	{#if faceDown}
		<div
			class="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600"
		>
			<span class="text-lg font-bold text-white">?</span>
		</div>
	{:else if card.isJoker}
		<span class="text-2xl sm:text-3xl">🃏</span>
	{:else}
		<span
			class="absolute top-1 left-1.5 text-xs leading-none font-bold sm:text-sm {isRed
				? 'text-red-500'
				: 'text-gray-900'}">{displayValue}</span
		>
		<span class="text-xl sm:text-2xl {isRed ? 'text-red-500' : 'text-gray-900'}">{card.suit}</span>
	{/if}
</button>
