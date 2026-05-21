<script lang="ts">
	import type { PlayerState } from '$lib/engine/types';

	const GRADIENTS = [
		'from-blue-400 to-blue-600',
		'from-purple-400 to-purple-600',
		'from-teal-400 to-teal-600',
		'from-amber-400 to-amber-600'
	];

	const BORDER_COLORS = [
		'border-blue-300',
		'border-purple-300',
		'border-teal-300',
		'border-amber-300'
	];

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

<div class="flex justify-center gap-4 p-4 sm:gap-8">
	{#each opponents as opponent, i (i)}
		{@const gradient = GRADIENTS[i % GRADIENTS.length]}
		{@const borderColor = BORDER_COLORS[i % BORDER_COLORS.length]}
		<!-- Opponent i has game index i + 1 (since player 0 is always human) -->
		<div class="flex flex-col items-center gap-2">
			<div
				class="badge badge-lg {i + 1 === currentPlayerIndex ? 'badge-primary' : 'badge-neutral'}"
			>
				{names[i] ?? `Player ${i + 2}`}
			</div>
			<div class="flex" style="margin-left: -0.5rem; margin-right: -0.5rem;">
				{#each opponent.hand as card (card.id)}
					<div
						class="flex h-12 w-8 items-center justify-center rounded-lg border shadow sm:h-14 sm:w-10 {borderColor} bg-gradient-to-br {gradient}"
						style="margin: 0 -0.375rem;"
					>
						<span class="text-xs font-bold text-white">?</span>
					</div>
				{/each}
			</div>
			<span class="text-xs text-gray-300">{opponent.hand.length} cards</span>
		</div>
	{/each}
</div>
