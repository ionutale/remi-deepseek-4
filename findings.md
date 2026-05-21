# Code Review Findings

## Security — Critical

1. `.env` file is tracked by git (visible in `git status`) exposing MongoDB credentials `mongodb+srv://tools:IX8zBNZyqWjrpSf4@...`. Add `.env` to `.gitignore` and rotate the exposed credentials immediately.

2. No authentication or authorization on any API endpoint — `playerId` is a trivially forgeable nanoid (10 chars). Any client can impersonate any player.

3. PUT `/api/rooms/[code]` accepts `gameState` without verifying the sender's `playerId` — any player (or unauthenticated client) could overwrite the game state.

4. No rate limiting on any endpoint — matchmaking, room creation, and room listing are all unbounded.

5. No CSRF protection on fetch-based API calls — SvelteKit's built-in form action CSRF is bypassed.

6. No input sanitization on `ownerName` or `playerName` — could be used for injection into the DOM via the room lobby UI.

7. Matchmaking POST accepts an arbitrary `playerId` from the client — clients can fabricate their own identity.

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

86. `drawFromPile` validates `state.phase !== 'draw'` but `drawFromDiscard` doesn't — the function itself does validate, but `drawFromPile` is called with the same validation.

87. `reshuffleDiscard` always keeps the top card of the discard pile — if the discard pile has only 1 card, `drawPile` is empty, and the next `drawFromPile` call throws.

88. `reshuffleDiscard` reveals card order information — the re-shuffled discard pile is placed face-down but the order was visible to players who watched the discards.

89. `discardCard` removes a card by ID from the hand — but the game table UI also shows cards in "meld slots" that are still in the hand array. Discarding a card visually in a meld slot would remove it from the hand.

90. `closeGame` requires hand length of exactly 15 cards — meaning the player can only close at the start of their turn (before drawing). After drawing (16 cards), they must discard and wait for their next turn.

91. `nextTurn` always sets phase to `'draw'` — if a player could close during the discard phase, the phase would still advance.

92. `drawFromPile` uses `drawPile[drawPile.length - 1]` (last element) — deck is used top-to-last, which is correct but means `shuffle` order is the draw order.

## `src/lib/engine/ai.ts`

93. `hasMeldContaining` brute-forces all combinations of every possible size — O(2^n) complexity. For a 15-card hand, this is checking 32,767 subsets per call.

94. `countMeldableCards` also iterates all combinations — O(2^n) and called once per card in `findWorstCard`, making it O(n \* 2^n).

95. `findWorstCard` recomputes meldability from scratch for every card — could cache results.

96. AI never forms melds or lays them on the table — only draws and discards, making the AI play sub-optimally.

97. AI closes during the draw phase (before drawing) — correct, but means the AI's closing logic is completely separate from the human's.

98. `shouldDrawFromDiscard` only considers whether the card forms a meld — doesn't account for strategic value like blocking opponents.

99. `aiTurn` discards the "worst" card based purely on meldability — doesn't consider what cards opponents might need.

100.  `aiTurn` doesn't handle the `'closing'` phase — it's a dead phase in the type system.

## `src/lib/engine/meld.ts`

101. `findAllMelds` checks all combinations for every size from 3 to hand.length — O(2^n). For a 15-card hand, this is astronomically expensive (32,767 subsets checked).

102. `partitionHand` uses recursion with no depth limit — a hand of 15+ cards can cause stack overflow in deeply nested partitions.

103. `partitionHand` greedily returns the first valid partition — may miss alternative valid partitions if the first branch fails to find one that doesn't exist. Actually, it backtracks, so this is fine, but the backtracking is exponential.

104. `isValidSequence` checks `range <= cards.length` — a sequence `[5, 6, 10]` with range 6 and 3 cards passes (`6 <= 3` is false, so rejected). But a sequence `[5, 6, 7, 8, 9, 10, 11, 12, 13, 1]` with range 13 and 10 cards passes (`13 <= 10` is false). Wait, that's rejected too. Actually `range = 13 - 1 + 1 = 13`, `13 <= 10` = false. OK.

But the issue is: `[5, 6, 8]` has range 4, cards length 3, `4 <= 3` is false → rejected correctly. But `[5, 6, 7, 8]` with range 4 and 4 cards: `4 <= 4` is true → accepted. Correct behavior.

Wait — `[5, 6, 8]` range = `8 - 5 + 1 = 4`, `4 <= 3` is false → rejected. But this is NOT necessarily invalid with jokers. With joker substitution, the range could exceed the card count.

Actually, the joker check is separate. Non-jokers in `[5, 6, 8]`? All non-jokers. `values = {5, 6, 8}`. `sorted = [5, 6, 8]`. `range = 8 - 5 + 1 = 4`. `4 <= 3` is false. So `isValidSequence([5, 6, 8])` = false. Correct — it's not a valid sequence without jokers.

But with one joker and two cards `[5, JOKER, 8]`: non-jokers = [5, 8], values = {5, 8}, sorted = [5, 8], range = 8 - 5 + 1 = 4, `4 <= 3` is false → rejected. But `[5, JOKER, 8]` could be a valid sequence if the joker fills 6 or 7. The function rejects it because the range (4) exceeds the card count (3). This is a **BUG** — joker-valid sequences can be rejected.

Wait, `cards.length` is 3 (including the joker). `range = 8 - 5 + 1 = 4`. `4 <= 3` is false. So `isValidSequence` returns false. But `[5, JOKER, 8]` should be valid with the joker representing 6 or 7. Actually the joker can only represent one value, so `[5, JOKER, 8]` has non-jokers at 5 and 8, with one joker. The range from 5 to 8 is 4 cards (5, 6, 7, 8), but we only have 3 cards total. So this can't form a valid sequence because we'd need two jokers to fill both 6 and 7.

Actually wait — `range <= cards.length` where range is the span of non-joker values. `[5, JOKER, 8]`: non-joker values are 5 and 8, range = 4 (5,6,7,8), cards.length = 3. `4 <= 3` is false. Correct — needs at least 4 cards to span 4 values.

What about `[5, JOKER, JOKER, 8]`: non-joker values are 5 and 8, range = 4, cards.length = 4. `4 <= 4` is true. So `isValidSequence([5, JOKER, JOKER, 8])` = true.

But what about `[5, 6, JOKER, 8]`: non-joker values = {5, 6, 8}, sorted = [5, 6, 8], range = 4, cards.length = 4. `4 <= 4` is true. Accepted. Correct — joker fills the 7.

And `[5, 6, JOKER, 9]`: non-joker values = {5, 6, 9}, sorted = [5, 6, 9], range = 5, cards.length = 4. `5 <= 4` is false. But could the joker fill the gap between 6 and 9? The range is 5 cards (5,6,7,8,9) and we have 4 cards — a joker can only fill one value, so we'd need another card. Rejected correctly.

So actually `range <= cards.length` is a correct necessary condition but might not be sufficient. Let me think of a case where it passes incorrectly:

`[5, 5, 6, 7]`: non-joker values = {5, 6, 7} (duplicate 5 is dedup'd), sorted = [5, 6, 7], range = 3, cards.length = 4. `3 <= 4` is true. But `values.has(c.value)` would fail on the duplicate 5 because it's already in the set. So `isValidSequence` returns false because `c.suit !== suit`... wait, that's checked first. Let me re-read:

```
for (const c of nonJokers) {
  if (c.suit !== suit) return false;
  if (values.has(c.value)) return false;
  values.add(c.value);
}
```

The duplicate check `values.has(c.value)` returns true on the second 5, so the function returns false. Correct.

So the range check is actually just a quick validation, and the duplicate suit/value checks handle the rest. The range check's job is to verify that cards span a range that could be filled by jokers.

OK, so `isValidSequence` is actually correct for the cases I considered. Let me move on.

105. isValidSequence might actually incorrectly reject some joker-containing combinations that have more jokers than needed — but the range check handles it correctly for all practical cases.

Let me compile more findings.

106. `meld.test.ts` uses `Math.random()` for card IDs — non-deterministic test IDs make test failures harder to reproduce.

107. The `combinations` function generates all subsets recursively — creating massive arrays for large inputs. For a 15-card hand with size 3, it generates C(15,3) = 455 combinations. But it's called for all sizes from 3 to 15.

## `src/lib/engine/utils.ts`

108. `combinations` function has no memoization — for repeated calls with the same cards, it recomputes from scratch.

109. `combinations` builds arrays via spread and concat — creates many intermediate array objects, increasing GC pressure.

## `src/lib/components/Card.svelte`

110. Non-null assertion `e.dataTransfer!.effectAllowed` — if `dataTransfer` is null, this throws at runtime.

111. Display value logic for face cards (A, J, Q, K) is duplicated in `DiscardPile.svelte` and `Card.svelte` — should be a shared utility function.

112. `ondragstart` prop is defined but the component attaches its own `handleDragStart` — the prop is only used as a callback, but the raw `ondragstart` event is also attached. The prop callback is called via `ondragstart?.(e)`, but the Svelte event handler `ondragstart={handleDragStart}` fires the component's own handler first.

113. The card button is `draggable` and also has `onclick` — `draggable` elements can swallow click events in some browsers.

114. `ring-3` is not a standard Tailwind utility — likely from daisyUI or a custom config, but could break with Tailwind v4.

115. No visual feedback for drag operations — no `dragenter`/`dragleave`/`dragover` handlers to show drop targets.

## `src/lib/components/DiscardPile.svelte`

116. Duplicate red/black color calculation (`topCard.suit === '♥' || topCard.suit === '♦'`) — appears 3 times in the codebase (Card.svelte and DiscardPile.svelte). Should be a utility function.

117. Duplicate value-to-label mapping (`value === 1 ? 'A' : ...`) — appears in both DiscardPile.svelte and Card.svelte.

118. No visual indication of how many cards are in the discard pile — only the top card is shown, no count.

119. The `○` circle character for empty discard pile is not keyboard-accessible.

## `src/lib/components/DrawPile.svelte`

120. `cardCount` of 0 still renders the pile with "0" — shows an empty pile as clickable (though disabled).

121. No visual distinction between "empty" and "has cards" beyond the count number — a pile with 0 cards looks identical to one with cards.

122. The `onclick` handler fires even when `disabled` — but the button element prevents it because of the `disabled` attribute. Correct, but redundant to have both.

## `src/lib/components/GameOver.svelte`

123. `resetGame()` doesn't navigate anywhere — the user stays on the "Game Over" screen and sees the GameStart component reappear. No back-navigation.

124. Winner display uses "Player X" numbering that's 1-indexed for non-human winners but "You win!" for human. Inconsistent.

125. `Play Again` button is always shown, even if `winner` is null (no winner scenario).

## `src/lib/components/GameStart.svelte`

126. `playerName` state variable is declared and bound in the template but never used in `handleStart()` — it's silently ignored.

127. `handleStart()` doesn't validate `playerName` — empty names are allowed.

128. Duplicate game configuration UI between `GameStart.svelte` and the room lobby (`+page.svelte` and `room/[code]/+page.svelte`) — three separate UI paths with inconsistent behavior.

129. The "Start Game" button doesn't check if a game is already in progress — calling `startGame(config)` overwrites without confirmation.

## `src/lib/components/GameTable.svelte`

130. `meldSlots` is initialized with 20 empty arrays — hardcoded magic number that doesn't account for the actual meld capacity of 15 cards (max ~5 groups of 3).

131. `meldSlots = meldSlots` pattern (reassigning to itself to trigger reactivity) is fragile — if a later version of Svelte optimizes away no-op assignments, meld mutations silently stop working.

132. `meldList` derived value guesses meld type: `allSameValue ? 'set' : allSameSuit ? 'sequence' : 'set'` — defaults to `'set'` when neither condition is met (mixed junk cards), which is misleading.

133. `handleSelectCard` ignores the draw phase — player can click cards during draw phase but nothing happens. No visual feedback.

134. `handleDiscard` calls `removeCardFromSlot(selectedCardId)` before `playerDiscard(selectedCardId)` — if the card is in a meld slot, it's removed from the slot before the discard function looks for it in the hand. But `discardCard` looks in `player.hand`, and cards in meld slots are still in the hand array. So the meld slot removal is purely UI.

Wait — `removeCardFromSlot` doesn't remove from the hand, it removes from `meldSlots[]`. So when `playerDiscard` calls `discardCard(state, cardId)`, it looks for the card in `state.players[0].hand`, which still contains the card (because meldSlots is a UI-only abstraction). So the discard works correctly. The meld slot removal is UI-only cleanup.

135. `handleDragStart` is defined in the props but never called — looks like copy-paste from PlayerHand.

136. `handleCardMoveToSlot` iterates all meld slots to find the card — O(n) for each card move, where n=20. Minor but unnecessary.

137. `handleClose` calls `playerClose()` which calls `closeGame(state)` — but `closeGame` throws if the hand isn't valid. The UI shows the close button based on `canFormValidClose`, but the server-side doesn't re-validate. It does re-validate via `closeGame` throwing. But if the exception propagates, the UI breaks.

138. No drag-and-drop visual feedback — no `dragenter`/`dragleave` styling on meld slots.

139. `OpponentArea` shows opponents as `$gameState.players.slice(1)` — assumes player 0 is always human. In multiplayer, player index depends on join order.

## `src/lib/components/MeldArea.svelte`

140. `handleDrop` uses string literal `'meld'` as a magic sentinel value for meld drag operations — fragile if a card happens to have ID "meld" (unlikely with nanoid but poor practice).

141. `handleMeldDragStart` sets `text/card-id` to `'meld'` — contaminating the card-id data type with a non-card value. Should use a separate data transfer key.

142. `handleCardDragStart` from a meld doesn't set `text/card-id` — only sets `text/from-meld`. The drop handler checks `cardId` first, so a card dragged from a meld without setting `text/card-id` would have `undefined` cardId, and `if (!cardId) return;` would silently swallow the drop.

143. `handleSlotClick` returns ALL cards from a meld slot — clicking a meld moves its entire contents back. There's no way to move individual cards from a meld.

144. `onkeydown` handler casts `e` via `as unknown as MouseEvent` — keyboard event is converted to mouse event type, which is type-unsafe and may lack mouse-specific properties.

145. `role="listbox"` with `tabindex="-1"` on draggable divs — semantic accessibility violation. listbox should contain option children, not be draggable.

146. `handleDragOver` calls `e.preventDefault()` to allow drops — correct, but no visual indication that the drop target is valid.

147. Cards inside meld slots show a small red 'x' button to remove individual cards — good UX, but the button is absolutely positioned and may overlap with the card content on small screens.

## `src/lib/components/OpponentArea.svelte`

148. Opponent card backs use inline `className` (wait, this is Svelte so it uses class=) — all cards appear identical with a blue gradient and '?' — no differentiation.

149. Opponent names are hardcoded as "Player 2", "Player 3", etc. — actual player names from room context are not displayed.

150. `currentPlayerIndex` is passed as a prop but the component receives `currentPlayerIndex` which is `$gameState?.currentPlayerIndex ?? 0` — but the opponent's index in the game state is `i + 1`. The component compares `i + 1 === currentPlayerIndex`, which works but is fragile.

151. `-space-x-3` for overlapping opponent cards — creates negative margin that makes cards overlap by 12px. Works in modern browsers but the overlap amount is fixed.

## `src/lib/components/PlayerHand.svelte`

152. `ondragstart` prop is defined but the component's own `handleCardDragStart` is attached directly to the event — the prop callback is never invoked.

153. `CardType` is imported as an alias — unnecessary since `Card` component import doesn't conflict.

154. The drop zone is the full hand area — dropping a card returns it from a meld slot to the hand. But there's no visual indicator that this is a drop target.

155. Cards wrapped in individual `draggable="true"` divs — each card has an extra wrapper div for drag handling, adding DOM depth.

## `src/routes/+page.svelte`

156. `handleQuickMatch` passes `name.trim()` to `quickJoin` — but `quickJoin` in `matchStore.ts` generates a new `playerId` via `crypto.randomUUID()` and does NOT use the `roomPlayerId` store. The `quickJoin` server call uses a new random ID, not tied to any room.

157. `$effect` containing `goto()` for `$matchRoomCode` — the `$effect` block navigates when `$matchRoomCode` changes, but `goto()` returns a Promise that's not awaited. The eslint-disable comment suppresses the warning.

158. `$effect` referencing `$matchRoomCode` — Svelte's `$effect` automatically tracks reactive dependencies. If `$matchRoomCode` is set and then cleared (e.g., by leaving queue), the effect fires again with `null`, causing `goto(\`/room/null\`)`.

Wait, looking at the effect:

```
$effect(() => {
  if ($matchRoomCode) {
    goto(`/room/${$matchRoomCode}`);
  }
});
```

This only navigates when `$matchRoomCode` is truthy. If it changes back to null, the `if` condition is false, so no navigation occurs. Good.

159. `handleJoinRoom` is defined in the page component but the room store's `joinRoom` returns `data.room` — however the type `Room` doesn't have a `room` property. Looking at roomService, `joinRoom` returns `{ room, playerId }`. So `data.room` exists but TypeScript might not know about it if the API response isn't typed.

160. Error state is a single string — can only show one error at a time. If multiple errors occur, only the last one is shown.

161. The `divider` text "OR" between name input and quick match button is confusing — it suggests the user must choose between entering a name and quick match, but the name is required for both.

162. `handleCreate` and `handleJoin` use `goto` with `eslint-disable-next-line` — the rule `svelte/no-navigation-without-resolve` is suppressed twice.

163. `tab` state variable changes trigger `startPolling`/`stopPolling` — clicking the Browse tab starts polling, clicking Create/Join stops it. But `onMount` also starts polling if tab is 'browse', which is handled by the button click handlers. However, if the page mounts with tab='browse' (default is 'create'), polling starts automatically.

## `src/routes/game/+page.svelte`

164. Imports `resolveRoute` from `$app/paths` but could use SvelteKit's `goto` — minor inconsistency.

165. The "Start a Game" link uses `resolveRoute('/')` — navigating to the home page where the game configuration is, but there's no game to resume.

166. No back-navigation when no game is in progress — the user has to click the link, but there's no automatic redirect.

## `src/routes/room/[code]/+page.svelte`

167. `handleDrawPile`, `handleDrawDiscard`, `handleDiscard`, and `handleClose` all use dynamic `import('$lib/engine/game')` — unnecessary runtime dynamic imports for functions that could be statically imported.

168. `getCurrentGS()` creates a new Promise + subscription on every action call — subscribes to the store, resolves on the first value, then unsubscribes. If there's a race between multiple actions, one could get stale state.

169. `handleDiscard` receives `card.id` as a parameter — the card ID is passed directly from the template, but `discardCard` could throw if the card isn't in the player's hand.

170. `handleLeave` calls `reset()` then `goto('/')` — `reset()` stops polling and resets stores, but `goto` is called without `await` (suppressed by eslint).

171. `cardLabel` function is defined in the script but only used within the template — could be inlined or co-located.

172. `isOwner` derived store checks `$room?.ownerId === $pid` — but `$pid` could be an empty string (initial value) which would match if `ownerId` happens to be empty.

173. `myPlayerState` derived store accesses `$gs.players[$idx]` — if `$idx` is -1 (player not found), this accesses `players[-1]` which is `undefined`. The subsequent null check handles it, but the array access is technically out of bounds.

174. Room lobby UI during `'waiting'` status shows the room code badge twice — once in the `<h2>` and once as a `<div class="badge">`.

175. "Leave room" button is always shown — even during an active game, which could cause the player to abandon a game in progress.

176. The game board uses derived stores for `myHand`, `drawCount`, `topDiscard`, `gamePhase` — each creates a separate subscriber to `currentGameState`, which is updated via polling. Four separate reactive chains for one source of truth.

177. The discard pile display renders ALL cards in the discard pile — `{#each $currentGameState.discardPile as card (card.id)}` — for long games, this could render dozens of cards.

178. `Player {$myIndex}` and `Current: Player {$currentGameState.currentPlayerIndex}` display — `$myIndex` is 0-indexed but "Player 0" looks odd. Should be `$myIndex + 1`.

179. Card display uses `cardLabel(card)` which renders `{value}{suit}` — for value 1, it renders `"1♠"` instead of `"A♠"`. Wait, looking at the function:

```
function cardLabel(c: { value: number; suit: string; isJoker?: boolean }) {
  if (c.isJoker) return '★';
  return `${c.value}${c.suit}`;
}
```

Yes, value 1 renders as "1♠", value 11 as "11♠" instead of "J♠". No face card mapping in the room view.

180. Close button text is "Close (Win)" — inconsistent with GameTable's "Close Game".

181. The view switches between `'waiting'`, `'playing'`, and `'finished'` screens — if `roomStatus` is something unexpected, nothing renders (blank page).

## `src/routes/demo/+page.svelte`

182. Uses `resolve` from `$app/paths` but it's imported as `{ resolve }` then called as `resolve('/demo/playwright')` — in SvelteKit, `resolve` from `$app/paths` resolves route paths, but the import is incorrectly named (should be `resolveRoute` or `resolvePath`). Actually let me check SvelteKit docs... in SvelteKit, `$app/paths` exports `base` and `assets`. There's no `resolve` export. This would be a compile error or import error.

Actually wait — looking at the import: `import { resolve } from '$app/paths';` — the `$app/paths` module in SvelteKit exports `{ base, assets }`. There is no `resolve` export. This would fail at runtime or during the build.

Actually, checking SvelteKit 2 docs — `$app/paths` does export `resolveRoute` which was added in SvelteKit 2. But the import here is `resolve` not `resolveRoute`. This is probably wrong.

Hmm, but looking at the usage: `<a href={resolve('/demo/playwright')}>` — this would need `resolveRoute` from `$app/paths`. So this import is incorrect and would cause an error.

183. The demo page just renders a link to `/demo/playwright` — minimal content that's not useful in production.

## `src/routes/demo/playwright/+page.svelte`

184. Single `<h1>` tag — minimal page for E2E test demo with no styling or navigation.

## `src/routes/demo/playwright/page.svelte.e2e.ts`

185. E2E test is placed inside `src/routes/demo/playwright/` — Playwright tests are conventionally in the root `tests/` or `e2e/` directory. Placing inside routes means it might be treated as a route or accidentally served.

## `src/lib/vitest-examples/` (entire directory)

186. Entire `vitest-examples/` directory contains scaffolding/boilerplate code that's never used by actual tests — `greet.ts`, `Welcome.svelte` and their specs are example files that should be removed.

187. `greet.spec.ts` imports from `./greet` (relative path inside vitest-examples) — if this directory is ever deleted, no other code is affected. But leaving it in the codebase is dead weight.

188. `Welcome.svelte.spec.ts` tests a component that's not part of the app — no production code references `Welcome.svelte`.

## `tests/engine/deck.test.ts`

189. `shuffle` test checks `JSON.stringify(shuffled) !== JSON.stringify(deck)` — this can theoretically fail (Fisher-Yates could produce the same order). Probabilistic test with no seed control.

## `tests/engine/game.test.ts`

190. Test uses `(state as GameState).phase = 'discard'` — type cast is needed because `closeGame` expects `phase: 'discard'` but the init phase is `'draw'`. The test mutates game state bypassing the normal flow.

191. `card` helper function uses a simple counter variable `i` for IDs — hard to trace in test failures. Using semantic IDs would help.

## `tests/engine/meld.test.ts`

192. Card IDs use `Math.random()` — non-deterministic IDs make test output unreproducible.

193. Test for "all-sets but mixed partition exists" uses 15 cards of 5 suits (5 sets of 3 same-value cards) — this hand is ALL sets and no sequences, so `canFormValidClose` should fail (requires both set AND sequence). Wait, looking at the test, it expects `true`. Let me check...

The test "accepts hand where first partition is all-sets but mixed partition exists" — the test expects the hand to be valid. But the hand has 5 sets (5, 6, 7, 8, 9) each in 3 suits. No sequence. So `canFormValidClose` requires both a set and a sequence. This test expects `true` but the hand only has sets...

Wait, let me re-check `canFormValidClose`:

```
export function canFormValidClose(hand: Card[]): boolean {
  if (hand.length !== 15) return false;
  const result = findBestMelds(hand, true, true);
  return result !== null;
}
```

`findBestMelds` with `requireSet=true, requireSequence=true` — requires BOTH a set and a sequence in the partition. A hand with only sets would NOT be a valid close.

But the test expects `true` for a hand with 5 sets and no sequences. Let me look at the test data more carefully...

The test:

```
const hand = [
  c('♠', 5), c('♥', 5), c('♦', 5),
  c('♠', 6), c('♥', 6), c('♦', 6),
  c('♠', 7), c('♥', 7), c('♦', 7),
  c('♠', 8), c('♥', 8), c('♦', 8),
  c('♠', 9), c('♥', 9), c('♦', 9),
];
expect(canFormValidClose(hand)).toBe(true);
```

This is 5 sets (threes of a kind) and 0 sequences. `canFormValidClose` requires BOTH a set and a sequence. So this test should FAIL.

But wait — `partitionHand` in `findBestMelds` might partition the 15 cards differently. Maybe it finds 3 sets and 1 sequence? Let me look at `findAllMelds` — it finds all subsets of 3+ cards that form valid melds. In a hand with cards like `♠5, ♥5, ♦5, ♠6, ♥6, ♦6, ...`, could any combination form a sequence?

A sequence requires same suit, consecutive values. `♠5, ♠6, ♠7` could be a sequence. And in this hand we have `♠5, ♠6, ♠7, ♠8, ♠9` — that's 5 consecutive spades! So `findAllMelds` would find:

- Sets: `♠5♥5♦5`, `♠6♥6♦6`, `♠7♥7♦7`, `♠8♥8♦8`, `♠9♥9♦9`
- Sequences: `♠5♠6♠7`, `♠6♠7♠8`, `♠7♠8♠9`, `♠5♠6♠7♠8`, `♠6♠7♠8♠9`, `♠5♠6♠7♠8♠9`

So `partitionHand` can find a partition that includes both sets AND sequences. For example, `♠5♠6♠7` (sequence) + `♠8♥8♦8` (set) + `♠9♥9♦9` (set) + `♥5♦5♥6♦6♥7♦7` — wait, that's 6 cards left... Let me think about this differently.

Actually the partition would be something like: `♠5♠6♠7♠8♠9` (sequence of 5 spades) + 2 sets of 5 cards each. But 15 cards total: if one sequence uses 5 cards, 10 cards remain. `♥5♦5` + `♥6♦6` + `♥7♦7` + `♥8♦8` + `♥9♦9` — these are pairs, not triples. So this doesn't work.

Another partitioning: `♠5♠6♠7` (sequence) + `♠8♠9` + ... no, `♠8♠9` is only 2 cards.

Hmm, `♠5♠6♠7♠8♠9` uses 5 spades. Then:

- `♥5♦5` = 2 cards (incomplete)
- `♥6♦6` = 2 cards (incomplete)
- `♥7♦7` = 2 cards (incomplete)
- `♥8♦8` = 2 cards (incomplete)
- `♥9♦9` = 2 cards (incomplete)

None of these are valid melds on their own (need at least 3). So the 5-sequence doesn't work.

What about: 4 sets + 1 sequence using spades?

- Sets: `♠5♥5♦5`, `♠6♥6♦6`, `♠7♥7♦7`, `♠8♥8♦8` = 12 cards
- Remaining: `♠9♥9♦9` = 3 cards = another set!

That's 5 sets, 0 sequences. Still fails the requireSequence check.

Hmm, let me think... What about using spades partially?

- `♠5♠6♠7` (sequence, 3 cards)
- `♠8♠9♥5` — this wouldn't be a valid set (different values) or sequence (different suits)
- Let me try: `♠5♠6♠7` (sequence) + `♠8♥8♦8` (set) + `♠9♥9♦9` (set) + `♥5♦5♥6♦6♥7♦7` = 6 remaining cards
  - `♥5♦5♥6` — not a set (different values)
  - `♥5♦5` — only 2 cards
  - Hmm, `♥5♦5` + `♥6♦6` + `♥7♦7` — these are pairs, can't make 3-card melds

What about: `♠5♠6♠7♠8` (sequence of 4) + `♠9♥9♦9` (set) + `♥5♦5♥6` — nope.

Let me try: `♥5♦5♠5` (set) + `♥6♦6♠6` (set) + `♥7♦7♠7` (set) + `♠8♠9♦8` — nope, `♠8♠9♦8` is not a set (not same value) or sequence (different suits).

Hmm, this is getting complicated. Let me just check with a different approach. Some melds could use spades in sequences:

- `♠5♠6♠7` (sequence)
- `♠8♠9` — only 2
- `♥5♦5♥6♦6♥7♦7` — only pairs
- `♥8♦8♥9♦9` — only pairs

I don't think there's a valid partition that includes both a set and a sequence with this hand. The test might actually be wrong (expecting true but getting false).

Actually, wait. Let me re-read the comment: "accepts hand where first partition is all-sets but mixed partition exists". The description says the FIRST partition attempt (trying all-sets) fails, but then backtracking finds a mixed partition. Let me think...

If partitionHand tries first with the first card ID, it tries all melds containing that card. If the first card is `♠5`, it tries:

- Set: `♠5♥5♦5`
- Sequence: `♠5♠6♠7`, `♠5♠6♠7♠8`, `♠5♠6♠7♠8♠9`

If it tries the set first, it would try to partition the remaining 12 cards. The remaining cards would be all non-♠5 cards.

Actually, `partitionHand` iterates all melds and tries each one. The order depends on `findAllMelds` output order. Let's see — `findAllMelds` iterates sizes from 3 to hand.length, and for each size, iterates all combinations. The order of combinations from the recursive `combinations` function puts "first-element-first" combinations first.

This is a complex combinatorial analysis. Let me just note it as a potential test bug and move on.

194. Actually the test might be correct if `partitionHand` backtracks enough to find a sequence-based partition. Given the backtracking, it should find any valid partition if one exists. Let me just flag it as a potential issue.

Let me check more pragmatically: with 5 triples of same-value cards across 5 values and 3 suits each, is there always a mixed partition?

Given cards:

```
♠5 ♥5 ♦5
♠6 ♥6 ♦6
♠7 ♥7 ♦7
♠8 ♥8 ♦8
♠9 ♥9 ♦9
```

Possible mixed partition:

- `♠5 ♠6 ♠7` (sequence of 3) → 3 cards
- `♠8 ♥8 ♦8` (set of 8s) → 3 cards
- `♠9 ♥9 ♦9` (set of 9s) → 3 cards
- Remaining: `♥5 ♦5 ♥6 ♦6 ♥7 ♦7` → 6 cards

Can the remaining 6 cards be partitioned into melds?

- `♥5 ♥6 ♥7` (hearts sequence) → 3 cards ✓
- `♦5 ♦6 ♦7` (diamonds sequence) → 3 cards ✓

So the full partition is: `♠5♠6♠7` (seq) + `♠8♥8♦8` (set) + `♠9♥9♦9` (set) + `♥5♥6♥7` (seq) + `♦5♦6♦7` (seq)

This has 3 sequences + 2 sets. Both requireSet and requireSequence are satisfied! So the test IS correct, and the hand can indeed be partitioned with mixed types.

OK so test is fine. Let me continue with actual findings.

195. The `partitionHand` function's backtracking is exponential — for a 15-card hand with many possible melds, it could explore millions of paths.

## `svelte.config.js`

196. `runes` option uses a function that checks `node_modules` — if any Svelte dependency uses runes, it's forced; if not, it's forced `true` for project files. The function returns `undefined` for node_modules, which means "use default" for external libraries.

197. `adapter-node` is used — requires Node.js runtime, can't be deployed to serverless platforms like Vercel or Cloudflare without changes.

## `vite.config.ts`

198. `@vitest/browser-playwright` is imported but the include pattern is `src/**/*.svelte.{test,spec}.{js,ts}` — no Svelte component tests currently exist (the vitest-examples are the only ones, but they're in `src/lib/vitest-examples/` which would be included).

199. The `expect.requireAssertions: true` option means tests must explicitly use `expect.assertions()` or have at least one assertion — if a test fails silently, it's caught. Good practice, but can cause test failures if assertions are conditional.

200. Two separate test projects (`client` and `server`) — the server project includes `tests/**/*.{test,spec}.{js,ts}` and the client project includes `src/**/*.svelte.{test,spec}.{js,ts}`. The `exclude` on the client project prevents engine tests from running in the browser. But the `tests/engine/` directory tests use `$lib/engine/*` imports that depend on SvelteKit's alias resolution — these may fail in the Node environment.

## `eslint.config.js`

201. `no-undef` is off for all files — standard practice with TypeScript, but means global variable typos won't be caught.

202. `@typescript-eslint/no-unused-vars` only ignores vars prefixed with `_` — but the codebase has unused variables without `_` prefix (e.g., `playerName` in `GameStart.svelte`, `hasOpened` in types).

## Cross-cutting Issues

203. **No proper error boundaries** — Svelte components that call game functions (`closeGame`, `discardCard`, etc.) never catch exceptions. A thrown error crashes the component tree.

204. **No loading states for API calls** — `createRoom`, `joinRoom`, `startGame`, etc. have no loading indicators. The UI shows stale state while requests are in flight.

205. **No offline/disconnected state** — all fetch calls silently fail (empty catch blocks). Users see no feedback when the server is unreachable.

206. **Memory leak in polling** — `startPolling`/`stopPolling` pattern is replicated in 3 places (roomStore, matchStore, +page.svelte) with no centralized cleanup. If a component unmounts without calling `onDestroy`, the interval leaks.

207. **TypeScript strict mode is enabled** but several areas use type assertions (`as`, `!`) that bypass type checking — `value: 0 as unknown as Value`, `e.dataTransfer!`, `as 2 | 3 | 4`.

208. **`nanoid` v3** imported — nanoid v3 is CJS-only. With `"type": "module"` in package.json, this could cause import issues depending on the bundler.

209. **No test for `aiTurn` with 3+ players** — all AI tests use 2-player configurations. AI behavior with 3+ players is untested.

210. **Room and matchmaking are in-memory only** — both services lose all state on server restart, meaning MMR ratings, active games, and room queues are ephemeral.

211. **The `docs/superpowers/` directory** contains superpowers documentation that's unrelated to the application code.

212. **`tests/components/` directory is empty** — no component tests exist despite the vitest-browser-svelte setup being fully configured.

213. **No integration tests** — the game flow (draw → discard → AI turn → next player) is only tested in isolation. No test covers the full round-trip through stores and API endpoints.

214. **No error recovery for game state corruption** — if `gameState` becomes corrupted (e.g., missing cards, invalid phase), there's no way to recover without restarting the server.

215. **The MongoDB dependency is unused in practice** — `connectDB()` is called in `hooks.server.ts` but no code actually uses the database. All game data is in-memory. The MongoDB connection is a dead code path that adds latency to every server start.
