<script lang="ts">
	import { gameState, winner } from '$lib/stores/gameStore';
	import GameTable from '$lib/components/GameTable.svelte';
	import GameOver from '$lib/components/GameOver.svelte';
	import { resolveRoute } from '$app/paths';
</script>

{#if $gameState === null}
	<div class="flex min-h-screen flex-col items-center justify-center gap-4">
		<p class="text-lg">No game in progress</p>
		<a href={resolveRoute('/')} class="btn btn-primary">Start a Game</a>
	</div>
{:else if $gameState.phase === 'finished'}
	<GameOver winner={$winner} />
{:else}
	<GameTable />
{/if}
