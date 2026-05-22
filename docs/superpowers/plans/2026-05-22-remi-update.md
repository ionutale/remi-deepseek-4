# Remi Game — Current State + Roadmap

> **Updated 2026-05-22.** Supersedes `2026-05-19-remi.md`.

**Game:** Romanian Remi — Board Remi (Close Mode). Players build melds on their own board and close when all cards are in valid melds (≥1 set + ≥1 sequence). No intermediate table-melding during play.

**Scope:** Single-player vs AI + Multiplayer rooms + Matchmaking (1v1).

**Architecture:** Pure TypeScript engine + SvelteKit UI + REST API. In-memory state transitioning to MongoDB persistence.

---

# Part A — What Exists (Current Reality)

All items below are **already built and working**. Checkbox = verified in codebase.

## A1. Engine — Pure Game Logic

- [x] **Types** (`src/lib/engine/types.ts`): Card, Suit, Value (incl. 0 for jokers), JokerType, Meld, PlayerState, GameState, GamePhase, GameConfig. Complete.
- [x] **Deck** (`src/lib/engine/deck.ts`): `createDeck()` — 108 cards (2×52 + 4 jokers), `shuffle()` — Fisher-Yates, `deal()` — 14 cards/player. Tested.
- [x] **Meld validation** (`src/lib/engine/meld.ts`): `isValidSet`, `isValidSequence`, `isValidMeld`, `findBestMelds`, `suggestMelds`, `canFormValidClose`. Combinatorial backtracking with memoized combinations. Tested.
- [x] **Game flow** (`src/lib/engine/game.ts`): `initGame`, `drawFromPile`, `drawFromDiscard`, `discardCard`, `closeGame`, `nextTurn`. Pure functions returning new state. Tested.
- [x] **AI** (`src/lib/engine/ai.ts`): `aiTurn` — preferred discard draw, worst-card discard, close-trigger. Correct for Board Remi (no mid-game meld-laying). Tested.
- [x] **Utils** (`src/lib/engine/utils.ts`): `combinations` with memoization (50k cache), `clearCombinationsCache`. Tested.
- [x] **Display** (`src/lib/engine/display.ts`): `cardLabel`, `displayValue`, `isRed`. Shared UI formatting.

## A2. Svelte Stores

- [x] **gameStore** (`src/lib/stores/gameStore.ts`): Single-player game state. Actions: `startGame`, `playerDrawPile`, `playerDrawDiscard`, `playerDiscard`, `playerClose`, `resetGame`. Auto-runs AI turns after human actions. Try-catch wrappers on all actions.
- [x] **roomStore** (`src/lib/stores/roomStore.ts`): Multiplayer room polling + actions. Polls `GET /api/rooms/[code]` every 2s. Actions: `joinRoom`, `createRoom`, `startGame`, `restartGame`, `closeRoomAction`, `sendGameState`, `reset`.
- [x] **matchStore** (`src/lib/stores/matchStore.ts`): Matchmaking queue. `quickJoin`, `leaveQueue`, `recordResult`. Server-generated playerId + sessionToken.

## A3. Server

- [x] **roomService** (`src/lib/server/roomService.ts`): In-memory `Map<string, Room>`. Create/Join/Start/Restart/Update/Close/Ping. 30s stale timeout, 15s cleanup. Owner auth for start/restart/close. 2-player MMR on finish.
- [x] **MMR** (`src/lib/server/mmr.ts`): In-memory Elo (default 1000, K=32). Dynamic range expansion (100→500). Wait-time prioritization. 1h abandoned match cleanup.
- [x] **Auth** (`src/lib/server/auth.ts`): In-memory sessions (nanoid 20, 4h TTL). `createSession`, `verifySession`, `destroySession`, `sanitizeName` (strip HTML, max 30 chars).
- [x] **DB** (`src/lib/server/db.ts`): MongoDB singleton. `connectDB`, `getDB`, `disconnectDB`. Ping-based health check, auto-reconnect.
- [x] **Hooks** (`src/hooks.server.ts`): Cleanup timers (rooms + MMR), rate limiter (120 req/min/IP), origin CSRF check.

## A4. API Routes

- [x] `GET/POST /api/rooms` — List/Create rooms
- [x] `GET/PATCH/PUT /api/rooms/[code]` — Get/Join/Start/Restart/Close/Update game state
- [x] `GET/POST /api/matchmaking` — Poll queue/Join/Leave
- [x] `POST /api/matchmaking/result` — Record MMR result

## A5. UI Components

- [x] **Card.svelte** — Face/back, value+suit, colored jokers, drag-and-drop, click select
- [x] **PlayerHand.svelte** — Horizontal card layout, drop zone for meld returns
- [x] **OpponentArea.svelte** — Face-down cards with gradients, active indicator, card count
- [x] **DrawPile.svelte** — Clickable back with count, empty state
- [x] **DiscardPile.svelte** — Top card + count badge, empty state
- [x] **MeldArea.svelte** — 2×4 slot grid, drag-and-drop between slots, per-card remove, auto-organize, validity badges
- [x] **GameStart.svelte** — Player count selector (2/3/4), in-progress confirmation
- [x] **GameTable.svelte** — Full layout: opponents, piles, meld area, hand, action buttons
- [x] **GameOver.svelte** — Winner display, Play Again button

## A6. Pages

- [x] `/` — Lobby: Create/Join/Browse rooms, Quick Match tabs, name input
- [x] `/game` — Single-player game (GameTable or redirect)
- [x] `/room/[code]` — Multiplayer room: lobby → playing → finished

## A7. Security

- [x] Session-based auth (server-generated playerId + sessionToken)
- [x] Rate limiting (120 req/min/IP)
- [x] CSRF origin check
- [x] Input sanitization (strip HTML, trim, max 30 chars)
- [x] Owner-only game actions
- [x] `.env` credentials excluded from git

## A8. Tests

- [x] `tests/engine/deck.test.ts` — Deck creation, shuffle, deal
- [x] `tests/engine/meld.test.ts` — Set/sequence/meld validation, close validation
- [x] `tests/engine/game.test.ts` — Init, draw, discard, turn, close, full flow
- [x] `tests/engine/ai.test.ts` — Draw decision, worst card, turn, close

---

# Part B — Gaps & Remaining Work

## P0 — Must Have

### P0-1: MongoDB Persistence for Rooms, MMR, and Sessions
**Why:** All state lost on restart. Players lose games, MMR resets, sessions invalidate.
**Strategy:** Full MongoDB replacement — every read/write hits the database. No in-memory cache.
**What:**
- `roomService.ts` — Replace in-memory Map with MongoDB collection operations
- `mmr.ts` — Replace in-memory Map with MongoDB collection
- `auth.ts` — Replace in-memory Map with MongoDB collection
- `db.ts` — Already exists, `getDB()` is never called. Wire it up.
- Add TTL indexes for session expiry, stale rooms, abandoned matches
- Require `mongod` running locally or via `MONGODB_URL` env var

### P0-2: E2E Tests
**Why:** No regression safety for UI or multiplayer flows.
**What:**
- Playwright E2E for: create room → join → start game → play → close
- Playwright E2E for: matchmaking → match → play → record result
- Playwright E2E for: single-player game → draw → discard → close
- Playwright E2E for: rate limiting, CSRF rejection, auth rejection

## P1 — Should Have

### P1-1: MMR Display in UI
**Why:** API returns MMR values but UI never shows them (finding #36).
**What:**
- Show MMR rating in matchmaking lobby
- Show MMR change after game finishes
- Component: `MMRBadge.svelte` or integrate into existing UI

### P1-2: Component Tests
**Why:** Vitest browser project configured but disabled. No component-level testing.
**What:**
- Enable vitest browser project for `src/lib/components/*.svelte`
- Component tests for Card, DrawPile, DiscardPile, GameOver, GameStart
- Skip heavy integration test for GameTable (covered by E2E)

### P1-3: `closeRoom` Auth Hardening
**Why:** `closeRoom` only checks `room.ownerId !== playerId` — no validation that caller is in the room (finding #42).
**What:**
- Add `verifySession` check in closeRoom
- Verify before it is called in the PATCH handler

### P1-4: Multiplayer MMR for 3+ Player Games
**Why:** `updateGameState` only records MMR for 2-player games (finding #41). For 3+ player games, MMR is silently skipped.
**What:**
- Implement multi-player MMR calculation (e.g., each opponent is a separate Elo comparison)
- Or: document as intentional limitation if MMR is only for 1v1 matchmaking

## P2 — Nice to Have

### P2-1: AI Strategy Improvements
**Why:** Current AI is basic (finding #96-99). Only draws/discards/closes. Doesn't track opponent discards.
**What:**
- Track which cards opponents have discarded
- Avoid discarding cards that opponents are collecting
- Prefer drawing from discard when it denies opponents a meld card

### P2-2: Room List UI Polish
**Why:** Current lobby tab shows raw room data.
**What:**
- Show player names in room list
- Show game status (waiting/playing)
- Auto-refresh room list

### P2-3: Game Timer
**Why:** No time limit per turn. Players can stall indefinitely.
**What:**
- Configurable turn timer (default 60s)
- Auto-discard on timeout
- UI countdown display

---

# Part C — Updated Task Tracker

## Phase 1: Foundation (Complete ✓)

- [x] Task 1: Project scaffold (SvelteKit + Tailwind + DaisyUI + Vitest + Playwright)
- [x] Task 2: Engine types
- [x] Task 3: Deck — createDeck, shuffle, deal (TDD)
- [x] Task 4: Meld validation — set, sequence, joker, findAllMelds (TDD)
- [x] Task 5: Close validation — canFormValidClose (TDD)
- [x] Task 6: Game flow — initGame, draw, discard, close, nextTurn (TDD)
- [x] Task 7: AI — aiTurn, shouldDrawFromDiscard, findWorstCard (TDD)
- [x] Task 8: Svelte gameStore

## Phase 2: UI (Complete ✓)

- [x] Task 9: Components — Card, PlayerHand, OpponentArea, DrawPile, DiscardPile, MeldArea, GameStart, GameTable, GameOver
- [x] Task 10: Routes — `/`, `/game`, `/room/[code]`, API endpoints

## Phase 3: Multiplayer (Complete ✓)

- [x] Task 11: roomService — CRUD rooms, players, polling
- [x] Task 12: matchmaking — queue, tryMatch, MMR Elo
- [x] Task 13: Auth — sessions, rate limiting, CSRF, sanitization
- [x] Task 14: roomStore, matchStore — polling, actions

## Phase 4: Hardening

- [ ] **Task 15: MongoDB Persistence**
  - [ ] Wire `getDB()` into roomService (rooms collection)
  - [ ] Wire `getDB()` into mmr.ts (ratings + matches collections)
  - [ ] Wire `getDB()` into auth.ts (sessions collection)
  - [ ] Add TTL indexes for auto-cleanup
  - [ ] Graceful in-memory fallback on DB failure
  - [ ] Verify: restart keeps state
- [ ] **Task 16: E2E Tests**
  - [ ] Single-player: draw → discard → close flow
  - [ ] Multiplayer: create room → join → play → close
  - [ ] Matchmaking: queue → match → result → MMR
  - [ ] Security: rate limit, CSRF, auth rejection
- [ ] **Task 17: Component Tests**
  - [ ] Enable vitest browser project
  - [ ] Tests for Card, DrawPile, DiscardPile, GameOver, GameStart

## Phase 5: Polish

- [ ] **Task 18: MMR Display in UI**
  - [ ] Show MMR in matchmaking lobby
  - [ ] Show MMR change after game
- [ ] **Task 19: `closeRoom` auth hardening**
  - [ ] Add `verifySession` check in closeRoom
- [ ] **Task 20: Multiplayer MMR for 3+ player games**
  - [ ] Research multi-player Elo formula
  - [ ] Implement or document limitation

## Phase 6: Enhancements

- [ ] **Task 21: AI improvements**
  - [ ] Opponent discard tracking
  - [ ] Strategic discard avoidance
- [ ] **Task 22: Room list UI polish**
  - [ ] Player names, game status, auto-refresh
- [ ] **Task 23: Turn timer**
  - [ ] Configurable timer, auto-discard, countdown UI

---

## Verifications

- [ ] `pnpm check` — type checking passes
- [ ] `pnpm lint` — linting passes
- [ ] `pnpm test:unit -- --run` — all unit tests pass
- [ ] `pnpm test:e2e` — all E2E tests pass
- [ ] `pnpm build` — production build succeeds
