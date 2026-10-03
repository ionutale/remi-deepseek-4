<script lang="ts">
	import type { Card, CloseDeclaration, GamePhase } from '$lib/engine/types';
	import type { MeldBoard } from '$lib/stores/meldBoard.svelte';
	import { cardLabel } from '$lib/engine/display';
	import Seat from './Seat.svelte';
	import DrawPile from './DrawPile.svelte';
	import DiscardPile from './DiscardPile.svelte';
	import MeldArea from './MeldArea.svelte';
	import PlayerHand from './PlayerHand.svelte';

	interface Opponent {
		name: string;
		handCount: number;
		isActive: boolean;
	}

	/**
	 * Presentational card table shared by the solo table and the room page.
	 *
	 * Owns only ephemeral view state (the selected card). Every game mutation is
	 * delegated to the props callbacks, and every meld mutation to the `board`
	 * controller, so this component can render either side without touching the
	 * stores itself.
	 */
	let {
		title = 'Remi',
		notice,
		opponents = [],
		myLabel = 'You',
		hand,
		drawCount,
		discardPile,
		phase,
		isMyTurn,
		board,
		ondrawpile,
		ondrawdiscard,
		ondiscard,
		onclose,
		onnextround,
		roundSummary = null
	}: {
		title?: string;
		notice?: string;
		opponents?: Opponent[];
		myLabel?: string;
		hand: Card[];
		drawCount: number;
		discardPile: Card[];
		phase: GamePhase;
		isMyTurn: boolean;
		board: MeldBoard;
		ondrawpile: () => void;
		ondrawdiscard: () => void;
		ondiscard: (cardId: string) => void;
		onclose: (declaration: CloseDeclaration) => void;
		/** Optional while the round score sheet does not exist yet. */
		onnextround?: () => void;
		/** Optional: e.g. "Player 2 wins the round" — shown in the round-over banner. */
		roundSummary?: string | null;
	} = $props();

	let selectedCardId = $state<string | null>(null);

	let topDiscard = $derived(discardPile.length > 0 ? discardPile[discardPile.length - 1] : null);
	let remainingHand = $derived(board.remainingHand(hand));
	let stagedCount = $derived(board.slots.reduce((total, slot) => total + slot.length, 0));

	/** Play phases: the human may select, stage and discard. */
	let interactive = $derived(isMyTurn && (phase === 'draw' || phase === 'discard'));
	let canDrawPile = $derived(interactive && phase === 'draw' && drawCount > 0);
	let canDrawDiscard = $derived(interactive && phase === 'draw' && discardPile.length > 0);
	let canDiscard = $derived(interactive && phase === 'discard');

	/** The selected card, only while it is still free in hand (not staged). */
	let selectedCard = $derived(
		selectedCardId === null ? null : (hand.find((card) => card.id === selectedCardId) ?? null)
	);
	let selectedCardIsFree = $derived(
		selectedCard !== null && !board.assignedIds.has(selectedCard.id)
	);

	/**
	 * `declaration !== null` is exactly `board.isCloseReady(hand)`; the declaration
	 * itself is needed for the button label, so derive it once.
	 */
	let closeDeclaration = $derived(
		interactive && phase === 'discard' ? board.declaration(hand) : null
	);
	let closeDiscardCard = $derived(
		closeDeclaration ? (hand.find((card) => card.id === closeDeclaration?.discardId) ?? null) : null
	);

	let prompt = $derived.by(() => {
		if (phase === 'round-over') return 'Round over';
		if (phase === 'finished') return 'Match finished';
		if (!interactive) return 'Waiting for the other players…';
		if (phase === 'draw') return 'Your turn — draw a card from the stock or the discard pile';
		return selectedCardIsFree
			? 'Discard or close — tap a meld slot to stage the selected card'
			: 'Discard or close — select a card from your hand';
	});

	let turnLabel = $derived(interactive ? 'Your turn' : 'Waiting…');

	function handleSelect(cardId: string) {
		if (!interactive) return;
		selectedCardId = selectedCardId === cardId ? null : cardId;
	}

	function handleDiscard() {
		if (!canDiscard || !selectedCardIsFree || selectedCard === null) return;
		const cardId = selectedCard.id;
		selectedCardId = null;
		ondiscard(cardId);
	}

	function handleDiscardDrop(e: DragEvent) {
		if (!canDiscard) return;
		const cardId = e.dataTransfer?.getData('text/card-id');
		if (!cardId || board.assignedIds.has(cardId)) return;
		selectedCardId = null;
		ondiscard(cardId);
	}

	function handleHandDrop(e: DragEvent) {
		if (!interactive) return;
		const cardId = e.dataTransfer?.getData('text/card-id');
		if (cardId) board.remove(cardId);
	}

	function handleClose() {
		if (closeDeclaration === null) return;
		onclose(closeDeclaration);
	}

	// A staged card is no longer selectable: drop the selection so the rack
	// (Enter/Space) and the discard button always act on a free card.
	$effect(() => {
		if (selectedCardId === null) return;
		const assigned = board.assignedIds;
		if (!assigned.has(selectedCardId)) return;
		selectedCardId = null;
	});
</script>

<div class="felt-surface relative flex min-h-dvh w-full flex-col gap-2.5 p-2.5 sm:gap-3 sm:p-4">
	<!-- ── HUD ────────────────────────────────────────────────────────────── -->
	<header
		class="glass-panel relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl px-3 py-2"
	>
		<div class="flex min-w-0 flex-col">
			<span class="truncate text-sm font-bold tracking-wide text-cream-50">{title}</span>
			<span class="truncate text-[0.65rem] text-cream-50/55">{myLabel}</span>
		</div>

		<span
			class="rounded-full bg-black/30 px-2.5 py-1 text-[0.7rem] font-semibold text-cream-50/75 tabular-nums"
		>
			Stock · {drawCount}
		</span>

		<span
			class="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-bold {interactive
				? 'border-gold-300/60 bg-gold-300/15 text-gold-200'
				: 'border-cream-50/15 bg-black/25 text-cream-50/60'}"
		>
			<span
				class="h-1.5 w-1.5 rounded-full {interactive ? 'bg-gold-300' : 'bg-cream-50/30'}"
				aria-hidden="true"
			></span>
			{turnLabel}
		</span>

		{#if notice}
			<p
				class="w-full rounded-lg bg-gold-300/10 px-2.5 py-1 text-[0.72rem] text-gold-200/90"
				role="status"
			>
				{notice}
			</p>
		{/if}
	</header>

	<!-- ── Round over banner ──────────────────────────────────────────────── -->
	{#if phase === 'round-over'}
		<div
			class="glass-panel relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2"
			role="status"
		>
			<p class="text-sm font-semibold text-cream-50">
				Round over — {roundSummary ?? 'round decided'}
			</p>
			{#if onnextround}
				<button type="button" class="btn-gold px-3 py-1.5 text-xs" onclick={() => onnextround?.()}>
					Next round
				</button>
			{/if}
		</div>
	{/if}

	<!-- ── Opponents ───────────────────────────────────────────────────────── -->
	<section
		class="relative z-10 flex flex-wrap items-start justify-center gap-2 sm:gap-4"
		aria-label="Opponents"
	>
		{#each opponents as opponent, index (opponent.name + index)}
			<Seat name={opponent.name} cardCount={opponent.handCount} active={opponent.isActive} />
		{/each}
	</section>

	<!-- ── Piles ──────────────────────────────────────────────────────────── -->
	<section
		class="relative z-10 flex items-center justify-center gap-10 py-1 sm:gap-24"
		aria-label="Draw and discard piles"
	>
		<div class="flex flex-col items-center gap-1.5">
			<DrawPile cardCount={drawCount} disabled={!canDrawPile} ondraw={() => ondrawpile()} />
			<span class="text-[0.65rem] font-semibold tracking-[0.2em] text-cream-50/50 uppercase"
				>Stock</span
			>
		</div>
		<div class="flex flex-col items-center gap-1.5">
			<DiscardPile
				topCard={topDiscard}
				count={discardPile.length}
				disabled={!canDrawDiscard}
				ondraw={() => ondrawdiscard()}
				oncarddrop={handleDiscardDrop}
			/>
			<span class="text-[0.65rem] font-semibold tracking-[0.2em] text-cream-50/50 uppercase"
				>Discard</span
			>
		</div>
	</section>

	<!-- ── Prompt + actions ───────────────────────────────────────────────── -->
	<div class="relative z-10 flex flex-col items-center gap-1.5">
		<p class="text-gold-100/80 text-center text-[0.78rem] font-medium" aria-live="polite">
			{prompt}
		</p>

		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if canDiscard}
				<button
					type="button"
					class="btn-ghost-gold px-3 py-1.5 text-xs"
					onclick={handleDiscard}
					disabled={!selectedCardIsFree}
				>
					Discard{selectedCardIsFree && selectedCard ? ` ${cardLabel(selectedCard)}` : ''}
				</button>
			{/if}

			{#if closeDeclaration}
				<button type="button" class="btn-gold px-3 py-1.5 text-xs" onclick={handleClose}>
					Close — discard {closeDiscardCard ? cardLabel(closeDiscardCard) : 'a card'}
				</button>
			{/if}
		</div>
	</div>

	<!-- ── Meld rack ──────────────────────────────────────────────────────── -->
	<div class="relative z-10">
		<MeldArea {board} {hand} disabled={!interactive} {selectedCardId} />
	</div>

	<!-- ── Hand ───────────────────────────────────────────────────────────── -->
	<div class="glass-panel relative z-10 rounded-2xl px-1.5 py-1.5">
		<PlayerHand
			cards={remainingHand}
			disabled={!interactive}
			{selectedCardId}
			onselect={handleSelect}
			oncarddrop={handleHandDrop}
		/>
		<p class="pb-0.5 text-center text-[0.65rem] text-cream-50/40">
			{hand.length}
			{hand.length === 1 ? 'card' : 'cards'} in hand · {stagedCount} staged
		</p>
	</div>
</div>

<style>
	.btn-gold,
	.btn-ghost-gold {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border-radius: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease,
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.btn-gold {
		border: 1px solid rgb(255 244 214 / 0.5);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 10px 20px -14px rgb(0 0 0 / 0.95),
			inset 0 1px 0 rgb(255 255 255 / 0.55);
	}

	.btn-ghost-gold {
		border: 1px solid rgb(232 197 106 / 0.45);
		background-color: rgb(255 255 255 / 0.06);
		color: #f6efe0;
	}

	.btn-gold:hover,
	.btn-ghost-gold:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	.btn-gold:focus-visible,
	.btn-ghost-gold:focus-visible {
		outline: 2px solid rgb(243 221 160 / 0.9);
		outline-offset: 2px;
	}

	.btn-ghost-gold:disabled {
		cursor: default;
		opacity: 0.45;
		filter: none;
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-gold,
		.btn-ghost-gold {
			transition: none;
		}

		.btn-gold:hover,
		.btn-ghost-gold:hover {
			transform: none;
		}
	}
</style>
