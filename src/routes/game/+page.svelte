<script lang="ts">
	import { goto } from '$app/navigation';
	import { gameState, startGame, playerNextRound, resetGame } from '$lib/stores/gameStore';
	import GameTable from '$lib/components/GameTable.svelte';
	import ScoreSheet from '$lib/components/ScoreSheet.svelte';
	import MatchOver from '$lib/components/MatchOver.svelte';

	const COUNTS: readonly (2 | 3 | 4)[] = [2, 3, 4];

	const FAN = [
		{ rank: 'A', suit: '♠', x: -46, y: 8, r: -14 },
		{ rank: 'K', suit: '♥', x: 0, y: 0, r: 0 },
		{ rank: 'Q', suit: '♦', x: 46, y: 8, r: 14 }
	];

	let playerCount = $state<2 | 3 | 4>(2);

	/** Table names for the score sheets: "You" plus numbered seats. */
	let names = $derived(
		($gameState?.players ?? []).map((_, index) => (index === 0 ? 'You' : `Player ${index + 1}`))
	);

	function handleStart() {
		startGame({ playerCount, humanPlayerIndex: 0 });
	}

	async function handleHome() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto('/');
	}

	/** End of match: start a new solo match at the same table size. */
	function handlePlayAgain() {
		const raw = $gameState?.players.length ?? 2;
		const count = (raw <= 2 ? 2 : raw >= 4 ? 4 : 3) as 2 | 3 | 4;
		playerCount = count;
		startGame({ playerCount: count, humanPlayerIndex: 0 });
	}

	/** End of match: clear the solo game and head back to the home screen. */
	async function handleResetAndHome() {
		resetGame();
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto('/');
	}
</script>

{#if $gameState === null}
	<div class="remi-root">
		<div
			class="felt relative mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-8 px-5 py-10"
		>
			<div class="scene" aria-hidden="true">
				<div class="scene-glow"></div>
				<div class="scene-ring"></div>
				<div class="fan">
					{#each FAN as c (c.rank + c.suit)}
						<div class="fan-card" style="--x:{c.x}px; --y:{c.y}px; --r:{c.r}deg">
							<span class="fan-rank">{c.rank}</span>
							<span class="fan-suit">{c.suit}</span>
						</div>
					{/each}
				</div>
			</div>

			<div class="panel flex w-full flex-col gap-5 glass p-5 text-center sm:p-7">
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Solo table</span>
					<h1 class="title">Ready to deal?</h1>
					<p class="text-sm text-amber-50/65">
						Pick your table size and start a fresh match against the house AI.
					</p>
				</div>

				<div class="flex flex-col gap-2">
					<span class="field-label" id="player-count-label">Players</span>
					<div class="segmented" role="group" aria-labelledby="player-count-label">
						{#each COUNTS as n (n)}
							<button
								type="button"
								class="seg-item"
								aria-pressed={playerCount === n}
								onclick={() => (playerCount = n)}
							>
								{n}
								<span class="text-[0.65rem] opacity-70">players</span>
							</button>
						{/each}
					</div>
				</div>

				<button type="button" class="btn-gold btn w-full" onclick={handleStart}>
					Start game vs AI
				</button>
				<button type="button" class="btn-quiet btn w-full" onclick={handleHome}>
					Back to home
				</button>
			</div>
		</div>
	</div>
{:else if $gameState.phase === 'round-over'}
	<ScoreSheet gameState={$gameState} {names} cannextround={true} onnextround={playerNextRound} />
{:else if $gameState.phase === 'finished'}
	<MatchOver
		gameState={$gameState}
		{names}
		myIndex={0}
		onplayagain={handlePlayAgain}
		onhome={handleResetAndHome}
	/>
{:else}
	<GameTable />
{/if}

<style>
	/* Same card-table identity as the home screen: walnut rail, emerald felt, gold accents. */
	.remi-root {
		min-height: 100vh;
		background-color: #38200f;
		background-image:
			repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.07) 0 2px, transparent 2px 8px),
			linear-gradient(180deg, #7a4a27 0%, #4b2c16 45%, #341c0d 100%);
	}

	.felt {
		background-color: #05301f;
		background-image:
			radial-gradient(90% 62% at 50% -6%, rgba(255, 238, 196, 0.2), transparent 58%),
			radial-gradient(75% 55% at 50% 32%, #12734a 0%, #0c5a3a 40%, #064027 72%, #03291a 100%);
		box-shadow:
			inset 0 0 180px rgba(0, 0, 0, 0.65),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.felt::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 6px),
			repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.05) 0 1px, transparent 1px 6px);
		border-radius: inherit;
	}

	.felt > * {
		position: relative;
	}

	.panel {
		border-radius: 1.25rem;
		border: 1px solid rgba(232, 197, 106, 0.22);
		box-shadow:
			0 22px 50px -24px rgba(0, 0, 0, 0.85),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	.glass {
		background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
		backdrop-filter: blur(12px);
	}

	.eyebrow {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: rgba(243, 221, 160, 0.75);
	}

	.title {
		font-size: clamp(1.6rem, 7vw, 2.35rem);
		font-weight: 800;
		line-height: 1.1;
		color: #f8f1e0;
		text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
	}

	/* — Decorative card fan — */
	.scene {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: clamp(120px, 34vw, 160px);
	}

	.scene-glow {
		position: absolute;
		inset: 4% 18%;
		border-radius: 50%;
		background-image: radial-gradient(closest-side, rgba(255, 236, 190, 0.22), transparent 72%);
		filter: blur(6px);
	}

	.scene-ring {
		position: absolute;
		inset: 10% 22%;
		border-radius: 50%;
		border: 1px solid rgba(232, 197, 106, 0.22);
	}

	.fan {
		position: relative;
		--fan-scale: clamp(0.66, 0.32 + 16vw, 1);
		transform: scale(var(--fan-scale));
		height: 104px;
	}

	.fan-card {
		position: absolute;
		top: 4px;
		left: calc(50% - 33px);
		width: 66px;
		height: 92px;
		transform: translateX(var(--x)) translateY(var(--y)) rotate(var(--r));
		transform-origin: 50% 135%;
		border-radius: 8px;
		border: 1px solid rgba(120, 90, 40, 0.35);
		background-image: linear-gradient(160deg, #fffdf6 0%, #f3ecdc 100%);
		box-shadow:
			0 14px 26px -12px rgba(0, 0, 0, 0.85),
			inset 0 0 0 1px rgba(255, 255, 255, 0.6);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
	}

	.fan-rank {
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		color: #23301f;
	}

	.fan-suit {
		font-size: 1.8rem;
		line-height: 1;
		color: #b03a2e;
	}

	/* — Controls — */
	.field-label {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(246, 239, 224, 0.6);
	}

	.segmented {
		display: flex;
		gap: 0.4rem;
		padding: 0.28rem;
		border-radius: 0.9rem;
		border: 1px solid rgba(232, 197, 106, 0.18);
		background-color: rgba(2, 22, 14, 0.5);
	}

	.seg-item {
		flex: 1;
		display: inline-flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.5rem 0.3rem;
		border: 0;
		border-radius: 0.65rem;
		background: transparent;
		color: rgba(246, 239, 224, 0.72);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			transform 0.15s ease;
	}

	.seg-item:hover {
		background-color: rgba(255, 255, 255, 0.06);
		color: #f8f1e0;
	}

	.seg-item[aria-pressed='true'] {
		background-image: linear-gradient(180deg, #f3dda0, #cfa84f);
		color: #241704;
		box-shadow: 0 6px 14px -8px rgba(0, 0, 0, 0.9);
	}

	.seg-item:focus-visible {
		outline: 2px solid rgba(243, 221, 160, 0.85);
		outline-offset: 2px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.85rem;
		padding: 0.65rem 1rem;
		font-size: 0.92rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease,
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	.btn-gold {
		border: 1px solid rgba(255, 244, 214, 0.55);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 12px 24px -14px rgba(0, 0, 0, 0.95),
			inset 0 1px 0 rgba(255, 255, 255, 0.55);
	}

	.btn-gold:hover {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}

	.btn-quiet {
		border: 1px solid rgba(232, 197, 106, 0.3);
		background-color: rgba(255, 255, 255, 0.05);
		color: #f6efe0;
	}

	.btn-quiet:hover {
		border-color: rgba(232, 197, 106, 0.6);
		background-color: rgba(255, 255, 255, 0.1);
	}

	.btn:focus-visible {
		outline: 2px solid rgba(243, 221, 160, 0.9);
		outline-offset: 2px;
	}

	/* — Motion, opt-in only — */
	@media (prefers-reduced-motion: no-preference) {
		.scene-glow {
			animation: breathe 7s ease-in-out infinite;
		}

		.fan-card {
			animation: settle 0.7s cubic-bezier(0.2, 0.8, 0.25, 1) backwards;
		}

		.fan-card:nth-child(2) {
			animation-delay: 0.08s;
		}

		.fan-card:nth-child(3) {
			animation-delay: 0.16s;
		}
	}

	@keyframes settle {
		from {
			transform: translateX(var(--x)) translateY(calc(var(--y) - 14px)) rotate(var(--r)) scale(0.9);
			opacity: 0;
		}
		to {
			transform: translateX(var(--x)) translateY(var(--y)) rotate(var(--r)) scale(1);
			opacity: 1;
		}
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.75;
		}
		50% {
			opacity: 1;
		}
	}
</style>
