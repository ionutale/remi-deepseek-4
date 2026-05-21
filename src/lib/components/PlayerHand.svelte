<script lang="ts">
	import type { Card } from '$lib/engine/types';
	import Card from './Card.svelte';

	let {
		cards,
		disabled = false,
		selectedCardId = null,
		onselect,
		oncarddrop
	}: {
		cards: Card[];
		disabled?: boolean;
		selectedCardId?: string | null;
		onselect?: (cardId: string) => void;
		oncarddrop?: (e: DragEvent) => void;
	} = $props();

	let dragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		oncarddrop?.(e);
	}

	function handleCardDragStart(e: DragEvent, card: Card) {
		e.dataTransfer?.setData('text/card-id', card.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
</script>

<div
	class="flex min-h-20 flex-wrap justify-center gap-1 rounded-xl border-2 p-4 transition-all sm:gap-2 {dragOver
		? 'border-primary/50 bg-primary/5'
		: 'border-dashed border-transparent'}"
	role="region"
	aria-label="Your hand — drop cards here to return from melds"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
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
