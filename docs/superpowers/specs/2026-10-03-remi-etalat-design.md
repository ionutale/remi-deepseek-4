# Remi Etalat — Spec + Implementation Plan

**Repo:** `/Users/ionutale/developer-playground/remi-deepseek-4`
**Date:** 2026-10-03
**Status:** Approved scope; ready for implementation after review.
**Rules of record:** https://ropet.ro/regulament-rummy-remi-etalat-si-pe-tabla/ — the ONLY authority. Other sources are explicitly ignored by the user.

**What this replaces:** the just-shipped "close-mode" game (private board, close declaration, play-to-500). The app shell (auth, rooms, matchmaking, polling sync, visual language, E2E infra) is reused; the game layer (rules engine, board/table semantics, AI, score sheets, meld interactions) is replaced.

**Language:** the entire game UI is **fully Romanian** (home, lobby, table, panels, errors, scoreboard).

---

## 1. Rules of record (ropet.ro, distilled)

### 1.1 Pieces and players

- 106 pieces: values 1–13 in 4 colours — **roșu, galben, albastru, negru** — two copies of each (104), plus **2 jokers** ("joly"/"gioni").
- 2–4 players, play proceeds clockwise ("sens trigonometric").
- Each player has a private rack (board); a shared table holds melds, the **șir** (discard column), the **grămadă** (stock) and the **atu**.

### 1.2 Duble

- A **dublă** = two identical pieces (same value AND colour).
- Categories: **dublă mică** (2–9), **dublă mare** (10–13), **dublă cheie / cui** (1).
- Before play, players announce duble and **swap blindly** (values hidden), small↔small, big↔big, key↔key.
- A player with **3+ duble** may **"strica jocul"** — cancel the deal and reshuffle.

### 1.3 Atu and double game

- The piece left over after the dealing ritual becomes the **atu** (a single visible piece on the table).
- The player holding the **identical piece** (same value+colour) may announce **"atu"** at the start, before their first draw → **+50** at scoring.
- If the atu piece is a **1 or a joker**, it is **"joc dublu"**: every player's final score is **doubled**.

### 1.4 Turn structure

- The first player (the one with 15 pieces) opens the game by **discarding one piece** — no draw. That first discarded piece starts the șir, is placed **sideways** and is **dead for the whole game** (nobody may take it).
- Every other turn: **draw one piece**, optionally **meld**, then **discard one piece**. At end of turn the rack holds at most **14** pieces.
- Draw sources:
  - **stock** (top piece), or
  - **the last piece of the șir** — only allowed if it is used in a formation that same turn (meld or, for a pe-tablă player, on their board), or
  - **the atu piece** — only allowed if it is used in a formation that same turn.
- **Breaking the șir** ("a rupe șirul"): any piece except the first/dead one, only if you are **already melded** and have pieces on your rack to compose the formation, and only if the broken piece is used in a formation that same turn (ropet additionally requires ≥3 pieces on the rack and ≥2 pieces to compose the formation). The broken piece **and all pieces after it** come into your rack.
- **Round 1 rule:** melding is not allowed until the first round completes ("etalarea se face numai dupa ce s-a incheiat prima tura") — i.e., from each player's **second turn** onward.

### 1.5 Formations

- **Suită** (sequence): ≥3 consecutive pieces of the same colour. The **1** may be used as `1-2-3` or `12-13-1`; it can **never** be in the middle (`13-1-2` illegal).
- **Terță** (set): 3 or 4 pieces of the same value in **different colours**.
- **Jokers** substitute any piece, with limits: a formation with **1 joker** needs **≥2 real pieces**; a formation with **2 jokers** needs **≥4 real pieces** and the two jokers **cannot be adjacent**.

### 1.6 Etalare (melding), lipire and joker swaps

- **First meld of the game** must be ≥ **45 points** AND contain at least **one suită** — exception: a **terță of 1s** may be melded without a suită, and other 1-terțe stay for later.
- From the second melding turn onward: melds have no restrictions and players may **lipi** pieces onto **any** table meld (own or opponents'), with the condition that the resulting formation stays valid.
- **Lipit ownership**: pieces you lipi belong to you and are counted for you at scoring (physical face-down marker → digital owner tag).
- **Jokers cannot be lipit to opponents' melds** — only to your own melds.
- **Joker swap**: a table joker may be replaced **once** (ever) by any player holding the **exact piece** the joker substitutes. The replacement goes into the joker's position; the joker goes to the swapping player, who **must use it in a formation that same turn**. A swapped joker **cannot be swapped again** (a joker is played, swapped, reused at most — never a third time).
- **Joker in a 3-terță** (joker + 2 reals): the joker cannot be used/swapped until the terță is completed with the fourth colour; the player who adds the 4th piece may use the joker.

### 1.7 Pe tablă (board mode)

- A player may declare **"joc pe tablă"** within the **first 3 turns** of the game.
- A pe-tablă player:
  - builds formations **privately on their board**, never melding them on the shared table;
  - **cannot lipi pieces to other players' melds** and **cannot use table jokers**;
  - may only take the **last piece of the șir** (never break the șir);
  - risks it all: if **someone else closes first**, they score **−100** like a non-melder.
- The game validates the declared pattern continuously (progress visible); when the pattern is complete, the player **closes** (discards their last piece) and scores the pattern bonus:

| Tip       | Observații                                                                                                                                                  | Punctaj |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Simplu    | suite și terțe, fără restricții (all rack pieces arranged legally)                                                                                          | 500     |
| Bete      | 2 terțe de câte 4 piese + 2 terțe de câte 3 piese                                                                                                           | 700     |
| Mozaic    | suită completă `1…13,1`; nu există 2 piese consecutive de aceeași culoare; primele 4 piese sunt de cele 4 culori; primul 1 are altă culoare decât ultimul 1 | 1000    |
| Bicolor   | 2 suite complete în 2 culori                                                                                                                                | 1200    |
| Duble     | 7 perechi de duble (identice)                                                                                                                               | 1300    |
| Monocolor | suită completă `1…13,1` toate piesele de aceeași culoare                                                                                                    | 1500    |

### 1.8 Closing and end of game

- A player closes when they finish their pieces: the **last discarded piece is the closing piece**.
- If the **stock runs out** before anyone closes, the game ends; **nobody gets the closing bonus**; each player scores melded+lipit minus rack.
- Winner = **most points** (not necessarily the closer).

### 1.9 Scoring (end of game; per player)

- Value of every melded/lipit piece belonging to you: `2–9 = 5`, `10–13 = 10`, `1 = 25`, `joker = 50`.
- **Minus** the value of pieces left on your rack (same value table).
- **+50 closing bonus** for the closer (unless the game ended by stock exhaustion).
- **+50 atu bonus** if you announced atu.
- A player who **never melded** (and didn't play pe tablă): **−100 flat** (rack not counted); if they announced atu: **−50 net** (−100 + 50).
- **Closer discarded a joker** as the closing piece: the closer's total **doubles**.
- **Joc dublu** (atu is 1 or joker): **every** score doubles; combined with a joker close: **×4** for the closer.
- **Pe tablă completion**: the player scores the pattern bonus (500–1500), plus atu if announced, with the double-game multiplier if applicable — instead of the normal meld scoring. Abandoned/failed board player = −100.

---

## 2. Digital interpretations (pinned decisions)

1. **Dealing simplified** (user-approved): shuffle; first player 15, others 14; a **random undealt piece** becomes the visible **atu**. No wall-of-15-piles ritual.
2. **Duble exchange simplified** (user-approved): pre-game phase listing your duble by category; you can put a dublă up for a **blind exchange**; a match is made with another player's offered dublă of the **same category** without revealing values; holding **3+ duble** shows a **"Strică jocul"** button that immediately reshuffles and redeals.
3. **Taking pieces**: last-șir and atu takes are allowed only when the taken piece is used in a formation (**etalezi**) that same turn; for a **pe-tablă** player the last șir take is allowed and the piece goes to their board.
4. **Breaking the șir**: implemented with ropet's conditions (already melded; ≥3 pieces on rack; the broken piece in a formation that turn). The broken piece and every piece after it move to the breaker's rack; the broken piece **must** be melded that turn or the action is rejected.
5. **Lipit ownership** is tracked digitally (owner tag on the piece), replacing the physical face-down marker.
6. **Joker swap**: any player; once per joker; gives the swapper the joker, which must be used in a formation that same turn; swapped jokers cannot be swapped again.
7. **Announcements**: the system auto-displays "mai are 2 piese" when a player reaches ≤2 rack pieces, so ropet's −500 non-announcement penalty never applies.
8. **Round 1**: first player discards only; melding disabled for everyone until the first round has completed (each player has had one turn).
9. **Match format** (user-approved): **single game per score**, session totals kept in the room for information; "Joc nou" deals the next game; MMR (1v1) updates from the per-game winner.
10. **Jokers adjacency** is interpreted positionally for suită; for terță the joker limits are count-based only (no ordering exists).
11. **Pe tablă turn rule pinned**: a pe-tablă player draws one piece per turn and is **not required to discard** — pieces accumulate in their private pattern until it is complete (this is what makes the 14–28-piece patterns reachable; ropet's "cel mult 14 piese" end-of-turn limit applies to normal etalat play only). If someone else closes first: −100.
12. **Both jokers are identical** (the physical set has two identical smiley jokers), so no colour distinction exists in this game; the engine treats them as interchangeable.
13. **Mozaic / Bicolor / Monocolor patterns are natural-only** (no jokers) — they are about colour layout; jokers are rejected there. Simplu/Bete/Duble may use jokers subject to the standard joker limits.
14. **Must-use safety valve**: a taken șir/atu piece that cannot be used in a formation returns to its source when the player discards (the șir regains its suffix in order; the atu returns to its slot); if the taken piece itself is chosen as the discard, the take is fully undone and nothing new joins the șir. On close, still-pending pieces return first and the player closes with the piece that remains. Prevents digital soft-locks (ropet's strict reading would strand turns with no legal move).

---

## 3. Architecture

### 3.1 New engine — `src/lib/engine/remi/`

- `types.ts` — `Color = 'red'|'yellow'|'blue'|'black'`; `Piece { id, value: 1..13 | 0, color, isJoker, jokerType? }`; `Formation { pieces: Piece[], type: 'suite'|'terta', owner, lipitBy?: (owner|null)[] }`; `GameState` v3.
- `pieces.ts` — 106-piece deck, shuffle, deal, atu pick.
- `formations.ts` — `validateSuite`, `validateTerta`, `validateFormation` (joker limits, adjacency, 1-wrap), point values, first-meld validator (≥45 + suită / 1-terță rule).
- `table.ts` — shared table mutators: meld table, șir (dead first piece), stock, atu; ownership bookkeeping.
- `actions.ts` — `drawStock`, `takeLastFromSir`, `takeAtu`, `breakSir`, `meld`, `lipi`, `swapJoker`, `declarePeTabla`, `discard`, `close`.
- `scoring.ts` — end-of-game scoring including atu, non-melder, joker close, double game, pe-tablă bonuses.
- `patterns.ts` — pe-tablă pattern validators (Simplu/Bete/Mozaic/Bicolor/Duble/Monocolor) and progress.
- `ai.ts` — etalat + pe-tablă AI.

### 3.2 State shape (v3, abridged)

```ts
GameState {
  schemaVersion: 3
  phase: 'duble' | 'atu' | 'playing' | 'finished'
  players: {
    rack: Piece[]; melded: boolean;
    peTabla?: { pattern: PatternType; declaredTurn: number; complete: boolean };
    announcedAtu: boolean;
  }[]
  table: {
    melds: Formation[];          // shared, with owner + lipitBy
    sir: Piece[];                // sir[0] = dead first piece
    stock: Piece[];
    atu: Piece | null;
  }
  currentPlayerIndex: number
  turnNumber: number             // global; round = floor over players
  firstPlayerIndex: number
  doubleGame: boolean            // atu is 1 or joker
  scores: number[]               // per game
  sessionTotals: number[]
  gameWinner: number | null
  targetScore: null              // (retired: no series target)
  turnStartedAt: number; revision: number
}
```

### 3.3 UI structure

- `Piece.svelte` (new; replaces Card.svelte) — wooden tile, big coloured number, smiley jokers, sizes.
- `Rack.svelte` — private rack (14 tiles), selection.
- `Table.svelte` / `TableView.svelte` — shared melds (rows), șir column with sideways dead first tile, stock, atu; meld builder with live points + **first-meld ≥45 + suită** indicator; lipi/swap target highlighting.
- `MeldBuilder.svelte` — select tiles → live formation validity, points; confirm.
- Pre-game `DublePanel.svelte`, `AtuPanel.svelte`.
- `PeTablaPanel.svelte` — declaration (first 3 turns), pattern picker, live progress.
- `EndGameSheet.svelte` — per-player breakdown (etalat, lipit, închidere, atu, neetalat, dublu ×2/×4), session totals, "Joc nou".
- All copy in Romanian (glossary §4).

### 3.4 Server

- Re-validate `meld`, `lipi`, `swapJoker`, `close`, `peTabla` actions with the engine; keep revision + turn-ownership.
- Pre-game phases live in room state; MMR from per-game winner.

### 3.5 AI

- Etalat: opening 45+ with suită, lipire, take-last/break decisions, joker use/swaps, closing.
- Pe tablă: pattern planning + completion.
- Mass self-play simulation asserting rule invariants + performance bounds.

---

## 4. Romanian UI glossary (copy deck)

- **Home:** Joacă împotriva calculatorului · Joc online · Creează cameră · Intră în cameră · Caută adversar · Numele tău · Jucători · Începe jocul · Cameră · Cod.
- **Table:** Etalează · Lipire · Lipește · Suită · Terță · Formație · Șir · Grămadă · Atu · Dublă / Dublă mică / Dublă mare / Dublă cheie · Trage · Aruncă · Închide · Pe tablă · Strică jocul · Joc dublu · Rândul tău · Așteaptă · Puncte · Total · Etalat · Lipit · Pe tablă rămase · Anunță atu · Alege piesa · Formație validă / invalidă · Prima etalare (min. 45 puncte + o suită) · Mai are 2 piese.
- **End:** Rezultate · Închidere · Etalat + Lipit · Rămas pe tablă · Neetalat · Bonus atu · ×2 Joc dublu · Următorul joc · Total sesiune.
- **Errors:** Nu este rândul tău · Mutație invalidă · Formație invalidă · Prima etalare are nevoie de 45 de puncte și o suită · Nu poți lipi la adversari încă · Etc.

---

## 5. Implementation phases

### Phase 1 — Engine core

1.1 `types.ts` + `pieces.ts` (106 pieces, 4 colours, 2 jokers; shuffle/deal/atu) + tests.
1.2 `formations.ts`: suite (incl. 1-wrap), terță, joker limits/adjacency, point values, `canOpen` (45 + suită / 1-terță) + exhaustive test matrix.

### Phase 2 — Engine flow

2.1 `table.ts` + state shape v3; șir with dead first piece; stock; atu.
2.2 `actions.ts`: draw sources, take-last/atu with same-turn meld requirement, break-șir conditions, meld, lipi (ownership, own-melds-only jokers), joker swap, discard, round-1 rule, close.
2.3 `scoring.ts`: full matrix incl. non-melder, joker close, double game, stock-out.
2.4 `patterns.ts` + pe-tablă declaration/validation/completion.
2.5 Engine tests for every rule + edge cases.

### Phase 3 — AI

3.1 Etalat AI; 3.2 pe-tablă AI; 3.3 mass self-play simulations (no illegal states, perf bounds).

### Phase 4 — UI

4.1 Tiles (`Piece.svelte`) + rack; 4.2 shared table + șir + stock + atu; 4.3 meld builder + lipi/swap interactions; 4.4 animations + responsive + a11y; 4.5 full Romanian copy pass.

### Phase 5 — Pre-game & endgame

5.1 Duble exchange + "Strică jocul"; 5.2 atu announcement + Joc dublu banner; 5.3 end-game sheet + session totals + next game + MMR.

### Phase 6 — Server & multiplayer

6.1 Action validation (meld/lipi/swap/close/pe-tablă) + pre-game phases over the room API; 6.2 single-player store; 6.3 revision/turn ownership retained.

### Phase 7 — Finish

7.1 E2E (etalat close, pe-tablă flow, duble/atu, scoreboard) in Romanian selectors; 7.2 screenshots; 7.3 README/RO rules doc; 7.4 delete close-mode leftovers (old engine, MeldArea controller, close sheet) and update docs.

---

## 6. Testing plan

- Unit: formation matrix (suite wrap, joker counts/adjacency), first-meld rule, draw/take/break conditions, lipi/ownership, joker swap lifecycle, full scoring matrix (incl. ×2/×4), pe-tablă pattern validators, duble categories/redeal.
- Simulation: thousands of AI self-play games per mode asserting invariants (14-tile rack, no orphan tiles, valid formations at all times) and performance.
- E2E: complete etalat game to close with deterministic doctored states; pe-tablă completion; duble + atu phases; end sheet + next game.
- Visual: regenerated screenshots.

## 7. Risks & mitigations

- **Rule ambiguity** (joker swap wording, șir breaking): pinned in §2; spec is binding.
- **Scope**: two modes + pre-game phases + AI + server; phased delivery with gates per phase.
- **Performance** of formation validation/AI: bounded enumeration + memoization + simulation tests.
- **Replacing shipped code**: keep git history; delete close-mode only in Phase 7 after the new flow passes.

## 8. Out of scope / deferred

Extra-joker purchases (6 jokers/110 pieces variant), tournaments, reconnect/resume, spectators, server-authoritative rule execution (beyond action validation), sound.
