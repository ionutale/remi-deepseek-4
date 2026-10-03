<script lang="ts">
	import type { PlayerBreakdown } from '$lib/engine/remi/scoring';

	let {
		playerNames,
		breakdowns,
		scores,
		sessionTotals,
		gameWinner,
		closerIndex,
		stockOut,
		doubleGame,
		onnext
	}: {
		playerNames: string[];
		breakdowns: PlayerBreakdown[];
		scores: number[];
		sessionTotals: number[];
		gameWinner: number | null;
		closerIndex: number | null;
		stockOut: boolean;
		doubleGame: boolean;
		onnext: () => void;
	} = $props();

	type RowDef = {
		label: string;
		kind: 'points' | 'multiplier';
		get: (breakdown: PlayerBreakdown) => number;
	};

	const ROWS: RowDef[] = [
		{ label: 'Etalat', kind: 'points', get: (b) => b.meldedPoints },
		{ label: 'Lipit', kind: 'points', get: (b) => b.lipitPoints },
		{ label: 'Rămas pe tablă', kind: 'points', get: (b) => b.rackPenalty },
		{ label: 'Închidere', kind: 'points', get: (b) => b.closingBonus },
		{ label: 'Bonus atu', kind: 'points', get: (b) => b.atuBonus },
		{ label: 'Pe tablă', kind: 'points', get: (b) => b.peTablaBonus },
		{ label: 'Neetalat', kind: 'points', get: (b) => b.nonMelderPenalty },
		{ label: '×2 Joc dublu', kind: 'multiplier', get: (b) => b.multiplier }
	];

	function points(value: number): string {
		if (value === 0) return '—';
		return value > 0 ? `+${value}` : `${value}`;
	}

	function signed(value: number): string {
		return value > 0 ? `+${value}` : `${value}`;
	}

	function cell(row: RowDef, index: number): string {
		const breakdown = breakdowns[index];
		if (!breakdown) return '—';
		const value = row.get(breakdown);
		if (row.kind === 'multiplier') return value > 1 ? `×${value}` : '—';
		return points(value);
	}

	function scoreAt(list: number[], index: number): string {
		const value = list[index];
		return typeof value === 'number' ? signed(value) : '—';
	}

	let winnerName = $derived(gameWinner !== null ? (playerNames[gameWinner] ?? null) : null);
	let closerName = $derived(closerIndex !== null ? (playerNames[closerIndex] ?? null) : null);
</script>

<section class="glass-panel min-w-0 rounded-2xl p-4" aria-label="Rezultate">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-bold tracking-wide text-gold-200 uppercase">Rezultate</h3>
		<div class="flex flex-wrap gap-1.5">
			{#if doubleGame}
				<span
					class="rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-black tracking-wider text-felt-950 uppercase"
				>
					Joc dublu!
				</span>
			{/if}
			{#if stockOut}
				<span
					class="rounded-full bg-amber-500/25 px-2.5 py-0.5 text-[11px] font-black tracking-wider text-amber-100 uppercase"
				>
					Grămada s-a terminat
				</span>
			{:else if closerName}
				<span class="rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] text-cream-100/80">
					A închis: <span class="font-bold text-cream-50">{closerName}</span>
				</span>
			{/if}
		</div>
	</div>

	{#if winnerName}
		<div class="winner-banner mb-3 rounded-xl px-3 py-3 text-center" role="status">
			<p class="text-[11px] font-black tracking-[0.24em] text-felt-950/80 uppercase">Câștigător</p>
			<p class="text-xl font-black text-felt-950">{winnerName}</p>
			<p class="text-sm font-black text-felt-900 tabular-nums">
				{scoreAt(scores, gameWinner ?? 0)} puncte
			</p>
		</div>
	{/if}

	{#if stockOut}
		<p
			class="mb-3 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
			role="note"
		>
			Grămada s-a terminat înainte ca cineva să închidă: nimeni nu primește bonusul de închidere,
			iar fiecare jucător punctează etalat + lipit minus ce i-a rămas pe tablă.
		</p>
	{/if}

	<div class="overflow-x-auto">
		<table class="w-full min-w-[30rem] border-collapse text-left">
			<caption class="sr-only">Punctaje finale pe jucător</caption>
			<thead>
				<tr class="border-b border-gold-400/40">
					<th
						scope="col"
						class="py-2 pr-2 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase"
					>
						Punctaj
					</th>
					{#each playerNames as name, i (i)}
						<th scope="col" class="px-2 py-2 text-right text-xs font-bold text-cream-50">
							{name}
							{#if i === gameWinner}
								<span class="block text-[9px] font-black tracking-wider text-gold-300 uppercase">
									Câștigător
								</span>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each ROWS as row (row.label)}
					<tr class="border-b border-white/5">
						<th scope="row" class="py-1.5 pr-2 text-xs font-semibold text-cream-100/80">
							{row.label}
						</th>
						{#each playerNames as name, i (i)}
							<td
								class="px-2 py-1.5 text-right text-xs tabular-nums {i === gameWinner
									? 'text-gold-100 bg-gold-400/10 font-bold'
									: 'text-cream-50'}"
							>
								<span class="sr-only">{name}: </span>{cell(row, i)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-gold-400/40">
					<th scope="row" class="py-2 pr-2 text-xs font-black text-gold-200">Total</th>
					{#each playerNames as name, i (i)}
						<td
							class="px-2 py-2 text-right text-sm font-black tabular-nums {i === gameWinner
								? 'text-gold-200'
								: 'text-cream-50'}"
						>
							<span class="sr-only">{name}: </span>{scoreAt(scores, i)}
						</td>
					{/each}
				</tr>
				<tr>
					<th scope="row" class="py-1.5 pr-2 text-xs font-semibold text-cream-100/70">
						Total sesiune
					</th>
					{#each playerNames as name, i (i)}
						<td class="px-2 py-1.5 text-right text-xs text-cream-100/85 tabular-nums">
							<span class="sr-only">{name}: </span>{scoreAt(sessionTotals, i)}
						</td>
					{/each}
				</tr>
			</tfoot>
		</table>
	</div>
	<p class="mt-1 text-[10px] text-cream-100/50 sm:hidden">
		Derulează orizontal pentru toți jucătorii.
	</p>

	<button
		type="button"
		class="btn mt-4 w-full border-gold-400 bg-gold-400 font-black text-felt-950 btn-sm hover:bg-gold-300"
		onclick={onnext}
	>
		Următorul joc
	</button>
</section>

<style>
	.winner-banner {
		background: linear-gradient(115deg, #f8e7b8 0%, #e7bd5b 45%, #d4a017 100%);
		border: 1px solid #a97c0f;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.6),
			0 6px 16px -8px rgb(0 0 0 / 0.7);
	}
</style>
