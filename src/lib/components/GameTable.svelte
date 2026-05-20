<script lang="ts">
	import {
		gameState,
		isHumanTurn,
		gamePhase,
		playerDrawPile,
		playerDrawDiscard,
		playerDiscard,
		playerClose
	} from '$lib/stores/gameStore';
	import { canFormValidClose } from '$lib/engine/meld';
	import type { Card, MeldType } from '$lib/engine/types';
	import PlayerHand from './PlayerHand.svelte';
	import OpponentArea from './OpponentArea.svelte';
	import DrawPile from './DrawPile.svelte';
	import DiscardPile from './DiscardPile.svelte';
	import MeldArea from './MeldArea.svelte';

	let selectedCardId = $state<string | null>(null);
	let meldSlots = $state<Card[][]>(Array.from({ length: 20 }, () => []));

	let humanHand = $derived($gameState?.players[0]?.hand ?? []);
	let opponents = $derived($gameState ? $gameState.players.slice(1) : []);
	let drawCount = $derived($gameState?.drawPile.length ?? 0);
	let topDiscard = $derived(
		$gameState && $gameState.discardPile.length > 0
			? $gameState.discardPile[$gameState.discardPile.length - 1]
			: null
	);
	let canClose = $derived(
		$gameState !== null &&
			$gamePhase !== 'finished' &&
			canFormValidClose($gameState.players[0].hand)
	);
	let assignedCardIds = $derived(new Set(meldSlots.flat().map((c) => c.id)));
	let remainingHand = $derived(humanHand.filter((c) => !assignedCardIds.has(c.id)));

	let meldList = $derived(
		meldSlots.map((cards) => {
			if (cards.length === 0) return null;
			const nonJokers = cards.filter((c) => !c.isJoker);
			const allSameSuit = nonJokers.every((c) => c.suit === nonJokers[0]?.suit);
			const allSameValue = nonJokers.every((c) => c.value === nonJokers[0]?.value);
			const type: MeldType = allSameValue ? 'set' : allSameSuit ? 'sequence' : 'set';
			return { cards, type };
		})
	);

	function addCardToSlot(slotIndex: number, cardId: string) {
		const card = humanHand.find((c) => c.id === cardId);
		if (!card) return;
		meldSlots[slotIndex] = [...meldSlots[slotIndex], card];
		meldSlots = meldSlots;
	}

	function removeCardFromSlot(cardId: string) {
		for (let i = 0; i < meldSlots.length; i++) {
			const idx = meldSlots[i].findIndex((c) => c.id === cardId);
			if (idx >= 0) {
				meldSlots[i] = [...meldSlots[i].slice(0, idx), ...meldSlots[i].slice(idx + 1)];
				meldSlots = meldSlots;
				return;
			}
		}
	}

	function moveMeld(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex) return;
		if (toIndex < 0 || toIndex >= meldSlots.length) return;
		const meld = meldSlots[fromIndex];
		const target = meldSlots[toIndex];
		meldSlots[fromIndex] = target;
		meldSlots[toIndex] = meld;
		meldSlots = meldSlots;
	}

	function handleSelectCard(cardId: string) {
		if (!$isHumanTurn || $gamePhase !== 'discard') return;
		selectedCardId = cardId;
	}

	function handleDiscard() {
		if (!selectedCardId) return;
		removeCardFromSlot(selectedCardId);
		playerDiscard(selectedCardId);
		selectedCardId = null;
	}

	function handleDrawPile() {
		playerDrawPile();
	}

	function handleDrawDiscard() {
		playerDrawDiscard();
	}

	function handleClose() {
		playerClose();
	}

	function handleCardDrop(e: DragEvent, slotIndex: number) {
		const cardId = e.dataTransfer?.getData('text/card-id');
		if (cardId) addCardToSlot(slotIndex, cardId);
	}

	function handleMeldDrop(_e: DragEvent, fromIndex: number, toIndex: number) {
		moveMeld(fromIndex, toIndex);
	}

	function handleCardBack(cardId: string) {
		removeCardFromSlot(cardId);
	}

	function handleCardDropBack(e: DragEvent) {
		const cardId = e.dataTransfer?.getData('text/card-id');
		if (cardId) removeCardFromSlot(cardId);
	}

	function handleCardMoveToSlot(cardId: string, toSlotIndex: number) {
		for (let i = 0; i < meldSlots.length; i++) {
			const idx = meldSlots[i].findIndex((c) => c.id === cardId);
			if (idx >= 0) {
				const card = meldSlots[i][idx];
				meldSlots[i] = [...meldSlots[i].slice(0, idx), ...meldSlots[i].slice(idx + 1)];
				meldSlots[toSlotIndex] = [...meldSlots[toSlotIndex], card];
				meldSlots = meldSlots;
				return;
			}
		}
	}
</script>

<div class="flex min-h-screen flex-col bg-gradient-to-br from-green-800 to-green-900 p-2 sm:p-4">
	<OpponentArea {opponents} currentPlayerIndex={$gameState?.currentPlayerIndex ?? 0} />

	<div class="flex flex-1 flex-col items-center justify-center gap-3">
		<div class="flex items-center gap-8 sm:gap-16">
			<div class="flex flex-col items-center gap-2">
				<DrawPile
					cardCount={drawCount}
					disabled={!$isHumanTurn || $gamePhase !== 'draw'}
					ondraw={handleDrawPile}
				/>
				<span class="text-xs font-medium text-white/70">Draw Pile</span>
			</div>
			<div class="flex flex-col items-center gap-2">
				<DiscardPile
					topCard={topDiscard}
					disabled={!$isHumanTurn || $gamePhase !== 'draw'}
					ondraw={handleDrawDiscard}
				/>
				<span class="text-xs font-medium text-white/70">Discard Pile</span>
			</div>
		</div>

		{#if $isHumanTurn}
			<div class="flex flex-wrap justify-center gap-3">
				{#if $gamePhase === 'draw'}
					<button class="btn btn-primary" onclick={handleDrawPile} disabled={drawCount === 0}>
						Draw from Pile
					</button>
					<button class="btn btn-secondary" onclick={handleDrawDiscard} disabled={!topDiscard}>
						Draw from Discard
					</button>
				{:else if $gamePhase === 'discard'}
					<button class="btn btn-warning" onclick={handleDiscard} disabled={!selectedCardId}>
						Discard Selected
					</button>
				{/if}
				{#if canClose}
					<button class="btn btn-success" onclick={handleClose}> Close Game </button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="py-2">
		<MeldArea
			melds={meldList}
			oncarddrop={(e, i) => handleCardDrop(e, i)}
			onmelddrop={(e, f, t) => handleMeldDrop(e, f, t)}
			oncardmovetomeld={(cardId, to) => handleCardMoveToSlot(cardId, to)}
			oncardback={(id) => handleCardBack(id)}
		/>
	</div>

	<div class="border-t border-white/10 pt-2">
		<PlayerHand
			cards={remainingHand}
			disabled={!$isHumanTurn || $gamePhase !== 'discard'}
			{selectedCardId}
			onselect={handleSelectCard}
			oncarddrop={handleCardDropBack}
		/>
	</div>
</div>
