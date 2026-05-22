<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { derived, get } from 'svelte/store';
	import {
		room,
		playerId,
		currentGameState,
		roomStatus,
		players,
		startGame,
		restartGame,
		closeRoomAction,
		stopPolling,
		sendGameState,
		reset
	} from '$lib/stores/roomStore';
	import { canFormValidClose, suggestMelds } from '$lib/engine/meld';
	import { recordResult } from '$lib/stores/matchStore';
	import { HAND_SIZE } from '$lib/engine/deck';
	import { drawFromPile, drawFromDiscard, discardCard, closeGame } from '$lib/engine/game';
	import type { Card, MeldType } from '$lib/engine/types';
	import MeldArea from '$lib/components/MeldArea.svelte';
	import PlayerHand from '$lib/components/PlayerHand.svelte';
	import DrawPile from '$lib/components/DrawPile.svelte';
	import DiscardPile from '$lib/components/DiscardPile.svelte';

	const MAX_MELD_SLOTS = Math.ceil(HAND_SIZE / 3) + 2;

	let code = $derived($page.params.code);

	const isOwner = derived([room, playerId], ([$room, $pid]) => {
		if (!$room || !$pid) return false;
		return $room.ownerId === $pid;
	});

	const myIndex = derived([room, playerId], ([$room, $pid]) => {
		if (!$room || !$pid) return -1;
		return $room.players.findIndex((p) => p.id === $pid);
	});

	const myPlayerState = derived([currentGameState, myIndex], ([$gs, $idx]) => {
		if (!$gs || $idx < 0 || $idx >= ($gs.players?.length ?? 0)) return null;
		return $gs.players[$idx] ?? null;
	});

	const isMyTurn = derived([currentGameState, myIndex], ([$gs, $idx]) => {
		if (!$gs || $idx < 0) return false;
		return $gs.currentPlayerIndex === $idx && $gs.phase !== 'finished';
	});

	const myHand = derived(myPlayerState, ($ps) => $ps?.hand ?? []);
	const drawCount = derived(currentGameState, ($gs) => $gs?.drawPile.length ?? 0);
	const topDiscard = derived(currentGameState, ($gs) =>
		$gs && $gs.discardPile.length > 0 ? $gs.discardPile[$gs.discardPile.length - 1] : null
	);
	const gamePhase = derived(currentGameState, ($gs) => $gs?.phase ?? 'idle');

	const opponents = derived([room, playerId, currentGameState], ([$room, $pid, $gs]) => {
		if (!$room || !$gs) return [];
		return $room.players
			.map((p, i) => ({
				...p,
				handCount: $gs.players[i]?.hand.length ?? 0,
				isActive: i === $gs.currentPlayerIndex
			}))
			.filter((p) => p.id !== $pid);
	});

	// — Meld slot state (local staging, not sent to server) —
	let meldSlots = $state<Card[][]>(Array.from({ length: MAX_MELD_SLOTS }, () => []));
	let selectedCardId = $state<string | null>(null);
	let mmrResult = $state<{ winnerMMR: number; loserMMR: number } | null>(null);

	const assignedCardIds = $derived(new Set(meldSlots.flat().map((c) => c.id)));
	const remainingHand = $derived($myHand.filter((c) => !assignedCardIds.has(c.id)));
	const meldList = $derived(
		meldSlots.map((cards) => {
			if (cards.length === 0) return null;
			const nonJokers = cards.filter((c) => !c.isJoker);
			const allSameValue =
				nonJokers.length > 0 && nonJokers.every((c) => c.value === nonJokers[0]?.value);
			const allSameSuit =
				nonJokers.length > 0 && nonJokers.every((c) => c.suit === nonJokers[0]?.suit);
			const type: MeldType = allSameValue ? 'set' : allSameSuit ? 'sequence' : 'set';
			return { cards, type };
		})
	);

	const canClose = $derived(
		$currentGameState !== null &&
			$gamePhase !== 'finished' &&
			$isMyTurn &&
			canFormValidClose($myHand)
	);

	// Clear selected card when the discard phase ends
	$effect(() => {
		if ($gamePhase !== 'discard') selectedCardId = null;
	});

	// Fetch MMR result when game finishes
	$effect(() => {
		if ($roomStatus === 'finished' && !mmrResult && code) {
			recordResult(code).then((r) => {
				if (r) mmrResult = r;
			});
		}
	});

	// — Meld slot helpers —
	function addCardToSlot(slotIndex: number, cardId: string) {
		const card = $myHand.find((c) => c.id === cardId);
		if (!card) return;
		meldSlots[slotIndex] = [...meldSlots[slotIndex], card];
	}

	function removeCardFromSlot(cardId: string) {
		for (let i = 0; i < meldSlots.length; i++) {
			const idx = meldSlots[i].findIndex((c) => c.id === cardId);
			if (idx >= 0) {
				meldSlots[i] = [...meldSlots[i].slice(0, idx), ...meldSlots[i].slice(idx + 1)];
				return;
			}
		}
	}

	function moveMeld(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex || toIndex < 0 || toIndex >= meldSlots.length) return;
		const tmp = meldSlots[fromIndex];
		meldSlots[fromIndex] = meldSlots[toIndex];
		meldSlots[toIndex] = tmp;
	}

	function moveCardToSlot(cardId: string, toSlotIndex: number) {
		for (let i = 0; i < meldSlots.length; i++) {
			const idx = meldSlots[i].findIndex((c) => c.id === cardId);
			if (idx >= 0) {
				const card = meldSlots[i][idx];
				meldSlots[i] = [...meldSlots[i].slice(0, idx), ...meldSlots[i].slice(idx + 1)];
				meldSlots[toSlotIndex] = [...meldSlots[toSlotIndex], card];
				return;
			}
		}
	}

	function handleSuggest() {
		const suggestions = suggestMelds($myHand);
		meldSlots = Array.from({ length: MAX_MELD_SLOTS }, () => []);
		for (let i = 0; i < suggestions.length && i < MAX_MELD_SLOTS; i++) {
			meldSlots[i] = suggestions[i];
		}
	}

	// — Game action handlers —
	onDestroy(() => {
		stopPolling();
		reset();
	});

	async function handleLeave() {
		reset();
		await goto('/');
	}

	async function handleDrawPile() {
		const gs = get(currentGameState);
		if (!gs) return;
		await sendGameState(drawFromPile(gs));
	}

	async function handleDrawDiscard() {
		const gs = get(currentGameState);
		if (!gs) return;
		await sendGameState(drawFromDiscard(gs));
	}

	async function handleDiscard(cardId: string) {
		const gs = get(currentGameState);
		if (!gs) return;
		removeCardFromSlot(cardId);
		selectedCardId = null;
		try {
			await sendGameState(discardCard(gs, cardId));
		} catch {
			console.error('Failed to discard card', cardId);
		}
	}

	async function handleDiscardSelected() {
		if (selectedCardId) await handleDiscard(selectedCardId);
	}

	async function handleClose() {
		const gs = get(currentGameState);
		if (!gs) return;
		try {
			await sendGameState(closeGame(gs));
		} catch {
			console.error('Failed to close game');
		}
	}
</script>

<div class="min-h-screen bg-base-200 p-4">
	{#if $roomStatus === 'waiting'}
		<div class="mx-auto max-w-md pt-20">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body items-center gap-4 text-center">
					<h2 class="text-3xl font-bold">Room: {code}</h2>
					<p class="text-sm text-base-content/60">Share this code with friends</p>

					<div class="w-full">
						<h3 class="mb-2 font-semibold">Players ({$players.length})</h3>
						<ul class="list rounded-box bg-base-200">
							{#each $players as p, i (p.id)}
								<li class="list-row flex items-center gap-2">
									<span class="w-6 text-center text-sm text-base-content/50">{i + 1}.</span>
									<span>{p.name}</span>
									{#if $room?.ownerId === p.id}
										<span class="badge badge-sm badge-primary">Host</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>

					{#if $isOwner}
						<button
							class="btn w-full btn-lg btn-primary"
							onclick={startGame}
							disabled={$players.length < 2}
						>
							Start Game
						</button>
						{#if $players.length < 2}
							<p class="text-xs text-base-content/50">Waiting for at least 2 players...</p>
						{/if}
					{/if}

					<button class="btn btn-ghost btn-sm" onclick={handleLeave}>Leave room</button>
				</div>
			</div>
		</div>
	{:else if $roomStatus === 'playing' && $currentGameState}
		<div class="flex min-h-screen flex-col bg-linear-to-br from-green-800 to-green-900 -m-4 p-2 sm:p-4">

			<!-- Header -->
			<div class="flex items-center justify-between px-2 py-1">
				<div class="flex items-center gap-2">
					<span class="badge badge-lg badge-primary font-mono">{code}</span>
				</div>
				<div class="flex items-center gap-3">
					<span class="text-sm text-white/80">Pile: {$drawCount}</span>
					<span class="badge {$isMyTurn ? 'badge-success' : 'badge-ghost'}">
						{$isMyTurn ? 'Your turn' : 'Waiting...'}
					</span>
					<button class="btn btn-ghost btn-xs text-white/60" onclick={handleLeave}>Leave</button>
				</div>
			</div>

			<!-- Opponents -->
			{#if $opponents.length > 0}
				<div class="flex justify-center gap-4 py-2">
					{#each $opponents as opp (opp.id)}
						<div class="flex flex-col items-center gap-1">
							<div class="badge badge-lg {opp.isActive ? 'badge-primary' : 'badge-neutral'}">
								{opp.name}
							</div>
							<div class="flex">
								{#each { length: opp.handCount } as _, i (i)}
									<div
										class="h-8 w-5 rounded border border-blue-300 bg-linear-to-br from-blue-400 to-blue-600 shadow"
										style="margin: 0 -3px;"
									></div>
								{/each}
							</div>
							<span class="text-xs text-white/60">{opp.handCount} cards</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Draw / Discard piles -->
			<div class="flex items-center justify-center gap-8 py-3">
				<div class="flex flex-col items-center gap-1">
					<DrawPile
						cardCount={$drawCount}
						disabled={!$isMyTurn || $gamePhase !== 'draw'}
						ondraw={handleDrawPile}
					/>
					<span class="text-xs font-medium text-white/70">Draw Pile</span>
				</div>
				<div class="flex flex-col items-center gap-1">
					<DiscardPile
						topCard={$topDiscard}
						count={$currentGameState.discardPile.length}
						disabled={!$isMyTurn || $gamePhase !== 'draw'}
						ondraw={handleDrawDiscard}
					/>
					<span class="text-xs font-medium text-white/70">Discard Pile</span>
				</div>
			</div>

			<!-- Action buttons -->
			{#if $isMyTurn}
				<div class="flex justify-center gap-2 pb-2">
					{#if $gamePhase === 'discard'}
						<button
							class="btn btn-warning btn-sm"
							onclick={handleDiscardSelected}
							disabled={!selectedCardId}
						>
							Discard {selectedCardId ? '✓' : 'a card'}
						</button>
					{/if}
					{#if canClose}
						<button class="btn btn-success btn-sm" onclick={handleClose}>Close Game</button>
					{/if}
				</div>
			{/if}

			<!-- Meld staging area -->
			<div class="py-1">
				<p class="mb-1 text-center text-xs text-white/40">
					Drag cards here to organise melds — drag a group to reorder
				</p>
				<MeldArea
					melds={meldList}
					oncarddrop={(e, i) => {
						const cardId = e.dataTransfer?.getData('text/card-id');
						if (cardId) addCardToSlot(i, cardId);
					}}
					onmelddrop={(_e, from, to) => moveMeld(from, to)}
					oncardmovetomeld={(cardId, to) => moveCardToSlot(cardId, to)}
					oncardback={(id) => removeCardFromSlot(id)}
					onsuggest={handleSuggest}
				/>
			</div>

			<!-- Player hand -->
			<div class="border-t border-white/10 pt-2">
				<p class="mb-1 text-center text-xs text-white/40">
					{$gamePhase === 'discard' && $isMyTurn
						? 'Click a card to select it for discard, or drag to a meld slot above'
						: 'Your hand'}
				</p>
				<PlayerHand
					cards={remainingHand}
					disabled={!$isMyTurn || $gamePhase !== 'discard'}
					{selectedCardId}
					onselect={(id) => {
						if ($isMyTurn && $gamePhase === 'discard') selectedCardId = id;
					}}
					oncarddrop={(e) => {
						const cardId = e.dataTransfer?.getData('text/card-id');
						if (cardId) removeCardFromSlot(cardId);
					}}
				/>
			</div>

			<!-- Status bar -->
			<div class="flex justify-between px-2 py-1 text-xs text-white/50">
				<span>Phase: {$gamePhase}</span>
				<span>You: Player {$myIndex + 1}</span>
				<span>Current: Player {$currentGameState.currentPlayerIndex + 1}</span>
			</div>
		</div>
	{:else if $roomStatus === 'finished' && $currentGameState}
		<div class="mx-auto max-w-md pt-20">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body items-center gap-4 text-center">
					<h2 class="text-3xl font-bold text-accent">Game Over</h2>
					<p class="text-lg">Winner: Player {($currentGameState.winner ?? -1) + 1}</p>
					{#if mmrResult}
						<div class="flex gap-4 text-sm">
							<span class="badge badge-success">Winner MMR: {mmrResult.winnerMMR}</span>
							<span class="badge badge-error">Loser MMR: {mmrResult.loserMMR}</span>
						</div>
					{/if}

					{#if $isOwner}
						<button class="btn w-full btn-primary" onclick={restartGame}>Play Again</button>
						<button
							class="btn w-full btn-ghost"
							onclick={async () => {
								await closeRoomAction();
								await goto('/');
							}}>Close Room</button
						>
					{/if}
					<button class="btn btn-ghost btn-sm" onclick={handleLeave}>Leave room</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="mx-auto max-w-md pt-20 text-center">
			<p class="text-base-content/60">Loading room...</p>
		</div>
	{/if}
</div>
