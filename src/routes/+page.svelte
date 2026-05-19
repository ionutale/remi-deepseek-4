<script lang="ts">
	import { gameState } from '$lib/stores/gameStore';
	import GameStart from '$lib/components/GameStart.svelte';
	import { resolveRoute } from '$app/paths';
</script>

{#if $gameState === null}
	<GameStart />
{:else}
	<div class="flex min-h-screen flex-col items-center justify-center gap-4">
		<p class="text-lg">Game in progress</p>
		<a href={resolveRoute('/game')} class="btn btn-primary">Go to Game</a>
	</div>
{/if}
