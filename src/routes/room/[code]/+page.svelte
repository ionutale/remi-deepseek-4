<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
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
	import { canFormValidClose } from '$lib/engine/meld';
	import { drawFromPile, drawFromDiscard, discardCard, closeGame } from '$lib/engine/game';
	import { derived } from 'svelte/store';
	import { cardLabel } from '$lib/engine/display';
	import type { Card } from '$lib/engine/types';

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

	const canClose = derived([currentGameState, myIndex, myPlayerState], ([$gs, $idx, $ps]) => {
		if (!$gs || !$ps || $gs.phase === 'finished') return false;
		return $gs.currentPlayerIndex === $idx && canFormValidClose($ps.hand);
	});

	onDestroy(() => {
		stopPolling();
		reset();
	});

	async function handleLeave() {
		reset();
		await goto('/');
	}

	async function handleDrawPile() {
		const gs = await getCurrentGS();
		if (!gs) return;
		const newState = drawFromPile(gs);
		await sendGameState(newState);
	}

	async function handleDrawDiscard() {
		const gs = await getCurrentGS();
		if (!gs) return;
		const newState = drawFromDiscard(gs);
		await sendGameState(newState);
	}

	async function handleDiscard(cardId: string) {
		const gs = await getCurrentGS();
		if (!gs) return;
		try {
			const newState = discardCard(gs, cardId);
			await sendGameState(newState);
		} catch {
			console.error('Failed to discard card', cardId);
		}
	}

	async function handleClose() {
		const gs = await getCurrentGS();
		if (!gs) return;
		try {
			const newState = closeGame(gs);
			await sendGameState(newState);
		} catch {
			console.error('Failed to close game');
		}
	}

	function getCurrentGS(): Promise<import('$lib/engine/types').GameState | null> {
		return new Promise((resolve) => {
			const unsub = currentGameState.subscribe((gs) => {
				unsub();
				resolve(gs);
			});
		});
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

					{#if $roomStatus === 'waiting'}
						<button class="btn btn-ghost btn-sm" onclick={handleLeave}>Leave room</button>
					{/if}
				</div>
			</div>
		</div>
	{:else if $roomStatus === 'playing' && $currentGameState}
		<div class="mx-auto max-w-xl">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="badge badge-lg badge-primary">{code}</span>
					<span class="text-sm text-base-content/60">
						{$players.map((p) => p.name).join(', ')}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-sm">Pile: {$drawCount}</span>
					<span class="badge badge-{$isMyTurn ? 'success' : 'ghost'}">
						{$isMyTurn ? 'Your turn' : 'Waiting...'}
					</span>
				</div>
			</div>

			<div class="card bg-base-100 shadow-xl">
				<div class="card-body items-center gap-4">
					<div class="flex min-h-[4rem] w-full flex-wrap justify-center rounded-box bg-base-200 p-4">
						{#each $myHand as card (card.id)}
							<div class="rounded border bg-white px-3 py-1.5 text-sm font-bold shadow-sm">
								{cardLabel(card)}
							</div>
						{/each}
					</div>

					<div class="flex flex-wrap justify-center gap-2">
						{#if $gamePhase === 'draw'}
							<button
								class="btn btn-primary"
								onclick={handleDrawPile}
								disabled={!$isMyTurn || $drawCount === 0}
							>
								Draw from Pile
							</button>
							<button
								class="btn btn-secondary"
								onclick={handleDrawDiscard}
								disabled={!$isMyTurn || !$topDiscard}
							>
								Draw from Discard
							</button>
						{/if}
						{#if $canClose}
							<button class="btn btn-success" onclick={handleClose}>Close Game</button>
						{/if}
					</div>

					{#if $gamePhase === 'discard' && $isMyTurn}
						<div class="w-full">
							<h4 class="mb-2 text-xs font-semibold text-base-content/60">
								Select a card to discard
							</h4>
							<div class="flex flex-wrap justify-center gap-2">
								{#each $myHand as card (card.id)}
									<button class="btn btn-outline btn-sm" onclick={() => handleDiscard(card.id)}>
										{cardLabel(card)}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="w-full">
						<h4 class="mb-1 text-xs font-semibold text-base-content/60">Discard Pile</h4>
						<div class="flex min-h-[3rem] flex-wrap gap-2 rounded-box bg-base-200 p-2">
							{#each $currentGameState.discardPile as card (card.id)}
								<div class="rounded bg-white px-2 py-1 text-xs font-bold shadow-sm">
									{cardLabel(card)}
								</div>
							{/each}
						</div>
					</div>

					<div class="flex w-full justify-between text-xs text-base-content/40">
						<span>Phase: {$gamePhase}</span>
						<span>You: Player {$myIndex + 1}</span>
						<span>Current: Player {$currentGameState.currentPlayerIndex + 1}</span>
					</div>
				</div>
			</div>
		</div>
	{:else if $roomStatus === 'finished' && $currentGameState}
		<div class="mx-auto max-w-md pt-20">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body items-center gap-4 text-center">
					<h2 class="text-3xl font-bold text-accent">Game Over</h2>
					<p class="text-lg">Winner: Player {($currentGameState.winner ?? -1) + 1}</p>

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
