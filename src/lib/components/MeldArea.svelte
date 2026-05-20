<script lang="ts">
	import type { Meld } from '$lib/engine/types';
	import { isValidMeld } from '$lib/engine/meld';
	import CardComp from './Card.svelte';

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

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function handleDrop(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		const cardId = e.dataTransfer?.getData('text/card-id');
		const fromMeldRaw = e.dataTransfer?.getData('text/from-meld');
		const fromMeld = fromMeldRaw ? parseInt(fromMeldRaw, 10) : -1;

		if (!cardId) return;

		if (cardId === 'meld' && fromMeld >= 0) {
			if (fromMeld === slotIndex) return;
			onmelddrop?.(e, fromMeld, slotIndex);
		} else if (cardId === 'meld') {
			return;
		} else if (fromMeld >= 0) {
			if (fromMeld === slotIndex) return;
			oncardmovetomeld?.(cardId, slotIndex);
		} else {
			oncarddrop?.(e, slotIndex);
		}
	}

	function handleMeldDragStart(e: DragEvent, meldIndex: number) {
		e.dataTransfer?.setData('text/card-id', 'meld');
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		e.dataTransfer!.effectAllowed = 'move';
		ondragstart?.(e, meldIndex);
	}

	function handleCardDragStart(e: DragEvent, meldIndex: number) {
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		e.dataTransfer!.effectAllowed = 'move';
	}

	function handleSlotClick(_e: MouseEvent, slotIndex: number) {
		const meld = melds[slotIndex];
		if (!meld) return;
		for (const card of meld.cards) {
			oncardback?.(card.id);
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
					<div
						class="relative flex min-h-16 items-center gap-0.5 rounded-lg border-2 p-1 transition-all
							{meld ? 'border-green-400/40 bg-green-950/40' : 'border-dashed border-white/10 bg-white/5'}
							cursor-pointer hover:border-green-400/60"
						ondragover={handleDragOver}
						ondrop={(e) => handleDrop(e, slotIndex)}
						onclick={(e) => handleSlotClick(e, slotIndex)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ')
								handleSlotClick(e as unknown as MouseEvent, slotIndex);
						}}
						role="button"
						aria-label="Meld slot {slotIndex + 1}"
						tabindex="-1"
					>
						{#if meld}
							<div
								class="flex items-center gap-0.5"
								draggable="true"
								role="listbox"
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
											e.dataTransfer?.setData('text/card-id', card.id);
											handleCardDragStart(e, slotIndex);
										}}
									>
										<CardComp {card} faceDown={false} clickable={false} />
										<button
											class="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 text-[10px] text-white hover:bg-red-500"
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
