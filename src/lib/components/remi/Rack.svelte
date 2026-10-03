<script lang="ts">
	import type { Piece } from '$lib/engine/remi/types';
	import PieceTile from './Piece.svelte';

	let {
		pieces,
		selectedId = null,
		disabled = false,
		onselect,
		ondrop
	}: {
		pieces: Piece[];
		selectedId?: string | null;
		disabled?: boolean;
		onselect?: (id: string) => void;
		ondrop?: (e: DragEvent) => void;
	} = $props();

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		ondrop?.(e);
	}
</script>

<div
	class="wood-surface rounded-2xl border border-wood-600/60 px-3 pt-2 pb-3 shadow-card"
	role="group"
	aria-label="Tabla ta ({pieces.length} piese)"
	ondragover={(e) => e.preventDefault()}
	ondrop={handleDrop}
>
	<div class="mb-1 flex items-center justify-between">
		<span class="text-[11px] font-bold tracking-[0.18em] text-gold-300/90 uppercase">
			Tabla ta
		</span>
		<span class="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-cream-50">
			{pieces.length} piese
		</span>
	</div>
	<div class="rack-scroll flex gap-1.5 overflow-x-auto pb-1" role="presentation">
		{#each pieces as piece (piece.id)}
			<div role="option" aria-selected={selectedId === piece.id}>
				<PieceTile
					{piece}
					size="md"
					selected={selectedId === piece.id}
					{disabled}
					draggable={!disabled}
					onclick={() => onselect?.(piece.id)}
				/>
			</div>
		{/each}
		{#if pieces.length === 0}
			<p class="px-2 py-4 text-sm text-cream-100/60 italic">Nicio piesă pe tablă.</p>
		{/if}
	</div>
</div>

<style>
	.rack-scroll {
		scrollbar-width: thin;
		scrollbar-color: var(--color-gold-500, #d4a017) transparent;
		scroll-padding: 0.5rem;
	}
	.rack-scroll::-webkit-scrollbar {
		height: 8px;
	}
	.rack-scroll::-webkit-scrollbar-thumb {
		background: rgb(212 160 23 / 0.5);
		border-radius: 9999px;
	}
</style>
