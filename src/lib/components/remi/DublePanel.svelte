<script lang="ts">
	import type { Piece } from '$lib/engine/remi/types';
	import PieceTile from './Piece.svelte';

	let {
		pieces,
		myIndex,
		playerNames,
		offers,
		onoffer,
		onwithdraw,
		onstrica,
		canStrica
	}: {
		pieces: Piece[];
		myIndex: number;
		playerNames: string[];
		offers: (Piece | null)[];
		onoffer: (pieceId: string) => void;
		onwithdraw: () => void;
		onstrica: () => void;
		canStrica: boolean;
	} = $props();

	type CatKey = 'mica' | 'mare' | 'cheie';

	const CATS: { key: CatKey; label: string; range: string }[] = [
		{ key: 'mica', label: 'Dublă mică', range: '2–9' },
		{ key: 'mare', label: 'Dublă mare', range: '10–13' },
		{ key: 'cheie', label: 'Dublă cheie', range: '1' }
	];

	const CAT_LABEL: Record<CatKey, string> = {
		mica: 'Dublă mică',
		mare: 'Dublă mare',
		cheie: 'Dublă cheie'
	};

	function categoryOf(value: number): CatKey {
		if (value === 1) return 'cheie';
		if (value >= 10) return 'mare';
		return 'mica';
	}

	type Dubla = { cat: CatKey; a: Piece; b: Piece; value: number };

	let myOffer = $derived(offers[myIndex] ?? null);

	/** Every identical pair on the player's rack, grouped by category. */
	let duble = $derived.by((): Dubla[] => {
		const groups: Record<string, Piece[]> = {};
		for (const piece of pieces) {
			if (piece.isJoker) continue;
			const key = `${piece.color}-${piece.value}`;
			const bucket = groups[key];
			if (bucket) bucket.push(piece);
			else groups[key] = [piece];
		}
		const found: Dubla[] = [];
		for (const key of Object.keys(groups)) {
			const bucket = groups[key] as Piece[];
			if (bucket.length < 2) continue;
			const a = bucket[0] as Piece;
			const b = bucket[1] as Piece;
			found.push({ cat: categoryOf(a.value), a, b, value: a.value });
		}
		return found.sort((x, y) => x.value - y.value || x.a.color.localeCompare(y.a.color));
	});

	let offeredIds = $derived(myOffer ? new Set([myOffer.id]) : new Set<string>());

	function isOffered(d: Dubla): boolean {
		return offeredIds.has(d.a.id) || offeredIds.has(d.b.id);
	}

	/** Seats with the category of their offer — values are never revealed. */
	let seats = $derived(
		playerNames.map((name, index) => ({
			name,
			index,
			isMe: index === myIndex,
			offer: offers[index] ?? null
		}))
	);

	let anyOffer = $derived(seats.some((seat) => seat.offer !== null));
</script>

<section class="glass-panel min-w-0 rounded-2xl p-4" aria-label="Schimbul de duble">
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-sm font-bold tracking-wide text-gold-200 uppercase">Duble</h3>
		<span class="rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-bold text-cream-50">
			{duble.length} duble
		</span>
	</div>

	<p
		class="mb-3 rounded-xl bg-black/30 px-3 py-2 text-xs leading-relaxed text-cream-100/80"
		role="note"
	>
		Pui o dublă la schimb și primești, la întâmplare, o altă dublă din aceeași categorie.
		<strong class="font-bold text-gold-200">Schimbul este orb:</strong> valorile rămân ascunse până la
		schimb — mici cu mici, mari cu mari, chei cu chei.
	</p>

	<div class="grid gap-3 sm:grid-cols-3">
		{#each CATS as cat (cat.key)}
			{@const catDuble = duble.filter((d) => d.cat === cat.key)}
			<div class="rounded-xl bg-black/30 p-2.5">
				<div class="mb-1.5">
					<span class="block text-[11px] font-bold tracking-wider text-gold-300 uppercase">
						{cat.label}
					</span>
					<span class="block text-[10px] text-cream-100/60">piese {cat.range}</span>
				</div>

				{#if catDuble.length === 0}
					<p class="py-2 text-xs text-cream-100/50 italic">Nicio dublă.</p>
				{:else}
					<ul class="space-y-2">
						{#each catDuble as d (d.a.id)}
							<li class="rounded-lg bg-black/40 px-2 py-2">
								<div class="flex items-center justify-center gap-1.5">
									<PieceTile piece={d.a} size="sm" />
									<PieceTile piece={d.b} size="sm" selected={isOffered(d)} />
								</div>
								<div class="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
									{#if isOffered(d)}
										<span
											class="rounded bg-gold-400/25 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-gold-200 uppercase"
										>
											ofertă
										</span>
										<button
											type="button"
											class="btn border-gold-400/50 font-bold text-gold-200 btn-ghost btn-xs hover:bg-gold-400/15"
											onclick={onwithdraw}
										>
											Retrage
										</button>
									{:else}
										<button
											type="button"
											class="btn border-gold-400/50 font-bold text-gold-200 btn-outline btn-xs hover:bg-gold-400/15 disabled:opacity-40"
											onclick={() => onoffer(d.a.id)}
											disabled={myOffer !== null}
										>
											Oferă la schimb
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>

	{#if myOffer}
		<p class="mt-2 text-[11px] text-gold-200/90" role="status">
			Ai deja o dublă oferită — retrage-o pentru a pune alta în schimb.
		</p>
	{/if}

	<div class="mt-3">
		<h4 class="mb-1.5 text-[11px] font-bold tracking-wider text-cream-100/70 uppercase">
			Scaune și oferte
		</h4>
		<ul class="flex flex-wrap gap-1.5">
			{#each seats as seat (seat.index)}
				<li
					class="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs {seat.isMe
						? 'ring-1 ring-gold-400/60'
						: ''}"
				>
					<span class="font-bold text-cream-50">
						{seat.name}{seat.isMe ? ' (tu)' : ''}
					</span>
					{#if seat.offer}
						<span class="text-cream-100/60">· {CAT_LABEL[categoryOf(seat.offer.value)]}</span>
						<span
							class="rounded bg-gold-400/25 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-gold-200 uppercase"
						>
							ofertă
						</span>
					{:else}
						<span class="text-cream-100/45">· fără ofertă</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if anyOffer}
			<p class="mt-1.5 text-[11px] text-cream-100/60">
				Se vede doar categoria ofertelor — valorile rămân ascunse până la schimb.
			</p>
		{/if}
	</div>

	{#if canStrica}
		<div
			class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2"
		>
			<p class="text-xs leading-relaxed text-rose-100">
				Ai cel puțin 3 duble: poți <span class="font-bold">strica jocul</span> pentru o nouă împărțire.
			</p>
			<button
				type="button"
				class="btn border-rose-300/60 font-bold text-rose-100 btn-outline btn-sm hover:bg-rose-400/20"
				onclick={onstrica}
			>
				Strică jocul
			</button>
		</div>
	{/if}
</section>
