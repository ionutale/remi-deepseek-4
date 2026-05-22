<script lang="ts">
	import type { Card } from '$lib/engine/types';
	import { displayValue, isRed } from '$lib/engine/display';

	let {
		card,
		faceDown = false,
		selected = false,
		clickable = false,
		draggable = false,
		onselect
	}: {
		card: Card;
		faceDown?: boolean;
		selected?: boolean;
		clickable?: boolean;
		draggable?: boolean;
		onselect?: (cardId: string) => void;
	} = $props();

	let dragOver = $state(false);

	function handleDragStart(e: DragEvent) {
		e.dataTransfer?.setData('text/card-id', card.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}
</script>

<button
	class="relative flex h-20 w-14 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white shadow-md transition-all sm:h-24 sm:w-16 {selected
		? 'scale-105 ring-2 ring-primary ring-offset-2'
		: ''} {dragOver ? 'ring-2 ring-primary/50' : ''} {clickable
		? 'cursor-pointer hover:-translate-y-1 hover:shadow-lg'
		: 'cursor-default'} {!clickable ? 'opacity-60' : ''}"
	{draggable}
	ondragstart={handleDragStart}
	ondragenter={() => (dragOver = true)}
	ondragleave={() => (dragOver = false)}
	ondragover={handleDragOver}
	onclick={() => onselect?.(card.id)}
	disabled={!clickable}
>
	{#if faceDown}
		<div
			class="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600"
		>
			<span class="text-lg font-bold text-white">?</span>
		</div>
	{:else if card.isJoker && card.jokerType === 'colored'}
		<div
			class="flex h-full w-full flex-col items-center justify-center rounded-xl bg-linear-to-br from-rose-400 via-amber-400 to-violet-500"
		>
			<span class="text-xl font-black text-white drop-shadow sm:text-2xl">★</span>
			<span class="text-[9px] font-bold tracking-widest text-white/90 uppercase">Wild</span>
		</div>
	{:else if card.isJoker}
		<div class="flex h-full w-full flex-col items-center justify-center rounded-xl bg-gray-900">
			<span class="text-xl font-black text-white sm:text-2xl">★</span>
			<span class="text-[9px] font-bold tracking-widest text-white/60 uppercase">Joker</span>
		</div>
	{:else}
		<span
			class="absolute top-1 left-1.5 text-xs leading-none font-bold sm:text-sm {isRed(card.suit)
				? 'text-red-500'
				: 'text-gray-900'}">{displayValue(card)}</span
		>
		<span class="text-xl sm:text-2xl {isRed(card.suit) ? 'text-red-500' : 'text-gray-900'}"
			>{card.suit}</span
		>
	{/if}
</button>
