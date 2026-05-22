<script lang="ts">
	import type { Meld } from '$lib/engine/types';
	import { isValidMeld } from '$lib/engine/meld';
	import { cardLabel, isRed } from '$lib/engine/display';

	const COLS = 4;

	let {
		melds,
		ondragstart,
		oncarddrop,
		onmelddrop,
		oncardmovetomeld,
		oncardback,
		onsuggest
	}: {
		melds: (Meld | null)[];
		ondragstart?: (e: DragEvent, meldIndex: number) => void;
		oncarddrop?: (e: DragEvent, meldIndex: number) => void;
		onmelddrop?: (e: DragEvent, fromIndex: number, toIndex: number) => void;
		oncardmovetomeld?: (cardId: string, toSlotIndex: number) => void;
		oncardback?: (cardId: string) => void;
		onsuggest?: () => void;
	} = $props();

	const rows = $derived(Math.ceil(melds.length / COLS));

	let dragOverSlot = $state<number | null>(null);
	let draggingMeld = $state<number | null>(null);

	function handleDragOver(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverSlot = slotIndex;
	}

	function handleDragLeave(e: DragEvent, slotIndex: number) {
		// Only clear if actually leaving the slot (not moving to a child)
		const related = e.relatedTarget as Element | null;
		const target = e.currentTarget as Element | null;
		if (target && related && target.contains(related)) return;
		if (dragOverSlot === slotIndex) dragOverSlot = null;
	}

	function handleDrop(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		dragOverSlot = null;
		draggingMeld = null;
		const cardId = e.dataTransfer?.getData('text/card-id');
		const meldMove = e.dataTransfer?.getData('text/meld-move');
		const fromMeldRaw = e.dataTransfer?.getData('text/from-meld');
		const fromMeld = fromMeldRaw ? parseInt(fromMeldRaw, 10) : -1;

		if (meldMove) {
			if (fromMeld !== slotIndex) onmelddrop?.(e, fromMeld, slotIndex);
		} else if (cardId && fromMeld >= 0) {
			if (fromMeld !== slotIndex) oncardmovetomeld?.(cardId, slotIndex);
		} else if (cardId) {
			oncarddrop?.(e, slotIndex);
		}
	}

	function handleMeldDragStart(e: DragEvent, meldIndex: number) {
		e.dataTransfer?.setData('text/meld-move', 'true');
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		draggingMeld = meldIndex;
		ondragstart?.(e, meldIndex);
	}

	function handleCardDragStart(e: DragEvent, meldIndex: number, cardId: string) {
		e.stopPropagation();
		e.dataTransfer?.setData('text/card-id', cardId);
		e.dataTransfer?.setData('text/from-meld', String(meldIndex));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
</script>

<!--
  Rummikub-style rack board.
  Two rows of meld slots on a wood-textured surface.
-->
<div
	class="w-full rounded-2xl p-3 shadow-[inset_0_2px_8px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.5)]"
	style="background: linear-gradient(160deg, #6b3f1f 0%, #8b5a2b 40%, #7a4e22 70%, #5c3317 100%);"
>
	<!-- Header row: label + organize button -->
	<div class="mb-2 flex items-center justify-between px-1">
		<span class="text-[11px] font-medium tracking-widest text-amber-200/40 uppercase"
			>Meld Board</span
		>
		{#if onsuggest}
			<button
				class="flex items-center gap-1 rounded-md border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-[11px] font-medium text-amber-200/70 transition hover:border-amber-300/50 hover:bg-amber-200/20 hover:text-amber-100 active:scale-95"
				onclick={onsuggest}
				title="Auto-group hand into likely melds and partial formations"
			>
				⚙ Organize
			</button>
		{/if}
	</div>

	<!-- Top rail shadow line -->
	<div
		class="mb-2 h-px w-full rounded-full opacity-40"
		style="background: linear-gradient(90deg, transparent, #d4a96a, transparent);"
	></div>

	<div class="flex flex-col gap-3">
		{#each { length: rows } as _, rowIdx (rowIdx)}
			<!-- Rack rail row -->
			<div
				class="flex gap-2 rounded-xl p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
				style="background: linear-gradient(180deg, #3d2008 0%, #4a2a0e 50%, #3d2008 100%);"
			>
				{#each { length: COLS } as _, colIdx (colIdx)}
					{@const slotIndex = rowIdx * COLS + colIdx}
					{@const meld = melds[slotIndex] ?? null}
					{@const isOver = dragOverSlot === slotIndex}
					{@const isDraggingThis = draggingMeld === slotIndex}
					{@const valid = meld ? isValidMeld(meld.cards) : false}

					<div
						class="relative flex min-h-30 flex-1 items-center gap-1 rounded-lg border-2 px-2 py-2 transition-all duration-150
							{meld
							? valid
								? 'border-green-400/50 bg-white/[0.07]'
								: 'border-red-400/50 bg-white/[0.07]'
							: 'border-dashed border-amber-200/20 bg-black/20'}
							{isOver ? 'scale-[1.02] border-amber-300/70 bg-amber-300/10 shadow-lg' : ''}
							{isDraggingThis ? 'opacity-40' : ''}
							cursor-pointer"
						ondragover={(e) => handleDragOver(e, slotIndex)}
						ondragleave={(e) => handleDragLeave(e, slotIndex)}
						ondrop={(e) => handleDrop(e, slotIndex)}
						onclick={() => {
							if (meld) for (const c of meld.cards) oncardback?.(c.id);
						}}
						onkeydown={(e) => {
							if ((e.key === 'Enter' || e.key === ' ') && meld) {
								e.preventDefault();
								for (const c of meld.cards) oncardback?.(c.id);
							}
						}}
						role="button"
						aria-label="Meld slot {slotIndex + 1}{meld
							? ` — ${meld.cards.length} cards, ${valid ? 'valid' : 'invalid'}`
							: ' — empty'}"
						tabindex="0"
					>
						{#if meld}
							<!-- Meld group: drag handle + cards -->
							<div
								class="flex items-center gap-0.5"
								draggable="true"
								role="group"
								aria-roledescription="meld group"
								tabindex="-1"
								aria-label="Meld group {slotIndex + 1}"
								ondragstart={(e) => handleMeldDragStart(e, slotIndex)}
							>
								<!-- Drag grip -->
								<div
									class="mr-1 flex cursor-grab flex-col gap-0.5 opacity-30 hover:opacity-70 active:cursor-grabbing"
									aria-hidden="true"
								>
									{#each { length: 4 } as _}
										<div class="h-px w-3 rounded-full bg-amber-200"></div>
									{/each}
								</div>

								<!-- Cards -->
								{#each meld.cards as card (card.id)}
									<div
										class="group relative"
										draggable="true"
										role="button"
										tabindex="-1"
										aria-label="Card {cardLabel(card)} in meld {slotIndex + 1}"
										ondragstart={(e) => handleCardDragStart(e, slotIndex, card.id)}
									>
										<!-- Compact tile -->
										{#if card.isJoker && card.jokerType === 'colored'}
											<div
												class="flex h-16 w-11 flex-col items-center justify-center rounded-md bg-linear-to-br from-rose-400 via-amber-400 to-violet-500 shadow-sm sm:h-20 sm:w-14"
											>
												<span class="text-lg font-black text-white drop-shadow">★</span>
												<span class="text-[8px] font-bold tracking-widest text-white/90 uppercase"
													>Wild</span
												>
											</div>
										{:else if card.isJoker}
											<div
												class="flex h-16 w-11 flex-col items-center justify-center rounded-md bg-gray-900 shadow-sm sm:h-20 sm:w-14"
											>
												<span class="text-lg font-black text-white">★</span>
												<span class="text-[8px] font-bold tracking-widest text-white/60 uppercase"
													>Joker</span
												>
											</div>
										{:else}
											<div
												class="flex h-16 w-11 flex-col items-center justify-center rounded-md border border-gray-200 bg-white shadow-sm sm:h-20 sm:w-14"
											>
												<span
													class="text-xs leading-none font-bold sm:text-sm {isRed(card.suit)
														? 'text-red-500'
														: 'text-gray-900'}"
													>{card.value === 1
														? 'A'
														: card.value === 11
															? 'J'
															: card.value === 12
																? 'Q'
																: card.value === 13
																	? 'K'
																	: card.value}</span
												>
												<span
													class="text-sm sm:text-base {isRed(card.suit)
														? 'text-red-500'
														: 'text-gray-900'}">{card.suit}</span
												>
											</div>
										{/if}
										<!-- Remove button -->
										<button
											class="absolute -top-1.5 -right-1.5 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white shadow group-hover:flex hover:bg-red-600"
											onclick={(e) => {
												e.stopPropagation();
												oncardback?.(card.id);
											}}
											aria-label="Remove {cardLabel(card)} from meld">×</button
										>
									</div>
								{/each}
							</div>

							<!-- Validity badge -->
							<div
								class="absolute top-1 right-1.5 text-[9px] font-bold tracking-wider uppercase
								{valid ? 'text-green-400' : 'text-red-400'}"
							>
								{valid ? '✓' : '✗'}&nbsp;{meld.type === 'set'
									? 'Set'
									: meld.type === 'joker-meld'
										? 'Wild'
										: 'Seq'}
							</div>
						{:else}
							<!-- Empty slot -->
							<div class="flex w-full flex-col items-center justify-center gap-1 select-none">
								<div class="text-[10px] font-medium text-amber-200/20">{slotIndex + 1}</div>
								{#if isOver}
									<div class="text-xs text-amber-300/60">Drop here</div>
								{:else}
									<div class="text-[18px] text-amber-200/10">⠿</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<!-- Bottom rail shadow line -->
	<div
		class="mt-2 h-px w-full rounded-full opacity-40"
		style="background: linear-gradient(90deg, transparent, #d4a96a, transparent);"
	></div>
</div>
