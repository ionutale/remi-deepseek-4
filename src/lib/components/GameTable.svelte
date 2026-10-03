<script lang="ts">
	import { untrack } from 'svelte';
	import {
		gameState,
		isHumanTurn,
		playerDrawPile,
		playerDrawDiscard,
		playerDiscard,
		playerClose,
		playerNextRound
	} from '$lib/stores/gameStore';
	import { MeldBoard } from '$lib/stores/meldBoard.svelte';
	import GameTableView from './GameTableView.svelte';

	/** One board instance per table; the view mutates it, this component syncs it. */
	const board = new MeldBoard();

	/** Round the board was last synced for, so a fresh deal clears staged cards. */
	let syncedRound: number | null = null;

	let state = $derived($gameState);
	let hand = $derived(state?.players[0]?.hand ?? []);
	let discardPile = $derived(state?.discardPile ?? []);

	let opponents = $derived(
		(state?.players ?? []).slice(1).map((player, i) => ({
			name: `Player ${i + 2}`,
			handCount: player.hand.length,
			isActive: (state?.currentPlayerIndex ?? 0) === i + 1
		}))
	);

	/** Human-readable round result for the banner; the score sheet comes later. */
	let roundSummary = $derived.by(() => {
		const winner = state?.roundWinner ?? null;
		if (winner === null || !state) return null;
		return winner === 0 ? 'You win the round' : `Player ${winner + 1} wins the round`;
	});

	$effect(() => {
		const current = $gameState;
		// Every board call reads and writes `board.slots`, so they must be untracked:
		// otherwise this effect depends on the very state it writes and re-runs forever.
		untrack(() => {
			if (!current) {
				board.reset();
				syncedRound = null;
				return;
			}

			// A new round = a new deal, so card ids no longer describe the staged cards.
			if (current.round !== syncedRound) {
				board.reset();
				syncedRound = current.round;
			}

			// Drop anything staged that is no longer held (drawn, discarded, revealed).
			board.sync(current.players[0]?.hand ?? []);
		});
	});
</script>

{#if state}
	<GameTableView
		title="Remi"
		{opponents}
		myLabel="You · Player 1"
		{hand}
		drawCount={state.drawPile.length}
		{discardPile}
		phase={state.phase}
		isMyTurn={$isHumanTurn}
		{board}
		ondrawpile={playerDrawPile}
		ondrawdiscard={playerDrawDiscard}
		ondiscard={playerDiscard}
		onclose={playerClose}
		onnextround={playerNextRound}
		{roundSummary}
	/>
{/if}
