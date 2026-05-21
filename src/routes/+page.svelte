<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { createRoom, joinRoom } from '$lib/stores/roomStore';
	import {
		quickJoin,
		leaveQueue,
		matchStatus,
		matchRoomCode,
		matchQueueSize
	} from '$lib/stores/matchStore';
	import type { Room } from '$lib/server/roomService';

	let tab = $state<'create' | 'join' | 'browse'>('create');
	let name = $state('');
	let code = $state('');
	let maxPlayers = $state<2 | 3 | 4>(4);
	let errors = $state<string[]>([]);
	let rooms = $state<Room[]>([]);
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
				const all: Room[] = await res.json();
				rooms = all.filter((r) => r.status === 'waiting');
			}
		} catch {
			/* ignore */
		}
		loading = false;
	}

	async function handleCreate() {
		if (!name.trim()) {
			errors = ['Enter your name'];
			return;
		}
		errors = [];
		const data = await createRoom(name.trim(), maxPlayers);
		if (data.code) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${data.code}`);
		} else {
			errors = [data.error || 'Failed to create room'];
		}
	}

	async function handleJoin() {
		if (!name.trim()) {
			errors = ['Enter your name'];
			return;
		}
		if (!code.trim()) {
			errors = ['Enter room code'];
			return;
		}
		errors = [];
		const data = await joinRoom(code.trim().toUpperCase(), name.trim());
		if (data.room) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${code.trim().toUpperCase()}`);
		} else {
			errors = [data.error || 'Failed to join room'];
		}
	}

	async function handleQuickMatch() {
		if (!name.trim()) {
			errors = ['Enter your name'];
			return;
		}
		errors = [];
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
			errors = ['Enter your name first'];
			return;
		}
		errors = [];
		const data = await joinRoom(roomCode, name.trim());
		if (data.room) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/room/${roomCode}`);
		} else {
			errors = [data.error || 'Failed to join room'];
		}
	}
</script>

<div
	class="flex min-h-screen flex-col items-center bg-gradient-to-br from-base-200 to-base-300 p-4 sm:justify-center sm:p-8"
>
	<div class="card w-full max-w-lg bg-base-100 shadow-xl">
		<div class="card-body items-center gap-4 text-center">
			<h1 class="text-5xl font-bold text-primary">Remi</h1>
			<p class="text-base-content/70">Multiplayer card game</p>

			<div class="tabs-box mt-2 tabs">
				<button
					class="tab-lg tab {tab === 'create' ? 'tab-active' : ''}"
					onclick={() => {
						tab = 'create';
						errors = [];
					}}>Create</button
				>
				<button
					class="tab-lg tab {tab === 'join' ? 'tab-active' : ''}"
					onclick={() => {
						tab = 'join';
						errors = [];
					}}>Join</button
				>
				<button
					class="tab-lg tab {tab === 'browse' ? 'tab-active' : ''}"
					onclick={() => {
						tab = 'browse';
						errors = [];
					}}>Browse</button
				>
			</div>

			<div class="w-full">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Your name</span></div>
					<input
						type="text"
						placeholder="Player"
						class="input-bordered input w-full"
						bind:value={name}
					/>
				</label>
			</div>

			<div class="w-full">
				{#if $matchStatus === 'queued'}
					<div class="flex flex-col items-center gap-2">
						<button class="btn w-full animate-pulse btn-lg btn-warning" disabled>
							Searching... ({$matchQueueSize} in queue)
						</button>
						<button class="btn btn-ghost btn-xs" onclick={handleCancelQueue}>Cancel</button>
					</div>
				{:else}
					<button
						class="btn w-full btn-lg btn-accent"
						onclick={handleQuickMatch}
						disabled={!name.trim()}
					>
						Quick Match (1v1)
					</button>
				{/if}
			</div>

			{#if tab === 'create'}
				<div class="w-full">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Max players</span></div>
						<div class="join w-full">
							<button
								class="btn join-item btn-sm {maxPlayers === 2
									? 'btn-primary'
									: 'btn-outline'} flex-1"
								onclick={() => (maxPlayers = 2)}>2</button
							>
							<button
								class="btn join-item btn-sm {maxPlayers === 3
									? 'btn-primary'
									: 'btn-outline'} flex-1"
								onclick={() => (maxPlayers = 3)}>3</button
							>
							<button
								class="btn join-item btn-sm {maxPlayers === 4
									? 'btn-primary'
									: 'btn-outline'} flex-1"
								onclick={() => (maxPlayers = 4)}>4</button
							>
						</div>
					</label>
				</div>
				<button class="btn w-full btn-lg btn-primary" onclick={handleCreate}> Create Room </button>
			{:else if tab === 'join'}
				<div class="w-full">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Room code</span></div>
						<input
							type="text"
							placeholder="ABC123"
							class="input-bordered input w-full uppercase"
							bind:value={code}
							maxlength={6}
						/>
					</label>
				</div>
				<button class="btn w-full btn-lg btn-primary" onclick={handleJoin}> Join Room </button>
			{:else if tab === 'browse'}
				<div class="w-full">
					<div class="mb-2 flex items-center justify-between">
						<span class="label-text">Open rooms</span>
						<button class="btn btn-ghost btn-xs" onclick={fetchRooms} disabled={loading}>
							{loading ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
					{#if rooms.length === 0}
						<p class="py-6 text-sm text-base-content/50">No open rooms</p>
					{:else}
						<ul class="list rounded-box bg-base-200">
							{#each rooms as r (r.code)}
								<li class="list-row flex items-center justify-between">
									<div class="flex flex-col items-start gap-1">
										<div class="flex items-center gap-2">
											<span class="badge font-mono badge-lg badge-info">{r.code}</span>
											<span class="text-xs text-base-content/50"
												>{r.players.length}/{r.maxPlayers}</span
											>
										</div>
										<div class="flex flex-wrap gap-1">
											{#each r.players as p (p.id)}
												<span class="badge badge-sm badge-neutral">{p.name}</span>
											{/each}
										</div>
									</div>
									<button class="btn btn-sm btn-primary" onclick={() => handleJoinRoom(r.code)}>
										Join
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if errors.length > 0}
				{#each errors as err}
					<p class="text-sm text-error">{err}</p>
				{/each}
			{/if}
		</div>
	</div>
</div>
