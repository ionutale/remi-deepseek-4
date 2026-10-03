<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
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
		stopPolling,
		sendGameState,
		nextRoundAction,
		reset
	} from '$lib/stores/roomStore';
	import { recordResult } from '$lib/stores/matchStore';
	import { drawFromPile, drawFromDiscard, discardCard, closeGame } from '$lib/engine/game';
	import type { CloseDeclaration, GameState } from '$lib/engine/types';
	import { MeldBoard } from '$lib/stores/meldBoard.svelte';
	import GameTableView from '$lib/components/GameTableView.svelte';
	import ScoreSheet from '$lib/components/ScoreSheet.svelte';
	import MatchOver from '$lib/components/MatchOver.svelte';

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

	const myHand = derived(myPlayerState, ($ps) => $ps?.hand ?? []);

	const isMyTurn = derived([currentGameState, myIndex], ([$gs, $idx]) => {
		if (!$gs || $idx < 0) return false;
		return $gs.currentPlayerIndex === $idx && $gs.phase !== 'finished';
	});

	const myLabel = derived([players, myIndex], ([$players, $idx]) =>
		$idx >= 0 ? ($players[$idx]?.name ?? 'You') : 'You'
	);

	/** Player names in game-state order (room order === engine seat order). */
	const names = derived(players, ($players) => $players.map((p) => p.name));

	/** Lobby seats: filled rows plus empty placeholders up to the room max. */
	const seats = derived(room, ($room) => {
		const max = Math.max($room?.maxPlayers ?? 0, $room?.players.length ?? 0, 1);
		return Array.from({ length: max }, (_, i) => $room?.players[i] ?? null);
	});

	const opponents = derived([room, playerId, currentGameState], ([$room, $pid, $gs]) => {
		if (!$room || !$gs) return [];
		return $room.players
			.map((p, i) => ({
				id: p.id,
				name: p.name,
				handCount: $gs.players[i]?.hand.length ?? 0,
				isActive: i === $gs.currentPlayerIndex
			}))
			.filter((p) => p.id !== $pid)
			.map((p) => ({ name: p.name, handCount: p.handCount, isActive: p.isActive }));
	});

	/** Human-readable round result for the table's round-over banner. */
	const roundSummary = derived([currentGameState, players], ([$gs, $players]) => {
		if (!$gs || $gs.roundWinner === null) return null;
		const winner = $gs.roundWinner;
		const name = $players[winner]?.name ?? `Player ${winner + 1}`;
		return `${name} wins the round`;
	});

	/** One board instance per room page; the view mutates it, this page syncs it. */
	const board = new MeldBoard();

	/** Round the board was last synced for, so a fresh deal clears staged cards. */
	let syncedRound: number | null = null;

	/** Shown through GameTableView when a PUT is rejected as stale (409). */
	let notice = $state<string | undefined>(undefined);

	/** MMR delta from the matchmaking result endpoint, 1v1 rooms only. */
	let mmrResult = $state<{ winnerMMR: number; loserMMR: number } | null>(null);
	let mmrRequested = false;

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	// Keep the staged board describing the viewer's actual hand: reset on a new
	// round, drop staged cards that are no longer held.
	$effect(() => {
		const gs = $currentGameState;
		const hand = $myHand;
		// Every board call reads and writes `board.slots`, so they must be untracked:
		// otherwise this effect depends on the very state it writes and re-runs forever.
		untrack(() => {
			if (!gs) {
				board.reset();
				syncedRound = null;
				return;
			}
			if (gs.round !== syncedRound) {
				board.reset();
				syncedRound = gs.round;
			}
			board.sync(hand);
		});
	});

	// Fetch the MMR delta once when the match finishes (idempotent server-side).
	$effect(() => {
		if ($currentGameState?.phase !== 'finished') {
			mmrRequested = false;
			mmrResult = null;
			return;
		}
		if (mmrRequested || !code) return;
		mmrRequested = true;
		recordResult(code)
			.then((r) => {
				if (r) mmrResult = r;
			})
			.catch((e) => console.error('Failed to record match result:', e));
	});

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
		stopPolling();
		reset();
	});

	async function handleLeave() {
		reset();
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto('/');
	}

	async function copyCode() {
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1600);
		} catch (e) {
			console.error('Failed to copy room code:', e);
		}
	}

	/**
	 * Send an optimistic state transition. A 409 re-fetches the room inside
	 * `sendGameState`; surface that as a notice so the player retries.
	 */
	async function submit(
		next: GameState,
		action: 'move' | 'close' = 'move',
		declaration?: CloseDeclaration
	): Promise<void> {
		try {
			const result = await sendGameState(next, action, declaration);
			if (result.conflict) {
				notice = 'State refreshed — please retry your move';
			} else if (result.ok) {
				notice = undefined;
			}
		} catch (e) {
			console.error('Failed to send game state:', e);
		}
	}

	// — Game action handlers —
	async function handleDrawPile() {
		const gs = get(currentGameState);
		if (!gs) return;
		await submit(drawFromPile(gs));
	}

	async function handleDrawDiscard() {
		const gs = get(currentGameState);
		if (!gs) return;
		await submit(drawFromDiscard(gs));
	}

	async function handleDiscard(cardId: string) {
		const gs = get(currentGameState);
		if (!gs) return;
		await submit(discardCard(gs, cardId));
	}

	async function handleClose(declaration: CloseDeclaration) {
		const gs = get(currentGameState);
		if (!gs) return;
		try {
			const next = closeGame(gs, declaration);
			await submit(next, 'close', declaration);
		} catch (e) {
			console.error('Failed to close game:', e);
		}
	}

	async function handlePlayAgain() {
		if (!get(isOwner)) return;
		await restartGame();
	}
</script>

{#if $roomStatus === 'waiting'}
	<!-- ── Lobby: seat diagram, prominent code, host controls ──────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full flex-col">
		<div class="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8 sm:py-12">
			<section class="glass-panel rounded-2xl px-5 py-6 text-center">
				<p class="text-[0.66rem] font-semibold tracking-[0.3em] text-gold-300/75 uppercase">
					Private table
				</p>
				<div class="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
					<span class="text-sm font-semibold tracking-[0.2em] text-cream-50/55 uppercase">
						Room:
					</span>
					<span
						class="font-mono text-3xl font-extrabold tracking-[0.22em] text-cream-50 sm:text-4xl"
					>
						{code}
					</span>
				</div>
				<div class="mt-4 flex items-center justify-center gap-2">
					<button type="button" class="pill-btn" onclick={copyCode}>
						{copied ? 'Copied!' : 'Copy code'}
					</button>
				</div>
				<p class="mt-3 text-xs text-cream-50/55">
					Share this code with friends so they can join the table.
				</p>
			</section>

			<section class="glass-panel rounded-2xl px-4 py-4">
				<header class="flex items-center justify-between gap-2">
					<span class="eyebrow">Seats</span>
					<span
						class="rounded-full bg-black/30 px-2.5 py-1 text-[0.7rem] font-bold text-cream-50/75 tabular-nums"
					>
						{$players.length} / {$room?.maxPlayers ?? $players.length}
					</span>
				</header>
				<ul class="mt-3 flex flex-col gap-2">
					{#each $seats as seat, i (i)}
						{#if seat}
							<li
								class="flex items-center gap-3 rounded-xl border border-gold-300/15 bg-black/25 px-3 py-2"
							>
								<span class="w-5 text-center text-[0.7rem] font-bold text-cream-50/45 tabular-nums">
									{i + 1}
								</span>
								<span class="min-w-0 flex-1 truncate text-sm font-semibold text-cream-50">
									{seat.name}
								</span>
								{#if $room?.ownerId === seat.id}
									<span
										class="rounded-full border border-gold-300/50 bg-gold-300/10 px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-gold-200 uppercase"
									>
										Host
									</span>
								{/if}
								{#if seat.id === $playerId}
									<span
										class="rounded-full border border-cream-50/25 px-2 py-0.5 text-[0.62rem] font-bold tracking-wide text-cream-50/70 uppercase"
									>
										You
									</span>
								{/if}
							</li>
						{:else}
							<li
								class="flex items-center gap-3 rounded-xl border border-dashed border-cream-50/15 px-3 py-2 text-cream-50/40"
							>
								<span class="w-5 text-center text-[0.7rem] font-bold tabular-nums">{i + 1}</span>
								<span class="flex-1 text-sm">Open seat</span>
							</li>
						{/if}
					{/each}
				</ul>
			</section>

			<section class="glass-panel flex flex-col gap-3 rounded-2xl px-4 py-4">
				{#if $isOwner}
					<button
						type="button"
						class="btn-gold w-full px-4 py-2.5 text-sm"
						onclick={startGame}
						disabled={$players.length < 2}
					>
						Start Game
					</button>
					{#if $players.length < 2}
						<p class="text-center text-xs text-cream-50/55">
							Waiting for at least 2 players to take a seat…
						</p>
					{/if}
				{:else}
					<p class="text-center text-xs text-cream-50/55">
						Waiting for the host to start the game…
					</p>
				{/if}
				<button type="button" class="btn-quiet w-full px-4 py-2 text-sm" onclick={handleLeave}>
					Leave room
				</button>
			</section>
		</div>
	</div>
{:else if $currentGameState && $currentGameState.phase === 'finished'}
	<!-- ── Match over: standings, MMR, play again / home ───────────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full items-center justify-center p-4">
		<MatchOver
			gameState={$currentGameState}
			names={$names}
			myIndex={$myIndex}
			mmr={mmrResult}
			onplayagain={$isOwner ? handlePlayAgain : undefined}
			onhome={handleLeave}
		/>
	</div>
{:else if $currentGameState && $currentGameState.phase === 'round-over'}
	<!-- ── Round score sheet ───────────────────────────────────────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full items-center justify-center p-4">
		<ScoreSheet
			gameState={$currentGameState}
			names={$names}
			cannextround={true}
			onnextround={nextRoundAction}
		/>
	</div>
{:else if $roomStatus === 'playing' && $currentGameState}
	<!-- ── Table ───────────────────────────────────────────────────────────── -->
	<div class="felt-surface relative flex min-h-dvh w-full flex-col">
		<div class="flex items-center justify-between gap-2 px-2.5 pt-2.5 text-cream-50/45">
			<span class="text-[0.65rem] font-semibold tracking-[0.24em] uppercase">
				Round {$currentGameState.round}
			</span>
			<button type="button" class="btn-quiet px-2.5 py-1 text-[0.7rem]" onclick={handleLeave}>
				Leave
			</button>
		</div>

		<GameTableView
			title={code}
			{notice}
			opponents={$opponents}
			myLabel={$myLabel}
			hand={$myHand}
			drawCount={$currentGameState.drawPile.length}
			discardPile={$currentGameState.discardPile}
			phase={$currentGameState.phase}
			isMyTurn={$isMyTurn}
			{board}
			ondrawpile={handleDrawPile}
			ondrawdiscard={handleDrawDiscard}
			ondiscard={handleDiscard}
			onclose={handleClose}
			onnextround={nextRoundAction}
			roundSummary={$roundSummary}
		/>
	</div>
{:else}
	<div class="mx-auto max-w-md px-4 pt-20 text-center text-cream-50/60">
		<p>Loading room...</p>
	</div>
{/if}

<style>
	.eyebrow {
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: rgb(243 216 148 / 0.75);
	}

	.btn-gold,
	.btn-quiet,
	.pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease,
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	.btn-gold {
		border: 1px solid rgb(255 244 214 / 0.55);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 12px 24px -14px rgb(0 0 0 / 0.95),
			inset 0 1px 0 rgb(255 255 255 / 0.55);
	}

	.btn-gold:hover:not(:disabled) {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}

	.btn-gold:disabled {
		cursor: default;
		opacity: 0.5;
		filter: none;
		transform: none;
	}

	.btn-quiet {
		border: 1px solid rgb(232 197 106 / 0.3);
		background-color: rgb(255 255 255 / 0.05);
		color: #f6efe0;
		font-weight: 600;
	}

	.btn-quiet:hover {
		border-color: rgb(232 197 106 / 0.6);
		background-color: rgb(255 255 255 / 0.1);
	}

	.pill-btn {
		border: 1px solid rgb(232 197 106 / 0.45);
		background-color: rgb(255 255 255 / 0.06);
		color: #f6efe0;
		padding: 0.4rem 0.9rem;
		font-size: 0.78rem;
		letter-spacing: 0.06em;
	}

	.pill-btn:hover {
		border-color: rgb(243 216 148 / 0.75);
		background-color: rgb(255 255 255 / 0.1);
	}

	.btn-gold:focus-visible,
	.btn-quiet:focus-visible,
	.pill-btn:focus-visible {
		outline: 2px solid rgb(243 221 160 / 0.9);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-gold,
		.btn-quiet,
		.pill-btn {
			transition: none;
		}

		.btn-gold:hover:not(:disabled) {
			transform: none;
		}
	}
</style>
