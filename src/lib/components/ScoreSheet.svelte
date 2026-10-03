<script lang="ts">
	import { onMount } from 'svelte';
	import type { GameState } from '$lib/engine/types';
	import { handPoints } from '$lib/engine/scoring';

	/**
	 * Round score sheet (phase === 'round-over').
	 *
	 * Shows the points the closer collected from the opponents'
	 * remaining hands, the running totals, and the race toward the
	 * target score. Purely presentational: advancing to the next
	 * round goes through `onnextround`, so the same sheet works
	 * for the solo table and multiplayer rooms.
	 */
	let {
		gameState,
		names,
		cannextround = false,
		onnextround
	}: {
		gameState: GameState;
		names: string[];
		cannextround?: boolean;
		onnextround?: () => void;
	} = $props();

	let roundWinner = $derived(gameState.roundWinner);

	let winnerName = $derived(
		roundWinner === null ? null : (names[roundWinner] ?? `Player ${roundWinner + 1}`)
	);

	let headline = $derived(
		winnerName === null
			? `Round ${gameState.round} — round decided`
			: winnerName === 'You'
				? `Round ${gameState.round} — You win the round`
				: `Round ${gameState.round} — ${winnerName} wins the round`
	);

	/**
	 * Points collected this round: the total value of every
	 * opponent's remaining hand (numbers face value, A/J/Q/K = 10,
	 * jokers = 25).
	 */
	let collectedPoints = $derived.by(() => {
		if (roundWinner === null) return 0;
		return gameState.players.reduce(
			(total, player, index) => (index === roundWinner ? total : total + handPoints(player.hand)),
			0
		);
	});

	/* — Score count-up (spec §5.5), skipped for reduced motion — */
	let shownTotals = $state<number[]>(gameState.scores.map(() => 0));
	let shownCollected = $state(0);

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shownTotals = [...gameState.scores];
			shownCollected = collectedPoints;
			return;
		}
		const duration = 650;
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - Math.pow(1 - t, 3);
			shownTotals = gameState.scores.map((score) => Math.round(score * eased));
			shownCollected = Math.round(collectedPoints * eased);
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

<div
	class="felt-surface relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-3 sm:p-6"
>
	<div
		class="glass-panel card-deal-in w-full max-w-xl rounded-3xl px-5 py-6 sm:px-7"
		role="status"
		aria-label="Round score sheet"
	>
		<span class="eyebrow">Round score</span>
		<h1 class="title">{headline}</h1>

		<!-- Collected points -->
		<div
			class="mt-4 flex flex-col items-center gap-1 rounded-2xl border border-gold-300/25 bg-gold-300/10 px-4 py-3"
		>
			<span class="text-3xl font-extrabold text-gold-200 tabular-nums">+{shownCollected}</span>
			<span class="text-[0.65rem] font-semibold tracking-[0.2em] text-cream-50/55 uppercase">
				collected from the opponents' remaining hands
			</span>
		</div>

		<!-- Scoreboard -->
		<div class="mt-5 overflow-x-auto">
			<table class="w-full min-w-56 text-sm">
				<thead>
					<tr
						class="text-left text-[0.65rem] font-semibold tracking-[0.18em] text-cream-50/45 uppercase"
					>
						<th class="pr-3 pb-2">Player</th>
						<th class="pr-3 pb-2 text-right">This round</th>
						<th class="pb-2 text-right">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each gameState.scores as _score, index (index)}
						<tr
							class="border-t border-cream-50/10 {index === roundWinner
								? 'text-gold-200'
								: 'text-cream-50/85'}"
						>
							<td class="py-2.5 pr-3 font-semibold">
								<span class="flex flex-wrap items-center gap-2">
									{names[index] ?? `Player ${index + 1}`}
									{#if index === roundWinner}
										<span
											class="rounded-full border border-gold-400/60 px-1.5 text-[9px] font-bold tracking-wider uppercase"
										>
											Round winner
										</span>
									{/if}
								</span>
							</td>
							<td class="py-2.5 pr-3 text-right tabular-nums">
								+{index === roundWinner ? shownCollected : 0}
							</td>
							<td class="py-2.5 text-right tabular-nums">{shownTotals[index]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Race to the target score -->
		<div class="mt-5 flex flex-col gap-3">
			<span class="field-label">Race to {gameState.targetScore}</span>
			{#each gameState.scores as score, index (index)}
				{@const label = names[index] ?? `Player ${index + 1}`}
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline justify-between text-[0.72rem]">
						<span
							class="font-semibold {index === roundWinner ? 'text-gold-200' : 'text-cream-50/75'}"
						>
							{label}
						</span>
						<span class="text-cream-50/55 tabular-nums">
							{shownTotals[index]}<span class="text-cream-50/35"> / {gameState.targetScore}</span>
						</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-black/35">
						<div
							class="h-full rounded-full {index === roundWinner
								? 'bg-gradient-to-r from-gold-600 to-gold-300'
								: 'bg-gradient-to-r from-cream-50/20 to-cream-50/40'}"
							style="width: {Math.min(100, (score / gameState.targetScore) * 100)}%"
							role="progressbar"
							aria-label="{label} progress toward {gameState.targetScore} points"
							aria-valuenow={score}
							aria-valuemin={0}
							aria-valuemax={gameState.targetScore}
						></div>
					</div>
				</div>
			{/each}
		</div>

		{#if cannextround && onnextround}
			<button type="button" class="btn-gold mt-6 w-full" onclick={() => onnextround?.()}>
				Next round
			</button>
		{/if}
	</div>
</div>

<style>
	.eyebrow {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: rgba(243, 221, 160, 0.75);
	}

	.title {
		font-size: clamp(1.35rem, 5.5vw, 1.85rem);
		font-weight: 800;
		line-height: 1.15;
		color: #f8f1e0;
		text-shadow: 0 2px 18px rgb(0 0 0 / 0.55);
	}

	.field-label {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(246, 239, 224, 0.6);
	}

	.btn-gold {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border-radius: 0.7rem;
		padding: 0.65rem 1rem;
		font-size: 0.92rem;
		font-weight: 700;
		cursor: pointer;
		border: 1px solid rgb(255 244 214 / 0.5);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 10px 20px -14px rgb(0 0 0 / 0.95),
			inset 0 1px 0 rgb(255 255 255 / 0.55);
		transition:
			filter 0.15s ease,
			transform 0.15s ease;
	}

	.btn-gold:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	.btn-gold:focus-visible {
		outline: 2px solid rgb(243 216 148 / 0.9);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-gold {
			transition: none;
		}

		.btn-gold:hover {
			transform: none;
		}
	}
</style>
