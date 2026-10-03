<script lang="ts">
	import type { Piece } from '$lib/engine/remi/types';

	let {
		piece,
		size = 'md',
		selected = false,
		disabled = false,
		draggable = false,
		ownerTag = null,
		onclick,
		ondragstart
	}: {
		piece: Piece;
		size?: 'sm' | 'md' | 'lg';
		selected?: boolean;
		disabled?: boolean;
		draggable?: boolean;
		ownerTag?: string | null;
		onclick?: () => void;
		ondragstart?: (e: DragEvent) => void;
	} = $props();

	const SIZE = {
		sm: 'h-14 w-11 text-2xl',
		md: 'h-20 w-14 text-3xl sm:h-22 sm:w-16',
		lg: 'h-24 w-[4.5rem] text-4xl'
	} as const;

	const INK: Record<string, string> = {
		red: 'color: #c81e1e; -webkit-text-stroke: 0.4px #7f1212;',
		yellow: 'color: #92610a; -webkit-text-stroke: 0.4px #5f4206;',
		blue: 'color: #1d4ed8; -webkit-text-stroke: 0.4px #12307f;',
		black: 'color: #1c1917; -webkit-text-stroke: 0.3px #000;'
	};

	let ink = $derived(piece.isJoker ? '' : (INK[piece.color] ?? ''));
	let faceLabel = $derived(piece.isJoker ? 'Joker' : `Piesă ${piece.value}, ${piece.color}`);

	function handleDragStart(e: DragEvent) {
		e.dataTransfer?.setData('text/piece-id', piece.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		ondragstart?.(e);
	}
</script>

<button
	type="button"
	class="piece-lift piece-tap relative flex shrink-0 flex-col items-center justify-center rounded-[0.45rem] {SIZE[
		size
	]} {selected ? 'piece-selected' : ''}"
	class:piece-disabled={disabled}
	{draggable}
	ondragstart={handleDragStart}
	onclick={() => onclick?.()}
	disabled={disabled && !onclick}
	aria-label={faceLabel}
	aria-pressed={selected}
	style="min-width: {size === 'sm' ? '2.75rem' : size === 'lg' ? '4.5rem' : '3.5rem'}; {size !==
	'sm'
		? 'min-height: 44px;'
		: ''}"
>
	{#if piece.isJoker}
		<span class="piece-smiley" aria-hidden="true">☺</span>
		<span class="piece-joker-caption" aria-hidden="true">Joker</span>
	{:else}
		<span class="piece-number" style={ink} aria-hidden="true">{piece.value}</span>
	{/if}
	{#if ownerTag}
		<span class="piece-owner" aria-label="Lipit de {ownerTag}">{ownerTag}</span>
	{/if}
</button>

<style>
	button {
		background:
			repeating-linear-gradient(
				97deg,
				rgb(255 255 255 / 0.14) 0 1px,
				transparent 1px 5px,
				rgb(120 72 20 / 0.07) 5px 6px,
				transparent 6px 12px
			),
			linear-gradient(165deg, #f7ead0 0%, #efdcba 45%, #e2c795 100%);
		border: 1px solid #a97e42;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.7),
			inset 0 -2px 3px rgb(120 72 20 / 0.25),
			0 2px 4px rgb(0 0 0 / 0.4),
			0 6px 14px -6px rgb(0 0 0 / 0.5);
		cursor: pointer;
	}

	.piece-number {
		font-weight: 900;
		line-height: 1;
		font-family: Georgia, 'Times New Roman', serif;
		text-shadow: 0 1px 0 rgb(255 255 255 / 0.6);
	}

	.piece-smiley {
		font-size: 1.6em;
		line-height: 1;
		color: #7c2d12;
		text-shadow: 0 1px 0 rgb(255 255 255 / 0.6);
	}

	.piece-joker-caption {
		font-size: 0.5rem;
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #7c2d12;
		margin-top: 2px;
	}

	.piece-owner {
		position: absolute;
		top: -7px;
		right: -7px;
		min-width: 1.1rem;
		height: 1.1rem;
		padding: 0 0.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.6rem;
		font-weight: 800;
		color: #fdf8ec;
		background: #0f5a3d;
		border: 1px solid #f3d894;
		border-radius: 9999px;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
	}

	.piece-selected {
		outline: 2px solid var(--color-gold-400, #e7bd5b);
		outline-offset: 2px;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.7),
			inset 0 -2px 3px rgb(120 72 20 / 0.25),
			0 0 0 2px var(--color-gold-400, #e7bd5b),
			0 0 18px 2px rgb(231 189 91 / 0.55);
	}

	.piece-lift {
		will-change: transform;
	}
	.piece-disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	@media (prefers-reduced-motion: no-preference) {
		.piece-lift {
			transition:
				transform 150ms ease-out,
				box-shadow 150ms ease-out;
		}
		.piece-lift:not(.piece-disabled):hover {
			transform: translateY(-3px);
		}
		.piece-selected {
			transform: translateY(-6px);
		}
	}

	@media (pointer: coarse) {
		.piece-tap {
			min-height: 44px;
		}
	}
</style>
