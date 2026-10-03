<script lang="ts">
	import type { FormationType, Piece } from '$lib/engine/remi/types';
	import { analyzeFormation, canOpen } from '$lib/engine/remi/formations';
	import PieceTile from './Piece.svelte';

	let {
		pieces,
		selectedIds,
		onselect,
		onconfirm,
		oncancel,
		isFirstMeld
	}: {
		pieces: Piece[];
		selectedIds: string[];
		onselect: (id: string) => void;
		onconfirm: () => void;
		oncancel: () => void;
		isFirstMeld: boolean;
	} = $props();

	const selected = $derived(pieces.filter((p) => selectedIds.includes(p.id)));

	function detectType(ps: Piece[]): FormationType {
		if (ps.length === 0) return 'suite';
		const naturals = ps.filter((p) => !p.isJoker);
		if (naturals.length >= 2 && new Set(naturals.map((p) => p.value)).size === 1) return 'terta';
		if (naturals.length >= 2 && new Set(naturals.map((p) => p.color)).size === 1) return 'suite';
		// Fallback: try both, prefer the valid one (suite first).
		const s = analyzeFormation('suite', ps);
		if (s.valid) return 'suite';
		return 'terta';
	}

	let type: FormationType = $derived(detectType(selected));
	let analysis = $derived(
		selected.length === 0
			? { valid: false as boolean, points: 0, reason: undefined as string | undefined }
			: analyzeFormation(type, selected)
	);
	let first = $derived(
		isFirstMeld && selected.length > 0 ? canOpen([{ type, pieces: selected }]) : null
	);
	let progress = $derived(Math.min(45, first?.points ?? analysis.points));
</script>

<section class="glass-panel rounded-2xl p-4" aria-label="Construiește formația">
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-bold tracking-wide text-gold-200 uppercase">Construiește formația</h3>
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-bold {analysis.valid
				? 'bg-emerald-500/20 text-emerald-200'
				: 'bg-rose-500/20 text-rose-200'}"
			role="status"
		>
			{selected.length === 0
				? 'Alege piese'
				: analysis.valid
					? `Formație validă · ${type === 'suite' ? 'Suită' : 'Terță'} · ${analysis.points} puncte`
					: `Formație invalidă · ${type === 'suite' ? 'Suită' : 'Terță'}`}
		</span>
	</div>

	{#if isFirstMeld}
		<div
			class="mb-3 rounded-xl border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-200"
			role="note"
		>
			<p class="font-bold">Prima etalare: minim 45 puncte + o suită</p>
			<div class="mt-1 flex items-center gap-2" aria-label="Progres prima etalare">
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
					<div
						class="h-full rounded-full bg-gold-400 transition-[width]"
						style="width: {(progress / 45) * 100}%"
					></div>
				</div>
				<span class="text-xs font-bold tabular-nums">{progress}/45</span>
			</div>
			{#if first && !first.ok && selected.length > 0}
				<p class="mt-1 text-xs text-gold-300/90">
					{first.reason === 'first meld needs at least one suite'
						? 'Îți lipsește o suită în prima etalare.'
						: first.reason === 'first meld needs at least 45 points'
							? 'Nu ai încă 45 de puncte.'
							: 'Formația nu este validă.'}
				</p>
			{/if}
		</div>
	{/if}

	{#if selected.length > 0 && !analysis.valid && analysis.reason}
		<p class="mb-2 text-xs text-rose-200/90" role="alert">
			{analysis.reason === 'at least 3 pieces'
				? 'Ai nevoie de cel puțin 3 piese.'
				: analysis.reason === 'all pieces must share one colour'
					? 'Toate piesele trebuie să aibă aceeași culoare (suită).'
					: analysis.reason === 'values must be consecutive'
						? 'Valorile trebuie să fie consecutive.'
						: analysis.reason === 'the 1 can only be used in 1-2-3 or 12-13-1'
							? 'Piesa 1 poate fi folosită doar în 1-2-3 sau 12-13-1.'
							: analysis.reason === 'all natural pieces must share one value'
								? 'Toate piesele trebuie să aibă aceeași valoare (terță).'
								: analysis.reason === 'terta colours must differ'
									? 'Culorile terței trebuie să fie diferite.'
									: analysis.reason === 'max 2 jokers'
										? 'Maxim 2 jokeri într-o formație.'
										: analysis.reason === 'a joker needs at least 2 natural pieces'
											? 'Un joker are nevoie de cel puțin 2 piese naturale.'
											: analysis.reason === 'two jokers need at least 4 natural pieces'
												? 'Doi jokeri au nevoie de cel puțin 4 piese naturale.'
												: analysis.reason === 'two jokers cannot be adjacent'
													? 'Cei doi jokeri nu pot fi alăturați.'
													: analysis.reason}
		</p>
	{/if}

	<div class="mb-2 flex items-center gap-2">
		<span class="text-xs font-bold tracking-wider text-cream-100/70 uppercase">Tip detectat:</span>
		<span class="rounded bg-black/40 px-2 py-0.5 text-xs font-bold text-cream-50">
			{type === 'suite' ? 'Suită' : 'Terță'}
		</span>
		<span class="text-xs text-cream-100/70">{analysis.points} puncte</span>
	</div>

	<div class="mb-3 flex flex-wrap gap-1.5" aria-label="Piese disponibile">
		{#each pieces as piece (piece.id)}
			<PieceTile
				{piece}
				size="sm"
				selected={selectedIds.includes(piece.id)}
				onclick={() => onselect(piece.id)}
			/>
		{/each}
	</div>

	{#if selected.length > 0}
		<div class="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Formație candidată">
			<span class="text-xs text-cream-100/70">Candidată:</span>
			{#each selected as piece (piece.id)}
				<PieceTile {piece} size="sm" selected onclick={() => onselect(piece.id)} />
			{/each}
		</div>
	{/if}

	<div class="flex gap-2">
		<button
			type="button"
			class="btn flex-1 border-gold-400 bg-gold-400 font-bold text-felt-950 btn-sm hover:bg-gold-300 disabled:opacity-40"
			onclick={onconfirm}
			disabled={!analysis.valid || (isFirstMeld && !(first?.ok ?? false))}
		>
			Etalează
		</button>
		<button type="button" class="btn text-cream-100 btn-ghost btn-sm" onclick={oncancel}>
			Anulează
		</button>
	</div>
</section>
