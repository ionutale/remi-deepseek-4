<script lang="ts">
	import type { Card as CardType } from '$lib/engine/types';
	import Card from './Card.svelte';

	let {
		cards,
		disabled = false,
		selectedCardId = null,
		onselect,
		oncarddrop,
		ondragstart
	}: {
		cards: CardType[];
		disabled?: boolean;
		selectedCardId?: string | null;
		onselect?: (cardId: string) => void;
		oncarddrop?: (e: DragEvent) => void;
		ondragstart?: (e: DragEvent, card: CardType) => void;
	} = $props();

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		oncarddrop?.(e);
	}

	function handleCardDragStart(e: DragEvent, card: CardType) {
		e.dataTransfer?.setData('text/card-id', card.id);
		e.dataTransfer!.effectAllowed = 'move';
		ondragstart?.(e, card);
	}
</script>

<div
	class="flex min-h-20 flex-wrap justify-center gap-1 rounded-xl border-2 border-dashed border-transparent p-4 transition-all sm:gap-2"
	role="region"
	aria-label="Your hand — drop cards here to return from melds"
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	{#each cards as card (card.id)}
		<div
			draggable="true"
			role="button"
			tabindex="-1"
			aria-label="Card {card.id}"
			ondragstart={(e) => handleCardDragStart(e, card)}
		>
			<Card
				{card}
				clickable={!disabled}
				selected={card.id === selectedCardId}
				onselect={() => onselect?.(card.id)}
			/>
		</div>
	{/each}
</div>
