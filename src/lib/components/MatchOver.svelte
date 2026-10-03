<script lang="ts">
	import type { GameState } from '$lib/engine/types';

	/**
	 * Match-over screen (phase === 'finished').
	 *
	 * Winner banner, final standings sorted by score, the
	 * optional 1v1 MMR result, and exit actions. Purely
	 * presentational: every navigation goes through the
	 * `onplayagain` / `onhome` callbacks, so the same
	 * screen works for the solo table and multiplayer rooms.
	 */
	let {
		gameState,
		names,
		myIndex,
		mmr = null,
		onplayagain,
		onhome
	}: {
		gameState: GameState;
		names: string[];
		myIndex?: number;
		mmr?: { winnerMMR: number; loserMMR: number } | null;
		onplayagain?: () => void;
		onhome?: () => void;
	} = $props();

	let matchWinner = $derived(gameState.matchWinner);

	let winnerName = $derived(
		matchWinner === null ? null : (names[matchWinner] ?? `Player ${matchWinner + 1}`)
	);

	/** Final standings, highest total first; ties keep table order. */
	let standings = $derived(
		gameState.scores
			.map((score, index) => ({ score, index }))
			.sort((a, b) => b.score - a.score || a.index - b.index)
	);

	function rankLabel(position: number): string {
		if (position === 1) return '1st';
		if (position === 2) return '2nd';
		if (position === 3) return '3rd';
		return `${position}th`;
	}
</script>

<div
	class="felt-surface relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-3 sm:p-6"
>
	<div
		class="glass-panel card-deal-in w-full max-w-xl rounded-3xl px-5 py-6 text-center sm:px-7"
		role="status"
		aria-label="Match result"
	>
		<span class="eyebrow">Match over</span>

		<div class="mt-1 flex flex-col items-center gap-1.5">
			<span class="crown" aria-hidden="true">♛</span>
			<h1 class="title">
				{winnerName === null ? 'Match finished' : `${winnerName} wins the match!`}
			</h1>
			<p class="text-[0.78rem] text-cream-50/60">
				First to {gameState.targetScore} · {gameState.round}
				{gameState.round === 1 ? 'round' : 'rounds'} played
			</p>
		</div>

		<!-- Final standings -->
		<div class="mt-5 overflow-x-auto text-left">
			<table class="w-full min-w-56 text-sm">
				<thead>
					<tr class="text-[0.65rem] font-semibold tracking-[0.18em] text-cream-50/45 uppercase">
						<th class="pr-3 pb-2">Rank</th>
						<th class="pr-3 pb-2">Player</th>
						<th class="pb-2 text-right">Score</th>
					</tr>
				</thead>
				<tbody>
					{#each standings as { score, index }, position (index)}
						{@const isYou = myIndex !== undefined && index === myIndex}
						<tr
							class="border-t border-cream-50/10 {isYou
								? 'bg-gold-300/10 text-gold-200'
								: 'text-cream-50/85'}"
						>
							<td class="py-2.5 pr-3">
								<span class={position === 0 ? 'rank rank-gold' : 'rank rank-plain'}>
									{rankLabel(position + 1)}
								</span>
							</td>
							<td class="py-2.5 pr-3 font-semibold">
								<span class="flex flex-wrap items-center gap-2">
									{names[index] ?? `Player ${index + 1}`}
									{#if isYou}
										<span
											class="rounded-full border border-gold-400/60 px-1.5 text-[9px] font-bold tracking-wider uppercase"
										>
											You
										</span>
									{/if}
									{#if index === matchWinner}
										<span class="text-gold-300" aria-hidden="true">♛</span>
									{/if}
								</span>
							</td>
							<td class="py-2.5 text-right tabular-nums">{score}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- MMR result (1v1 quick match only) -->
		{#if mmr}
			<div class="mt-5 flex flex-wrap items-center justify-center gap-2">
				<span class="mmr-chip mmr-winner">Winner MMR · {mmr.winnerMMR}</span>
				<span class="mmr-chip mmr-loser">Loser MMR · {mmr.loserMMR}</span>
			</div>
		{/if}

		{#if onplayagain || onhome}
			<div class="mt-6 flex flex-col gap-2 sm:flex-row">
				{#if onplayagain}
					<button type="button" class="btn-gold flex-1" onclick={() => onplayagain?.()}>
						Play again
					</button>
				{/if}
				{#if onhome}
					<button type="button" class="btn-quiet flex-1" onclick={() => onhome?.()}> Home </button>
				{/if}
			</div>
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

	/* Modest close celebration (spec §5.5), gated by reduced motion */
	.crown {
		font-size: 2.1rem;
		line-height: 1;
		color: var(--color-gold-400);
		text-shadow: 0 0 14px rgb(231 189 91 / 0.45);
	}

	.rank {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.1rem;
		border-radius: 9999px;
		padding: 0.1rem 0.55rem;
		font-size: 0.68rem;
		font-weight: 800;
	}

	.rank-gold {
		border: 1px solid rgb(255 244 214 / 0.55);
		background-image: linear-gradient(180deg, #f6e3ad, #d9b25c);
		color: #241704;
	}

	.rank-plain {
		border: 1px solid rgb(243 216 148 / 0.2);
		background-color: rgb(255 255 255 / 0.06);
		color: rgba(246, 239, 224, 0.6);
	}

	.mmr-chip {
		border-radius: 9999px;
		padding: 0.35rem 0.8rem;
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.mmr-winner {
		border: 1px solid rgb(255 244 214 / 0.5);
		background-color: rgb(20 113 73 / 0.4);
		color: #f8e7b8;
	}

	.mmr-loser {
		border: 1px solid rgb(243 216 148 / 0.25);
		background-color: rgb(0 0 0 / 0.3);
		color: rgba(246, 239, 224, 0.65);
	}

	.btn-gold,
	.btn-quiet {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border-radius: 0.7rem;
		padding: 0.65rem 1rem;
		font-size: 0.92rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease,
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.btn-gold {
		border: 1px solid rgb(255 244 214 / 0.5);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 10px 20px -14px rgb(0 0 0 / 0.95),
			inset 0 1px 0 rgb(255 255 255 / 0.55);
	}

	.btn-gold:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	.btn-quiet {
		border: 1px solid rgb(232 197 106 / 0.3);
		background-color: rgb(255 255 255 / 0.05);
		color: #f6efe0;
	}

	.btn-quiet:hover {
		border-color: rgb(232 197 106 / 0.6);
		background-color: rgb(255 255 255 / 0.1);
	}

	.btn-gold:focus-visible,
	.btn-quiet:focus-visible {
		outline: 2px solid rgb(243 216 148 / 0.9);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.crown {
			animation: crown-glow 2.6s ease-in-out infinite;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-gold,
		.btn-quiet {
			transition: none;
		}

		.btn-gold:hover,
		.btn-quiet:hover {
			transform: none;
		}
	}

	@keyframes crown-glow {
		0%,
		100% {
			text-shadow: 0 0 10px rgb(231 189 91 / 0.35);
		}
		50% {
			text-shadow: 0 0 26px rgb(231 189 91 / 0.75);
		}
	}
</style>
