# Icebreaker 2.0 -- QA Testing Brief

---

## 1. Project

| Item | Value |
|---|---|
| **Repo path** | `/Users/christianli/icebreaker 2.0/Icebreaker` |
| **Expo SDK** | 58 (`expo: ~58.0.25`) |
| **React Native** | 0.88.1 |
| **React** | 19.3.1 |
| **Node** | Any version supported by Expo SDK 58 (Node 18+ recommended) |
| **Package manager** | npm (`.npmrc` enforces `legacy-peer-deps=true`) |

### Key commands

```bash
# Install dependencies (the .npmrc already sets legacy-peer-deps=true)
cd "/Users/christianli/icebreaker 2.0/Icebreaker"
npm install

# Start Metro bundler
npx expo start          # interactive mode (press i for iOS)
npx expo start --ios    # launch directly on iOS Simulator
```

### Environment & backend

- **No `.env` file exists.** Supabase credentials are hard-coded in `src/lib/supabase.ts`.
- **Supabase project:** `wmifnqroaruqygrwuqav` at `https://wmifnqroaruqygrwuqav.supabase.co`
- **Anon key:** Legacy JWT format, embedded directly in source.
- **No separate backend server** is required. All networking goes through Supabase (REST + Realtime WebSockets).
- **Auth storage:** `@react-native-async-storage/async-storage` -- sessions are persisted on-device.

### .npmrc requirement

The file `/Users/christianli/icebreaker 2.0/Icebreaker/.npmrc` contains:

```
legacy-peer-deps=true
```

This is **required** because several packages (Reanimated, Skia, NativeWind, etc.) have conflicting peer-dependency ranges under React 19 / RN 0.88. Running `npm install` without this flag will fail.

### Path warning

The project lives inside a directory with a space (`icebreaker 2.0`). Always wrap paths in double-quotes in shell commands. Some tooling (e.g., Metro environment variable interpolation) can break on spaces.

---

## 2. Simulators

### Device UUIDs

The codebase does not reference specific simulator UUIDs, and no scripts or config files specify them. Use whatever iOS Simulator devices are available on the host Mac. You can list them with:

```bash
xcrun simctl list devices available
```

A typical pick for multi-player testing: two instances of "iPhone 16" and/or "iPhone 16 Pro".

### Booting multiple simulators

```bash
# Boot two simulators by UDID (replace with your actual UDIDs)
xcrun simctl boot <UDID_1>
xcrun simctl boot <UDID_2>

# Or open them by name (first available device of that type)
open -a Simulator --args -CurrentDeviceUDID <UDID_1>
open -a Simulator --args -CurrentDeviceUDID <UDID_2>
```

In the Simulator app, use **File > Open Simulator** to have multiple simulator windows on screen simultaneously.

### Installing Expo Go

```bash
# For each booted simulator:
xcrun simctl install <UDID> /path/to/Expo_Go.app

# Or, with Expo CLI (auto-installs if needed):
npx expo start --ios
# Then press Shift+i to pick a specific simulator
```

When Metro is running, press **Shift + i** in the terminal to get a picker listing all booted simulators. Select each one to install and open the app.

### Player identity

Each simulator gets a **unique anonymous Supabase auth account** automatically. The flow in `authStore.initialize()` is:

1. Attempt to restore a persisted session from AsyncStorage.
2. If none, call `supabase.auth.signInAnonymously()`.
3. If anonymous auth is disabled on the Supabase project, fall back to creating a random email account (`player_<random>@icebreaker.local` with a random password).

Because each simulator has its own AsyncStorage sandbox, each simulator will have a different `user.id` and therefore a different player identity. No manual configuration is needed.

### Opening the app URL on each simulator

```bash
# After Metro starts, it prints a URL like exp://192.168.x.x:8081
# Open it on a specific simulator:
xcrun simctl openurl <UDID> exp://192.168.x.x:8081
```

---

## 3. Live Game Rooms

### Room creation flow

When the host taps "Host Game" on the Play tab (`app/(tabs)/play.tsx`), `roomStore.createRoom()` executes:

1. **Generate a 5-character room code** client-side from the charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous characters like 0/O, 1/I).
2. **Insert a row into `rooms` table** with `{ code, host_id: user.id }`. Returns the full room row including the server-generated `id`.
3. **Insert a row into `room_players` table** with `{ room_id, user_id, username, is_host: true }`.
4. **Subscribe to realtime channels** (see below).
5. **Fetch the initial player list.**
6. Navigate to `/lobby`.

### Room code format

- 5 uppercase alphanumeric characters (e.g., `K7XH3`).
- Generated client-side; no server-side uniqueness check beyond a potential DB unique constraint.

### Joining a room

When a player enters a code and taps "Join", `roomStore.joinRoom(code)` executes:

1. Look up the player's username from the `users` table.
2. Query `rooms` where `code = <input>.toUpperCase()` and `status != 'finished'`.
3. Insert into `room_players` with `is_host: false`.
4. If the insert fails with a `uq_room_player` constraint violation, the error is mapped to "You're already in this room".
5. Subscribe to realtime channels and fetch players.

### Realtime channels

Two Supabase Realtime channels are subscribed per room (in `roomStore._subscribe`):

| Channel name | Table | Event | Filter | Purpose |
|---|---|---|---|---|
| `room:<roomId>` | `rooms` | `UPDATE` | `id=eq.<roomId>` | Sync game_state, status, host_id changes to all clients |
| `room_players:<roomId>` | `room_players` | `*` (INSERT, UPDATE, DELETE) | `room_id=eq.<roomId>` | Triggers a full re-fetch of players on any change (join, leave, kick, score update) |

### Host vs player in lobby (`app/lobby.tsx`)

| Feature | Host sees | Player sees |
|---|---|---|
| Room code + copy button | Yes | Yes |
| Player list with online dots | Yes | Yes |
| Kick buttons (X icon per non-host player) | Yes | No |
| "Pick a Game" section (5 game cards) | Yes | No |
| "Waiting for host to start..." message | No | Yes |
| Leave button (back arrow) | Yes (with confirmation alert) | Yes (with confirmation alert) |

### Resetting a room between tests

- **Easiest:** Just create a new room each time. Old rooms can be left in-place.
- **Manual cleanup:** In the Supabase dashboard (Table Editor), delete the row from `rooms` where `code = <your code>`. The `room_players` rows should cascade-delete if there is a foreign key constraint, or delete them manually as well.
- **endGame() resets to lobby:** Calling `endGame()` (host only) sets the room back to `status: 'lobby'`, `game_type: null`, `game_state: {}`. This does NOT delete the room -- it returns everyone to the lobby for another game.

### Host transfer logic

When the host leaves (`roomStore.leaveRoom()`):

1. The host's row is deleted from `room_players`.
2. Query remaining players (`LIMIT 1`, ordered by default/insertion).
3. If remaining players exist:
   - Update `rooms.host_id` to the first remaining player's `user_id`.
   - Update that player's `room_players.is_host` to `true`.
4. If no players remain:
   - Set the room's `status` to `"finished"` (effectively closes it).

---

## 4. Minigames

### 4.1 Nobody's Got Talent (talentShow)

| Item | Detail |
|---|---|
| **File** | `/Users/christianli/icebreaker 2.0/Icebreaker/app/games/talentShow.tsx` |
| **Data file** | `src/data/talentShow.ts` (prompt bank) |
| **How to reach** | Launch app -> username setup (first time) -> Play tab -> Host Game -> Lobby -> tap "Nobody's Got Talent" |

**Rules:**
- Each round shows a creative prompt (e.g., "Name a fictional weapon").
- Players have 30 seconds to type a unique answer.
- After all answers are in (or timer expires), answers are compared.
- If two or more players wrote the **same answer** (case-insensitive, trimmed), all of them score **0** for that round.
- Unique answers score **1 point**.
- Highest cumulative score after all rounds wins.

**Phases:** `intro` -> `answering` -> `reveal` -> `round-end` -> (repeat or) `game-over`

**Rounds:** Fixed at 5 (`TOTAL_ROUNDS = 5`). The host cannot change this.

**Win condition:** Player with the highest cumulative score at `game-over`.

**Timer:** 30 seconds per round. If a player does not submit before the timer, an empty string is auto-submitted. The host also has a "Skip Timer" button to force-advance to reveal early.

**Back to lobby:** Host presses "Back to Lobby" on game-over. Note: `handleBackToLobby` navigates to `/room` (which may be a bug -- the lobby screen is at `/lobby`).

---

### 4.2 1 to 100 (numberGuessor)

| Item | Detail |
|---|---|
| **File** | `/Users/christianli/icebreaker 2.0/Icebreaker/app/games/numberGuessor.tsx` |
| **Data file** | `src/data/numberGuessor.ts` (prompt bank with correct answers) |
| **How to reach** | Play tab -> Host Game -> Lobby -> tap "1 to 100" |

**Rules:**
- Each round shows a trivia question whose answer is a number (0-100).
- Players have 20 seconds to type their guess (numeric input, clamped to 0-100).
- Penalty per round = `|guess - correctAnswer| + seconds_elapsed`.
- No guess (timed out) = 120 penalty points.
- **Lowest** total penalty after all rounds wins.

**Phases:** `intro` -> `setup` -> `guessing` -> `reveal` -> `round-end` -> (repeat or) `game-over`

**Rounds:** Configurable by host during `setup` phase: 5, 10, or 20. Default is 10.

**Win condition:** Player with the **lowest** cumulative penalty at `game-over`.

**Timer:** 20 seconds. Auto-submits a null guess (120 penalty) on expiry. Host auto-advances to reveal when all guesses are in (800ms delay).

---

### 4.3 Pie Charts (pieCharts)

| Item | Detail |
|---|---|
| **File** | `/Users/christianli/icebreaker 2.0/Icebreaker/app/games/pieCharts.tsx` |
| **Data file** | `src/data/pieCharts.ts` (prompt bank) |
| **How to reach** | Play tab -> Host Game -> Lobby -> tap "Pie Charts" |

**Rules:**
- Each round shows a "Who's most likely to..." prompt.
- Players vote for **another player** (cannot vote for themselves -- self is filtered out of the vote list).
- Results are displayed as a horizontal bar chart.
- The player(s) with the most votes earn **1 point** for that round.
- Ties: all tied players each get 1 point.
- Highest score after all rounds wins.

**Phases:** `intro` -> `voting` -> `results` -> (repeat or) `game-over`

**Rounds:** Fixed at 5 (`TOTAL_ROUNDS = 5`).

**Win condition:** Player with the highest cumulative score at `game-over`.

**Timer:** 15 seconds per voting phase. If timer expires, the host auto-advances to results with whatever votes are in. Players who didn't vote simply don't contribute to the tally.

---

### 4.4 Pot Luck (potLuck)

| Item | Detail |
|---|---|
| **File** | `/Users/christianli/icebreaker 2.0/Icebreaker/app/games/potLuck.tsx` |
| **Data file** | `src/data/potLuck.ts` (question bank with difficulty, choices, correctIndex, startingPot) |
| **How to reach** | Play tab -> Host Game -> Lobby -> tap "Pot Luck" |

**Rules:**
- Each round shows a multiple-choice trivia question with a difficulty level (easy/medium/hard).
- Players have 15 seconds to pick an answer.
- Correct answers earn the question's pot value (1-3 points based on difficulty: easy=1, medium=2, hard=3 implied by `startingPot`).
- Wrong or no answer earns 0.
- Question mix: 4 easy, 3 medium, 3 hard (shuffled).
- Highest score after all rounds wins.

**Phases:** `intro` -> `question` -> `reveal` -> (repeat or) `game-over`

**Rounds:** Fixed at 10 (`TOTAL_ROUNDS = 10`). Uses 0-based round indexing internally.

**Win condition:** Player with the highest cumulative score at `game-over`.

**Timer:** 15 seconds. Uses a synchronized `timerEnd` timestamp (unix ms) in game_state so all clients show roughly the same countdown. Host auto-advances to reveal when timer expires or all players answer. Reveal auto-advances to next round after 4 seconds (`REVEAL_DURATION = 4000`).

**Score sync:** On "Back to Lobby", the host syncs game scores to `room_players.score` via `updateScore()`.

---

### 4.5 Blind Ranking (blindRanking)

| Item | Detail |
|---|---|
| **File** | `/Users/christianli/icebreaker 2.0/Icebreaker/app/games/blindRanking.tsx` |
| **Data file** | Categories are hard-coded in the component (not a separate data file) |
| **How to reach** | Play tab -> Host Game -> Lobby -> tap "Blind Ranking" |

**Rules:**
- Each round shows a category with 5 items (e.g., "Best Pizza Toppings": Pepperoni, Mushrooms, Pineapple, Sausage, Olives).
- Players tap items in order from best (#1) to worst (#5). Tapping a ranked item un-ranks it and everything after it.
- After all players submit (or 30s timer expires), the **group consensus** is computed: for each item, average the position across all players, then sort.
- Score per item: `5 - |yourPosition - consensusPosition|`. Total round score is the sum across all 5 items (max 25 per round).
- Highest total score after all rounds wins.

**Categories (hard-coded, 3 total):**
1. "Best Pizza Toppings" (Pepperoni, Mushrooms, Pineapple, Sausage, Olives)
2. "Scariest Animals" (Shark, Spider, Snake, Bear, Crocodile)
3. "Best Superpowers" (Flying, Invisibility, Super Strength, Teleportation, Time Travel)

**Phases:** `intro` -> `ranking` -> `reveal` -> (repeat or) `game-over`

**Rounds:** Fixed at 3 (`TOTAL_ROUNDS = 3`). One category per round, using `categoryIndex = round - 1`.

**Win condition:** Player with the highest cumulative score at `game-over`. Max possible = 75 (25 per round x 3 rounds).

**Timer:** 30 seconds. If timer expires without submission, unranked items are appended in their original order and auto-submitted.

---

## 5. Decisions and Contexts

### 5.1 Core App Flow

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-001 | N/A | Boot | New user | Open app for the first time | Anonymous auth fires, `needsUsername` = true, redirected to `/username-setup` |
| TC-002 | N/A | Username setup | New user | Enter valid username (3-16 chars, alphanumeric + underscore) and tap "Let's Go" | Username saved to `users` table, redirected to `/(tabs)/play` |
| TC-003 | N/A | Username setup | New user | Enter username < 3 chars | Button stays disabled (opacity 0.5), cannot submit |
| TC-004 | N/A | Username setup | New user | Enter username with special characters (e.g., `@#$`) | Input border turns red (inputError style), button disabled |
| TC-005 | N/A | Username setup | New user | Enter a username that is already taken | Alert: "That username is taken" |
| TC-006 | N/A | Play tab | Returning user | Open app with existing session and username | Skips username setup, lands on `/(tabs)/play` |
| TC-007 | N/A | Play tab | Host | Tap "Host Game" | Room created in Supabase, navigated to `/lobby`, room code displayed |
| TC-008 | N/A | Play tab | Player | Enter valid 5-char room code, tap "Join" | Joined room, navigated to `/lobby`, player appears in host's player list |
| TC-009 | N/A | Play tab | Player | Enter invalid/expired room code | Alert: "Room not found" |
| TC-010 | N/A | Play tab | Player | Enter code for a room they are already in | Alert: "You're already in this room" |
| TC-011 | N/A | Lobby | Host | Tap copy icon on room code | Code copied to clipboard, Alert: "Copied!" |
| TC-012 | N/A | Lobby | Host | Tap kick button on a player | Confirmation alert, then player removed from `room_players` |
| TC-013 | N/A | Lobby | Player | Tap back arrow to leave | Confirmation alert "Are you sure?", then removed from room, back to Play tab |
| TC-014 | N/A | Lobby | Host | Leave the room with other players still in it | Host transferred to next remaining player, room stays open |
| TC-015 | N/A | Lobby | Host | Leave the room as the only player | Room status set to "finished" |
| TC-016 | N/A | Lobby | Player | Room status changes to "playing" (host started a game) | Auto-navigated to `/games/<gameType>` |
| TC-017 | N/A | Any | Player | App is backgrounded and foregrounded | Session persists via AsyncStorage, realtime channels should reconnect (Supabase default behavior) |
| TC-018 | N/A | Auth | Any | Anonymous auth is disabled on Supabase project | Fallback: random email signup (`player_<rand>@icebreaker.local`), user still gets a session |

### 5.2 Nobody's Got Talent (talentShow)

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-100 | talentShow | intro | Host | Tap "Start Game" | Phase advances to `answering`, prompt displayed, 30s timer starts |
| TC-101 | talentShow | intro | Player | View intro screen | Sees rules, "Waiting for host to start..." message, no start button |
| TC-102 | talentShow | answering | Player | Type answer and tap "Submit" | Answer stored in `game_state.answers`, UI shows "Answer submitted!", counter increments |
| TC-103 | talentShow | answering | Player | Submit empty answer (tap Submit with no text) | Submit button is disabled when `answer.trim()` is empty -- cannot submit |
| TC-104 | talentShow | answering | Player | Timer expires without submitting | Empty string auto-submitted via `handleSubmit("")` |
| TC-105 | talentShow | answering | Host | All players submit before timer | Phase auto-advances to `reveal` |
| TC-106 | talentShow | answering | Host | Tap "Skip Timer" | All non-submitted players get empty answers, phase advances to `reveal` with scoring |
| TC-107 | talentShow | reveal | All | Two players submit the same answer (case-insensitive) | Both marked as duplicates, both get +0. Others with unique answers get +1 |
| TC-108 | talentShow | reveal | All | All players submit unique answers | All players get +1 |
| TC-109 | talentShow | reveal | All | All players submit the same answer | All marked as duplicates, all get +0 |
| TC-110 | talentShow | reveal | Host | Tap "Continue" | Phase advances to `round-end` (leaderboard) |
| TC-111 | talentShow | round-end | Host | Tap "Next Round" (rounds remaining) | Phase advances to `answering` with new prompt, round counter increments |
| TC-112 | talentShow | round-end | Host | Tap "See Final Results" (round 5 of 5) | Phase advances to `game-over` |
| TC-113 | talentShow | game-over | Host | Tap "Back to Lobby" | `endGame()` called, room resets to lobby status. NOTE: code navigates to `/room` which may not resolve correctly (see bug in section 7) |
| TC-114 | talentShow | game-over | Player | View game-over screen | Sees winner, leaderboard, "Waiting for host to return to lobby..." |
| TC-115 | talentShow | answering | All | Only 1 player in the room | That player's answer is always unique, always scores +1 |
| TC-116 | talentShow | any | All | Tie at game-over (two players with same score) | Both shown at same rank. No tiebreaker logic -- sorted by score descending, order among ties is arbitrary |

### 5.3 1 to 100 (numberGuessor)

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-200 | numberGuessor | intro | Host | Tap "Start Game" on intro | Phase advances to `setup` |
| TC-201 | numberGuessor | setup | Host | Select round count (5/10/20) and tap "Start Game" | Phase advances to `guessing`, prompts shuffled and selected, round 1 begins |
| TC-202 | numberGuessor | guessing | Player | Type "50" and tap send | Guess submitted, "Guess submitted!" shown, guess count increments |
| TC-203 | numberGuessor | guessing | Player | Type "150" and tap send | Value clamped to 100 (`Math.min(100, ...)`) |
| TC-204 | numberGuessor | guessing | Player | Type "0" and tap send | Valid -- 0 is accepted |
| TC-205 | numberGuessor | guessing | Player | Leave input empty, tap send | Submit button is disabled when `guessText` is empty |
| TC-206 | numberGuessor | guessing | Player | Type non-numeric characters | Input strips non-digits via regex `.replace(/[^0-9]/g, "")` |
| TC-207 | numberGuessor | guessing | Player | Timer expires (20s) without guessing | Auto-submits null guess, penalty = 120 |
| TC-208 | numberGuessor | guessing | Host | All players guess before timer | Auto-advances to `reveal` after 800ms delay |
| TC-209 | numberGuessor | reveal | All | View results | Guesses sorted by distance from correct answer, penalties shown |
| TC-210 | numberGuessor | reveal | Host | Tap "Leaderboard" | Phase advances to `round-end` |
| TC-211 | numberGuessor | round-end | Host | Tap "Next Round" | Phase advances to `guessing` with next prompt |
| TC-212 | numberGuessor | round-end | Host | Tap "Final Results" (last round) | Phase advances to `game-over` |
| TC-213 | numberGuessor | game-over | Host | Tap "Back to Lobby" | `endGame()` called, navigated to `/lobby` |
| TC-214 | numberGuessor | guessing | All | Player disconnects mid-round, reconnects | `useEffect` checks `gs.guesses` for existing entry and sets `hasGuessed = true` if found |
| TC-215 | numberGuessor | guessing | All | Only 1 player in the room | Game works -- single player guesses, auto-advances |
| TC-216 | numberGuessor | game-over | All | Tie in penalty scores | Both shown at same position, no tiebreaker |

### 5.4 Pie Charts (pieCharts)

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-300 | pieCharts | intro | Host | Tap "Start Game" | Phase advances to `voting`, round 1 begins |
| TC-301 | pieCharts | voting | Player | Tap another player's name | Vote recorded, selected player highlighted, other buttons dimmed |
| TC-302 | pieCharts | voting | Player | Try to vote for self | Not possible -- self is filtered out of the vote grid |
| TC-303 | pieCharts | voting | Player | Try to change vote after casting | Not possible -- `disabled={!!myVote}`, vote is locked once cast |
| TC-304 | pieCharts | voting | All | Timer expires (15s) with some players not voting | Host auto-advances to results. Non-voters simply have no vote counted |
| TC-305 | pieCharts | voting | All | All players vote before timer | Auto-advances to results after 800ms delay |
| TC-306 | pieCharts | results | All | View bar chart | Bars sorted by vote count descending. Winner(s) marked with star icon |
| TC-307 | pieCharts | results | All | Tie in votes (2 players with same count) | Both get +1 point, both marked as winners |
| TC-308 | pieCharts | results | Host | Tap "Next Round" | Phase advances to `voting` with next prompt, votes reset |
| TC-309 | pieCharts | results | Host | Tap "See Final Results" (round 5) | Phase advances to `game-over` |
| TC-310 | pieCharts | game-over | Host | Tap "Back to Lobby" | `endGame()` called, navigated to `/lobby` |
| TC-311 | pieCharts | voting | All | Only 2 players | Each player can only vote for the other player. Whoever gets a vote wins the round |
| TC-312 | pieCharts | voting | All | Only 1 player | Vote grid is empty (self is filtered out). No one can vote. Timer expires, results show 0 votes for everyone, no points awarded |
| TC-313 | pieCharts | any | Player | Room status changes to "lobby" or "finished" | `router.back()` triggered, player leaves game screen |

### 5.5 Pot Luck (potLuck)

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-400 | potLuck | intro | Host | Tap "Start Game" | Phase advances to `question`, timer starts |
| TC-401 | potLuck | question | Player | Tap a choice | Choice highlighted, checkmark shown, other choices dimmed, "Waiting for others..." shown |
| TC-402 | potLuck | question | Player | Timer expires (15s) without answering | Host auto-advances to reveal. Player gets 0 points for this round |
| TC-403 | potLuck | question | All | All players answer before timer | Host auto-advances to reveal |
| TC-404 | potLuck | reveal | All | View results | Each player's answer shown as correct/wrong/no-answer with icon. Points displayed |
| TC-405 | potLuck | reveal | All | Reveal auto-advances | After 4 seconds, host automatically advances to next question or game-over |
| TC-406 | potLuck | question | Player | Correct answer on a hard question (3 pts pot) | Player earns 3 points |
| TC-407 | potLuck | question | Player | Wrong answer | Player earns 0 points |
| TC-408 | potLuck | game-over | Host | Tap "Back to Lobby" | Scores synced to `room_players`, `endGame()` called, navigated to `/lobby` |
| TC-409 | potLuck | game-over | All | Tie in scores | Both shown, no explicit tiebreaker |
| TC-410 | potLuck | question | All | Only 1 player | Works normally -- single player answers trivia alone |

### 5.6 Blind Ranking (blindRanking)

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-500 | blindRanking | intro | Host | Tap "Start Game" | Phase advances to `ranking`, round 1, category 1 shown |
| TC-501 | blindRanking | ranking | Player | Tap items in order (1 through 5) | Items get numbered badges (1, 2, 3...), lime-colored left border |
| TC-502 | blindRanking | ranking | Player | Tap an already-ranked item | That item and all items ranked after it are un-ranked |
| TC-503 | blindRanking | ranking | Player | Rank all 5 items and tap "Submit Ranking" | Ranking submitted to `game_state.rankings`, waiting message shown |
| TC-504 | blindRanking | ranking | Player | Only rank 3 of 5 items, timer expires | Unranked items appended in original order, auto-submitted |
| TC-505 | blindRanking | ranking | Player | Try to submit with fewer than 5 ranked | Submit button disabled (opacity 0.5) and `disabled={!allRanked}` |
| TC-506 | blindRanking | ranking | All | All players submit | Host auto-computes consensus and round scores, advances to `reveal` |
| TC-507 | blindRanking | reveal | All | View results | Shows group consensus, your ranking comparison ("Exact!" or "Off by X"), round scores |
| TC-508 | blindRanking | reveal | Host | Tap "Next Round" | Phase advances to `ranking` with next category |
| TC-509 | blindRanking | reveal | Host | Tap "See Final Results" (round 3) | Phase advances to `game-over` |
| TC-510 | blindRanking | game-over | All | View final results | Leaderboard with scores out of 75, medal icons for top 3 |
| TC-511 | blindRanking | game-over | Host | Tap "Back to Lobby" | `endGame()` called, navigated to `/lobby` |
| TC-512 | blindRanking | ranking | All | Only 1 player | Consensus = that player's ranking, score = 25 (perfect match with self) |
| TC-513 | blindRanking | game-over | All | Tie in total scores | Both shown, no explicit tiebreaker. Winner highlight goes to first in sort |

### 5.7 Cross-Cutting Edge Cases

| Test Case | Game | Phase | Actor | Action | Expected Result |
|---|---|---|---|---|---|
| TC-600 | Any | Playing | Host | Leaves the app / closes it mid-game | Host transfer logic in `leaveRoom` only runs if `leaveRoom()` is explicitly called. If the app is killed without calling leaveRoom, the host row remains and the room is stuck. There is no heartbeat or presence-based cleanup |
| TC-601 | Any | Playing | Player | Disconnects and reconnects | Realtime channels re-subscribe on reconnect (Supabase default). Local state may be stale -- depends on whether the component re-mounts and re-reads `room.game_state` |
| TC-602 | Any | Playing | Player | Backgrounds app for 30+ seconds | Timer continues locally (setInterval). When foregrounded, local timer may be out of sync with game_state. Pot Luck uses `timerEnd` timestamp for sync; others rely on local countdown |
| TC-603 | Any | Playing | Player | Gets kicked by host mid-game | Player's `room_players` row deleted. Realtime update fires, but no explicit kick-detection in game screens. Player may see stale game state |
| TC-604 | Any | Playing | All | 4 players in room | All games work with any player count. UI scales (FlatLists, flex layouts) |

---

## 6. Testability

### testID and accessibilityLabel audit

**Result: ZERO testID or accessibilityLabel props exist anywhere in the codebase.**

A search across all `.tsx` files in the project returned no matches for `testID` or `accessibilityLabel`. This means **Maestro (or Detox, Appium, etc.) cannot reliably target any UI element by test ID**.

### Screens and components in the project

**App screens (18 files):**
- `app/_layout.tsx` -- root layout
- `app/index.tsx` -- routing/splash
- `app/welcome.tsx` -- welcome screen
- `app/sign-in.tsx` -- sign-in
- `app/sign-up.tsx` -- sign-up
- `app/username-setup.tsx` -- onboarding
- `app/(tabs)/_layout.tsx` -- tab navigator
- `app/(tabs)/play.tsx` -- host/join
- `app/(tabs)/games.tsx` -- games catalog
- `app/(tabs)/profile.tsx` -- profile
- `app/(tabs)/social.tsx` -- social/friends
- `app/lobby.tsx` -- room lobby
- `app/games/[gameType].tsx` -- dynamic game route
- `app/games/numberGuessor.tsx`
- `app/games/talentShow.tsx`
- `app/games/pieCharts.tsx`
- `app/games/potLuck.tsx`
- `app/games/blindRanking.tsx`

**Shared components (6 files):**
- `src/components/AnimatedButton.tsx`
- `src/components/Confetti.tsx`
- `src/components/CountdownBar.tsx`
- `src/components/GlassCard.tsx`
- `src/components/PlayerAvatar.tsx`
- `src/components/SkiaBackground.tsx`

### Recommended testIDs for Maestro automation

The following testIDs should be added as a priority to enable end-to-end testing:

**Username setup (`app/username-setup.tsx`):**
- `testID="username-input"` on the TextInput
- `testID="username-submit-btn"` on the AnimatedPressable

**Play tab (`app/(tabs)/play.tsx`):**
- `testID="host-game-btn"` on the Host Game Pressable
- `testID="room-code-input"` on the room code TextInput
- `testID="join-game-btn"` on the Join Pressable

**Lobby (`app/lobby.tsx`):**
- `testID="room-code-display"` on the room code Text
- `testID="copy-code-btn"` on the copy Pressable
- `testID="leave-room-btn"` on the back arrow Pressable
- `testID="player-list"` on the FlatList
- `testID="game-card-talentShow"` etc. on each GameCard (use `game-card-${game.id}`)
- `testID="kick-player-btn"` on kick Pressables

**Game screens (common pattern for each):**
- `testID="game-intro-start-btn"` on the host's "Start Game" button in intro phase
- `testID="game-timer-text"` on the countdown text
- `testID="game-submit-btn"` on submit/send buttons
- `testID="game-next-round-btn"` on "Next Round" / "Continue" buttons
- `testID="game-back-to-lobby-btn"` on "Back to Lobby" buttons

**numberGuessor specific:**
- `testID="guess-input"` on the numeric TextInput
- `testID="round-option-5"`, `testID="round-option-10"`, `testID="round-option-20"` on setup round selectors

**talentShow specific:**
- `testID="answer-input"` on the creative answer TextInput
- `testID="skip-timer-btn"` on the host's "Skip Timer" button

**pieCharts specific:**
- `testID="vote-player-<userId>"` on each vote button

**potLuck specific:**
- `testID="choice-0"` through `testID="choice-3"` on answer choice buttons

**blindRanking specific:**
- `testID="rank-item-<itemName>"` on each item card
- `testID="submit-ranking-btn"` on the submit button

---

## 7. Debugging

### Metro logs

- Metro logs appear in the terminal where `npx expo start` is running.
- On the iOS Simulator, shake the device (Cmd+Ctrl+Z) or press `Cmd+D` to open the dev menu for "Open JS Debugger".
- `console.log` and `console.error` statements in the code appear in Metro's terminal output.

### Existing console.log / console.error statements

The following debug logging exists in the codebase:

**`src/stores/roomStore.ts`:**
- `console.log("[createRoom] code:", code, "user:", user.id, "name:", playerName)` (line 82)
- `console.log("[createRoom] room created:", room.id)` (line 96)
- `console.log("[createRoom] success!")` (line 108)
- `console.error("[createRoom] No user")` (line 68)
- `console.error("[createRoom] room error:", roomErr?.message)` (line 92)
- `console.error("[createRoom] player error:", playerErr.message)` (line 104)

**`src/stores/authStore.ts`:**
- `console.error("Auth init error:", e.message)` (line 69)

### Supabase Realtime logs

- Go to the Supabase Dashboard > Project `wmifnqroaruqygrwuqav` > **Database > Realtime** to see active subscriptions.
- Use the **Logs Explorer** in the Supabase dashboard (Logs > Edge Functions / Realtime) to see WebSocket connection events.
- On the client side, you can enable Supabase debug logging by passing `{ realtime: { log_level: 'debug' } }` to `createClient()` in `src/lib/supabase.ts`.

### Debug flags / cheat / skip modes

**None.** There are no debug flags, cheat codes, feature flags, or skip modes anywhere in the codebase. No `__DEV__` checks, no debug menus, no game-skip shortcuts.

The host's "Skip Timer" button in talentShow is the closest thing to a debug shortcut -- it lets the host force-end the answering phase early.

### Known bugs and issues

1. **talentShow "Back to Lobby" navigates to `/room` instead of `/lobby`.** In `talentShow.tsx` line 257, `handleBackToLobby` calls `router.replace("/room" as any)`. The lobby screen is at `/lobby`. This will likely cause a blank screen or navigation error when the host tries to return to lobby after a talentShow game.

2. **No heartbeat / presence detection.** If a player or host force-quits the app without calling `leaveRoom()`, their player row remains in `room_players` and the room is never cleaned up. There is no server-side TTL or presence channel to detect this.

3. **Blind Ranking has only 3 hard-coded categories.** If `TOTAL_ROUNDS` were ever increased beyond 3, `CATEGORIES[categoryIndex]` would be `undefined` and the fallback `CATEGORIES[0]` would repeat.

4. **Blind Ranking "Back to Lobby" is available to ALL players, not just host.** In the game-over phase (line 643), the "Back to Lobby" button is rendered unconditionally -- it is not gated by `isHost`. Every player can end the game. This differs from all other games.

5. **Timer drift across games.** numberGuessor, talentShow, and blindRanking use local `setInterval` for their timers. Only potLuck uses a shared `timerEnd` timestamp. This means if a player joins late or reconnects, their local timer may be significantly out of sync with other players.

6. **No validation on room code collisions.** The 5-character code is generated client-side with no uniqueness check. Two hosts could theoretically generate the same code simultaneously. The Supabase insert might fail if there is a unique constraint on `rooms.code`, but the error handling would show a generic failure.

7. **pieCharts: 1-player room is broken.** If only one player is in the room, the vote grid is empty (self is filtered out). The timer runs out, results show zero votes, and no points are ever awarded. The game proceeds through all 5 rounds with no interaction possible.

### Auth fallback mechanism

When `supabase.auth.signInAnonymously()` fails (e.g., anonymous sign-in is disabled in the Supabase project settings), the code falls back to:

```typescript
const rand = Math.random().toString(36).slice(2, 10);
const email = `player_${rand}@icebreaker.local`;
const password = `pw_${Math.random().toString(36).slice(2, 18)}`;
await supabase.auth.signUp({ email, password });
```

This creates a real email-based account with a fake email. The email domain `icebreaker.local` is non-routable, so email confirmation cannot be completed. This works only if the Supabase project has email confirmation disabled.
