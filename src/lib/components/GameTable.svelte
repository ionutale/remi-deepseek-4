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
	import PlayerHand from './PlayerHand.svelte';
	import OpponentArea from './OpponentArea.svelte';
	import DrawPile from './DrawPile.svelte';
	import DiscardPile from './DiscardPile.svelte';

	let selectedCardId = $state<string | null>(null);

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

	function handleSelectCard(cardId: string) {
		if (!$isHumanTurn || $gamePhase !== 'discard') return;
		selectedCardId = cardId;
	}

	function handleDiscard() {
		if (!selectedCardId) return;
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
</script>

<div class="flex min-h-screen flex-col bg-gradient-to-br from-green-800 to-green-900 p-2 sm:p-4">
	<OpponentArea {opponents} currentPlayerIndex={$gameState?.currentPlayerIndex ?? 0} />

	<div class="flex flex-1 flex-col items-center justify-center gap-6">
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

	<div class="border-t border-white/10 pt-2">
		<PlayerHand
			cards={humanHand}
			disabled={!$isHumanTurn || $gamePhase !== 'discard'}
			{selectedCardId}
			onselect={handleSelectCard}
		/>
	</div>
</div>
