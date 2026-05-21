<script lang="ts">
	import { startGame, gameState } from '$lib/stores/gameStore';
	import type { GameConfig } from '$lib/engine/types';

	let playerCount = $state<2 | 3 | 4>(2);
	let error = $state('');

	function handleStart() {
		if ($gameState && $gameState.phase !== 'finished' && $gameState.phase !== 'idle') {
			if (!confirm('A game is already in progress. Start a new one?')) return;
		}
		error = '';
		const config: GameConfig = {
			playerCount,
			humanPlayerIndex: 0
		};
		startGame(config);
	}
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-base-200 to-base-300 p-8"
>
	<div class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body items-center gap-6 text-center">
			<h1 class="text-5xl font-bold text-primary">Remi</h1>
			<p class="text-base-content/70">Romanian card game</p>

			<div class="w-full">
				<span class="label-text mb-2 block">Number of players</span>
				<div class="flex justify-center gap-2">
					{#each [2, 3, 4] as count (count)}
						<button
							class="btn {playerCount === count ? 'btn-primary' : 'btn-outline'} btn-lg"
							onclick={() => (playerCount = count as 2 | 3 | 4)}
						>
							{count}
						</button>
					{/each}
				</div>
			</div>

			{#if error}
				<p class="text-sm text-error">{error}</p>
			{/if}

			<button class="btn mt-4 w-full btn-lg btn-primary" onclick={handleStart}> Start Game </button>
		</div>
	</div>
</div>
