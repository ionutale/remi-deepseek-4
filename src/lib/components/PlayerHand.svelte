<script lang="ts">
	import type { Card as CardType } from '$lib/engine/types';
	import Card from './Card.svelte';

	let {
		cards,
		disabled = false,
		selectedCardId = null,
		onselect
	}: {
		cards: CardType[];
		disabled?: boolean;
		selectedCardId?: string | null;
		onselect?: (cardId: string) => void;
	} = $props();
</script>

<div class="flex flex-wrap justify-center gap-1 p-4 sm:gap-2">
	{#each cards as card (card.id)}
		<Card
			{card}
			clickable={!disabled}
			selected={card.id === selectedCardId}
			onselect={() => onselect?.(card.id)}
		/>
	{/each}
</div>
