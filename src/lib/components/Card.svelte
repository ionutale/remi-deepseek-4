<script lang="ts">
	import type { Card } from '$lib/engine/types';
	import { displayValue, isRed } from '$lib/engine/display';

	let {
		card,
		faceDown = false,
		selected = false,
		clickable = false,
		draggable = false,
		onselect,
		size = 'md',
		valid = undefined
	}: {
		card: Card;
		faceDown?: boolean;
		selected?: boolean;
		clickable?: boolean;
		draggable?: boolean;
		onselect?: (cardId: string) => void;
		size?: 'sm' | 'md' | 'lg';
		valid?: boolean;
	} = $props();

	let dragOver = $state(false);

	const SIZE_CLASSES = {
		sm: 'h-20 w-14',
		md: 'h-24 w-16 sm:h-28 sm:w-20',
		lg: 'h-32 w-24 sm:h-36 sm:w-28'
	} as const;

	const CENTER_SUIT_SIZE = {
		sm: 'text-xl',
		md: 'text-2xl sm:text-3xl',
		lg: 'text-4xl'
	} as const;

	let rank = $derived(displayValue(card));
	let red = $derived(!card.isJoker && isRed(card.suit));
	let isCourt = $derived(!card.isJoker && (card.value === 1 || card.value >= 11));
	let ink = $derived(red ? 'text-red-600' : 'text-slate-900');

	let stateRing = $derived(
		valid === true
			? 'ring-2 ring-emerald-300'
			: valid === false
				? 'card-shake ring-2 ring-rose-400'
				: selected
					? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-felt-900'
					: dragOver
						? 'ring-2 ring-gold-300/60'
						: 'ring-1 ring-black/10'
	);

	let faceLabel = $derived(
		faceDown
			? 'Face-down card'
			: card.isJoker
				? card.jokerType === 'colored'
					? 'Colored joker, wild'
					: 'Black joker'
				: `${rank}${card.suit}`
	);

	function handleDragStart(e: DragEvent) {
		e.dataTransfer?.setData('text/card-id', card.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}
</script>

<button
	class="card-lift card-tap-target relative flex flex-col items-center justify-center rounded-xl bg-card-50 shadow-card {SIZE_CLASSES[
		size
	]} {stateRing} {selected ? '-translate-y-2 shadow-card-lift' : ''} {clickable
		? 'cursor-pointer hover:-translate-y-1 hover:shadow-card-lift'
		: 'cursor-default'} {!clickable ? 'opacity-60' : ''}"
	type="button"
	{draggable}
	ondragstart={handleDragStart}
	ondragenter={() => (dragOver = true)}
	ondragleave={() => (dragOver = false)}
	ondragover={handleDragOver}
	onclick={() => onselect?.(card.id)}
	disabled={!clickable}
	aria-label={faceLabel}
	aria-pressed={selected}
>
	{#if faceDown}
		<div
			class="card-back-lattice flex h-full w-full flex-col items-center justify-center rounded-[0.65rem]"
		>
			<span class="text-lg font-black text-gold-300 drop-shadow sm:text-xl" aria-hidden="true"
				>◆</span
			>
			<span class="text-[8px] font-bold tracking-[0.2em] text-gold-300/80 uppercase">Remi</span>
		</div>
	{:else if card.isJoker && card.jokerType === 'colored'}
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[0.65rem] bg-gradient-to-br from-red-500 via-amber-400 to-yellow-200"
		>
			<span class="text-xl font-black text-white drop-shadow sm:text-2xl" aria-hidden="true">★</span
			>
			<span class="text-[9px] font-black tracking-[0.18em] text-white uppercase drop-shadow"
				>Wild</span
			>
			<span class="text-[8px] font-bold tracking-[0.18em] text-white/85 uppercase">Joker</span>
		</div>
	{:else if card.isJoker}
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[0.65rem] bg-gradient-to-br from-slate-800 via-slate-900 to-black"
		>
			<span class="text-xl font-black text-gold-300 sm:text-2xl" aria-hidden="true">★</span>
			<span
				class="rounded border border-gold-400/60 px-1 text-[9px] font-black tracking-[0.18em] text-gold-300 uppercase"
				>Joker</span
			>
		</div>
	{:else}
		<!-- top-left corner -->
		<span
			class="absolute top-1 left-1.5 flex flex-col items-center leading-none"
			aria-hidden="true"
		>
			<span class="text-xs font-bold sm:text-sm {ink}">{rank}</span>
			<span class="text-[10px] leading-tight sm:text-xs {ink}">{card.suit}</span>
		</span>
		<!-- bottom-right corner (mirrored) -->
		<span
			class="absolute right-1.5 bottom-1 flex rotate-180 flex-col items-center leading-none"
			aria-hidden="true"
		>
			<span class="text-xs font-bold sm:text-sm {ink}">{rank}</span>
			<span class="text-[10px] leading-tight sm:text-xs {ink}">{card.suit}</span>
		</span>
		<!-- center -->
		{#if card.value === 1}
			<span class="text-4xl sm:text-5xl {ink}" aria-hidden="true">{card.suit}</span>
			<span class="mt-0.5 text-[8px] font-bold tracking-[0.25em] text-slate-400 uppercase">Ace</span
			>
		{:else if isCourt}
			<span
				class="flex h-10 w-10 items-center justify-center rounded-full border-2 {red
					? 'border-red-600/40 bg-red-50'
					: 'border-slate-900/30 bg-slate-100'} sm:h-12 sm:w-12"
				aria-hidden="true"
			>
				<span class="font-serif text-xl font-black sm:text-2xl {ink}">{rank}</span>
			</span>
			<span class="mt-0.5 text-sm {ink}" aria-hidden="true">{card.suit}</span>
		{:else}
			<span class="{CENTER_SUIT_SIZE[size]} {ink}" aria-hidden="true">{card.suit}</span>
			<span class="mt-0.5 text-[10px] font-bold {ink}" aria-hidden="true">{rank}</span>
		{/if}
	{/if}
</button>
