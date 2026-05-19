<script lang="ts">
	import type { PlayerState } from '$lib/engine/types';

	let {
		opponents,
		currentPlayerIndex
	}: {
		opponents: PlayerState[];
		currentPlayerIndex: number;
	} = $props();
</script>

<div class="flex justify-center gap-4 p-4 sm:gap-8">
	{#each opponents as opponent, i (i)}
		<div class="flex flex-col items-center gap-2">
			<div class="badge badge-lg {i + 1 === currentPlayerIndex ? 'badge-primary' : 'badge-ghost'}">
				Player {i + 2}
			</div>
			<div class="flex -space-x-3">
				{#each opponent.hand as card (card.id)}
					<div
						class="flex h-12 w-8 items-center justify-center rounded-lg border border-blue-300 bg-gradient-to-br from-blue-400 to-blue-600 shadow sm:h-14 sm:w-10"
					>
						<span class="text-xs font-bold text-white">?</span>
					</div>
				{/each}
			</div>
			<span class="text-xs text-gray-300">{opponent.hand.length} cards</span>
		</div>
	{/each}
</div>
