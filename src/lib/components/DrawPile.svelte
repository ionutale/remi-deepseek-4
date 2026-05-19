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
</script>

<button
	class="flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white shadow-md transition-all sm:h-24 sm:w-16 {!disabled
		? 'cursor-pointer hover:-translate-y-1 hover:border-primary hover:shadow-lg'
		: 'cursor-default opacity-60'}"
	onclick={ondraw}
	{disabled}
>
	<span class="mb-1 text-2xl sm:text-3xl">🂠</span>
	<span class="text-xs font-medium text-gray-500">{cardCount}</span>
</button>
