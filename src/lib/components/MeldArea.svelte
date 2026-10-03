<script lang="ts">
	import type { Card as CardType } from '$lib/engine/types';
	import { MAX_SLOTS, type MeldBoard, type SlotStatus } from '$lib/stores/meldBoard.svelte';
	import { cardLabel } from '$lib/engine/display';
	import Card from './Card.svelte';

	/**
	 * Walnut meld rack, driven entirely by the shared `MeldBoard` controller.
	 *
	 * Presentational + thin interaction shell: every mutation goes through the
	 * board (`place` / `remove` / `moveCard` / `swapSlots` / `addSlot` /
	 * `organize`) so the solo table and the room page behave identically.
	 */
	let {
		board,
		hand,
		disabled,
		selectedCardId = null
	}: {
		board: MeldBoard;
		hand: CardType[];
		disabled: boolean;
		selectedCardId?: string | null;
	} = $props();

	let dragOverSlot = $state<number | null>(null);
	let draggingMeld = $state<number | null>(null);

	let slots = $derived(board.slots);
	let stagedCount = $derived(slots.reduce((total, slot) => total + slot.length, 0));
	let canAddSlot = $derived(slots.length < MAX_SLOTS);
	let empty = $derived(stagedCount === 0);

	function canPlace(): boolean {
		return !disabled && selectedCardId !== null;
	}

	function placeInto(slotIndex: number) {
		if (!canPlace()) return;
		board.place(selectedCardId as string, slotIndex, hand);
	}

	function returnCard(cardId: string) {
		if (disabled) return;
		board.remove(cardId);
	}

	function returnSlot(slotIndex: number) {
		if (disabled) return;
		for (const card of [...slots[slotIndex]]) board.remove(card.id);
	}

	function slotActionLabel(index: number, cards: CardType[], status: SlotStatus | null): string {
		const head = `Meld slot ${index + 1}`;
		if (cards.length === 0) {
			return canPlace()
				? `${head}, empty. Press Enter to place the selected card.`
				: `${head}, empty.`;
		}
		const state = status?.valid
			? `valid ${status.type ?? 'meld'}`
			: `invalid${status?.reason ? `: ${status.reason}` : ''}`;
		const action = canPlace()
			? 'Press Enter to place the selected card'
			: 'Press Enter to pull back';
		return `${head}, ${cards.length} cards, ${state}. ${action}.`;
	}

	function handleSlotClick(e: MouseEvent, slotIndex: number) {
		// Clicks that originate on a staged card (or its remove button) are handled there.
		const target = e.target as HTMLElement | null;
		if (target?.closest('[data-staged-card]')) return;
		if (canPlace()) placeInto(slotIndex);
		else if (slots[slotIndex].length > 0) returnSlot(slotIndex);
	}

	function handleSlotKey(e: KeyboardEvent, slotIndex: number) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		// Prevent the native button activation so a key press acts exactly once.
		e.preventDefault();
		if (canPlace()) placeInto(slotIndex);
		else if (slots[slotIndex].length > 0) returnSlot(slotIndex);
	}

	function handleOrganize() {
		if (disabled || hand.length === 0) return;
		board.organize(hand);
	}

	function handleDragOver(e: DragEvent, slotIndex: number) {
		if (disabled) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverSlot = slotIndex;
	}

	function handleDragLeave(e: DragEvent, slotIndex: number) {
		const related = e.relatedTarget as Element | null;
		const current = e.currentTarget as Element | null;
		if (current && related && current.contains(related)) return;
		if (dragOverSlot === slotIndex) dragOverSlot = null;
	}

	function handleDrop(e: DragEvent, slotIndex: number) {
		e.preventDefault();
		dragOverSlot = null;
		draggingMeld = null;
		if (disabled) return;

		const cardId = e.dataTransfer?.getData('text/card-id');
		const fromMeldRaw = e.dataTransfer?.getData('text/from-meld');
		const fromMeld = fromMeldRaw ? Number.parseInt(fromMeldRaw, 10) : -1;
		const meldMove = e.dataTransfer?.getData('text/meld-move');

		if (meldMove) {
			// Whole-meld reorder / move between slots.
			if (Number.isInteger(fromMeld) && fromMeld !== slotIndex)
				board.swapSlots(fromMeld, slotIndex);
			return;
		}
		if (!cardId) return;
		if (Number.isInteger(fromMeld) && fromMeld >= 0) {
			if (fromMeld !== slotIndex) board.moveCard(cardId, slotIndex);
			return;
		}
		board.place(cardId, slotIndex, hand);
	}

	function handleMeldDragStart(e: DragEvent, slotIndex: number) {
		if (disabled) return;
		e.dataTransfer?.setData('text/meld-move', 'true');
		e.dataTransfer?.setData('text/from-meld', String(slotIndex));
		const first = slots[slotIndex][0];
		if (first) e.dataTransfer?.setData('text/card-id', first.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		draggingMeld = slotIndex;
	}

	function handleCardDragStart(e: DragEvent, slotIndex: number, cardId: string) {
		if (disabled) return;
		e.stopPropagation();
		e.dataTransfer?.setData('text/card-id', cardId);
		e.dataTransfer?.setData('text/from-meld', String(slotIndex));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
</script>

<section
	class="wood-surface rounded-2xl p-2.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.45),0_12px_28px_-18px_rgba(0,0,0,0.9)] ring-1 ring-black/50 sm:p-3"
	aria-label="Meld rack"
>
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
		<div class="flex items-baseline gap-2">
			<h2 class="text-[0.62rem] font-semibold tracking-[0.28em] text-gold-300/75 uppercase">
				Meld rack
			</h2>
			<span class="text-[0.65rem] text-cream-50/50 tabular-nums">
				{stagedCount}
				{stagedCount === 1 ? 'card' : 'cards'} staged
			</span>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				class="hover:text-gold-100 rounded-lg border border-gold-300/25 bg-black/25 px-2.5 py-1 text-[0.7rem] font-semibold text-gold-200/85 transition hover:border-gold-300/55 hover:bg-black/40 active:scale-[0.97] disabled:cursor-default disabled:opacity-35 disabled:hover:border-gold-300/25 disabled:hover:bg-black/25"
				onclick={handleOrganize}
				disabled={disabled || hand.length === 0}
				title="Group your hand into the best melds"
			>
				Organize
			</button>
			<button
				type="button"
				class="hover:text-gold-100 flex h-7 w-7 items-center justify-center rounded-lg border border-gold-300/25 bg-black/25 text-base leading-none text-gold-200/85 transition hover:border-gold-300/55 hover:bg-black/40 active:scale-[0.97] disabled:cursor-default disabled:opacity-35 disabled:hover:border-gold-300/25 disabled:hover:bg-black/25"
				onclick={() => board.addSlot()}
				disabled={disabled || !canAddSlot}
				aria-label="Add meld slot"
				title={canAddSlot ? 'Add meld slot' : 'Maximum of 8 meld slots'}
			>
				+
			</button>
		</div>
	</div>

	{#if empty && !disabled}
		<p class="mb-2 px-0.5 text-[0.68rem] text-cream-50/45">
			Tap a card in your hand, then tap a slot — or drag a card onto a slot. Close needs all 14
			other cards staged as valid melds.
		</p>
	{/if}

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
		{#each slots as cards, index (index)}
			{@const status = board.slotStatus(index)}
			{@const isOver = dragOverSlot === index}
			{@const isDragging = draggingMeld === index}
			{@const activatable = !disabled && (canPlace() || cards.length > 0)}

			<div
				class="slot relative flex min-h-26 flex-col rounded-xl border-2 p-1.5 transition-colors duration-150 {status
					? status.valid
						? 'border-emerald-400/55 bg-black/30'
						: 'border-rose-400/55 bg-black/30'
					: 'border-dashed border-gold-300/25 bg-black/20'} {isOver
					? 'border-gold-300 bg-gold-300/10'
					: ''} {isDragging ? 'opacity-40' : ''}"
				role="group"
				aria-label="Meld slot {index + 1}"
				ondragover={(e) => handleDragOver(e, index)}
				ondragleave={(e) => handleDragLeave(e, index)}
				ondrop={(e) => handleDrop(e, index)}
			>
				<!-- activation surface: click / Enter / Space -->
				{#if activatable}
					<button
						type="button"
						class="absolute inset-0 z-0 cursor-pointer rounded-xl"
						onclick={(e) => handleSlotClick(e, index)}
						onkeydown={(e) => handleSlotKey(e, index)}
						aria-label={slotActionLabel(index, cards, status)}
					></button>
				{:else}
					<div class="pointer-events-none absolute inset-0 z-0" aria-hidden="true"></div>
				{/if}

				<div class="pointer-events-none relative z-10 flex flex-col gap-1.5">
					<div class="flex items-center justify-between gap-1">
						<span class="text-[0.6rem] font-semibold text-gold-300/40 tabular-nums">
							{index + 1}
						</span>
						{#if status}
							<span
								class="max-w-[9rem] truncate rounded-full px-1.5 py-0.5 text-[0.6rem] leading-tight font-bold {status.valid
									? 'bg-emerald-400/20 text-emerald-200'
									: 'bg-rose-500/20 text-rose-200'}"
								title={status.valid ? `${status.type} — valid` : (status.reason ?? 'invalid')}
							>
								{status.valid ? '✓' : '✗'}
								{status.valid
									? status.type === 'sequence'
										? ' Sequence'
										: ' Set'
									: ` ${status.reason ?? 'invalid'}`}
							</span>
						{/if}
					</div>

					{#if cards.length === 0}
						<div class="flex flex-1 items-center justify-center pb-2">
							<span
								class="text-[0.7rem] font-medium {isOver
									? 'text-gold-200/80'
									: canPlace()
										? 'text-cream-50/35'
										: 'text-cream-50/20'}"
							>
								{isOver ? 'Drop here' : canPlace() ? 'Tap to place' : '—'}
							</span>
						</div>
					{:else}
						<div
							class="flex flex-wrap items-start gap-1"
							role="group"
							draggable={!disabled}
							aria-label="Meld {index + 1}: {cards.length} cards"
							ondragstart={(e) => handleMeldDragStart(e, index)}
							ondragend={() => (draggingMeld = null)}
						>
							{#each cards as card, cardIndex (card.id)}
								<div
									class="snap-in pointer-events-auto relative"
									style="animation-delay: {Math.min(cardIndex * 45, 220)}ms"
									data-staged-card
									role="presentation"
									draggable={!disabled}
									ondragstart={(e) => handleCardDragStart(e, index, card.id)}
									ondragend={() => (draggingMeld = null)}
								>
									<Card
										{card}
										size="sm"
										clickable={!disabled}
										onselect={() => returnCard(card.id)}
									/>
									<button
										type="button"
										class="absolute -top-1.5 -right-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[0.65rem] leading-none font-black text-white shadow-sm ring-1 ring-black/40 transition hover:bg-rose-600"
										onclick={() => returnCard(card.id)}
										{disabled}
										aria-label="Return {cardLabel(card)} to your hand"
										title="Return to hand"
									>
										×
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	.slot:focus-within {
		box-shadow: 0 0 0 2px rgb(243 216 148 / 0.55);
	}

	@media (prefers-reduced-motion: no-preference) {
		.snap-in {
			animation: meld-snap var(--duration-card-snap) cubic-bezier(0.2, 0.8, 0.25, 1) backwards;
		}
	}

	@keyframes meld-snap {
		from {
			opacity: 0.35;
			transform: translateY(-10px) scale(0.92);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
