<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { startSoloGame } from '$lib/stores/remi/soloStore';
	import { createRemiRoom, joinRemiRoom, remiError } from '$lib/stores/remi/roomStore';
	import {
		quickJoin,
		leaveQueue,
		matchStatus,
		matchRoomCode,
		matchQueueSize,
		matchMMR
	} from '$lib/stores/matchStore';
	import Piece from '$lib/components/remi/Piece.svelte';
	import type { Piece as PieceType } from '$lib/engine/remi/types';

	const COUNTS: readonly (2 | 3 | 4)[] = [2, 3, 4];

	/**
	 * Room summary as returned by `GET /api/rooms` — typed locally so this
	 * page does not depend on server types.
	 */
	type RoomSummary = {
		code: string;
		status: 'waiting' | 'playing' | 'finished';
		maxPlayers: number;
		players: { name: string }[];
	};

	/** Hero motif: a terță (7 roșu, 7 galben, 7 albastru) fanned on the felt. */
	const HERO_TILES: PieceType[] = [
		{ id: 'hero-7-red', value: 7, color: 'red', isJoker: false },
		{ id: 'hero-7-yellow', value: 7, color: 'yellow', isJoker: false },
		{ id: 'hero-7-blue', value: 7, color: 'blue', isJoker: false }
	];

	const TILE_FAN = [
		{ x: -46, r: -16 },
		{ x: 0, r: 0 },
		{ x: 46, r: 16 }
	];

	let tab = $state<'create' | 'join' | 'browse'>('create');
	let name = $state('');
	let code = $state('');
	let maxPlayers = $state<2 | 3 | 4>(4);
	let playerCount = $state<2 | 3 | 4>(2);
	let error = $state('');
	let rooms = $state<RoomSummary[]>([]);
	let loading = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	onDestroy(() => {
		stopPolling();
		if (browser) leaveQueue();
	});

	$effect(() => {
		if (tab === 'browse') startPolling();
		else stopPolling();
	});

	function startPolling() {
		stopPolling();
		fetchRooms();
		pollTimer = setInterval(fetchRooms, 3000);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function fetchRooms() {
		loading = true;
		try {
			const res = await fetch('/api/rooms');
			if (res.ok) {
				rooms = (await res.json()) as RoomSummary[];
			}
		} catch {
			/* ignore — the list simply stays as-is */
		}
		loading = false;
	}

	function handlePlaySolo() {
		error = '';
		startSoloGame(playerCount);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/game');
	}

	async function handleCreate() {
		if (!name.trim()) {
			error = 'Introdu numele tău.';
			return;
		}
		error = '';
		const data = await createRemiRoom(name.trim(), maxPlayers);
		if (data.code) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${data.code}`);
		} else {
			error = data.error || 'Nu s-a putut crea camera.';
		}
	}

	async function handleJoin() {
		if (!name.trim()) {
			error = 'Introdu numele tău.';
			return;
		}
		if (!code.trim()) {
			error = 'Introdu codul camerei.';
			return;
		}
		error = '';
		const upper = code.trim().toUpperCase();
		const data = await joinRemiRoom(upper, name.trim());
		if (data.room) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${upper}`);
		} else {
			error = data.error || 'Nu s-a putut intra în cameră.';
		}
	}

	async function handleQuickMatch() {
		if (!name.trim()) {
			error = 'Introdu numele tău.';
			return;
		}
		error = '';
		await quickJoin(name.trim());
	}

	async function handleCancelQueue() {
		await leaveQueue();
	}

	$effect(() => {
		if ($matchRoomCode) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(`/room/${$matchRoomCode}`);
		}
	});

	async function handleJoinRoom(roomCode: string) {
		if (!name.trim()) {
			error = 'Introdu mai întâi numele tău.';
			return;
		}
		error = '';
		const data = await joinRemiRoom(roomCode, name.trim());
		if (data.room) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${roomCode}`);
		} else {
			error = data.error || 'Nu s-a putut intra în cameră.';
		}
	}

	function statusLabel(status: string): string {
		if (status === 'waiting') return 'în așteptare';
		if (status === 'playing') return 'în joc';
		return 'terminată';
	}

	function statusChip(status: string): string {
		if (status === 'waiting') return 'is-open';
		if (status === 'playing') return 'is-live';
		return 'is-done';
	}
</script>

<div class="remi-root">
	<div
		class="felt relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-8 sm:py-10 lg:px-12"
	>
		<header class="flex items-center gap-3">
			<span class="wordmark">REMI</span>
			<span class="hairline w-10 self-center sm:w-20"></span>
			<span class="text-[0.7rem] tracking-[0.32em] text-amber-100/60 uppercase"
				>Jocul clasic românesc</span
			>
		</header>

		<div
			class="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-10"
		>
			<!-- Hero: masa de joc + solo -->
			<section class="flex flex-col gap-6">
				<div class="scene" aria-hidden="true">
					<div class="scene-glow"></div>
					<div class="scene-ring"></div>
					<div class="deck-stack">
						<div class="deck-card"></div>
						<div class="deck-card"></div>
						<div class="deck-card"></div>
					</div>
					<div class="tile-fan">
						{#each HERO_TILES as tile, i (tile.id)}
							<div
								class="tile-fan-item"
								style="--x:{TILE_FAN[i]?.x ?? 0}px; --r:{TILE_FAN[i]?.r ?? 0}deg"
							>
								<Piece piece={tile} size="lg" disabled />
							</div>
						{/each}
					</div>
				</div>

				<div class="flex flex-col gap-5 sm:gap-6">
					<div>
						<h1 class="hero-title">Remi Etalat</h1>
						<p class="mt-2 max-w-md text-sm text-amber-50/70 sm:text-base">
							Jocul clasic românesc cu piese de remi — 106 piese, 4 culori, 2 jokeri.
						</p>
					</div>

					<div class="panel flex flex-col gap-5 glass p-5 sm:p-6">
						<div class="flex items-center justify-between gap-3">
							<h2 class="text-xs font-semibold tracking-[0.24em] text-amber-100/80 uppercase">
								Joacă împotriva calculatorului
							</h2>
							<span class="chip is-open">instant</span>
						</div>

						<div class="flex flex-col gap-2">
							<span class="field-label" id="solo-count-label">Jucători</span>
							<div class="segmented" role="group" aria-labelledby="solo-count-label">
								{#each COUNTS as n (n)}
									<button
										type="button"
										class="seg-item"
										aria-pressed={playerCount === n}
										onclick={() => (playerCount = n)}
									>
										{n}
									</button>
								{/each}
							</div>
						</div>

						<button type="button" class="btn-gold btn w-full" onclick={handlePlaySolo}>
							Începe jocul
						</button>
						<p class="text-center text-xs text-amber-50/50">
							Ocupi locul 1. Trage, etalează, închide.
						</p>
					</div>
				</div>
			</section>

			<!-- Card multiplayer -->
			<section class="panel flex flex-col gap-5 glass p-5 sm:p-6" aria-label="Joc online">
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-xs font-semibold tracking-[0.24em] text-amber-100/80 uppercase">
						Joc online
					</h2>
					{#if $matchStatus !== 'idle'}
						<span class="chip is-mmr">MMR {$matchMMR}</span>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<label class="field-label" for="player-name">Numele tău</label>
					<input
						id="player-name"
						type="text"
						placeholder="Jucător"
						maxlength={30}
						autocomplete="off"
						bind:value={name}
					/>
				</div>

				{#if $matchStatus === 'queued'}
					<div class="flex flex-col gap-2">
						<button type="button" class="btn-gold is-pulsing btn w-full" disabled>
							Se caută adversar… ({$matchQueueSize})
						</button>
						<button type="button" class="btn-quiet btn w-full" onclick={handleCancelQueue}>
							Anulează
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="btn-quiet btn w-full"
						onclick={handleQuickMatch}
						disabled={!name.trim()}
					>
						Căutare adversar (1v1)
					</button>
				{/if}

				<div class="hairline"></div>

				<div class="segmented" role="group" aria-label="Acțiune cameră">
					<button
						type="button"
						class="seg-item"
						aria-pressed={tab === 'create'}
						onclick={() => {
							tab = 'create';
							error = '';
						}}
					>
						Creează cameră
					</button>
					<button
						type="button"
						class="seg-item"
						aria-pressed={tab === 'join'}
						onclick={() => {
							tab = 'join';
							error = '';
						}}
					>
						Intră în cameră
					</button>
					<button
						type="button"
						class="seg-item"
						aria-pressed={tab === 'browse'}
						onclick={() => {
							tab = 'browse';
							error = '';
						}}
					>
						Camere deschise
					</button>
				</div>

				{#if tab === 'create'}
					<div class="flex flex-col gap-2">
						<span class="field-label" id="max-players-label">Jucători max</span>
						<div class="segmented" role="group" aria-labelledby="max-players-label">
							{#each COUNTS as n (n)}
								<button
									type="button"
									class="seg-item"
									aria-pressed={maxPlayers === n}
									onclick={() => (maxPlayers = n)}
								>
									{n}
								</button>
							{/each}
						</div>
					</div>
					<button type="button" class="btn-gold btn w-full" onclick={handleCreate}>
						Creează cameră
					</button>
				{:else if tab === 'join'}
					<div class="flex flex-col gap-2">
						<label class="field-label" for="room-code">Cod cameră</label>
						<input
							id="room-code"
							type="text"
							placeholder="ABC123"
							maxlength={6}
							autocomplete="off"
							class="font-mono tracking-[0.3em] uppercase"
							bind:value={code}
						/>
					</div>
					<button type="button" class="btn-gold btn w-full" onclick={handleJoin}>
						Intră în cameră
					</button>
				{:else}
					<div class="flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<span class="field-label">Camere deschise</span>
							<button
								type="button"
								class="btn-quiet btn btn-xs"
								onclick={fetchRooms}
								disabled={loading}
							>
								{loading ? 'Se reîmprospătează…' : 'Reîmprospătează'}
							</button>
						</div>
						{#if rooms.length === 0}
							<p class="py-6 text-center text-sm text-amber-50/45">Nici o cameră disponibilă</p>
						{:else}
							<ul class="flex flex-col gap-2">
								{#each rooms as r (r.code)}
									<li class="room-row">
										<div class="flex min-w-0 flex-col gap-1.5">
											<div class="flex flex-wrap items-center gap-2">
												<span class="chip is-code">{r.code}</span>
												<span class="text-xs text-amber-50/55"
													>{r.players.length}/{r.maxPlayers} locuri</span
												>
												<span class="chip {statusChip(r.status)}">{statusLabel(r.status)}</span>
											</div>
											<div class="flex flex-wrap gap-1">
												{#each r.players as p, i (i)}
													<span class="chip is-player">{p.name}</span>
												{/each}
											</div>
										</div>
										<button
											type="button"
											class="btn {r.status === 'waiting' ? 'btn-gold btn-sm' : 'btn-quiet btn-sm'}"
											onclick={() => handleJoinRoom(r.code)}
											disabled={r.status !== 'waiting'}
										>
											Intră
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				{#if error || $remiError}
					<p class="chip is-error" role="alert">{error || $remiError}</p>
				{/if}
			</section>
		</div>

		<footer class="text-center text-xs text-amber-50/35">
			Remi — trage o piesă, etalează suite și terțe, închide jocul.
		</footer>
	</div>
</div>

<style>
	/* — Card-table identity: walnut rail, deep emerald felt, gold/cream accents — */
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

	/* 8% lattice so the felt reads as fabric rather than flat paint */
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

	.wordmark {
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: 0.42em;
		background-image: linear-gradient(180deg, #fbeec2 0%, #e2bd6a 55%, #b98f33 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
	}

	.hairline {
		display: block;
		flex: none;
		height: 1px;
		background-image: linear-gradient(90deg, transparent, rgba(232, 197, 106, 0.4), transparent);
	}

	.hero-title {
		font-size: clamp(2rem, 8vw, 3.25rem);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: #f8f1e0;
		text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
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

	/* — Hero table scene — */
	.scene {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: clamp(170px, 46vw, 260px);
		overflow: hidden;
		border-radius: 1.25rem;
		border: 1px solid rgba(232, 197, 106, 0.16);
		background-image:
			radial-gradient(65% 90% at 50% 12%, rgba(255, 240, 205, 0.16), transparent 62%),
			linear-gradient(180deg, rgba(4, 40, 26, 0.35), rgba(2, 22, 14, 0.75));
	}

	.scene-glow {
		position: absolute;
		inset: 6% 12%;
		border-radius: 50%;
		background-image: radial-gradient(closest-side, rgba(255, 236, 190, 0.2), transparent 72%);
		filter: blur(6px);
	}

	.scene-ring {
		position: absolute;
		inset: 12% 18%;
		border-radius: 50%;
		border: 1px solid rgba(232, 197, 106, 0.22);
		box-shadow: inset 0 0 40px rgba(255, 233, 180, 0.06);
	}

	/* Terță fan — three wooden tiles fanned over the felt */
	.tile-fan {
		position: relative;
		height: 118px;
		width: 100%;
	}

	.tile-fan-item {
		position: absolute;
		top: 6px;
		left: calc(50% + var(--x, 0px));
		transform: translateX(-50%) rotate(var(--r, 0deg));
		transform-origin: 50% 130%;
	}

	/* The grămadă (stock) waiting beside the fan */
	.deck-stack {
		position: absolute;
		left: clamp(6%, 12%, 16%);
		bottom: 14%;
		width: 54px;
		height: 74px;
		transform: scale(clamp(0.7, 0.35 + 12vw, 1));
		transform-origin: bottom left;
	}

	.deck-card {
		position: absolute;
		inset: 0;
		border-radius: 6px;
		border: 1px solid rgba(232, 197, 106, 0.55);
		background-image:
			repeating-linear-gradient(45deg, rgba(232, 197, 106, 0.16) 0 3px, transparent 3px 7px),
			linear-gradient(160deg, #0c4d33, #062a1c);
		box-shadow: 0 10px 20px -12px rgba(0, 0, 0, 0.9);
	}

	.deck-card:nth-child(1) {
		transform: translate(9px, 4px);
	}

	.deck-card:nth-child(2) {
		transform: translate(4px, 2px);
	}

	.deck-card:nth-child(3) {
		transform: translate(0, 0);
	}

	/* — Controls — */
	.field-label {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(246, 239, 224, 0.6);
	}

	.remi-root input[type='text'] {
		width: 100%;
		border-radius: 0.75rem;
		border: 1px solid rgba(232, 197, 106, 0.24);
		background-color: rgba(2, 24, 15, 0.55);
		padding: 0.6rem 0.85rem;
		font-size: 0.95rem;
		color: #f8f1e0;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.remi-root input[type='text']::placeholder {
		color: rgba(246, 239, 224, 0.32);
	}

	.remi-root input[type='text']:focus {
		outline: none;
		border-color: rgba(232, 197, 106, 0.75);
		box-shadow:
			0 0 0 3px rgba(232, 197, 106, 0.18),
			inset 0 1px 2px rgba(0, 0, 0, 0.5);
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
		padding: 0.45rem 0.3rem;
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
		letter-spacing: 0.01em;
		cursor: pointer;
		transition:
			filter 0.15s ease,
			transform 0.15s ease,
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	.btn-sm {
		padding: 0.35rem 0.75rem;
		font-size: 0.78rem;
		border-radius: 0.6rem;
	}

	.btn-xs {
		padding: 0.2rem 0.55rem;
		font-size: 0.72rem;
		border-radius: 0.5rem;
	}

	.btn-gold {
		border: 1px solid rgba(255, 244, 214, 0.55);
		background-image: linear-gradient(180deg, #f6e3ad 0%, #d9b25c 58%, #b98f33 100%);
		color: #241704;
		box-shadow:
			0 12px 24px -14px rgba(0, 0, 0, 0.95),
			inset 0 1px 0 rgba(255, 255, 255, 0.55);
	}

	.btn-gold:hover:not(:disabled) {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}

	.btn-quiet {
		border: 1px solid rgba(232, 197, 106, 0.3);
		background-color: rgba(255, 255, 255, 0.05);
		color: #f6efe0;
	}

	.btn-quiet:hover:not(:disabled) {
		border-color: rgba(232, 197, 106, 0.6);
		background-color: rgba(255, 255, 255, 0.1);
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn:focus-visible {
		outline: 2px solid rgba(243, 221, 160, 0.9);
		outline-offset: 2px;
	}

	/* — Chips — */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.16rem 0.6rem;
		border-radius: 999px;
		border: 1px solid rgba(232, 197, 106, 0.28);
		background-color: rgba(255, 255, 255, 0.05);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #f0e6d2;
	}

	.chip.is-open {
		border-color: rgba(120, 240, 180, 0.35);
		background-color: rgba(16, 110, 72, 0.3);
		color: #a7f0c6;
	}

	.chip.is-live {
		border-color: rgba(255, 205, 130, 0.4);
		background-color: rgba(140, 90, 20, 0.32);
		color: #ffd79a;
	}

	.chip.is-done {
		border-color: rgba(200, 190, 170, 0.3);
		background-color: rgba(120, 120, 120, 0.2);
		color: #d3c9b6;
	}

	.chip.is-code {
		font-family: var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
		border-color: rgba(232, 197, 106, 0.45);
		background-color: rgba(232, 197, 106, 0.12);
		color: #f6e3ad;
	}

	.chip.is-mmr {
		border-color: rgba(232, 197, 106, 0.45);
		background-color: rgba(232, 197, 106, 0.12);
		color: #f6e3ad;
	}

	.chip.is-player {
		text-transform: none;
		letter-spacing: 0.02em;
		color: rgba(246, 239, 224, 0.75);
	}

	.chip.is-error {
		display: block;
		text-transform: none;
		letter-spacing: 0.01em;
		border-color: rgba(255, 140, 120, 0.45);
		background-color: rgba(120, 30, 25, 0.4);
		color: #ffc7bd;
	}

	.room-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		border-radius: 0.9rem;
		border: 1px solid rgba(232, 197, 106, 0.14);
		background-color: rgba(2, 22, 14, 0.45);
	}

	/* — Motion, opt-in only — */
	@media (prefers-reduced-motion: no-preference) {
		.scene-glow {
			animation: breathe 7s ease-in-out infinite;
		}

		.tile-fan-item {
			animation: settle 0.7s cubic-bezier(0.2, 0.8, 0.25, 1) backwards;
		}

		.tile-fan-item:nth-child(2) {
			animation-delay: 0.07s;
		}

		.tile-fan-item:nth-child(3) {
			animation-delay: 0.14s;
		}

		.is-pulsing {
			animation: breathe 1.8s ease-in-out infinite;
		}
	}

	@keyframes settle {
		from {
			transform: translateX(-50%) translateY(calc(-16px)) rotate(var(--r, 0deg)) scale(0.9);
			opacity: 0;
		}
		to {
			transform: translateX(-50%) translateY(0) rotate(var(--r, 0deg)) scale(1);
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
