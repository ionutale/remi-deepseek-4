# Remi Revamp — Approved Design + Implementation Plan

**Repo:** `/Users/ionutale/developer-playground/remi-deepseek-4`
**Date:** 2026-10-03
**Status:** Design discussed and approved section-by-section via brainstorming (rules, architecture, UI, delivery). This document is the handoff for implementation.
**Stack:** SvelteKit (Svelte 5 runes), Tailwind CSS v4, daisyUI 5, pure-TS game engine, Vitest + Playwright, MongoDB-backed rooms.

> Implementation note: everything below was approved in conversation. The implementation agent should follow this plan; deviations should be raised with the user first. The repo's `AGENTS.md` issue tracker is `issues.md`.

---

## 1. Goals

1. **Game design:** make the meld board a real mechanic, add cross-round scoring up to 500, replace the "close = any valid hand partition" rule with a validated board declaration.
2. **Game logic fixes:** multiplayer turn-timeout deadlock, stale/last-write-wins race in state PUTs, unenforced turn ownership, free-for-all joker rules, unreachable single-player mode, AI that can't really close.
3. **UI revamp:** modern card-table look, proper playing cards, responsive/mobile (tap-to-place), animated interactions, score sheets, real solo entry point.

**Non-goals (this pass):** server-authoritative rule execution, sound, AI difficulty levels, tournaments, spectator mode, i18n.

---

## 2. Current-state findings (verified in code)

| # | Finding | Where |
|---|---------|-------|
| 1 | Meld board is decorative: `closeGame` ignores staged melds and re-derives any partition of the hand. | `src/lib/engine/game.ts`, `src/lib/components/GameTable.svelte` |
| 2 | No scoring, no rounds: first close ends the game. | `src/lib/engine/types.ts` (`winner` only) |
| 3 | Turn-timeout deadlock: after `TURN_TIMEOUT_MS` the PUT handler rejects all updates; there is no auto-play, so games permanently stall. | `src/routes/api/rooms/[code]/+server.ts:65-79` |
| 4 | No turn-ownership or revision check: any room member can PUT arbitrary full game state; concurrent clients last-write-win. | same PUT handler |
| 5 | Joker rules degenerate: a single colored joker is a valid 1-card meld; unlimited jokers per meld. | `src/lib/engine/meld.ts` (`isValidMeld`, `findAllMelds`, `suggestMelds`) |
| 6 | Single-player vs AI is unreachable: `gameStore.startGame()` is never called (GameStart component was removed). | `src/lib/stores/gameStore.ts`, no callers |
| 7 | Meld staging logic duplicated (~150 lines) between the solo table and the room page. | `GameTable.svelte`, `src/routes/room/[code]/+page.svelte` |
| 8 | Drag-and-drop only: melds cannot be built on touch devices. | `Card.svelte`, `MeldArea.svelte` |
| 9 | AI never stages melds, closes only when `canFormValidClose` happens to pass, weak discard heuristic, heavy combinatorial scans. | `src/lib/engine/ai.ts` |
| 10 | MMR is recorded at first `winner` (round end once rounds exist → wrong timing). | `roomService.updateGameState` |
| 11 | Status bar reads like debug output; redundant Draw buttons duplicate clickable piles; oversized empty meld board; dimmed washed-out hand; no animations (open issue in `issues.md`). | UI screenshots + components |
| 12 | README advertises "AI opponents — Play solo", but no UI path exists. | `README.md` |

---

## 3. Approved rules (design of record)

### 3.1 Match & rounds
- Match target: **500 points** (`TARGET_SCORE`, single tuning constant).
- Rounds repeat until, after a round is scored, a player's total is **≥ 500** → that player wins the match.
- Round 1 starts with player index 0. The **previous round's winner** starts the next round.
- Void round (see 3.4): same starter, fresh deal, no score.

### 3.2 Turn
Draw exactly one card (stock, or top of discard), then either:
- discard one card to end the turn, or
- **close** (allowed only in the discard phase, i.e. after drawing).

### 3.3 Closing — enforced board declaration
The board is **private until close**. To close:
- You hold 15 cards (just drew).
- The staged melds on your board contain **exactly 14 cards** from your hand (no duplicates, no omissions), each meld valid, and the 15th card is the one you discard as your closing move.
- Meld validity: 3+ cards; **≥ 2 natural cards**; **≤ 1 joker**; a meld is a set (same value, distinct suits) or a sequence (same suit, consecutive values, jokers filling gaps).
- Among staged melds: **≥ 1 set AND ≥ 1 sequence**.
- A colored joker is a normal wildcard; the standalone 1-card "wild meld" is removed.

The close is validated by the engine, on the client and re-validated on the server for multiplayer (`validateCloseDeclaration`).

### 3.4 Scoring & blocked rounds
- Closer collects the total value of every opponent's remaining hand: numbers = face value, **A/J/Q/K = 10**, any joker = **25**. No bonus.
- On close: the closer's melds are revealed (stored in `player.melds`), the 15th card goes to the discard pile.
- After scoring: `phase = 'round-over'` with a score sheet; `phase = 'finished'` if `scores[closer] >= 500`.
- **Blocked round:** stock empty and discard has ≤ 1 card → round is void: no score, same starter, fresh deal (round number unchanged).

### 3.5 Timing & ratings
- Multiplayer turn limit: **2 minutes**; when exceeded the server **auto-plays** the turn (draw from stock, then safest discard; if a legal close exists, close instead).
- Solo: no timer.
- MMR is recorded **once at match end** (`matchWinner`), 1v1 matchmaking rooms only. 3–4 player rooms remain casual.

---

## 4. Architecture design

### 4.1 Engine (`src/lib/engine/`)

**`types.ts`**
```ts
export type GamePhase = 'draw' | 'discard' | 'round-over' | 'finished';

export interface CloseDeclaration { melds: Meld[]; discardId: string; }

export interface GameState {
  schemaVersion: 2;                 // guard against stale persisted rooms
  players: PlayerState[];           // player.melds now meaningful after close (revealed)
  currentPlayerIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  phase: GamePhase;
  round: number;                    // 1-based
  roundStarter: number;             // for void-round redeal
  scores: number[];                 // per player, accumulated across rounds
  roundWinner: number | null;       // replaced old `winner`
  matchWinner: number | null;
  targetScore: number;              // default TARGET_SCORE
  turnStartedAt: number;
  revision: number;                 // monotonic; +1 on every accepted transition
}
```
`GameConfig` unchanged (`playerCount`, `humanPlayerIndex`); optional `maxScore` added.

**`scoring.ts` (new)**
- `cardPoints(card): number` — numbers face value; A/J/Q/K = 10; joker = 25.
- `handPoints(cards): number`.
- `TARGET_SCORE = 500`.

**`meld.ts`**
- New `validateMeld(cards): { valid: boolean; reason?: string; type?: MeldType }` — enforces 3+ cards, ≤1 joker, ≥2 naturals, set/sequence shape. `isValidMeld` becomes a boolean wrapper.
- `findAllMelds` / `suggestMelds`: remove the standalone colored-joker meld branch.
- New `validateCloseDeclaration(hand, declaration): { valid: boolean; reason?: string }` — hand length 15; `discardId ∈ hand`; melded card ids equal hand ids minus discard, exactly (no dupes/omissions); each meld valid; ≥1 set; ≥1 sequence.
- `canFormValidClose(hand)` stays as the hint/AI solver (uses `findBestMelds`).
- `findBestMelds` stays (powers "Organize" and the AI).

**`game.ts`**
- `initMatch(config): GameState` — deals round 1, scores zeros, `roundStarter = 0`, `revision = 1`.
- `dealRound(state, starterIndex): GameState` — fresh deal, keeps scores/round; used by `nextRound` and `voidRound`.
- `drawFromPile`, `drawFromDiscard`, `discardCard` — increment `revision`.
- `closeGame(state, declaration): GameState` — validates phase + declaration, moves the discarded card to the pile, reveals `player.melds`, adds collected points to `scores[current]`, sets `roundWinner`, sets `matchWinner` if `>= targetScore`, phase `'round-over' | 'finished'`.
- `nextRound(state): GameState` — from `'round-over'`; starter = `roundWinner`; clears `roundWinner`; `round + 1`.
- `isRoundBlocked(state): boolean` — `drawPile.length === 0 && discardPile.length <= 1`.
- `voidRound(state): GameState` — `dealRound` with same `roundStarter`, scores unchanged.
- `autoPlayTurn(state): GameState` — server timeout path: draw from stock (or discard if AI logic says so), then discard safest / close if possible (reuses `ai.ts` helpers).

**`ai.ts`**
- Close via real partition: for each candidate spare card, `findBestMelds(hand minus spare, true, true)`; close with the cheapest spare using that partition as the declaration.
- Discard selection: keep the card that maximizes **partition coverage** of the rest (`findBestMelds` size), tie-break with the existing discard-pile danger heuristic (`countDiscardOverlaps`).
- Performance pass: prune combinations by size (3..~8), use memoized `combinations`; target < 50 ms per AI turn typical.

### 4.2 Shared UI controller (`src/lib/stores/meldBoard.svelte.ts`, new)
Runes-based `MeldBoard` class owning: `slots: Card[][]`, `place(cardId, slotIndex)`, `remove(cardId)`, `moveCard(cardId, toSlotIndex)`, `swapSlots(a, b)`, `organize()` (jumps the best partition in, staggered in the UI), `clear()`, `sync(hand)` (drops cards no longer held), derived `assignedIds`, `remainingHand`, `slotStatus` (per-slot validation + reason), `isCloseReady` (14 staged, valid, one hand card left, ≥1 set + ≥1 sequence), `declaration(): CloseDeclaration | null`.
Used by both the solo table and the room page. Pure helpers (validation/reasons) live in `meld.ts` so they remain unit-testable without runes.

### 4.3 Stores
- `gameStore` (solo): `startGame(config)` → `initMatch`; `draw/discard` as today; `close(declaration)`; `nextRound()`; AI turns after human actions; exposes phase/scores; `winner` derived removed.
- `roomStore`: `sendGameState(state, action, declaration?)` includes `baseRevision`; on `409` re-fetch the room and surface a "state refreshed" notice; `nextRound` action; MMR trigger moves to `phase === 'finished'`.

### 4.4 Server (`roomService`, API)
**PUT `/api/rooms/[code]`** body: `{ playerId, sessionToken, baseRevision, action: 'move' | 'close' | 'next-round', gameState, declaration? }`.
Acceptance rules (ordered):
1. Session valid + player in room.
2. `baseRevision === room.gameState.revision`, else `409` with current state.
3. `action: 'move'` → sender must be the current player (`players[currentPlayerIndex].id`).
4. `action: 'close'` → sender is current player; re-validate `declaration` server-side against the **stored pre-close hand**; reject `400` with the engine's reason otherwise.
5. `action: 'next-round'` → only when stored phase is `'round-over'`; allowed for any room member (non-destructive).
6. Accepted state is stored with `revision = baseRevision + 1`.
7. `schemaVersion !== 2` stored states are discarded (room reset to waiting) to survive deploys.

**Liveness (`roomService` cleanup tick, existing timer):**
- For each `playing` room: if `now - turnStartedAt > TURN_TIMEOUT_MS` → `autoPlayTurn`; if `isRoundBlocked` → `voidRound`. Persist and let clients pick it up on the next poll (≤ 2 s + tick granularity).
- Delete the old "reject everything after timeout" check.

**MMR:** in `updateGameState`, record result only when `phase === 'finished' && matchWinner !== null && players.length === 2`, winner = `matchWinner`, loser = the other; keep the `recordedRooms` idempotency guard.

### 4.5 Files overview
- Modify: `engine/{types,deck,meld,game,ai,utils,display}.ts`, `stores/{gameStore,roomStore,matchStore}.ts`, `server/roomService.ts`, `routes/api/rooms/[code]/+server.ts`, all game components, `routes/{+page.svelte,game/+page.svelte,room/[code]/+page.svelte}`, `layout.css`.
- Create: `engine/scoring.ts`, `stores/meldBoard.svelte.ts`, components `GameTableView.svelte`, `ScoreSheet.svelte`, `MatchOver.svelte` (replacing `GameOver.svelte`), `Seat.svelte`.
- Tests: `tests/engine/scoring.test.ts`, `tests/engine/close.test.ts`, updates to `game/meld/ai/deck` tests, E2E updates.

---

## 5. UI design (modern card-table)

### 5.1 Visual language
- Deep emerald felt + radial spotlight + vignette; walnut wood meld rack; gold/cream accents; glassy HUD panels.
- Tokens (color, radii, shadows, motion) in `layout.css` under Tailwind v4 `@theme`. System font stack; **no new runtime dependencies**.

### 5.2 Cards
- Proper faces: white stock, mirrored corner rank + suit, large center suit; A/J/Q/K decorative treatment in CSS.
- Card backs: CSS lattice pattern, gold border.
- Jokers: colored = warm red/gold, black = dark; clearly labeled.
- States: hover lift (desktop), selected lift + ring, invalid shake, dimmed only when truly unplayable.

### 5.3 Table layout (shared `GameTableView.svelte`)
- Center: stock + discard as clickable piles with counts (no duplicate action buttons).
- Opponents: seats with card-back fans, hand counts, glowing active ring.
- Meld rack between table and hand; **grows on demand** — compact "Add meld" state when empty; per-meld chip with Set/Sequence + ✓/✗ and reason ("max 1 joker", "needs 2+ naturals").
- Hand: bottom fan, horizontally scrollable on narrow screens.
- HUD: glass top bar with room code, pile count, turn indicator + countdown ring (multiplayer), leave. No debug status bar.

### 5.4 Interactions
- Tap card → select; tap meld slot → place; tap staged card → return; tap meld group → pull back.
- Drag-and-drop remains as a desktop enhancement.
- "Organize" fills the best partition with a staggered animation.
- Close button appears only when `isCloseReady` and shows the card that will be discarded.
- Discard = select + button, or drag onto the discard pile.
- Keyboard: Enter/Space select-and-place, focus rings, `aria-live` turn announcements.

### 5.5 Motion
Deal / draw / discard / meld-snap via CSS transitions + Svelte `animate:flip`; invalid shake; score count-up; modest close celebration. All gated by `prefers-reduced-motion`.

### 5.6 Screens
1. **Home `/`** — hero table scene; two clear paths: **Play vs AI** (player count 2–4 → `/game`) and multiplayer panel (Create/Join/Browse/Quick Match) with styled room cards.
2. **Solo `/game`** — start overlay when no game; then table; round-over score sheet; match-over screen.
3. **Room lobby `/room/[code]`** — seat diagram, prominent code + copy button, host start controls, waiting state.
4. **Round score sheet** (`ScoreSheet.svelte`) — collected points per player, running totals, Next Round.
5. **Match over** (`MatchOver.svelte`) — final standings, MMR delta for 1v1 quick match, Play Again / Home.

---

## 6. Error handling

| Case | Behavior |
|------|----------|
| Invalid close (client/server disagreement) | Inline error with engine reason; board untouched; turn continues. Server `400` includes reason. |
| Stale PUT (`409`) | Client re-fetches room state, re-renders, shows "State refreshed — please retry". No silent loss. |
| Turn timeout | Server auto-plays; clients show "auto-playing…" as the timer ring empties; state arrives via poll. |
| Polling failure | Keep last state; show reconnecting indicator (today: silent). |
| Blocked round | Void banner on score area; fresh deal, no score. |
| Draw from empty discard / out-of-turn action | Guarded in UI and rejected server-side (`400`). |
| Long names | Server sanitization stays (strip HTML, 30 chars). |
| Old persisted rooms (`schemaVersion !== 2`) | Room game state discarded; room resets to waiting. |
| Reduced motion / narrow screens | Verified in Phase 3–4. |

---

## 7. Testing plan

**Unit (Vitest)**
- `scoring.test.ts`: card values (number/A/J/Q/K/joker), hand totals, target crossing.
- `meld.test.ts` (update): joker limit >1 invalid; <2 naturals invalid; standalone colored joker invalid; sequence gap rules.
- `close.test.ts` (new): declaration valid; missing/duplicate card; wrong partition; missing set; missing sequence; 15th-card mismatch; joker overflow.
- `game.test.ts` (update): initMatch fields; revision increments; closeGame scoring + reveal + round/match phase; nextRound (winner starts, scores persist); isRoundBlocked/voidRound; autoPlayTurn legality.
- `ai.test.ts` (update): AI close produces a valid declaration; AI discards never leave an illegal state; perf sanity (<50 ms typical).
- Store/controller tests: `meldBoard` pure helpers; roomStore 409 path (mock fetch); gameStore round flow.
- Existing `deck`, `utils`, `display` tests stay green.

**E2E (Playwright)**
- Solo: Play vs AI → draw → discard → Organize → close → score sheet → Next Round.
- Multiplayer: create → join → start → draw/discard → close → score sheet.
- Invalid close rejected (crafted request) returns reason.
- Timeout auto-play with a shortened timeout (test override).
- Update `tests/e2e/screenshots.e2e.ts` and regenerate `static/screenshots/*` including new score sheet.

**Commands (pnpm only):** `pnpm check`, `pnpm lint`, `pnpm test:unit -- --run`, `pnpm test:e2e`, `pnpm build`.

---

## 8. Phased delivery

### Phase 1 — Engine (rules & scoring)
1.1 `types.ts`: phases, new fields, `CloseDeclaration`, `schemaVersion`.
1.2 `scoring.ts` + tests.
1.3 `meld.ts`: `validateMeld` + reasons; joker rules; remove standalone colored joker; `validateCloseDeclaration`; update tests.
1.4 `game.ts`: `initMatch`, `dealRound`, revision, `closeGame(declaration)`, `nextRound`, `isRoundBlocked`, `voidRound`, `autoPlayTurn`; update/add tests.
1.5 `ai.ts` partition-based rework + tests + perf pass.
**Exit:** `pnpm check` + `pnpm test:unit -- --run` green.

### Phase 2 — Stores & server
2.1 `meldBoard.svelte.ts` controller.
2.2 `gameStore` (close declaration, nextRound, round-over, remove `winner`).
2.3 `roomStore` (`baseRevision`, action types, 409 handling, next-round).
2.4 `roomService`: revision + turn ownership + close re-validation + MMR at match end + auto-play/void on the cleanup tick + schemaVersion guard.
2.5 PUT handler body/status changes.
**Exit:** unit tests green; manual two-browser room run-through works, including a forced-timeout game.

### Phase 3 — UI foundation
3.1 Theme tokens + felt/wood/glass surfaces in `layout.css`.
3.2 `Card.svelte` rewrite; `PlayerHand` fan + tap/drag selection.
3.3 `MeldArea.svelte` rewrite: controller-backed, growing rack, chips + reasons, tap place/return, organizer animation hooks.
3.4 `GameTableView.svelte` + `GameTable.svelte` (solo wrapper); room page consumes the same view.
3.5 Keyboard + touch + `prefers-reduced-motion` pass.
**Exit:** both solo and multiplayer tables usable with mouse and touch; `pnpm check` green.

### Phase 4 — Screens & motion
4.1 Home rewrite with Play vs AI (→ `/game`), styled multiplayer panel.
4.2 `/game` start overlay (player count 2–4).
4.3 `ScoreSheet.svelte` + `MatchOver.svelte` (with MMR), wire round/match flow.
4.4 Room lobby restyle: seats, copy-code, host controls.
4.5 Animations: deal/draw/discard/snap/score/close, reduced-motion fallbacks.
**Exit:** complete solo and multiplayer match to 500 played manually; visuals reviewed.

### Phase 5 — Verification & finish
5.1 E2E suite updates/additions.
5.2 README (rules, Play vs AI, screenshots), regenerate screenshots; mark `issues.md` "Animate melds movement" resolved.
5.3 Dead code cleanup (GameOver leftovers, unused exports, old status bar), `pnpm format`.
5.4 Full suite + `pnpm build`.
**Exit:** all five commands in §7 pass; screenshots committed.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Rules changes break persisted rooms | `schemaVersion: 2` guard resets incompatible games (§4.4.7). |
| AI partition search too slow | Pruned combinations + memo cache; perf sanity test; fallback to current heuristic if needed. |
| Multiplayer sync regressions | Revision + turn-ownership checks; 409 → refetch; two-browser manual test each phase. |
| Scope creep in UI | No new runtime deps; CSS/Svelte-native motion only; tokens keep styling consistent. |
| Close-rule edge cases | Dedicated `close.test.ts` matrix (§7). |

## 10. Deferred (explicitly out of scope)
- Server-authoritative rules execution (future hardening).
- Sound effects, AI difficulty levels, spectators, i18n, reconnect/resume mid-match.
- MMR for 3–4 player rooms (stays documented as casual).
