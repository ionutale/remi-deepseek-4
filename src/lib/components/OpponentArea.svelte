<script lang="ts">
	import type { PlayerState } from '$lib/engine/types';
	import Seat from './Seat.svelte';

	let {
		opponents,
		currentPlayerIndex,
		names = []
	}: {
		opponents: PlayerState[];
		currentPlayerIndex: number;
		names?: string[];
	} = $props();
</script>

<div
	class="flex flex-wrap items-start justify-center gap-2 p-2 sm:gap-4 sm:p-4"
	role="region"
	aria-label="Opponents"
>
	{#each opponents as opponent, i (i)}
		<!-- Opponent i has game index i + 1 (since player 0 is always human) -->
		<Seat
			name={names[i] ?? `Player ${i + 2}`}
			cardCount={opponent.hand.length}
			active={i + 1 === currentPlayerIndex}
		/>
	{/each}
</div>
