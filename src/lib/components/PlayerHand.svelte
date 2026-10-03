<script lang="ts">
	import type { Card as CardType } from '$lib/engine/types';
	import { cardLabel } from '$lib/engine/display';
	import Card from './Card.svelte';

	let {
		cards,
		disabled = false,
		selectedCardId = null,
		onselect,
		oncarddrop,
		size = 'md'
	}: {
		cards: CardType[];
		disabled?: boolean;
		selectedCardId?: string | null;
		onselect?: (cardId: string) => void;
		oncarddrop?: (e: DragEvent) => void;
		size?: 'sm' | 'md' | 'lg';
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

	function handleCardDragStart(e: DragEvent, card: CardType) {
		e.dataTransfer?.setData('text/card-id', card.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
</script>

<div
	class="flex min-h-24 flex-nowrap items-end justify-start gap-1.5 overflow-x-auto rounded-2xl px-3 py-3 transition-colors sm:justify-center sm:gap-2 {dragOver
		? 'bg-gold-300/10 outline-2 outline-gold-300/60 outline-dashed'
		: 'outline-2 outline-transparent outline-dashed'}"
	role="region"
	aria-label="Your hand — drop cards here to return from melds"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if cards.length === 0}
		<p class="w-full py-4 text-center text-sm text-cream-50/50">Your hand is empty</p>
	{:else}
		{#each cards as card (card.id)}
			<div
				class="shrink-0 snap-center"
				draggable="true"
				role="button"
				tabindex="-1"
				aria-label="Card {cardLabel(card)}"
				ondragstart={(e) => handleCardDragStart(e, card)}
			>
				<Card
					{card}
					{size}
					clickable={!disabled}
					selected={card.id === selectedCardId}
					onselect={() => onselect?.(card.id)}
				/>
			</div>
		{/each}
	{/if}
</div>
