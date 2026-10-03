<script lang="ts">
	import type { PatternType, Piece } from '$lib/engine/remi/types';
	import { PATTERN_BONUS, PATTERN_REASON, validatePattern } from '$lib/engine/remi/patterns';
	import PieceTile from './Piece.svelte';

	let {
		pattern,
		pieces,
		onselect,
		onconfirm,
		onclose,
		canDeclare
	}: {
		pattern: PatternType | null;
		pieces: Piece[];
		onselect: (pattern: PatternType) => void;
		onconfirm: () => void;
		onclose: () => void;
		canDeclare: boolean;
	} = $props();

	type PatternDef = { key: PatternType; name: string; desc: string };

	const PATTERNS: PatternDef[] = [
		{
			key: 'simplu',
			name: 'Simplu',
			desc: 'Suite și terțe, fără restricții — toate piesele din tablă aranjate legal.'
		},
		{ key: 'bete', name: 'Bete', desc: '2 terțe de câte 4 piese + 2 terțe de câte 3 piese.' },
		{
			key: 'mozaic',
			name: 'Mozaic',
			desc: 'Suită completă 1…13,1; vecinii nu au aceeași culoare; primele 4 piese sunt din cele 4 culori; primul 1 are altă culoare decât ultimul 1.'
		},
		{ key: 'bicolor', name: 'Bicolor', desc: '2 suite complete în 2 culori.' },
		{ key: 'duble', name: 'Duble', desc: '7 perechi de duble (identice).' },
		{
			key: 'monocolor',
			name: 'Monocolor',
			desc: 'Suită completă 1…13,1, toate piesele din aceeași culoare.'
		}
	];

	let hasPieces = $derived(pieces.length > 0);

	/** Live progress of every model against the pieces gathered so far. */
	let results = $derived(
		PATTERNS.map((def) => ({
			def,
			bonus: PATTERN_BONUS[def.key],
			result: validatePattern(def.key, pieces)
		}))
	);

	let selected = $derived(results.find((entry) => entry.def.key === pattern) ?? null);
	let selectedValid = $derived(selected !== null && selected.result.valid && hasPieces);
	let progressPct = $derived(selected ? Math.round(selected.result.progress * 100) : 0);

	/** Engine reasons (stable English strings) → Romanian copy. */
	function reasonRo(reason?: string): string | null {
		if (!reason) return null;
		if (reason === PATTERN_REASON.notArrangement) {
			return 'Piesele nu pot fi aranjate în formații valide.';
		}
		if (reason.startsWith('this pattern needs exactly')) {
			const count = reason.match(/\d+/)?.[0] ?? '';
			return `Modelul are nevoie exact de ${count} piese.`;
		}
		if (reason === PATTERN_REASON.noJokers) return 'Acest model nu acceptă jokeri.';
		if (reason === PATTERN_REASON.beteShape) return 'Bete cere 2 terțe de 4 și 2 terțe de 3.';
		if (reason === PATTERN_REASON.mozaicValues) {
			return 'Mozaic are nevoie de valorile 1, 2, 3 … 13, 1.';
		}
		if (reason === PATTERN_REASON.mozaicColours) {
			return 'Culorile nu se potrivesc cu aranjamentul cerut de Mozaic.';
		}
		if (reason === PATTERN_REASON.bicolorColours) {
			return 'Bicolor are nevoie de 2 suite complete în 2 culori.';
		}
		if (reason === PATTERN_REASON.monocolorColours) {
			return 'Monocolor are nevoie de o suită completă într-o singură culoare.';
		}
		if (reason === PATTERN_REASON.dublePairs) return 'Duble are nevoie de 7 perechi identice.';
		return null;
	}
</script>

<section class="glass-panel min-w-0 rounded-2xl p-4" aria-label="Joc pe tablă">
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-bold tracking-wide text-gold-200 uppercase">Pe tablă</h3>
		<span class="rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-bold text-cream-50">
			{pieces.length} piese adunate
		</span>
	</div>

	<p class="mb-3 text-xs leading-relaxed text-cream-100/75">
		Construiești formațiile numai la tine în tablă, fără a le etala. Alege modelul, urmărește
		progresul și, când e gata, <span class="font-bold text-gold-200">închide</span>.
	</p>

	<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
		{#each results as { def, bonus, result } (def.key)}
			{@const active = pattern === def.key}
			{@const complete = result.valid && hasPieces}
			<button
				type="button"
				class="pattern-card rounded-xl bg-black/30 p-2.5 text-left {active
					? 'ring-2 ring-gold-400'
					: ''}"
				aria-pressed={active}
				onclick={() => onselect(def.key)}
				disabled={!canDeclare && !active}
			>
				<div class="mb-1 flex items-start justify-between gap-2">
					<span class="text-sm font-black {active ? 'text-gold-200' : 'text-cream-50'}">
						{def.name}
					</span>
					<span class="rounded bg-gold-400/20 px-1.5 py-0.5 text-[11px] font-black text-gold-200">
						+{bonus}
					</span>
				</div>
				<p class="mb-2 text-[11px] leading-snug text-cream-100/70">{def.desc}</p>
				<div class="flex items-center gap-2">
					<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
						<div
							class="progress-fill h-full rounded-full {complete
								? 'bg-emerald-400'
								: 'bg-gold-400'}"
							style="width: {Math.round(result.progress * 100)}%"
						></div>
					</div>
					<span
						class="text-[10px] font-bold tabular-nums {complete
							? 'text-emerald-300'
							: 'text-cream-100/60'}"
					>
						{Math.round(result.progress * 100)}%
					</span>
				</div>
				{#if complete}
					<span class="mt-1 block text-[10px] font-black tracking-wider text-emerald-300 uppercase">
						Complet
					</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if selected}
		<div class="mt-3 rounded-xl border border-gold-400/40 bg-black/30 p-3" role="status">
			<div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm font-black text-gold-200">
					{selected.def.name} · +{selected.bonus} puncte
				</p>
				<span class="text-xs font-bold text-cream-100 tabular-nums">{progressPct}%</span>
			</div>
			<div class="h-2.5 overflow-hidden rounded-full bg-black/50">
				<div
					class="progress-fill h-full rounded-full {selectedValid
						? 'bg-emerald-400'
						: 'bg-gold-400'}"
					style="width: {progressPct}%"
				></div>
			</div>
			{#if selectedValid}
				<p class="mt-1.5 text-xs font-bold text-emerald-200">Model complet — poți închide jocul.</p>
			{:else}
				<p class="mt-1.5 text-xs text-amber-200">
					{reasonRo(selected.result.reason) ?? 'Încă nu este complet.'}
				</p>
			{/if}
		</div>
	{/if}

	<div class="mt-3">
		<h4 class="mb-1.5 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">
			Piese adunate
		</h4>
		{#if pieces.length === 0}
			<p class="text-xs text-cream-100/50 italic">Nicio piesă încă.</p>
		{:else}
			<div class="flex flex-wrap gap-1.5">
				{#each pieces as piece (piece.id)}
					<PieceTile {piece} size="sm" />
				{/each}
			</div>
		{/if}
	</div>

	<p
		class="mt-3 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
		role="note"
	>
		Atenție: dacă altcineva închide jocul înaintea ta, o tablă rămasă incompletă se punctează cu
		<span class="font-black">−100</span>.
	</p>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if canDeclare && pattern}
			<button
				type="button"
				class="btn border-gold-400 bg-gold-400 font-bold text-felt-950 btn-sm hover:bg-gold-300"
				onclick={onconfirm}
			>
				Declară joc pe tablă
			</button>
		{/if}
		{#if selectedValid}
			<button
				type="button"
				class="btn border-emerald-300/60 font-bold text-emerald-100 btn-outline btn-sm hover:bg-emerald-400/20"
				onclick={onclose}
			>
				Închide
			</button>
		{/if}
		{#if canDeclare && !pattern}
			<p class="text-xs text-cream-100/70">Alege un model pentru a-l declara.</p>
		{/if}
		{#if !canDeclare && !pattern}
			<p class="text-xs text-cream-100/70">Fereastra de declarare (primele 3 ture) s-a închis.</p>
		{/if}
	</div>
</section>

<style>
	.pattern-card {
		border: 1px solid rgb(243 216 148 / 0.12);
		cursor: pointer;
	}

	.pattern-card:disabled {
		cursor: not-allowed;
		opacity: 0.75;
	}

	@media (prefers-reduced-motion: no-preference) {
		.progress-fill {
			transition: width 160ms ease-out;
		}

		.pattern-card {
			transition:
				border-color 150ms ease-out,
				box-shadow 150ms ease-out,
				transform 150ms ease-out;
		}
		.pattern-card:not(:disabled):hover {
			transform: translateY(-2px);
			border-color: rgb(231 189 91 / 0.55);
		}
	}
</style>
