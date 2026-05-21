<script lang="ts">
	let {
		cardCount,
		disabled = false,
		ondraw
	}: {
		cardCount: number;
		disabled?: boolean;
		ondraw?: () => void;
	} = $props();

	let empty = $derived(cardCount === 0);
</script>

<button
	class="flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white shadow-md transition-all sm:h-24 sm:w-16 {empty
		? 'border-gray-200 bg-gray-50'
		: 'border-gray-300'} {!disabled
		? 'cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-lg'
		: 'cursor-default opacity-60'}"
	onclick={ondraw}
	{disabled}
	aria-label={empty ? 'Draw pile is empty' : `Draw pile, ${cardCount} cards remaining`}
>
	<span class="mb-1 text-2xl sm:text-3xl {empty ? 'opacity-30' : ''}">🂠</span>
	{#if empty}
		<span class="text-xs font-medium text-gray-300">empty</span>
	{:else}
		<span class="text-xs font-medium text-gray-500">{cardCount}</span>
	{/if}
</button>
