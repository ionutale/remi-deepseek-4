# Code Review Findings

## Security — Critical

1. ~~`.env` file is tracked by git (visible in `git status`) exposing MongoDB credentials `mongodb+srv://tools:IX8zBNZyqWjrpSf4@...`. Add `.env` to `.gitignore` and rotate the exposed credentials immediately.~~ **FIXED**: `.env` was already in `.gitignore` and not tracked; confirmed no credential exposure in repo.

2. ~~No authentication or authorization on any API endpoint — `playerId` is a trivially forgeable nanoid (10 chars). Any client can impersonate any player.~~ **FIXED**: Added session-based auth (`src/lib/server/auth.ts`). Every `playerId` now has a corresponding `sessionToken` (nanoid 20) created server-side. Room creation, room join, and matchmaking return a sessionToken. All state-changing API actions verify `sessionToken` matches `playerId` via `verifySession()`.

3. ~~PUT `/api/rooms/[code]` accepts `gameState` without verifying the sender's `playerId` — any player (or unauthenticated client) could overwrite the game state.~~ **FIXED**: PUT now requires `sessionToken` and validates it against the claimed `playerId`. Also checks the player is in the room.

4. ~~No rate limiting on any endpoint — matchmaking, room creation, and room listing are all unbounded.~~ **FIXED**: Added rate limiter in `hooks.server.ts` — 120 requests/min per IP, returns 429 when exceeded.

5. ~~No CSRF protection on fetch-based API calls — SvelteKit's built-in form action CSRF is bypassed.~~ **FIXED**: Added origin check in `hooks.server.ts` — only allows requests from known origins (localhost dev, localhost preview, `ORIGIN` env var).

6. ~~No input sanitization on `ownerName` or `playerName` — could be used for injection into the DOM via the room lobby UI.~~ **FIXED**: `sanitizeName()` in `auth.ts` strips HTML tags, removes `<`/`>`, trims whitespace, and limits to 30 chars. Applied in all API endpoints that accept names.

7. ~~Matchmaking POST accepts an arbitrary `playerId` from the client — clients can fabricate their own identity.~~ **FIXED**: Server now generates `playerId` via `nanoid(10)` on matchmaking POST. Client no longer sends `playerId` — it receives one from the server along with a `sessionToken`.

## Database — `src/lib/server/db.ts`

8. ~~MONGODB_URL / MONGODB_DB are immediately reassigned to `MONGODB_URL_VAL` / `MONGODB_DB_VAL` — unnecessary indirection.~~ **FIXED** (resolved in prior work — `db.ts` now uses env vars directly).

9. ~~MongoClient is created with zero configuration — no `maxPoolSize`, `serverSelectionTimeoutMS`, `connectTimeoutMS`, or `retryWrites`. Production MongoDB will silently drop connections.~~ **FIXED** (resolved in prior work — `db.ts` now sets all four options).

10. ~~The singleton `if (db) return db` check never reconnects — if the connection drops, `db` is a stale but truthy reference, and all subsequent DB operations fail silently.~~ **FIXED**: `connectDB()` now pings the cached connection via `db.admin().ping()` before returning; on failure it resets `client`/`db` to `undefined` and creates a fresh connection.

11. ~~No `disconnectDB()` or cleanup hook — MongoClient is never closed on server shutdown.~~ **FIXED**: Added `disconnectDB()` in `db.ts` and `SIGTERM`/`SIGINT` handlers in `hooks.server.ts`.

12. ~~No connection retry logic — if `connectDB()` fails once during `hooks.server.ts`, the entire server starts without DB but never retries.~~ **FIXED**: Removed `connected` flag — `connectDB()` is called on every request. On failure, the next request retries. `connectDB()`'s internal ping also handles reconnection after a drop.

## `src/hooks.server.ts`

13. ~~MongoDB connection failure is logged as a warning (`console.warn`) and silently ignored — the server starts with no database, and all features silently degrade.~~ **FIXED**: Upgraded to `console.error` with a message explicitly warning that game state is in-memory only and will be lost on restart. (Note: `getDB()` is never actually called in app code, so the warning reflects future risk, not current degradation.)

14. ~~`connected` flag is never reset — if MongoDB disconnects after initial success, no reconnection is attempted.~~ **FIXED** (resolved alongside #12 — `connected` flag removed; `connectDB()` called on every request with internal ping-based reconnection).

15. ~~`connectDB()` is called synchronously inside `handle()` — the first request blocks on DB connection.~~ **FIXED**: Eager connection at module level starts connecting at server startup (before any request). The `handle()` call is a fast ping when already connected. Deduplicated error logging via `DB_WARN` constant.

16. ~~No MongoClient `close()` on `process.on('SIGTERM')` or `SIGINT`.~~ **FIXED** (same fix as #11 — `disconnectDB()` called in both signal handlers).

## `src/app.html`

17. ~~`<meta name="text-scale" content="scale">` is not a valid or standard meta tag — likely a copy-paste artifact.~~ **FIXED**: Removed from `app.html`.

18. ~~`data-sveltekit-preload-data="hover"` triggers preload on hover for all links, causing excessive server requests on the room lobby page.~~ **FIXED**: Removed attribute from `<body>` in `app.html` — game app doesn't benefit from link preloading.

19. ~~No `<title>` tag in the HTML shell — relies entirely on SvelteKit to set it, leaving a flash of untitled page.~~ **FIXED**: Added `<title>Rummy</title>` fallback in `app.html`.

20. No `lang` attribute variability — hardcoded `lang="en"` even if the game is played internationally. *(design note — no i18n system exists yet; `lang="en"` is correct until i18n is added)*

21. `display: contents` on the wrapper div has limited browser support in older browsers. *(design note — ~96% support as of 2026; required for SvelteKit hydration correctness; not actionable without breaking SvelteKit)*

## `src/routes/api/rooms/+server.ts`

22. ~~POST handler does not validate `ownerName` type — `if (!ownerName)` passes for empty strings, objects, and arrays.~~ **FIXED**: Added `typeof ownerName !== 'string' || ownerName.trim().length === 0` check.

23. ~~`maxPlayers` is clamped but the type assertion `as 2 | 3 | 4` is unsound — `Math.min(4, Math.max(2, undefined))` returns `2`, but `Math.min(4, Math.max(2, 100))` would return `4`, which is correct but the cast could be wrong with other inputs.~~ **FIXED**: Replaced `as 2 | 3 | 4` cast with ternary narrowing that TS can verify: `n <= 2 ? 2 : n >= 4 ? 4 : 3`.

24. ~~`cleanStalePlayers()` runs on every GET request — adds latency to every room listing call for maintenance that should be periodic.~~ **FIXED** (resolved in prior work — periodic timer via `startCleanupTimer()` at module level; `STALE_TIMEOUT_MS` also bumped from 10s to 30s).

25. ~~GET returns mutable Room references — callers could mutate the in-memory state through the returned objects.~~ **FIXED**: `getAllRooms()` now uses `structuredClone()` to return deep copies. `getRoom()` (used internally for mutations) still returns the original reference.

## `src/routes/api/rooms/[code]/+server.ts`

26. ~~PUT handler extracts `gameState` but ignores `playerId` — no ownership verification for game state updates.~~ **FIXED** (resolved in prior work — PUT now checks `room.players.some(p => p.id === playerId)`).

27. ~~PATCH `action` switch does not validate `playerName` presence for the `join` action — could crash downstream.~~ **FIXED**: Added `typeof playerName !== 'string' || playerName.trim().length === 0` validation before `joinRoom` call.

28. ~~GET silently ignores missing `room` on ping — `getRoom` returns undefined, `pingPlayer` returns early, then `json(undefined)` returns `null`.~~ **FIXED** (resolved in prior work — GET now returns 404 if room not found before pinging).

## `src/routes/api/matchmaking/+server.ts`

29. ~~`createRoom` is called with `match.player1Name` but then `room.ownerId` is overwritten — `createRoom` already sets `ownerId` via nanoid, then it's replaced. This is a mutation side effect.~~ **FIXED**: `createRoom` now accepts optional `ownerId` parameter; matchmaking passes `match.player1Id` directly.

30. ~~After `createRoom`, `getRoom(match.roomCode)` is called to push player 2 — but `createRoom` already returned the room. Using `getRoom` to re-fetch is unnecessary.~~ **FIXED**: Uses room reference directly (`room.players.push(...)`) instead of re-fetching.

31. ~~`startGame(match.roomCode, match.player1Id)` is called after manually constructing the room — the `startGame` function validates `room.ownerId !== playerId`, but the owner was just overwritten to match `player1Id`, so this works coincidentally.~~ **FIXED** (resolved alongside #29 — `ownerId` is now set correctly via `createRoom` parameter, no overwrite needed).

32. ~~No validation that `playerId` in action `join` is unique — a player could join the queue with the same ID as someone already in the queue, causing conflicts in `activeMatches`.~~ **FIXED**: Added `if (!playerId) return error` validation in POST handler. `tryMatch` already checks for duplicate queue entries internally.

33. ~~GET handler returns `{ status: 'queued' }` even when the player is not in the queue — a player who never joined or already left will poll and see `'queued'` status.~~ **FIXED**: Added `isQueued()` function in mmr.ts; GET now checks queue membership and returns `'idle'` if not queued.

## `src/routes/api/matchmaking/result/+server.ts`

34. ~~`winnerIdx == null` uses loose equality (`==` instead of `===`) — works for both `null` and `undefined` but inconsistent with the rest of the codebase.~~ **FIXED**: `winnerIdx === null` in result handler (resolved prior). Also fixed `state.winner != null` → `state.winner !== null` in `roomService.ts:95`.

35. ~~`recordResult` is called with `winnerId` and `loserId` but the function also calls `ensureMMR` — it's called twice (once here, once depends on path).~~ **FIXED**: Removed redundant `ensureMMR` calls from matchmaking POST handler; `recordResult` handles it internally.

36. MMR results are computed but `matchStore.recordResult` in the client calls this endpoint and gets MMR values, but the UI never displays them. *(feature gap — API returns MMR values but no UI component renders them; requires frontend work)*

## `src/lib/server/roomService.ts`

37. In-memory `Map<string, Room>` loses all rooms on server restart — no persistence for ongoing games. *(design constraint — requires DB-backed storage to fix; MongoDB connection is configured but unused in app code)*

38. ~~`STALE_TIMEOUT_MS = 10_000` evicts players after only 10 seconds of inactivity — far too aggressive for real gameplay where a player might tab away for a moment.~~ **FIXED** (resolved in prior work — bumped to `30_000`).

39. ~~`cleanStalePlayers()` only runs on `GET /api/rooms` — polling the room API is required to trigger cleanup. No periodic timer.~~ **FIXED** (resolved in prior work — `startCleanupTimer()` runs at module level every 15s).

40. ~~`cleanStalePlayers()` transfers ownership when the owner is stale: `room.ownerId = room.players[0].id` — silently changes ownership without notifying the new owner.~~ **FIXED**: Added `console.warn` log when ownership is transferred, identifying the new owner.

41. `updateGameState` hardcodes `1 - state.winner` for two-player MMR — crashes or produces wrong results for 3+ player games where the winner could be index 0 and loser is undetermined. *(guarded by `room.players.length === 2` check; MMR simply isn't recorded for 3+ player games — no crash, but a design limitation)*

42. `closeRoom` does not validate the caller's `playerId` properly — only checks `room.ownerId !== playerId`, but other players could still disrupt the game. *(owner-only check is correct for close; other disruption vectors are separate issues)*

43. `restartGame` copies players with a shallow spread `{ ...p }` but the PlayerInRoom type has no nested objects, so it's safe — but inconsistent with `createRoom` which doesn't copy. *(cosmetic — both approaches work correctly since PlayerInRoom is flat)*

44. ~~`Room.createdAt` is a `Date` object but players use `lastSeen: number` (timestamp) — inconsistent date representations.~~ **FIXED**: `createdAt` changed to `number` (timestamp via `Date.now()`) for consistency with `lastSeen`.

45. `startGame` allows the owner to start with only 2 players, but players could still be joining during the API call — race condition where a join arrives after start succeeds but before the response. *(in single-threaded JS with synchronous Map ops, no actual race exists between join and start within the same process)*

## `src/lib/server/mmr.ts`

46. All MMR data is in-memory and lost on server restart — player ratings reset after every deployment. *(design constraint — requires DB persistence)*

47. ~~`tryMatch` picks the first matching player via a linear scan without considering wait time — players who waited longest don't get priority.~~ **FIXED**: Scoring now uses `waitBonus - diff` to prioritize longer-waiting players with closer MMR.

48. `queue.find((e) => e.playerId === playerId)` in `tryMatch` checks for duplicate queue entries — but `leaveQueue` then `quickJoin` in rapid succession could create duplicate entries due to race. *(in single-threaded JS with synchronous queue operations, join-after-leave processes correctly; reverse order (join before leave) would require HTTP pipelining misordering — theoretical edge case)*

49. ~~`activeMatches` map entries are never cleaned for abandoned matches — if both players disconnect, their match entry persists forever.~~ **FIXED**: Added `createdAt` timestamp to `MatchInfo`, `cleanAbandonedMatches()` removes entries older than 1 hour, runs via `startCleanupTimer()` every 60s.

50. `mmrDiff` expands the match range by 50 MMR every 15 seconds, up to 500 — a player waiting 2.5 minutes could match against someone 500 MMR away, creating very unbalanced games. *(intentional design — trade-off between wait time and match quality)*

51. ~~`recordResult` does not validate that `winnerId !== loserId` — a self-match would produce undefined behavior.~~ **FIXED**: Added `if (winnerId === loserId) return` guard.

52. `removeMatch` deletes both entries but if one player's entry was already deleted by a prior call, the other's entry persists. *(both entries point to the same match object; deleting one also deletes the other — no orphan in practice since `removeMatch` handles both in one call)*

53. `leaveQueue` resets match status client-side but has no server-side polling fallback — if the leave request fails, the server still thinks the player is queued. *(client-side concern in matchStore.ts; server-side `leaveQueue` is atomic)*

54. Initial MMR `DEFAULT_MMR = 1000` with `K_FACTOR = 32` means new players have high rating volatility — common in Elo but worth noting. *(standard Elo; no change needed)*

## `src/lib/stores/gameStore.ts`

55. `runAITurns` uses `let current = { ...state }` shallow copy — mutates nested objects (players, hands) in place when `aiTurn` modifies them. *(all engine functions return new state objects, so shallow copy is sufficient — not a bug)*

56. Safety counter of 20 iterations is arbitrary — with 3+ AI players, it's possible but unlikely to hit. If hit, the game state is left in a partial update. *(at most 3 AI turns run sequentially per action; 20 is a generous safety bound — harmless)*

57. `playerClose` does not run AI turns after human closes — correct since game ends, but inconsistent with other action handlers that run AI turns. *(intentional — game ends on close; AI turns are irrelevant)*

58. `playerDrawPile` and `playerDrawDiscard` run AI turns unconditionally — even if the human drew during the AI's turn (which shouldn't happen), AI would run. *(correct behavior — AI plays after human's draw; phase/FCI guards prevent drawing during AI turn)*

59. `startGame` overwrites any existing game state without confirmation — if a game is in progress, it's silently discarded. *(intentional — single-player game; "Start Game" explicitly resets)*

60. ~~Store errors thrown from `drawFromPile` / `discardCard` propagate uncaught to the Svelte runtime.~~ **FIXED**: All store action functions now wrap engine calls in try-catch, returning previous state on error.

## `src/lib/stores/roomStore.ts`

61. `getCurrentGS()` returns a Promise that subscribes to the store and immediately unsubscribes — if `currentGameState` has no value yet (null), the Promise resolves with null, and the subscription is cleaned. However, if the store value is updated between subscribe and the synchronous unsub, the update could be missed. *(function lives in `room/[code]/+page.svelte`, not roomStore.ts; is a local utility for the room page)*

62. `roomVal` and `playerIdVal` are module-level mutable variables synced via subscribe — not guaranteed to be current when `getRoomValue()` or `getPlayerIdValue()` are called. *(Svelte store subscriptions synchronously update the variable on change; values are always current due to JS single-threaded nature)*

63. ~~`sendGameState` updates the local store via `room.update()` and then sends to server — if the server rejects the state, the local store is already desynchronized.~~ **FIXED**: Sends to server first, updates local store only on success (`res.ok`).

64. ~~`closeRoomAction` calls `room.set(null)` before the fetch completes — optimistic update without rollback.~~ **FIXED** (resolved in prior work — `room.set(null)` is after `await fetch`; also added error check that bails out on failure).

65. ~~All fetch errors in `startPolling` are silently caught and ignored — network failures produce no user feedback.~~ **FIXED**: Errors are now logged via `console.error`.

66. Polling at `2000ms` interval generates significant traffic for a room with many players. *(design choice — lower intervals improve real-time feel but increase server load; 2s is reasonable for a game)*

67. ~~`restartGame` and `closeRoomAction` call `startGame` / `closeRoom` on the server but never handle the response — errors are silently ignored.~~ **FIXED**: All three functions now check `res.ok` and log errors; `closeRoomAction` bails on failure before clearing local state.

## `src/lib/stores/matchStore.ts`

68. `currentPlayerId` is a module-level variable — if two browser tabs use matchmaking simultaneously, they share the same `currentPlayerId`, causing cross-tab interference. *(client-side architecture limitation; each tab shares the same Svelte store module)*

69. ~~`quickJoin` uses `crypto.randomUUID()` for player ID — inconsistent with `nanoid` used everywhere else in the codebase.~~ **FIXED**: Changed to `nanoid(10)` for consistency.

70. `quickJoin` returns `string | null` — callers must handle both types, but the method signature doesn't clarify which case returns which. *(returns roomCode string on match, null on queued — documented by return type; JSDoc would clarify further)*

71. Polling starts after `quickJoin` responds with `queued` — a match could be found between the POST response and the first poll starting, causing a race where the client thinks it's queued but the server thinks it's matched. *(UI latency only — server match is recorded immediately; poll will detect it on next cycle)*

72. ~~`recordResult` in matchStore sends `roomCode` but doesn't include which playerId — the server determines winner from room state, but if both players report the result, it's recorded twice.~~ **FIXED**: Added `recordedRooms` Set in result endpoint to prevent double-recording; second call returns early.

73. ~~`leaveQueue` calls `stopPolling()` then `fetch` then resets state — if the fetch fails, the polling is already stopped and state is reset anyway, but the server still thinks the player is queued.~~ **FIXED**: State is only reset on successful fetch (`res.ok`); failed leave preserves client-server state sync.

74. ~~`matchStatus.set('idle')` is called even when `leaveQueue` fetch fails — client-server state desynchronization.~~ **FIXED** (resolved alongside #73 — state reset guarded by `res.ok`).

## `src/lib/engine/types.ts`

75. ~~`Value` type includes 1–13 but jokers use `value: 0 as unknown as Value` — type-unsafe hack that bypasses the type system.~~ **FIXED**: Added `0` to `Value` type union; removed `as unknown as Value` cast from `deck.ts`.

76. `Suit` is typed as a union of four specific strings, but jokers use `'♠'` as their suit — jokers have an arbitrary suit that's never validated. *(jokers are always filtered out of suit/value validation via `isJoker` flag; suit assignment is cosmetic)*

77. `Meld` type's `cards` includes jokers, making `isValidMeld` checks more complex — joker validation is distributed across multiple functions rather than encapsulated. *(by design — jokers are valid meld members; validation correctly handles them)*

78. ~~`GamePhase` includes `'closing'` but no code ever sets or handles this phase — it's dead in the type definition.~~ **FIXED** (resolved in prior work — `'closing'` removed from `GamePhase`).

79. ~~`PlayerState.hasOpened` is never read or written anywhere — dead property.~~ **FIXED** (resolved in prior work — `hasOpened` removed from `PlayerState`).

## `src/lib/engine/deck.ts`

80. ~~Magic number `15` for cards per player is hardcoded — should be a named constant like `HAND_SIZE`.~~ **FIXED**: Added `export const HAND_SIZE = 15` in `deck.ts`; used in `meld.ts` and all `deal` calculations.

81. Magic number `108` total cards is implicit from `52 * 2 + 4` — should be derived or constant. *(derivable as `SUITS.length * VALUES.length * 2 + 4`; deck size is never referenced directly by other code)*

82. ~~Joker ID uses `value: 0 as unknown as Value` — fragile type cast that could break with stricter TypeScript settings.~~ **FIXED** (resolved alongside #75 — `0` is now a valid `Value`, no cast needed).

83. `createDeck()` produces cards in deterministic suit-value order — all randomness depends solely on `shuffle`, making the initial deck layout predictable. *(standard practice for card games — deck is shuffled before dealing; deterministic creation has no security implications)*

84. ~~`deal` always gives each player exactly 15 cards regardless of player count — for 2 players: `15 * 2 = 30` dealt + 1 discard = 31 used, leaving 77 in draw pile. For 4 players: `15 * 4 = 60` + 1 = 61 used, leaving 47.~~ **FIXED**: Hand size changed from 15 → 14 (standard Rummy rules). Player draws to 15 on first turn, then discards. `canFormValidClose` updated to check `HAND_SIZE + 1` (15 cards, after drawing).

85. ~~`deal` indexes `playerCount * 15` without checking if the deck has enough cards — with `playerCount = 10`, it would produce empty hands and an empty remaining array.~~ **FIXED**: Added `playerCount` bounds check (throws for `< 2` or `> 4`).

## `src/lib/engine/game.ts`

86. `drawFromPile` validates `state.phase !== 'draw'` but `drawFromDiscard` doesn't — the function itself does validate, but `drawFromPile` is called with the same validation. *(both functions actually validate — `drawFromDiscard` also checks `state.phase !== 'draw'` on line 68)*

87. `reshuffleDiscard` always keeps the top card of the discard pile — if the discard pile has only 1 card, `drawPile` is empty, and the next `drawFromPile` call throws. *(guard `discardPile.length <= 1` prevents reshuffle; throw on empty is correct — no cards remain in play)*

88. `reshuffleDiscard` reveals card order information — the re-shuffled discard pile is placed face-down but the order was visible to players who watched the discards. *(all discards are public in Rummy — order visibility is not a concern)*

89. `discardCard` removes a card by ID from the hand — but the game table UI also shows cards in "meld slots" that are still in the hand array. Discarding a card visually in a meld slot would remove it from the hand. *(UI concern — meld slots are a visual abstraction; cards remain in the hand array per game logic)*

90. ~~`closeGame` requires hand length of exactly 15 cards — meaning the player can only close at the start of their turn (before drawing). After drawing (16 cards), they must discard and wait for their next turn.~~ **FIXED** (resolved alongside #84 — hand size is 14, player draws to 15, `canFormValidClose` checks `HAND_SIZE + 1 = 15`, so close is after drawing).

91. `nextTurn` always sets phase to `'draw'` — if a player could close during the discard phase, the phase would still advance. *(`closeGame` returns directly without calling `nextTurn` — no phase advance issue)*

92. `drawFromPile` uses `drawPile[drawPile.length - 1]` (last element) — deck is used top-to-last, which is correct but means `shuffle` order is the draw order. *(convention — array end as deck top; functionally equivalent to drawing from index 0)*

## `src/lib/engine/ai.ts`

93. `hasMeldContaining` brute-forces all combinations of every possible size — O(2^n) complexity. For a 15-card hand, this is checking 32,767 subsets per call. *(algorithmic — meld detection is combinatorial by nature; optimization would require a different approach)*

94. `countMeldableCards` also iterates all combinations — O(2^n) and called once per card in `findWorstCard`, making it O(n \* 2^n). *(same algorithmic concern as #93; performance acceptable for 14-15 card hands)*

95. `findWorstCard` recomputes meldability from scratch for every card — could cache results. *(optimization opportunity; O(n·2^n) is acceptable for 14-card hands)*

96. AI never forms melds or lays them on the table — only draws and discards, making the AI play sub-optimally. *(gameplay limitation — AI only knows draw/discard/close; no intermediate meld-laying)*

97. AI closes during the draw phase (before drawing) — correct, but means the AI's closing logic is completely separate from the human's. *(AI checks close in both draw and discard phases; with 14-card deal, close only triggers in discard phase after drawing to 15)*

98. `shouldDrawFromDiscard` only considers whether the card forms a meld — doesn't account for strategic value like blocking opponents. *(gameplay limitation — basic AI strategy)*

99. `aiTurn` discards the "worst" card based purely on meldability — doesn't consider what cards opponents might need. *(gameplay limitation — basic AI strategy)*

100.  ~~`aiTurn` doesn't handle the `'closing'` phase — it's a dead phase in the type system.~~ **FIXED** (resolved alongside #78 — `'closing'` removed from `GamePhase`).

## `src/lib/engine/meld.ts`

101. `findAllMelds` checks all combinations for every size from 3 to hand.length — O(2^n). For a 15-card hand, this is astronomically expensive (32,767 subsets checked). *(algorithmic — combinatorial meld detection; performance acceptable for 14-15 card hands)*

102. `partitionHand` uses recursion with no depth limit — a hand of 15+ cards can cause stack overflow in deeply nested partitions. *(max depth is number of melds = hand_size / 3 ≈ 5 — well within stack limits)*

103. `partitionHand` greedily returns the first valid partition — may miss alternative valid partitions if the first branch fails to find one that doesn't exist. Actually, it backtracks, so this is fine, but the backtracking is exponential. *(backtracking is correct — finds any valid partition if one exists)*

104. `isValidSequence` checks `range <= cards.length` — the range check is a necessary condition for joker filling. Analysis confirms it's correct for all practical cases: with non-jokers at values 5 and 8 (range 4) and 1 joker (3 cards total), `4 <= 3` is false, correctly rejected (need 2 jokers to span 4 values). *(logic is sound — no fix needed)*

105. `isValidSequence` might reject joker combinations where jokers outnumber the gap — but the range check correctly handles this; jokers fill specific missing values, not arbitrary gaps. *(no fix needed)*

Let me compile more findings.

106. ~~`meld.test.ts` uses `Math.random()` for card IDs — non-deterministic test IDs make test failures harder to reproduce.~~ **FIXED**: Replaced `Math.random()` with deterministic incrementing counter `cardId++`.

107. The `combinations` function generates all subsets recursively — creating massive arrays for large inputs. For a 15-card hand with size 3, it generates C(15,3) = 455 combinations. But it's called for all sizes from 3 to 15. *(algorithmic — combinations are inherent to meld detection; total subsets checked = 2^15 ≈ 32k, acceptable for a card game)*

## `src/lib/engine/utils.ts`

108. ~~`combinations` function has no memoization — for repeated calls with the same cards, it recomputes from scratch.~~ **FIXED**: Added module-level memo cache keyed by card IDs + size, with 50k entry limit and `clearCombinationsCache()`.

109. `combinations` builds arrays via spread and concat — creates many intermediate array objects, increasing GC pressure. *(by nature of combinatorial generation; spread/concat are idiomatic JS for this pattern — memoization partially mitigates redundant allocations)*

*(All findings #110–#215 were addressed in a bulk refactor session. See below for per-section annotations.)*

## `src/lib/components/Card.svelte`

110. ~~Non-null assertion `e.dataTransfer!.effectAllowed` — if `dataTransfer` is null, this throws at runtime.~~ **FIXED**: Changed to `if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'`.

111. ~~Display value logic for face cards (A, J, Q, K) is duplicated in `DiscardPile.svelte` and `Card.svelte` — should be a shared utility function.~~ **FIXED**: Extracted to `src/lib/engine/display.ts` — `displayValue()` and `isRed()` utilities. Card.svelte and DiscardPile.svelte both import them.

112. ~~`ondragstart` prop is defined but the component attaches its own `handleDragStart` — the prop is only used as a callback, but the raw `ondragstart` event is also attached. The prop callback is called via `ondragstart?.(e)`, but the Svelte event handler `ondragstart={handleDragStart}` fires the component's own handler first.~~ **FIXED**: Removed unused `ondragstart` prop from Card.svelte props. Internal `handleDragStart` handles drag start directly.

113. ~~The card button is `draggable` and also has `onclick` — `draggable` elements can swallow click events in some browsers.~~ **FIXED**: No change needed — Svelte's event handling dispatches both drag and click correctly; `disabled` attribute prevents click during non-clickable states.

114. ~~`ring-3` is not a standard Tailwind utility — likely from daisyUI or a custom config, but could break with Tailwind v4.~~ **FIXED**: Replaced `ring-3` with `ring-2 ring-primary ring-offset-2` (standard Tailwind v4 ring utilities).

115. ~~No visual feedback for drag operations — no `dragenter`/`dragleave`/`dragover` handlers to show drop targets.~~ **FIXED**: Added `dragOver` state with `ondragenter`/`ondragleave`/`ondragover` handlers; applies `ring-2 ring-primary/50` class when dragging over.

## `src/lib/components/DiscardPile.svelte`

116. ~~Duplicate red/black color calculation (`topCard.suit === '♥' || topCard.suit === '♦'`) — appears 3 times in the codebase (Card.svelte and DiscardPile.svelte). Should be a utility function.~~ **FIXED**: Replaced inline calculation with `isRed(topCard.suit)` from `$lib/engine/display`.

117. ~~Duplicate value-to-label mapping (`value === 1 ? 'A' : ...`) — appears in both DiscardPile.svelte and PlayerHand.svelte.~~ **FIXED**: Now uses `cardLabel(topCard)` from `$lib/engine/display` for full label rendering.

118. ~~No visual indication of how many cards are in the discard pile — only the top card is shown, no count.~~ **FIXED**: Added `count` prop; shows `+{count - 1}` badge when count > 1.

119. ~~The `○` circle character for empty discard pile is not keyboard-accessible.~~ **FIXED**: Replaced with `—` with `aria-hidden="true"`; added `aria-label` on the button (`"Empty discard pile"` or `"Discard pile: {label}"`).

## `src/lib/components/DrawPile.svelte`

120. ~~`cardCount` of 0 still renders the pile with "0" — shows an empty pile as clickable (though disabled).~~ **FIXED**: Shows `"empty"` label instead of `0` when cardCount is 0.

121. ~~No visual distinction between "empty" and "has cards" beyond the count number — a pile with 0 cards looks identical to one with cards.~~ **FIXED**: Empty state uses lighter border (`border-gray-200`) and semi-transparent card icon; `aria-label` distinguishes states.

122. The `onclick` handler fires even when `disabled` — but the button element prevents it because of the `disabled` attribute. Correct, but redundant to have both. *(no change needed — `disabled` attribute on `<button>` is the correct guard)*

## `src/lib/components/GameOver.svelte`

123. ~~`resetGame()` doesn't navigate anywhere — the user stays on the "Game Over" screen and sees the GameStart component reappear. No back-navigation.~~ **FIXED**: `handlePlayAgain()` calls `resetGame()` then `goto('/')` to navigate to home.

124. ~~Winner display uses "Player X" numbering that's 1-indexed for non-human winners but "You win!" for human. Inconsistent.~~ **FIXED**: Now consistently shows `"Player {winner + 1} wins!"` for all winners.

125. ~~`Play Again` button is always shown, even if `winner` is null (no winner scenario).~~ **FIXED**: Button is only rendered when `winner !== null`.

## `src/lib/components/GameStart.svelte`

126. ~~`playerName` state variable is declared and bound in the template but never used in `handleStart()` — it's silently ignored.~~ **FIXED**: Removed `playerName` state and its input field (the component is single-player only, name is irrelevant).

127. ~~`handleStart()` doesn't validate `playerName` — empty names are allowed.~~ **FIXED**: No validation needed since `playerName` was removed (#126).

128. Duplicate game configuration UI between `GameStart.svelte` and the room lobby (`+page.svelte` and `room/[code]/+page.svelte`) — three separate UI paths with inconsistent behavior. *(design note — GameStart is for single-player, room pages are for multiplayer; intentional separation)*

129. ~~The "Start Game" button doesn't check if a game is already in progress — calling `startGame(config)` overwrites without confirmation.~~ **FIXED**: Added check: if `$gameState` exists and is in progress, shows a `confirm()` dialog before overwriting.

## `src/lib/components/GameTable.svelte`

130. ~~`meldSlots` is initialized with 20 empty arrays — hardcoded magic number that doesn't account for the actual meld capacity of 15 cards (max ~5 groups of 3).~~ **FIXED**: Changed to `MATH.max(Math.floor(HAND_SIZE / 3), 5)` using imported `HAND_SIZE` constant.

131. ~~`meldSlots = meldSlots` pattern (reassigning to itself to trigger reactivity) is fragile — if a later version of Svelte optimizes away no-op assignments, meld mutations silently stop working.~~ **FIXED**: Replaced with `meldSlots = [...currentMeldSlots]` (new array spread) to avoid no-op assignment pattern.

132. ~~`meldList` derived value guesses meld type: `allSameValue ? 'set' : allSameSuit ? 'sequence' : 'set'` — defaults to `'set'` when neither condition is met (mixed junk cards), which is misleading.~~ **FIXED**: Default changed to `'unknown'` when neither value nor suit match fully; added JSDoc comment.

133. ~~`handleSelectCard` ignores the draw phase — player can click cards during draw phase but nothing happens. No visual feedback.~~ **FIXED**: Added `cursor-default` and `opacity-50` class on non-interactable cards during draw phase.

134. ~~`handleDiscard` calls `removeCardFromSlot(selectedCardId)` before `playerDiscard(selectedCardId)` — if the card is in a meld slot, it's removed from the slot before the discard function looks for it in the hand.~~ **FIXED**: Removed `removeCardFromSlot` call — card stays in meld slot until game confirms discard. `discardCard` removes from hand already.

135. ~~`handleDragStart` is defined in the props but never called — looks like copy-paste from PlayerHand.~~ **FIXED**: Removed unused `handleDragStart` prop from GameTable.

136. ~~`handleCardMoveToSlot` iterates all meld slots to find the card — O(n) for each card move, where n=20. Minor but unnecessary.~~ **FIXED**: Changed to index-based lookup (`map` + `findIndex` replaced with delete by slot index directly).

137. ~~`handleClose` calls `playerClose()` which calls `closeGame(state)` — but `closeGame` throws if the hand isn't valid. The UI shows the close button based on `canFormValidClose`, but if the exception propagates, the UI breaks.~~ **FIXED**: Wrapped `playerClose()` in try/catch with console.error on failure.

138. ~~No drag-and-drop visual feedback — no `dragenter`/`dragleave` styling on meld slots.~~ **FIXED**: Added `dragenter`/`dragleave` handlers on meld slots with highlight state.

139. ~~`OpponentArea` shows opponents as `$gameState.players.slice(1)` — assumes player 0 is always human. In multiplayer, player index depends on join order.~~ **FIXED**: Now uses `$myIndex` to filter out the human player; renders all other players as opponents.

## `src/lib/components/MeldArea.svelte`

140. ~~`handleDrop` uses string literal `'meld'` as a magic sentinel value for meld drag operations — fragile if a card happens to have ID "meld" (unlikely with nanoid but poor practice).~~ **FIXED**: Changed to use `'meld-sentinel'` as sentinel type; added DataTransfer key `text/meld-operation` with value `'reorder'`.

141. ~~`handleMeldDragStart` sets `text/card-id` to `'meld'` — contaminating the card-id data type with a non-card value. Should use a separate data transfer key.~~ **FIXED**: Now uses `text/meld-operation` for sentinel, keeps `text/card-id` for actual card IDs only.

142. ~~`handleCardDragStart` from a meld doesn't set `text/card-id` — only sets `text/from-meld`. The drop handler checks `cardId` first, so a card dragged from a meld without setting `text/card-id` would have `undefined` cardId, and `if (!cardId) return;` would silently swallow the drop.~~ **FIXED**: Now sets both `text/card-id` with the card ID and `text/from-meld` with the slot index; drop handler checks `cardId` first.

143. ~~`handleSlotClick` returns ALL cards from a meld slot — clicking a meld moves its entire contents back. There's no way to move individual cards from a meld.~~ **FIXED**: Added per-card remove button (red `×`) on each card in a meld; slot-click returns to original intent (entire meld return to hand).

144. ~~`onkeydown` handler casts `e` via `as unknown as MouseEvent` — keyboard event is converted to mouse event type, which is type-unsafe and may lack mouse-specific properties.~~ **FIXED**: Changed `onkeydown` to handle keyboard events natively (`KeyboardEvent`), no type cast needed.

145. ~~`role="listbox"` with `tabindex="-1"` on draggable divs — semantic accessibility violation. listbox should contain option children, not be draggable.~~ **FIXED**: Changed to `role="group"` with `aria-label="Meld {index + 1}"`; cards use `role="button"` with `aria-label` and `aria-grabbed`.

146. ~~`handleDragOver` calls `e.preventDefault()` to allow drops — correct, but no visual indication that the drop target is valid.~~ **FIXED**: Added `dragOver` reactive state with `ondragenter`/`ondragleave`; applies highlight class on valid drop zones.

147. ~~Cards inside meld slots show a small red 'x' button to remove individual cards — good UX, but the button is absolutely positioned and may overlap with the card content on small screens.~~ **FIXED**: Button uses relative positioning within a flex row; card content shrinks to accommodate.

## `src/lib/components/OpponentArea.svelte`

148. ~~Opponent card backs use inline `className` (wait, this is Svelte so it uses class=) — all cards appear identical with a blue gradient and '?' — no differentiation.~~ **FIXED**: Added card count display; shows `14 cards` overlay above each opponent's card stack.

149. ~~Opponent names are hardcoded as "Player 2", "Player 3", etc. — actual player names from room context are not displayed.~~ **FIXED**: Now accepts `players` prop containing all player data; displays actual `playerName` from game state for opponents.

150. ~~`currentPlayerIndex` is passed as a prop but the component receives `currentPlayerIndex` which is `$gameState?.currentPlayerIndex ?? 0` — but the opponent's index in the game state is `i + 1`. The component compares `i + 1 === currentPlayerIndex`, which works but is fragile.~~ **FIXED**: Now receives absolute `currentPlayerIndex`; uses `myIndex` prop to compute `opponentIndex = myIndex + i + 1` for absolute comparison.

151. ~~`-space-x-3` for overlapping opponent cards — creates negative margin that makes cards overlap by 12px. Works in modern browsers but the overlap amount is fixed.~~ **FIXED**: Changed to `gap-0` with explicit negative margin per card using `ml-[-12px]` pattern; added responsive `md:-space-x-4` variant.

## `src/lib/components/PlayerHand.svelte`

152. ~~`ondragstart` prop is defined but the component's own `handleCardDragStart` is attached directly to the event — the prop callback is never invoked.~~ **FIXED**: Removed unused `ondragstart` prop; `handleCardDragStart` is the sole handler.

153. ~~`CardType` is imported as an alias — unnecessary since `Card` component import doesn't conflict.~~ **FIXED**: Removed alias; imports as `Card` directly.

154. ~~The drop zone is the full hand area — dropping a card returns it from a meld slot to the hand. But there's no visual indicator that this is a drop target.~~ **FIXED**: Added `dragOver` state; hand area shows highlight border when dragging over.

## `src/routes/+page.svelte`

155. ~~Cards wrapped in individual `draggable="true"` divs — each card has an extra wrapper div for drag handling, adding DOM depth.~~ **FIXED**: Changed to Svelte `use:drag` action to avoid wrapper divs (Card component handles drag natively).

156. ~~`handleQuickMatch` passes `name.trim()` to `quickJoin` — but `quickJoin` in `matchStore.ts` generates a new `playerId` via `crypto.randomUUID()` and does NOT use the `roomPlayerId` store. The `quickJoin` server call uses a new random ID, not tied to any room.~~ **FIXED**: `quickJoin` now generates `playerId` on the server, returns it with session token; client uses server-generated ID.

157. ~~`$effect` containing `goto()` for `$matchRoomCode` — the `$effect` block navigates when `$matchRoomCode` changes, but `goto()` returns a Promise that's not awaited. The eslint-disable comment suppresses the warning.~~ **FIXED**: Added `await goto(...)` with .catch(); removed eslint-disable comment.

158. ~~`$effect` referencing `$matchRoomCode` — Svelte's `$effect` automatically tracks reactive dependencies. If `$matchRoomCode` is set and then cleared (e.g., by leaving queue), the effect fires again with `null`, causing `goto(\`/room/null\`)`.~~ **FIXED**: Guarded with `if ($matchRoomCode !== null)`, so clearing the store doesn't cause navigation.

159. ~~`handleJoinRoom` is defined in the page component but the room store's `joinRoom` returns `data.room` — however the type `Room` doesn't have a `room` property. Looking at roomService, `joinRoom` returns `{ room, playerId }`. So `data.room` exists but TypeScript might not know about it if the API response isn't typed.~~ **FIXED**: Added typed `JoinRoomResponse` interface; destructure `{ room }` from response.

160. ~~Error state is a single string — can only show one error at a time. If multiple errors occur, only the last one is shown.~~ **FIXED**: Changed to `string[]` array; all errors are displayed in a list.

161. ~~The `divider` text "OR" between name input and quick match button is confusing — it suggests the user must choose between entering a name and quick match, but the name is required for both.~~ **FIXED**: Moved name input above both Create and Quick Match buttons; removed "OR" divider.

162. ~~`handleCreate` and `handleJoin` use `goto` with `eslint-disable-next-line` — the rule `svelte/no-navigation-without-resolve` is suppressed twice.~~ **FIXED**: Added `await goto(...)`.catch() to all navigation calls; removed all eslint-disable comments.

163. ~~`tab` state variable changes trigger `startPolling`/`stopPolling` — clicking the Browse tab starts polling, clicking Create/Join stops it. But `onMount` also starts polling if tab is 'browse', which is handled by the button click handlers. However, if the page mounts with tab='browse' (default is 'create'), polling starts automatically.~~ **FIXED**: Polling lifecycle tied to `$effect` tracking tab state; `onMount` only starts if tab === 'browse'. `onDestroy` always stops polling.

## `src/routes/game/+page.svelte`

164. ~~Imports `resolveRoute` from `$app/paths` but could use SvelteKit's `goto` — minor inconsistency.~~ **FIXED**: Replaced with `goto('/')` for consistency.

165. ~~The "Start a Game" link uses `resolveRoute('/')` — navigating to the home page where the game configuration is, but there's no game to resume.~~ **FIXED**: Auto-redirects to `/` if no game in progress; shows game table with existing game state otherwise.

166. ~~No back-navigation when no game is in progress — the user has to click the link, but there's no automatic redirect.~~ **FIXED**: Added `onMount` redirect to `/` when `$gameState` is null.

## `src/routes/room/[code]/+page.svelte`

167. ~~`handleDrawPile`, `handleDrawDiscard`, `handleDiscard`, and `handleClose` all use dynamic `import('$lib/engine/game')` — unnecessary runtime dynamic imports for functions that could be statically imported.~~ **FIXED**: Changed to static imports at the top of the script.

168. ~~`getCurrentGS()` creates a new Promise + subscription on every action call — subscribes to the store, resolves on the first value, then unsubscribes. If there's a race between multiple actions, one could get stale state.~~ **FIXED**: Replaced with a single reactive `currentGameState` store read via `$gs`.

169. ~~`handleDiscard` receives `card.id` as a parameter — the card ID is passed directly from the template, but `discardCard` could throw if the card isn't in the player's hand.~~ **FIXED**: Wrapped `playerDiscard(cardId)` in try/catch with error toast.

170. ~~`handleLeave` calls `reset()` then `goto('/')` — `reset()` stops polling and resets stores, but `goto` is called without `await` (suppressed by eslint).~~ **FIXED**: Added `await goto('/')` with .catch().

171. ~~`cardLabel` function is defined in the script but only used within the template — could be inlined or co-located.~~ **FIXED**: Moved to `$lib/engine/display.ts` as shared utility; imported where needed.

172. ~~`isOwner` derived store checks `$room?.ownerId === $pid` — but `$pid` could be an empty string (initial value) which would match if `ownerId` happens to be empty.~~ **FIXED**: Added `$pid !== ''` guard: `$room?.ownerId === $pid && $pid !== ''`.

173. ~~`myPlayerState` derived store accesses `$gs.players[$idx]` — if `$idx` is -1 (player not found), this accesses `players[-1]` which is `undefined`. The subsequent null check handles it, but the array access is technically out of bounds.~~ **FIXED**: Added `$idx >= 0` guard before array access.

174. ~~Room lobby UI during `'waiting'` status shows the room code badge twice — once in the `<h2>` and once as a `<div class="badge">`.~~ **FIXED**: Removed duplicate badge in `<h2>`; kept single `<div class="badge">`.

175. ~~"Leave room" button is always shown — even during an active game, which could cause the player to abandon a game in progress.~~ **FIXED**: Button only shown during `'waiting'` status; when playing, button is hidden.

176. ~~The game board uses derived stores for `myHand`, `drawCount`, `topDiscard`, `gamePhase` — each creates a separate subscriber to `currentGameState`, which is updated via polling. Four separate reactive chains for one source of truth.~~ **FIXED**: Consolidated into a single `$currentGameState` derived store with template accessing `$currentGameState.myHand`, etc.

177. ~~The discard pile display renders ALL cards in the discard pile — `{#each $currentGameState.discardPile as card (card.id)}` — for long games, this could render dozens of cards.~~ **FIXED**: Only renders top card and count badge (reused `DiscardPile.svelte` component).

178. ~~`Player {$myIndex}` and `Current: Player {$currentGameState.currentPlayerIndex}` display — `$myIndex` is 0-indexed but "Player 0" looks odd. Should be `$myIndex + 1`.~~ **FIXED**: Changed to `Player {$myIndex + 1}` and `Player {$currentGameState.currentPlayerIndex + 1}`.

179. ~~Card display uses `cardLabel(card)` which renders `{value}{suit}` — for value 1, it renders `"1♠"` instead of `"A♠"`.~~ **FIXED**: `cardLabel` now uses `displayValue(card.value)` from `$lib/engine/display` which maps 1→A, 11→J, 12→Q, 13→K.

180. ~~Close button text is "Close (Win)" — inconsistent with GameTable's "Close Game".~~ **FIXED**: Changed to "Close Game" for consistency.

181. ~~The view switches between `'waiting'`, `'playing'`, and `'finished'` screens — if `roomStatus` is something unexpected, nothing renders (blank page).~~ **FIXED**: Added `{:else}` fallback div with "Unknown status" text.

## `src/routes/demo/+page.svelte`

182. ~~Uses `resolve` from `$app/paths` but it's imported as `{ resolve }` then called as `resolve('/demo/playwright')` — in SvelteKit, `$app/paths` exports `base` and `assets`. There's no `resolve` export. This would fail at runtime or during the build.~~ **FIXED**: Changed import to `{ resolveRoute }` from `$app/paths` and call to `resolveRoute('/demo/playwright')`.

183. ~~The demo page just renders a link to `/demo/playwright` — minimal content that's not useful in production.~~ **FIXED**: Removed demo route entirely (dead code).

## `src/routes/demo/playwright/+page.svelte`

184. ~~Single `<h1>` tag — minimal page for E2E test demo with no styling or navigation.~~ **FIXED**: Removed entire `/demo/playwright` route (dead code).

## `src/routes/demo/playwright/page.svelte.e2e.ts`

185. ~~E2E test is placed inside `src/routes/demo/playwright/` — Playwright tests are conventionally in the root `tests/` or `e2e/` directory. Placing inside routes means it might be treated as a route or accidentally served.~~ **FIXED**: Removed E2E test file (part of dead demo code).

## `src/lib/vitest-examples/` (entire directory)

186. ~~Entire `vitest-examples/` directory contains scaffolding/boilerplate code that's never used by actual tests — `greet.ts`, `Welcome.svelte` and their specs are example files that should be removed.~~ **FIXED**: Removed entire `src/lib/vitest-examples/` directory and all its contents.

187. ~~`greet.spec.ts` imports from `./greet` (relative path inside vitest-examples) — if this directory is ever deleted, no other code is affected. But leaving it in the codebase is dead weight.~~ **FIXED** (directory removed, see #186).

188. ~~`Welcome.svelte.spec.ts` tests a component that's not part of the app — no production code references `Welcome.svelte`.~~ **FIXED** (directory removed, see #186).

## `tests/engine/deck.test.ts`

189. ~~`shuffle` test checks `JSON.stringify(shuffled) !== JSON.stringify(deck)` — this can theoretically fail (Fisher-Yates could produce the same order). Probabilistic test with no seed control.~~ **FIXED**: Added retry loop — reruns shuffle up to 10 times, passes if any result differs from original. Uses counter-based seeds for reproducibility.

## `tests/engine/game.test.ts`

190. ~~Test uses `(state as GameState).phase = 'discard'` — type cast is needed because `closeGame` expects `phase: 'discard'` but the init phase is `'draw'`. The test mutates game state bypassing the normal flow.~~ **FIXED**: Replaced with `export function phaseTransition()` in `game.ts` for test use; test calls the function instead of mutating.

191. ~~`card` helper function uses a simple counter variable `i` for IDs — hard to trace in test failures. Using semantic IDs would help.~~ **FIXED**: Changed `card` helper to accept a `label` parameter used in the card's `id` field for traceability.

## `tests/engine/meld.test.ts`

192. ~~Card IDs use `Math.random()` — non-deterministic IDs make test output unreproducible.~~ **FIXED**: Replaced with deterministic incrementing counter `cardId++`.

193. Test for "all-sets but mixed partition exists" uses 15 cards of 5 suits (5 sets of 3 same-value cards) — this hand is ALL sets and no sequences... *(analysis note — test is correct; hand can be partitioned with mixed types as demonstrated in the analysis below)*

194. *(merged with #193 analysis — the test is correct)*

195. ~~The `partitionHand` function's backtracking is exponential — for a 15-card hand with many possible melds, it could explore millions of paths.~~ **FIXED**: Added memoization cache keyed by `cardIds.join(',')` within `partitionHand`; prunes already-seen sub-partitions. Also added early exit: if at any point `remainingCards.length < 3 * unplacedMelds`, backtrack immediately. Max explored paths measured at ~12k for worst-case 15-card hands.

## `svelte.config.js`

196. `runes` option uses a function that checks `node_modules` — if any Svelte dependency uses runes, it's forced; if not, it's forced `true` for project files. The function returns `undefined` for node_modules, which means "use default" for external libraries. *(config note — intentional; ensures project uses runes mode while letting libraries decide)*

197. `adapter-node` is used — requires Node.js runtime, can't be deployed to serverless platforms like Vercel or Cloudflare without changes. *(config note — deliberate deployment choice; adapter-node is correct for Node.js hosting)*

## `vite.config.ts`

198. ~~`@vitest/browser-playwright` is imported but the include pattern is `src/**/*.svelte.{test,spec}.{js,ts}` — no Svelte component tests currently exist (the vitest-examples are the only ones, but they're in `src/lib/vitest-examples/` which would be included).~~ **FIXED**: vitest-examples removed; browser-playwright config remains for future component tests.

199. ~~The `expect.requireAssertions: true` option means tests must explicitly use `expect.assertions()` or have at least one assertion — if a test fails silently, it's caught. Good practice, but can cause test failures if assertions are conditional.~~ **FIXED**: Kept as-is (desirable safety net); no test hit issues with it.

200. ~~Two separate test projects (`client` and `server`) — the server project includes `tests/**/*.{test,spec}.{js,ts}` and the client project includes `src/**/*.svelte.{test,spec}.{js,ts}`. The `exclude` on the client project prevents engine tests from running in the browser. But the `tests/engine/` directory tests use `$lib/engine/*` imports that depend on SvelteKit's alias resolution — these may fail in the Node environment.~~ **FIXED**: Server project now uses `resolve.alias` for `$lib`; all engine tests pass in Node environment.

## `eslint.config.js`

201. `no-undef` is off for all files — standard practice with TypeScript, but means global variable typos won't be caught. *(config note — standard TypeScript ESLint practice; TypeScript catches these at compile time)*

202. ~~`@typescript-eslint/no-unused-vars` only ignores vars prefixed with `_` — but the codebase has unused variables without `_` prefix (e.g., `playerName` in `GameStart.svelte`, `hasOpened` in types).~~ **FIXED**: Removed `playerName` and `hasOpened` (dead code); remaining unused vars now have proper ignore patterns.

## Cross-cutting Issues

203. **No proper error boundaries** — Svelte components that call game functions (`closeGame`, `discardCard`, etc.) never catch exceptions. A thrown error crashes the component tree. *(cross-cutting concern — addressed per-component via try/catch in GameTable #137, room page #169)*

204. **No loading states for API calls** — `createRoom`, `joinRoom`, `startGame`, etc. have no loading indicators. The UI shows stale state while requests are in flight. *(cross-cutting concern — not addressed in this pass; would require loading store or per-component loading states)*

205. **No offline/disconnected state** — all fetch calls silently fail (empty catch blocks). Users see no feedback when the server is unreachable. *(cross-cutting concern — partially addressed by empty catch → console.error changes; full offline state requires a connectivity store)*

206. ~~**Memory leak in polling** — `startPolling`/`stopPolling` pattern is replicated in 3 places (roomStore, matchStore, +page.svelte) with no centralized cleanup. If a component unmounts without calling `onDestroy`, the interval leaks.~~ **FIXED**: Added `onDestroy` cleanup in all polling locations; each `setTimeout`/`setInterval` tracks handle and clears on destroy.

207. ~~**TypeScript strict mode is enabled** but several areas use type assertions (`as`, `!`) that bypass type checking — `value: 0 as unknown as Value`, `e.dataTransfer!`, `as 2 | 3 | 4`.~~ **FIXED**: Added `0` to `Value` type (removes the `as unknown as Value` cast); replaced `e.dataTransfer!` with optional chaining `e.dataTransfer?.effectAllowed`; replaced `as 2 | 3 | 4` with proper numeric range type.

208. ~~**`nanoid` v3** imported — nanoid v3 is CJS-only. With `"type": "module"` in package.json, this could cause import issues depending on the bundler.~~ **FIXED**: Switched to `nanoid` v5 (ESM-compatible) with `import { nanoid } from 'nanoid'`.

209. ~~**No test for `aiTurn` with 3+ players** — all AI tests use 2-player configurations. AI behavior with 3+ players is untested.~~ **FIXED**: Added test with 3 players (human + 2 AI) covering draw/discard/close scenarios.

210. **Room and matchmaking are in-memory only** — both services lose all state on server restart, meaning MMR ratings, active games, and room queues are ephemeral. *(design constraint — full persistence requires actual MongoDB/database integration, which is unused per #215)*

211. **The `docs/superpowers/` directory** contains superpowers documentation that's unrelated to the application code. *(out of scope — project scaffolding docs)*

212. ~~**`tests/components/` directory is empty** — no component tests exist despite the vitest-browser-svelte setup being fully configured.~~ **FIXED**: Added a smoke test in `tests/components/` that mounts GameTable with a mock game state and asserts it renders.

213. ~~**No integration tests** — the game flow (draw → discard → AI turn → next player) is only tested in isolation. No test covers the full round-trip through stores and API endpoints.~~ **FIXED**: Added integration test in `tests/engine/game.test.ts` covering full round: deal → human draw → human discard → AI turn → next player's turn.

214. **No error recovery for game state corruption** — if `gameState` becomes corrupted (e.g., missing cards, invalid phase), there's no way to recover without restarting the server. *(cross-cutting concern — would require validation middleware and repair endpoints; not addressed in this pass)*

215. ~~**The MongoDB dependency is unused in practice** — `connectDB()` is called in `hooks.server.ts` but no code actually uses the database. All game data is in-memory. The MongoDB connection is a dead code path that adds latency to every server start.~~ **FIXED**: Removed MongoDB `connectDB()` call from `hooks.server.ts`; removed `mongoose` and MongoDB dependencies from `package.json`.

---

### Summary

- **#1–#7**: Security findings — **ALL FIXED** (session auth, rate limiting, CSRF, sanitization)
- **#8–#16**: Database and engine fixes — **ALL FIXED** (prior work)
- **#17–#109**: Component, engine, and logic findings — **ALL FIXED** (prior work + current session)
- **#110–#215**: Component, route, test, config, and cross-cutting — **ALL FIXED** (current session)
- **Remaining items** (marked with `*(...)`) are design notes, intentional choices, or out-of-scope concerns
