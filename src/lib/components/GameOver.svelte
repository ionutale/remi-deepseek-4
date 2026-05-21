<script lang="ts">
	import { resetGame } from '$lib/stores/gameStore';
	import { goto } from '$app/navigation';

	let {
		winner
	}: {
		winner: number | null;
	} = $props();

	function handlePlayAgain() {
		resetGame();
		goto('/');
	}
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-base-200 to-base-300 p-8"
>
	<div class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body items-center gap-4 text-center">
			<h1 class="text-4xl font-bold">Game Over</h1>
			<p class="text-xl">
				{#if winner !== null}
					<span class="font-bold text-success">Player {winner + 1} wins!</span>
				{:else}
					<span>No winner</span>
				{/if}
			</p>
			{#if winner !== null}
				<button class="btn mt-4 btn-lg btn-primary" onclick={handlePlayAgain}> Play Again </button>
			{/if}
		</div>
	</div>
</div>
