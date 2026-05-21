<script lang="ts">
	import type { Meld } from '$lib/engine/types';
	import { isValidMeld } from '$lib/engine/meld';
	import CardComp from './Card.svelte';

	const DATA_MELD = '__meld__';

	let {
		melds,
		ondragstart,
		oncarddrop,
		onmelddrop,
		oncardmovetomeld,
		oncardback
	}: {
		melds: (Meld | null)[];
		ondragstart?: (e: DragEvent, meldIndex: number) => void;
		oncarddrop?: (e: DragEvent, meldIndex: number) => void;
		onmelddrop?: (e: DragEvent, fromIndex: number, toIndex: number) => void;
		oncardmovetomeld?: (cardId: string, toSlotIndex: number) => void;
		oncardback?: (cardId: string) => void;
	} = $props();

	const rows = 2;
	const cols = 10;

	let dragOverSlot = $state<number | null>(null);

	function handleDragOver(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		dragOverSlot = slotIndex;
	}

	function handleDragLeave(_e: DragEvent, slotIndex: number) {
		if (dragOverSlot === slotIndex) dragOverSlot = null;
	}

	function handleDrop(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		dragOverSlot = null;
		const cardId = e.dataTransfer?.getData('text/card-id');
		const meldMove = e.dataTransfer?.getData('text/meld-move');
		const fromMeldRaw = e.dataTransfer?.getData('text/from-meld');
		const fromMeld = fromMeldRaw ? parseInt(fromMeldRaw, 10) : -1;

		if (meldMove) {
			if (fromMeld === slotIndex) return;
			onmelddrop?.(e, fromMeld, slotIndex);
		} else if (cardId && fromMeld >= 0) {
			if (fromMeld === slotIndex) return;
			oncardmovetomeld?.(cardId, slotIndex);
		} else if (cardId) {
			oncarddrop?.(e, slotIndex);
		}
	}

	function handleMeldDragStart(e: DragEvent, meldIndex: number) {
		e.dataTransfer?.setData('text/meld-move', 'true');
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		ondragstart?.(e, meldIndex);
	}

	function handleCardDragStart(e: DragEvent, meldIndex: number, cardId: string) {
		e.dataTransfer?.setData('text/card-id', cardId);
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function handleSlotClick(slotIndex: number) {
		const meld = melds[slotIndex];
		if (!meld) return;
		for (const card of meld.cards) {
			oncardback?.(card.id);
		}
	}

	function handleKeyDown(e: KeyboardEvent, slotIndex: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleSlotClick(slotIndex);
		}
	}
</script>

<div class="mx-auto w-full max-w-3xl px-2">
	<div class="flex flex-col gap-2">
		{#each { length: rows } as _, rowIdx (rowIdx)}
			<div class="flex justify-center gap-1.5">
				{#each { length: cols } as _, colIdx (colIdx)}
					{@const slotIndex = rowIdx * cols + colIdx}
					{@const meld = melds[slotIndex]}
					{@const isOver = dragOverSlot === slotIndex}
					<div
						class="relative flex min-h-16 items-center gap-0.5 rounded-lg border-2 p-1 transition-all
							{meld ? 'border-green-400/40 bg-green-950/40' : 'border-dashed border-white/10 bg-white/5'}
							{isOver ? 'border-primary/60 bg-primary/10' : ''}
							cursor-pointer hover:border-green-400/60"
						ondragover={(e) => handleDragOver(e, slotIndex)}
						ondragleave={(e) => handleDragLeave(e, slotIndex)}
						ondrop={(e) => handleDrop(e, slotIndex)}
						onclick={() => handleSlotClick(slotIndex)}
						onkeydown={(e) => handleKeyDown(e, slotIndex)}
						role="button"
						aria-label="Meld slot {slotIndex + 1}"
						tabindex="0"
					>
						{#if meld}
							<div
								class="flex items-center gap-0.5"
								draggable="true"
								role="group"
								aria-roledescription="meld"
								tabindex="-1"
								aria-label="Meld {slotIndex + 1}"
								ondragstart={(e) => handleMeldDragStart(e, slotIndex)}
							>
								{#each meld.cards as card (card.id)}
									<div
										class="relative"
										draggable="true"
										role="button"
										tabindex="-1"
										aria-label="Card from meld {slotIndex + 1}"
										ondragstart={(e) => {
											e.stopPropagation();
											handleCardDragStart(e, slotIndex, card.id);
										}}
									>
										<CardComp {card} faceDown={false} clickable={false} />
										<button
											class="absolute -top-1.5 right-0 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 text-[10px] text-white hover:bg-red-500"
											onclick={(e) => {
												e.stopPropagation();
												oncardback?.(card.id);
											}}>x</button
										>
									</div>
								{/each}
							</div>
							<div
								class="absolute top-0.5 right-1 text-[9px] font-medium tracking-wider uppercase
									{isValidMeld(meld.cards) ? 'text-green-400' : 'text-red-400'}"
							>
								{meld.type === 'set' ? 'S' : 'Q'}
							</div>
						{:else}
							<span class="w-full text-center text-[10px] text-white/15 select-none"
								>{slotIndex + 1}</span
							>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
