# Icebreaker 2.0 — Technical Spec

> Written from the code on branch `qa/fix-round-1` (2026-11-23). If this doc and the code disagree, the code is right.
> `file:line` references point at the working tree as of this date.
> **`QA_TESTING_BRIEF.md` (repo root) is out of date.** It describes earlier game rules, phases and timers and says there are zero testIDs. Don't use it as a rules source.

---

## 1. Overview

Icebreaker is a real-time party-game app for phones in the same room.
- One player **hosts** a room and gets a 5-character code. Friends **join** with that code.
- The host picks one of **7 mini-games** from the lobby.
- Each room's state lives in a single Supabase row (`rooms.game_state`, JSONB). It syncs through Supabase Realtime and is written with client-side compare-and-swap.
- There is no custom backend server.
- All game content (prompts, trivia, items) is **offline and deterministic**: curated tables plus slot generators bundled with the app. A per-device "no-repeat" deck is stored in AsyncStorage.

| Game id (`GameType`) | Display name | Players enforced | Win condition |
|---|---|---|---|
| `talentShow` | Nobody's Got Talent | — | Elimination over 3 rounds, then a final vote |
| `blindRanking` | Blind Ranking | — | Most "best list" votes across a 1/3/5-game series |
| `numberGuessor` | 1 to 100 | — | Lowest total penalty |
| `pieCharts` | Pie Charts | — | No winner; reveal only |
| `tenSecondTasks` | 10 Second Tasks | — | Last player standing |
| `potLuck` | Smarty Pot | — | First to 10 points |
| `auctionDraft` | Bid Wars (`AUCTION_GAME_NAME`) | 2–4 | Most votes for your creation |

---

## 2. Tech stack

From `package.json`. Package manager is **npm** (`package-lock.json`). `.npmrc` sets `legacy-peer-deps=true`, which is required.

| Area | Package | Version |
|---|---|---|
| Runtime | `expo` | ~58.0.25 |
| | `react-native` | 0.88.1 |
| | `react` | ^19.3.1 |
| Routing | `expo-router` | ~58.0.31 (entry `expo-router/entry`) |
| State | `zustand` | ^5.1.0 |
| Backend | `@supabase/supabase-js` | ^2.119.0 (+ `react-native-url-polyfill`) |
| Storage | `@react-native-async-storage/async-storage` | 2.2.0 |
| Animation | `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0, `moti` ^0.30.0, `lottie-react-native` ~7.5.0 | |
| Graphics | `@shopify/react-native-skia` 2.14.0, `react-native-svg` 15.16.0, `expo-linear-gradient`, `expo-blur` | |
| Expo modules | `expo-haptics`, `expo-clipboard`, `expo-image-picker`, `expo-av`, `expo-font`, `expo-constants`, `expo-linking`, `expo-status-bar` | ~58.x |
| Navigation deps | `react-native-screens` ~4.30.1, `react-native-safe-area-context` ~5.11.1, `react-native-gesture-handler` ~3.3.0 | |
| Fonts | `@expo-google-fonts/inter` | Inter 400–800 loaded in `app/_layout.tsx` |
| | `@expo-google-fonts/alatsi`, `exo-2`, `outfit` | installed but not loaded |
| Styling | `nativewind` ^4.2.7 + `tailwindcss` ^3.4.17 | configured; screens use `StyleSheet` + `src/theme.ts` |
| Dev | `typescript` ~6.0.3, `@types/react` ~19.3.0 | |

**`app.json`**
- name/slug `Icebreaker`, scheme `icebreaker`, portrait only, `userInterfaceStyle: "dark"`
- iOS bundle id / Android package: `com.icebreaker.app`
- plugins: `expo-router`, `expo-status-bar`
- No `ios/` or `android/` folders: native projects are generated (Continuous Native Generation).

**Supabase config**
- URL and anon key are hard-coded in `src/lib/supabase.ts`. There is no `.env`.
- The client persists the session to AsyncStorage with `autoRefreshToken: true` and `detectSessionInUrl: false`.

---

## 3. Folder structure

```
app/                       Expo Router routes (every file is a screen)
  _layout.tsx              Root Stack, font loading, animated intro splash, auth init
  index.tsx                Redirect gate (welcome / username-setup / tabs)
  welcome.tsx              Landing (SkiaBackground) → sign-up / sign-in
  sign-in.tsx, sign-up.tsx Email/password auth (optional; anonymous is default)
  username-setup.tsx       First-run username picker
  lobby.tsx                Room lobby (code, players, kick, game picker)
  (tabs)/_layout.tsx       Bottom tabs: Play, Games, Profile (Social hidden)
  (tabs)/play.tsx          Host a game / join with code
  (tabs)/games.tsx         Game catalogue (display only)
  (tabs)/profile.tsx       Avatar, stats, milestone progress
  (tabs)/social.tsx        "Coming soon" placeholder (hidden from tab bar)
  games/[gameType].tsx     Fallback "loading" screen for unknown game ids
  games/<gameId>.tsx       One screen per game (7 files)
src/
  lib/supabase.ts          Supabase client
  stores/authStore.ts      Session, profile, stats (Zustand)
  stores/roomStore.ts      Rooms, players, realtime, CAS writes (Zustand)
  theme.ts                 Design tokens
  components/              Shared UI (see §7)
  utils/deck.ts            Seeded RNG + device no-repeat picker
  utils/rank.ts            competitionRanks / ordinal / joinNames
  data/                    Content banks per game (pure TS, Node-importable)
  data/gen/                Deterministic slot generators
  data/bank/               Bid Wars item bank + recipe engine
scripts/                   Node verification scripts (run with tsx)
supabase/schema.sql        Full schema (idempotent)
supabase/migrations/       001 (host-kick RLS), 002 (merge RPC); see §5.5
```

---

## 4. Navigation and auth

### 4.1 Routes (Expo Router)

The root is a `Stack` with `headerShown: false` and `slide_from_right` (`app/_layout.tsx`). The Stack only mounts once fonts are loaded and `authStore.loading` is false. An intro splash (lightning bolt changes green → purple, then the "Icebreaker" title) stays up for at least 2.4 s and fades out over 350 ms.

| Route | Purpose / transitions |
|---|---|
| `/` (`index.tsx`) | When auth finishes loading: no user → `/welcome`; `needsUsername` → `/username-setup`; otherwise → `/(tabs)/play` |
| `/welcome` | "Get started" → `/sign-up`; "Sign in" → `/sign-in` |
| `/sign-in` | `supabase.auth.signInWithPassword` |
| `/sign-up` | `supabase.auth.signUp`, then the "Check your email" alert |
| `/username-setup` | Validates `/^[a-zA-Z0-9_]{3,16}$/`, calls `authStore.setUsername`. On a duplicate: "That username is taken". Then → `/(tabs)/play` |
| `/(tabs)/play` | Host: `createRoom()` → `/lobby`. Join: `joinRoom(code)` → `/lobby`. Errors are shown in an Alert |
| `/(tabs)/games` | Catalogue with "Tonight's pick" (Blind Ranking). Cards only fire haptics; they don't navigate |
| `/(tabs)/profile` | Avatar upload to Storage bucket `avatars/<uid>/avatar.<ext>` (falls back to the local URI on failure). Stats: Games / Wins / Trophies (Trophies is always 0). Milestones at 5/10/25/50/100 wins |
| `/(tabs)/social` | Placeholder (`href: null`) |
| `/lobby` | See §5.3 |
| `/games/<id>` | Pushed by the lobby when `room.status === "playing"`. Static files take precedence over `[gameType].tsx` |

### 4.2 Auth (`src/stores/authStore.ts`)

**State:** `session, user, username, avatarUrl, wins, gamesPlayed, loading, needsUsername`.

`initialize()` runs once from the root layout:
1. Restore the session from AsyncStorage.
2. If there's no session, call `signInAnonymously()`. If that fails, sign up a throwaway account `player_<rand>@icebreaker.local` with a random password (this only works when email confirmation is off).
3. Load `users` (`username, wins, games_played, avatar_url`). `needsUsername = !profile.username`.
4. Subscribe to `onAuthStateChange`.

**Actions**

| Action | What it does |
|---|---|
| `setUsername` | Upserts `users{id, username, username_lower}`. The unique `username_lower` constraint prevents duplicate names |
| `incrementWins`, `incrementGamesPlayed`, `setAvatarUrl` | Update local state first, then write `users`. Errors are only logged |
| `signOut` | Clears all fields |

Each game screen bumps the stats once per mount on its game-over screen, using a `trackedGameRef` that is never reset (see §10).

---

## 5. Rooms and multiplayer

### 5.1 Supabase tables (`supabase/schema.sql`)

| Table | Key columns | RLS (role `authenticated`) | Realtime |
|---|---|---|---|
| `users` | `id` (FK `auth.users`), `username`, `username_lower` (UNIQUE), `avatar_url`, `trophies`, `wins`, `games_played`, `is_online`, `last_seen_at` | read: all; insert/update: own row | — |
| `rooms` | `id`, `code` (UNIQUE), `host_id` → users, `status` ∈ `lobby\|playing\|finished`, `game_type`, `game_state jsonb` default `{}`, `created_at`, `updated_at` | read: all; insert: `host_id = auth.uid()`; **update: anyone**; delete: host | ✅ |
| `room_players` | `id`, `room_id` (cascade), `user_id`, `username`, `score`, `is_host`, `joined_at`; UNIQUE `uq_room_player(room_id,user_id)` | read: all; insert: own; update: anyone; delete: self **or room host** | ✅ |
| `friend_requests` | sender/receiver, status `pending\|accepted\|declined`; unique pending pair | sender/receiver | — |
| `friends` | bidirectional pairs, kept in sync by triggers | own rows | — |
| `game_invites` | sender/receiver, `room_code`, status | sender/receiver | — |
| `notifications` | `type` ∈ friend_request/friend_accepted/game_invite; filled by triggers | own rows | — |

There is also a helper function `generate_room_code()`, which the client doesn't use (it generates codes itself). Friends, invites and notifications exist in the schema, but there's no UI for them yet (Social is a placeholder).

### 5.2 `roomStore` (`src/stores/roomStore.ts`)

**State:** `room, players, isHost, loading, error, kicked, _leaving, _roomChannel, _playersChannel`.

| Action | Behaviour |
|---|---|
| `createRoom()` | Generates a 5-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no uniqueness pre-check; the UNIQUE constraint rejects a collision). Inserts `rooms{code, host_id}`, then `room_players{is_host:true}`. Then `_subscribe` + `_fetchPlayers` |
| `joinRoom(code)` | Reads the username from `users`. Finds the room by `code.toUpperCase()` with status ≠ `finished` ("Room not found"). Inserts `room_players`. A `uq_room_player` violation shows "You're already in this room" |
| `leaveRoom()` | Sets `_leaving`, deletes own `room_players` row. **If you were the host:** the first remaining row (`limit 1`) becomes `rooms.host_id` and gets `is_host=true`; if nobody is left, `status='finished'`. Then `cleanup()` |
| `kickPlayer(userId)` | Host only. Deletes that player's row with `.select()`. Throws if 0 rows were deleted (RLS not allowing it), then refetches |
| `startGame(type)` | `status:'playing', game_type, game_state:{phase:'starting', game:type}`, new `updated_at`. Returns false if 0 rows were written |
| `updateGameState(gs)` | Blind overwrite (legacy; games use `mutateGameState`) |
| `mutateGameState(fn, maxRetries=8)` | **Compare-and-swap**, see §5.4 |
| `updateScore(uid, Δ)` | Writes `room_players.score` (games mostly keep scores in `game_state`) |
| `endGame()` | Host only. `status:'lobby', game_type:null, game_state:{}`, and applies that change locally right away so screens don't act on the old "playing" status |
| `refreshRoom()` | Refetches the room row. Ignores stale responses (`roomFetchSeq`) and never moves back to an older `updated_at` |
| `cleanup()` | Removes both channels and resets state |

**Realtime channels (`_subscribe`)**
- `room:<id>`: `UPDATE` on `rooms` filtered `id=eq.<id>`. Replaces `room` and recomputes `isHost` from `host_id`. Bumps `roomFetchSeq` so any in-flight refresh is discarded. **On every `SUBSCRIBED`** (first connect and each reconnect) it calls `refreshRoom()`.
- `room_players:<id>`: `UPDATE` (filtered by room); `INSERT` and `DELETE` are **unfiltered** because filtered delivery proved unreliable. Every event triggers `_fetchPlayers` (ordered by `joined_at`). It also refetches on `SUBSCRIBED`.

**Ordering and kick detection**
- `_fetchPlayers` only applies the newest response (`playersFetchSeq`).
- If your own row is missing *after* you have been seen in this room this session, and you aren't leaving, the store runs `cleanup()` and sets `kicked=true`. The lobby then shows "You were removed from the room".

### 5.3 Lobby (`app/lobby.tsx`)

- Shows the room code with a Copy button, and players with a HOST/JOINED label. The host gets a kick button on every non-host row.
- **Host:** "Pick a game" list of all 7 games. Tapping one calls `startGame` directly.
- **Non-host:** "Waiting for the host to start…".
- **Navigating into a game:** when `status==='playing'` and the screen is focused, it pushes `/games/<game_type>` once per `room.id:game_type`.
- **Missed-update fallback (non-host, focused, status lobby):** `refreshRoom()` every **4 s**, and again whenever the app comes back to the foreground.
- If `room` becomes null, it goes back to `/(tabs)/play`.
- Each game screen goes back (`router.back()` or `/lobby`) when the status becomes `lobby` or `finished`.

**`GameHeader`** (used by every game):
- Host: "End Game" (`endGame`, back to the lobby) and "Leave Room".
- Everyone else: "Leave".

### 5.4 Writing `game_state` safely: `mutateGameState`

1. Read the **fresh** `game_state, updated_at, status` from the server. If `status !== 'playing'`, return false.
2. `next = mutator(fresh.game_state)`. If it returns null or undefined, abort with no write. This is how games guard phase transitions: each mutator re-checks `phase`, `seq`, etc.
3. Pick `newUpdatedAt = max(now, prev+1ms)`.
4. `UPDATE … WHERE id=? AND updated_at=<value read>`. If 0 rows changed, someone else wrote first: back off 20–120 ms and go back to step 1 (up to 9 attempts).
5. On success, apply the change locally right away (realtime confirms it later).

Consequence: **mutators can run more than once.** Side effects inside a mutator (e.g. `markUsed` on the deck) can repeat. See §10.

### 5.5 Migrations

| File | Content | Status |
|---|---|---|
| `001_rp_delete_host_kick.sql` | Replaces the `rp_delete` policy so the host can delete other players' rows (kick). `schema.sql`'s `IF NOT EXISTS` guards won't replace an existing policy on a live project | Header: "NOT YET APPLIED – requires owner approval". `schema.sql` already has the new policy for fresh installs |
| `002_game_state_merge_rpc.sql` | `merge_game_state_entry(room, path[], value)`: atomic server-side JSONB merge | **Not applied**; optional. The app doesn't call it (CAS is used instead) |

---

## 6. Common game patterns

- **Lifecycle:** `startGame` writes `{phase:'starting'}`. The host's mount effect turns that into the game's initial state (usually `intro`). Screens render `GameLoadingScreen` until that happens.
- **Host authority:** in almost every game, only the host moves phases forward and tallies. Players write only their own entries (vote, guess, bid…) through CAS. Host-only effects depend on `isHost`, so **if the host leaves properly**, `leaveRoom` promotes the next player and their client takes over.
- **A host that is killed or backgrounded freezes every game except Bid Wars during the auction** (§8.7). There is no presence or heartbeat.
- **Counting who's present:** most "everyone has submitted" checks count only submitters still in `players` (`countInRoom`) and compare against `players.length`.
- **Game over:** the host gets **Play Again** (`startGame(sameGame)`) and **Back to Lobby** (`endGame`). Other players see `HostWaitingPill` ("Waiting for host…").
- **Ranking ties:** `competitionRanks` gives "1224" ranking; `joinNames` builds "A, B & C" for tie banners.
- **Timers:** most countdowns run locally per client (`setInterval`). Talent Show, 10 Second Tasks and Bid Wars store `timerEnd`/`deadline` (epoch ms) in `game_state`.

---

## 7. Design system

### 7.1 Tokens (`src/theme.ts`)

| Group | Tokens |
|---|---|
| Backgrounds | `background #0E0C1A`, `bgPurple #1D182D` (lobby), `bgPurpleTop #221A35`, `bgPurpleBottom #1A1527`, `surface #1A1730`, `surfaceLight/border #2A2745`, `tabBar #100E18` |
| Primary | `lavender #BAA2F9` (main accent), `lavenderPill #C9B8F1`, `onLavender #1A1427` (text on lavender), `primary #6D5ACD`, `primaryLight #9B8FDB`, `primaryDark #5240A8`, `highlight #B8AEE8`, `highlightSoft` |
| Cards | `card/cardFill #231C31`, `cardRaised #2A2140`, `cardBorder/cardEdge rgba(186,162,249,.14)` |
| Accents | `lime #C4F04D`, `peach #F8D2C0`, `gold #D4A843`, `goldLight`, `goldStat #F0C66A`, `goldTile #F8D293`, `accent #06B6D4`, `joinedGreen #6FD8A4` |
| Status | `danger #EF4444`, `success #10B981`, `warning #F59E0B` |
| Greys | `white`, `gray300…gray600` |
| `fonts` | `regular/medium/semibold/bold/extrabold` → Inter 400/500/600/700/800 |
| `radii` | sm 10, md 14, lg 20, xl 24, pill 999 |
| `spacing` | xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, `screen` 24 |
| `gradients` | `hero`, `primaryButton`, `card`, `profileCard`, `cardBorder`, `highlightBlob`, `gold` (golden buzzer), `screenGlow`, `screenBase`, `inviteCard`, `heroDarkButton`, `taskCard`, `avatarTile`, `rowGold/rowTeal/rowPink/rowPurple` (per-game row tints) |
| `type` | `eyebrow` (11 pt bold uppercase), `title` (34 pt extrabold), `subtitle` (15 pt grey) |

### 7.2 Shared components (`src/components`)

| Component | Purpose | Used by |
|---|---|---|
| `ScreenBackground` | Static purple vertical gradient with a lavender glow at the top | Most screens |
| `SkiaBackground` | Animated Skia shader "aurora" | `welcome.tsx` |
| `GradientCard` | Dark rounded card with a 1px gradient edge and a faint inner sheen. Props: `fill`, `borderColors`, `radius`, `style`, `contentStyle` | Everywhere |
| `HeroGradient` | Lavender → violet diagonal hero card with a white highlight | Tabs, game intros |
| `PrimaryAction` / `PrimaryActionBar` | Full-width lavender button (variants, icon left/right, `testID`). The bar pins actions to the bottom with safe-area padding and optional helper text | All game footers, lobby |
| `RoomToolbar` | In-room top bar: pill back button, centred uppercase title, optional menu or right slot | Lobby, `GameHeader` |
| `GameHeader` | Game toolbar. Host: End Game + Leave Room. Others: Leave. Shows the room code | All 7 games |
| `GameLoadingScreen` | Placeholder while the phase is `starting` | All 7 games |
| `HostWaitingPill` | Non-host "Waiting for host…" pill on game-over screens (QA matches `/Waiting for host.*/`) | All 7 games |
| `CountdownBar` | Animated bar with seconds text; props `seconds, onExpire, paused, color` | Bid Wars |
| `AppHeader` | Tab header: bolt tile, "Icebreaker" wordmark, gear button | Play/Games/Profile |
| `Eyebrow` | Small uppercase label (tones) | Everywhere |
| `Pill` | Small rounded badge (tones, optional tilt) | Everywhere |
| `PlayerAvatar` | Initial avatar tile from the username | Lobby, games |
| `AnimatedButton`, `GlassCard`, `Confetti` | Legacy (blur card, spring button, confetti burst) | **Not imported anywhere** in `app/` |

---

## 8. Games

Each section covers rules, phases, `game_state`, host duties, timers, scoring and edge cases. "Host-only" means the work is done in the host's effects and there's no fallback unless one is stated.

### 8.1 Nobody's Got Talent — `talentShow` (`app/games/talentShow.tsx`)

**Rules:** three rounds.
- **Round 1, Auditions:** everyone performs a 30 s prompt. Each audience member can give one buzz or one golden buzz. A majority either way ends the act immediately.
- **Round 2, Semifinals:** survivors perform again and everyone picks 2 players for the finals.
- **Round 3, The Finals:** 2 finalists perform and everyone votes for a winner.
- Ties go to a 10 s tiebreak performance plus a vote.

**Phases:** `intro` → `round-intro` → `prep` → `performing` → (R1: `r1-neutral-vote` when needed) → `r1-result` → … → `r2-voting` → [`tiebreak-prep` → `tiebreak-performing` → `tiebreak-vote`] → `r3-voting` → `winner`

| Phase | Who acts |
|---|---|
| `intro`, `round-intro` | Host taps Start / Continue |
| `prep` | **Only the current performer** taps "Start!", which sets `timerEnd = now + timerDuration` |
| `performing` | R1: audience Buzz / Golden. R2/R3/tiebreak: performer can tap "I'm done" (sets `timerEnd=now`) |
| `r1-neutral-vote` | Only players who neither buzzed nor golden-buzzed vote Advance or Eliminate |
| `r1-result` | Host Continue → next performer or end of round |
| `r2-voting` | Each player picks exactly 2 (self allowed) |
| `tiebreak-vote`, `r3-voting` | One pick each |
| `winner` | Winner and runner-up. Host: Play Again / Back to Lobby |

**game_state** (`:59-105`):
```ts
{ phase; game; round: 1|2|3; prompt; timerEnd: number|null; timerDuration /*ms*/;
  performerQueue: string[]; currentPerformerIdx; buzzedPlayerIds; goldenPlayerIds; totalVoters /*unused*/;
  r1Results: {playerId, playerName, outcome:"advanced"|"eliminated"|"golden", buzzCount, goldenCount}[];
  eliminatedPlayerIds; r1NeutralVoterIds; r1NeutralVotes:{voterId, decision}[]; r1NeutralSubmittedIds;
  r2Results /*= R2 performer list*/; r2VoterIds; r2Votes:{voterId, voteFor}[]; r2SubmittedVoterIds;
  tiebreakerCandidates; tiebreakerSpotsNeeded; tiebreakerAlreadyAdvanced; tbVotes; tbSubmittedVoterIds; tbVoterIds;
  r3FinalistIds; r3Results; r3Votes; r3SubmittedVoterIds; r3VoterIds; winnerId; runnerUpId }
```

**Host duties:**
- Initialise, shuffling everyone into `performerQueue`.
- Intro and round-intro advances.
- Handle timer expiry.
- Every tally: neutral vote, R2, tiebreak, R3.
- Advance from `r1-result`.

**Timers:**
- Performance is 30 s; tiebreak is 10 s.
- Only the host's effect acts on expiry. The display re-renders every 250 ms.
- No timers on prep, voting or results.

**Scoring and outcomes:**
- **R1 threshold** is `ceil(liveVoters/2)`, where `liveVoters` = players present minus the performer. Reaching it on buzzes eliminates; reaching it on goldens advances (golden).
- **R1 on expiry:** if nobody is neutral, the performer advances when goldens ≥ buzzes. Otherwise the neutral vote decides: advance if goldens + advance votes ≥ buzzes + eliminate votes, so **a tie favours the performer**.
- **End of R1:**
  - 0 survivors: everyone is revived.
  - 1 survivor: wins outright, no runner-up.
  - 2 survivors: skip to the finals.
  - 3 or more: go to R2.
- **R2:** the top 2 by votes go through. Players tied at the cut-off go to a tiebreak for the remaining spots.
- **R3:** a tie goes to a tiebreak. A tie *within* a tiebreak is broken by stable sort order (queue order).
- No points. Only the winner gets `incrementWins`.

**Edge cases:**
- Voting phases wait for every player in a voter snapshot. **A voter who leaves stalls the game.**
- A queued performer who leaves stalls the game at `prep`, because only they can press Start.
- Late joiners can buzz and are added to voter snapshots taken after they join.
- With 1 player the threshold is 0, so they win on expiry. With 2 players, a single buzz eliminates.

**Content:**
- R1/R2 prompts: curated + `gen/talentGen.ts` = **1,979** unique (curated 299 kept of 305 after normalised dedupe).
- Tiebreak pool: **111**. Finals pool: **111**.
- Deck keys: `ngt`, `ngt:tb`, `ngt:final` (id = hash of the prompt text).

**testIDs:** none.

### 8.2 Blind Ranking — `blindRanking` (`app/games/blindRanking.tsx`)

**Rules:**
- The host picks a category, a size (Top 5 or Top 10) and a series length (1, 3 or 5 games).
- Items appear one at a time. Each player locks the current item into an empty rank slot without seeing what comes next. No take-backs.
- After the reveal, everyone votes for the best list other than their own. Everyone tied on the most votes gets +1 series point.

**Phases:** `intro` → `setup` (host-only) → `playing` → `reveal` → `voting` → `vote-results` → (next game: `setup` | `game-over`)

| Phase | Details |
|---|---|
| `setup` | Step 1: category grid (55 built-in, the host's custom ones, or "Make Your Own" with at least 5 items). Step 2: size (only sizes with enough items). Step 3 (game 1 only): rounds 1/3/5. For games 2..N, picking a size starts the game |
| `playing` | Tap an empty slot for the current item. **No timer** |
| `reveal` | Side-by-side lists. "Most Divisive" (spread ≥4 for Top 10, ≥2 for Top 5) and "Everyone Agrees" (spread ≤1), top 3 of each |
| `voting` | Vote for another player's list; self-votes blocked |
| `vote-results` | Vote ranking, plus series scores when `totalGames>1` |
| `game-over` | Winner card and standings |

**game_state** (`:42-61`):
```ts
{ phase; game; categoryKey /*bank key | "custom:<id>"*/; categoryLabel; categoryEmoji; size: 5|10;
  draw: string[]; currentRound /*item idx*/; placements: Record<uid,(string|null)[]>; roundSubmitted: string[];
  rankings /*unused*/; votes: Record<voterId,voteeId>; votedPlayerIds; totalGames; currentGame; brScores: Record<uid,number> }
```

**Host duties:**
- Setup, including drawing items on the host's device.
- Moving to the next item once present submitters ≥ `players.length`.
- Auto-tallying votes once everyone has voted.
- All click-through advances.

**Timers:** none.

**Ties:**
- All co-leaders get the series point.
- Standings use `competitionRanks`, sorted by score then username.
- The game-over headline shows `sorted[0]`, the alphabetically first co-leader.
- `incrementWins` goes to everyone tied at the max score (if above 0).

**Edge cases:**
- Leavers don't block progress, but their column and their votes remain.
- **A late joiner stalls `playing`:** they have no `placements` entry, so they can't place, but they still count in `players.length`.
- With 1 player, voting stalls because there's nobody to vote for.

**Content:**
- `src/data/blindRankingBanks.ts`: **55 categories, 2,131 items** (min 36 per category).
- Drawn with `drawFresh("br:<categoryKey>", …, cap 200)`.
- Custom categories are saved in the host's AsyncStorage `br_custom_categories` and drawn with a plain shuffle (no no-repeat).

**testIDs:** none.

### 8.3 1 to 100 — `numberGuessor` (`app/games/numberGuessor.tsx`)

**Rules:** each round is a trivia question with a numeric answer from 0 to 100. Players have 20 s to guess.
- Penalty = `|guess − answer| + round(seconds taken)`.
- No guess = 120.
- Lowest total penalty wins.

**Phases:** `intro` → `setup` (host picks 5, 10 or 20 rounds; default 10) → `guessing` → `reveal` → `round-end` → … → `game-over`

**game_state** (`:41-66`):
```ts
{ phase; totalRounds; currentRound /*1-based*/; promptIds: string[];
  currentPrompt: {id, text, correctAnswer, category} | null;
  guesses: {userId, username, value: number|null, timeMs, timedOut}[];
  roundResults: {promptId, promptText, correctAnswer, guesses}[];
  penalties: Record<uid, number>; roundStartedAt /*host epoch ms*/ }
```
`advanceToSetup` replaces the state with `{phase:"setup"}`, which drops `game`.

**Host duties:**
- All transitions, each guarded on phase and round.
- When present guesses ≥ `players.length`, wait **800 ms** then reveal.
- Calculate penalties from the fresh state. Players who are present but never guessed get +120.

**Timer:**
- 20 s, local per client. At 0 the client submits `{value:null, timedOut:true}`.
- The host never forces a reveal. **A backgrounded or disconnected player who is still in the room stalls the round.**
- `timeMs` uses the client's clock minus the host's `roundStartedAt`, so clock skew affects the penalty.

**Input:** digits only, up to 3 characters, clamped to 0–100. Submit is disabled while the field is empty.

**Ties:** competition ranks. The game-over banner reads "A & B tie!". Every player at the minimum penalty gets `incrementWins`.

**Edge cases:**
- Leavers drop out of counts and the leaderboard.
- Late joiners start accumulating penalty only from the rounds they're present for, which is an advantage.
- On reconnect, an existing guess restores the "guessed" state.

**Content:**
- **840** prompts: 299 curated + `gen/numberGuessorGen.ts` (atomic numbers, Roman numerals, alphabet positions, month and day maths, unit conversions, facts…).
- Categories: math 360, science 182, sports 71, nature 62, geography 55, history 44, food 40, pop_culture 26.
- Deck key: `ng`.

**testIDs:** `ng-guess-input`, `ng-submit-guess`.

### 8.4 Pie Charts — `pieCharts` (`app/games/pieCharts.tsx`)

**Rules:** players vote "Who's most likely to…" for each question. Self-votes are allowed, and a vote can't be changed. All questions are voted on first. Then each result is revealed as a donut chart, followed by a summary. **No scoring and no winner.**

**Phases:** `intro` → `setup` (host: question count, custom questions) → `question-intro` → `voting` → (next question … ) → `reveal` (`revealStage`: `suspense` → `revealed`, per `revealIdx`) → `final-results`

**game_state** (`:55-64`):
```ts
{ phase; game; questions: {id, text, isCustom?}[]; questionIdx; submittedVoterIds: string[];
  allVotes: {questionIdx, voterId, voteeId}[]; revealIdx; revealStage: "suspense"|"revealed" }
```

**Host duties:**
- Initialise and run every transition.
- Auto-advance once present voters ≥ `players.length`.
- Step through the reveal.

**Timers:** none. A present player who never votes stalls the game, and the host has no button to force it forward.

**Results:**
- The per-question winners are everyone tied at the highest vote count above 0, shown as "It's a tie!".
- Zero votes means no winner.
- Only `incrementGamesPlayed` is recorded.

**Edge cases:**
- Votes cast by or for a player who left stay in the totals, but the donut only draws slices for players still present.
- Custom questions are local to the host's device and are lost if the host changes during setup.

**Content:**
- **891** prompts: 280 curated + `gen/pieChartsGen.ts` (actions × frames by tag).
- Default **5 questions** per game. Custom questions replace presets, and the final list is shuffled.
- Deck key: `pc`.

**testIDs:** none.

### 8.5 10 Second Tasks — `tenSecondTasks` (`app/games/tenSecondTasks.tsx`)

**Rules:**
- One "holder" performs a growing stack of tasks before the timer ends. The stack holds at most 5; the oldest task drops off.
- Everyone else votes PASS or FAIL. Eliminated players stay on as the "Jury" and still vote.
- A FAIL verdict eliminates the holder. The last player standing wins.

**Phases:** `intro` → `countdown` (3 s) → `active` → `judging` (500 ms) → `resolve` (2.5 s) → next turn's `countdown` | `game-over`

**game_state** (`:38-59`):
```ts
{ phase; game; turnNumber; stack: {id, text}[]; usedTaskIds; activePlayerIds; eliminatedPlayerIds;
  eliminationOrder; currentHolderId; previousHolderId; timerEnd: number|null; timerDuration;
  votes: Record<uid,"pass"|"fail">; holderTappedDone; verdict: "pass"|"fail"|null;
  passCount; failCount; timerExpired; isSuddenDeath; winnerId }
```

**Timer:** turns 1–3 get 10 s, turns 4–6 get 15 s, turns 7–9 get 20 s, and later turns get 25 s. Every client gets a warning haptic at 3 s. **All transitions are host-only**, including expiry handling.

**Verdict:**
- If the timer expired: FAIL.
- If there are no valid votes: PASS if the holder tapped Done, otherwise FAIL.
- Otherwise: FAIL only if fail votes > pass votes. **A tie counts as PASS.**
- Only votes from players still in the room count.
- The next holder is chosen at random from active players, excluding the previous holder.
- `isSuddenDeath` (2 or fewer active) only changes the label.

**Game over:** the winner, turns played, and the elimination order. Stats are tracked once per mount.

**Edge cases:**
- A holder who leaves is never removed from `activePlayerIds`. Their turn times out and they're eliminated, but they can still be picked as holder later.
- Late joiners aren't active but can vote.
- With 1 player the game ends after the first resolve.

**Content:**
- **591** tasks: 75 curated `t01–t75` (tags physical/movement/audio/face; flag `loud`) + `gen/tenSecondTasksGen.ts` (16 templates with compatibility rules).
- Deck key: `ts`.

**testIDs:** none.

### 8.6 Smarty Pot — `potLuck` (`app/games/potLuck.tsx`)

The Games tab calls this game "Pot Luck"; everywhere else it's "Smarty Pot".

**Rules:**
- Turns rotate through a random seat order with 4-option trivia. Each turn has 15 s to **answer or skip**.
- **Correct:** win the pot; a new question follows.
- **Wrong:** lose `min(pot, your score)` (scores never go below 0). The pot grows by 1 (cap 7) and the turn passes.
- **Skip:** the pot grows by 1 and the turn passes.
- **A full round of skips voids the pot.**
- First to **10** wins.
- Starting pot by difficulty: easy 1, medium 2, hard 3.

**Phases:** `intro` → `rolling` (shows the turn order; host's local 3 s timeout) → `live` → `reveal` (on a correct answer or a voided pot) → `live` … → `gameover`

**game_state** (`:38-73`):
```ts
{ phase; game; order: string[]; seatPtr; currentQuestion: {id, text, choices[4], correctIndex, difficulty, startingPot} | null;
  usedQuestionIds; pot; potCap /*7*/; consecutiveSkips; scores: Record<uid,number>; target /*10*/;
  turnAction: {playerId, choiceIdx} | null; turnSkip: string | null;
  revealInfo: {answer, scored, by} | null; lastResult: {playerId, kind, delta, total, potAt} | null; winnerId }
```

**Who writes what:**
- The active player writes only `turnAction` or `turnSkip`.
- **The host resolves** the turn (score, pot, next seat, reveal or game over).
- The host also initialises (after `loadRecent("sp")`), moves rolling → live, and runs Next Question.

**Timer:** 15 s, local. Only the active player's client auto-skips at 0. **If the active player is backgrounded or gone, the game stalls.**

**Ties:** only one player scores per action, so the win is unique. Standings use competition ranks with a name tiebreak.

**Edge cases:**
- **1-player softlock:** after a wrong answer the seat stays the same, so the timer never restarts.
- `order` and `scores` are never trimmed when someone leaves. A leaver's turn stalls the game.
- Late joiners aren't in `order` and wrongly see "You're up".
- If the host leaves during `rolling`, the game stays in `rolling`.

**Content:**
- **1,099** questions: 70 curated (25 easy, 25 medium, 20 hard) + `gen/potLuckGen.ts` (capitals, elements, state capitals, authors, artists, currencies, baby animal names, multiplication, square roots, Roman numerals…; distractors seeded by a hash of the question).
- Difficulty: easy 251, medium 504, hard 344.
- Deck key: `sp`, plus `usedQuestionIds` within a game.

**testIDs:** none.

### 8.7 Bid Wars — `auctionDraft` (`app/games/auctionDraft.tsx`, rules in `src/data/auctionDraft.ts`)

The display name comes from `AUCTION_GAME_NAME = "Bid Wars"` (the code comment says it's a placeholder).

**Rules:**
- **2–4 players** (`MIN_PLAYERS`/`MAX_PLAYERS`, checked by `validatePlayerCount` at start).
- Everyone starts with **$20** and the same base, e.g. a bun.
- Items are auctioned one at a time. Each player fills **k slots**: 2 players → 5, 3 → 4, 4 → 3.
- Creations are revealed and everyone **votes for the best one**. Money doesn't decide the winner.

**Phases:** `intro` → `setup` (host picks one of 12 themes or Custom) → `auction` (internal `status`: `bidding` → `result` → … → `done`) → `reveal` → `voting` → `vote-results` → `game-over` (Play Again → `setup` with `round+1`)

**game_state:**
```ts
{ phase; game; theme: {id, name, emoji, baseName, baseEmoji, itemNoun, finishedNoun} | null;
  auction: AuctionState | null; names: Record<uid,string>; votes: Record<voterId,voteeId>;
  votedPlayerIds; winners: string[]; round }
AuctionState = { order; itemsPerPlayer; startingMoney; pool: {id,name,emoji}[]; itemIndex;
  players: Record<uid,{money, items}>; departed: string[]; status: "bidding"|"result"|"done";
  opener; turn; highBid /*0=none*/; highBidder; passed: string[]; seq; deadline /*epoch ms*/;
  lastResults: AuctionResult[]; log: AuctionResult[] }   // AuctionResult.kind: "sold"|"free"|"leftover"
```

**Auction state machine:** pure functions in `auctionDraft.ts`: `createAuction`, `applyBid`, `applyPass`, `applyTimeout`, `markDeparted`, `nextItem`, `tallyVotes`.
- **Opener** rotates: the first eligible player scanning from `order[i % n]`.
- **Eligible:** in the room, has a free slot, and has more than $0.
- **Turn order:** the next eligible player in table order who hasn't passed, skipping the high bidder.
- **Bid:** any whole number from `highBid+1` (minimum $1) up to all your money. The UI stepper offers −$1, +$1 and +$5. **Passing is final** for that item.
- **Sold:** when the high bidder has no remaining opponents. A sole eligible bidder wins on their first bid.
- **All pass, no bid:** the item goes **FREE** to a player with a free slot, preferring broke players, then fewest items, then table order.
- **Nobody eligible:** remaining items are dealt round-robin as **leftovers** at $0, broke players first.
- `assertFinalAllocation` checks every player has exactly k items and every item went to exactly one player.

**Timers and the dead-host backup:**
- `TURN_SECONDS = 15`, `RESULT_MS = 2500`, `BACKUP_GRACE_MS = 5000`.
- **Every client** (not just the host) schedules:
  - turn timeout → `applyTimeout(seq)` (auto-pass) after `min(deadline−now, 15 s) + 400 ms`
  - result card → `advanceFromResult(seq)` after `min(deadline−now, 2.5 s)`
- **Non-host clients add 5 s**, so the host normally acts first and a dead host can't freeze the auction.
- The 15 s cap means a writer with a wrong clock can't stall the game.
- **No double-advance:**
  - `seq` is captured when the timer is scheduled.
  - The mutators return null unless `status`/`seq` still match the fresh server state.
  - Every transition bumps `seq`, and the CAS on `updated_at` rejects the loser of a race.
  - Late writers therefore do nothing.
- Only the player whose `turn` it is can bid or pass.
- **The host still has jobs with no backup:** marking leavers as departed, setup, reveal → voting, the voting auto-tally, End Voting, results → game over. So a dead host is covered **only during the auction**.

**Voting:**
- Voters are auction participants still in the room. Candidates are present players other than yourself.
- Auto-tally runs once everyone has voted. The host can force it with **End Voting**, which is also needed when fewer than 2 voters are present.
- `tallyVotes` ignores self-votes and votes for non-candidates. **Everyone tied on the top count is a co-winner.** With no valid votes there is "No winner".
- Stats: games played for participants; a win for each co-winner.

**Edge cases:**
- Late joiners watch only.
- A departed player is treated as passed and keeps their items (they can still receive free or leftover items).
- Broke players sit out and receive free or leftover items.

**Content: see §9.3.** Custom theme: the host enters a base name and items (max 40 characters each; pasted lines are split). At least n×k unique items are needed, and a random subset is used (emoji ✨, not tracked for no-repeat).

**testIDs:**
- Flow: `ad-start`, `ad-begin`, `ad-theme-<id>`, `ad-custom-base`, `ad-custom-item`, `ad-custom-add`
- Bidding: `ad-my-turn`, `ad-turn`, `ad-bid-minus`, `ad-bid-plus1`, `ad-bid-plus5`, `ad-pass`, `ad-bid-submit`
- Voting and end: `ad-vote-<orderIdx>`, `ad-vote-submit`, `ad-play-again`, `ad-lobby`
- `ad-next` is reused on **4 screens**, so it isn't unique.

---

## 9. Offline content architecture

### 9.1 `src/utils/deck.ts` (device no-repeat)

- **Pure helpers (Node-safe):** `seededRng` (mulberry32), `hashString` (FNV-1a), `shuffleWith`, `pickFresh(items, n, idOf, recent, rng)` (prefers ids not in `recent`; falls back to the oldest-used), `pushRecent(recent, ids, cap)`.
- **Persistence:**
  - `loadRecent(key)` hydrates from AsyncStorage key **`deck_recent_v1:<key>`** into memory.
  - `getRecent(key)` reads the in-memory list.
  - `markUsed(key, ids, cap=400)` updates memory and storage.
  - `drawFresh(key, items, n, idOf, cap)` = `pickFresh` + `markUsed`.
- AsyncStorage is loaded with `require` inside `try`, so under plain Node it quietly falls back to memory only.
- Recents are **per device**. In practice only the host's device draws content.

| Deck key | Game | Cap |
|---|---|---|
| `ngt`, `ngt:tb`, `ngt:final` | Nobody's Got Talent | 400 |
| `br:<categoryKey>` (55 keys) | Blind Ranking | 200 |
| `ng` | 1 to 100 | 400 |
| `pc` | Pie Charts | 400 |
| `ts` | 10 Second Tasks | 400 |
| `sp` | Smarty Pot | 400 |
| `bidwars:<themeId>` | Bid Wars | `max(24, floor(0.6 × theme-eligible items))` |
| *(not a deck)* `br_custom_categories` | Blind Ranking custom categories | — |

### 9.2 Banks and generators

Every module in `src/data/**` is **pure TypeScript with no React Native imports**, so the scripts can import it under Node. Each `getAll*()` merges a curated table with a deterministic generator in `src/data/gen/` and dedupes on normalised text. Generated ids are hash-based (`ngg_`, `pcg_`, `tg_`, `sp_`).

Counts are from `scripts/verifyBanks.ts` run on 2026-11-23:

| Game | Curated source | Generator | Unique total | 20-game repeat rate |
|---|---|---|---|---|
| Blind Ranking | `blindRankingBanks.ts` (55 categories) | — | 2,131 items | 0.00% |
| Nobody's Got Talent R1/R2 | `talentShow.ts` (299 kept) | `talentGen.ts` | 1,979 (+111 tiebreak, +111 final) | 0.00% |
| 1 to 100 | `numberGuessor.ts` | `numberGuessorGen.ts` | 840 (all answers 1–100) | 0.00% |
| Pie Charts | `pieCharts.ts` (280) | `pieChartsGen.ts` | 891 | 0.00% |
| 10 Second Tasks | `tenSecondTasks.ts` (75) | `tenSecondTasksGen.ts` | 591 | 0.00% |
| Smarty Pot | `potLuck.ts` (70) | `potLuckGen.ts` | 1,099 | 1.20% |

### 9.3 Bid Wars bank and recipe engine (`src/data/bank/`)

**`items.ts`**
- **1,055 items**, **61 tags**, one per line as `Name|emoji|tags`. Parsed lazily to `{id: slugify(name), name, emoji, tags[]}`.
- Names are unique, and items are shared across themes.
- **Slot tags** (e.g. `patty`, `pizza_topping`, `destination`) say which part of a recipe an item can fill.
- **Modifier tags** (breakfast, spicy, tropical, green, meat, veggie, dessert, cabin, beach, snow, city, gamer, cozy, basketball, baseball, football, nature, coastal, zombie, alien) are used by variants.
- `RESERVED_TAGS = []`.

**`recipes.ts`**
- A **recipe** is `{key, themeId, name, emoji, bases, itemNoun, finishedNoun, slots}`. A **theme** is a base recipe plus variants, keyed `theme:variant`.
- Slot spec syntax: `any,of,tags+required-excluded:min-max`.
- `chooseRecipe`: the base recipe has weight 2, each variant weight 1. A chosen variant's name becomes `theme.name`.
- `drawRecipePool`:
  - Every slot starts at its minimum. The rest of the n×k items go to random slots within each slot's max and supply.
  - The smallest slot pools are filled first, using `pickFresh` against recents.
  - A random base is chosen and the final picks are shuffled.

The 12 themes have 24 variants in total:

| Theme id | Variants |
|---|---|
| `burger` | breakfast, spicy |
| `hotdog` | spicy |
| `smoothie` | tropical, green |
| `cursed` (Cursed Combo) | breakfast, dessert |
| `house` (Dream House) | cabin, beach |
| `bedroom` (Dream Bedroom) | gamer, cozy |
| `vacation` (Dream Vacation) | beach, snow, city |
| `pizza` | meat, veggie |
| `sports` (Game Day) | basketball, baseball, football |
| `roadtrip` | coastal, parks |
| `festival` | food |
| `apocalypse` (Apocalypse Kit) | zombie, alien |

Per `recipes.ts:64`, the ids of the first 7 themes are pinned because testIDs use them.

---

## 10. Verification and QA

### 10.1 Scripts (plain Node, no React Native)

| Command | Checks | Last result (2026-11-23) |
|---|---|---|
| `npx --yes tsx scripts/verifyBanks.ts` | Every non-auction bank: ≥500 unique items, no duplicates, grammar (no unfilled `{slots}`, a/an, punctuation), 1-to-100 answers in range, Smarty Pot answers valid, 20-game repeat simulation | ALL CHECKS PASSED |
| `npx --yes tsx scripts/verifyBidWars.ts` | Bank (unique ids and names, emoji, known tags); engine (≥1000 seeded games per recipe for 2/3/4 players, slot min/max, deterministic); freshness overlap <15% | OK: 43,200 pools, max overlap 8% |
| `npx --yes tsx scripts/auctionDraftSim.ts` | Fixed rule scenarios plus 12,000 random games, checking invariants after every transition (money conserved, never negative, no double timeouts, allocation exact) | OK |
| `npx tsc --noEmit` | Typecheck | 4 errors (see §11) |

Any data or generator module must stay importable by these scripts, so no React Native imports in `src/data/**` or `src/utils/deck.ts`.

### 10.2 Local QA setup

1. Install: `npm install` (`.npmrc` sets legacy peer deps). The repo path contains a space, so **quote paths**.
2. Start Metro on the LAN: `npx expo start --lan --port 8082`.
3. Simulators: **Expo Go** on iOS **iPhone 16, iPhone 16 Plus, iPhone 16 Pro, iPhone 16 Pro Max**. Each simulator has its own AsyncStorage, so each one is an anonymous player. Open the app with `xcrun simctl openurl <UDID> exp://<lan-ip>:8082`, or press `Shift+i` in Metro.
4. Multiplayer: one simulator hosts and shares the code; the others join.
5. **Maestro** flows target testIDs: `ng-*` (1 to 100), `ad-*` (Bid Wars), and `PrimaryAction`'s `testID` prop. Other games need text selectors (e.g. `/Waiting for host.*/`). No Maestro flow files are committed to the repo.
6. Before handing off: `npx tsc --noEmit` (don't add errors) and the three scripts above.

Debug logs to look for: `[tapdiag]` (lobby taps, startGame), `[rtdiag]` (realtime channel status, refreshRoom), `[mutateGameState]`.

---

## 11. Known issues and open items

**Product / ownership**
- **The Games tab (`app/(tabs)/games.tsx`) doesn't list Bid Wars** (6 games, and it calls Smarty Pot "Pot Luck"). This is the owner's work in progress; the lobby picker does list all 7. The Blind Ranking description there ("Rank items and match the group") is also out of date.
- **Supabase migration 002 has not been applied** (optional; the app doesn't call it). Migration 001's header also says "NOT YET APPLIED". If the live `rp_delete` policy is the old one, host kicks fail and show "could not be removed…".
- Social tab, friends, invites and notifications: schema only, no UI.
- Profile "Trophies" is always 0.
- `QA_TESTING_BRIEF.md` is out of date.

**TypeScript:** `npx tsc --noEmit` currently reports 4 errors.
- `blindRanking.tsx:277` TS2538 ×2: untyped `cur.votes` values used as an index.
- `talentShow.tsx:575` and `:617` TS7006 ×2: implicit-any `id` in mutator callbacks.
- The earlier `numberGuessor` TS2304 (`myId`) no longer appears: the working tree declares `myId` at `:98`.

**Reliability (seen in the code; not yet fixed)**
- **No presence or heartbeat.** A force-quit player or host stays in `room_players`. Every game except Bid Wars' auction stalls if the host or a required player disappears without leaving:
  - Talent: voters and performers
  - 1 to 100: unsubmitted guessers
  - Pie Charts: non-voters
  - Smarty Pot: the active seat
  - 10 Second Tasks: the host
- **Late joiners** can stall Blind Ranking (`playing`) and show wrong turn info in Smarty Pot.
- **Smarty Pot:** 1-player softlock after a wrong answer; `order` is never trimmed; host-local `rolling` timeout.
- **Mutator side effects:** `pickTask`, `pickQuestion`, `pickRandom` and `drawFresh` call `markUsed` inside or before CAS mutators, so retries or failed writes use up extra deck items.
  - Smarty Pot also has an unused `pickQuestion` call in the all-skip branch.
- Some mutators have no phase guard and read the cached `gs` (Talent → voting transitions, Blind Ranking next game). A double tap could skip a step.
- `trackedGameRef` is never reset, so stats for a second game after **Play Again** on a still-mounted screen aren't recorded. 10 Second Tasks' init effect may also not re-run after Play Again (needs a runtime check).
- **Timing:** client-local timers (1 to 100, Smarty Pot) and the host's clock in `roundStartedAt` mean clock skew affects 1 to 100 penalties.
- Room codes are generated client-side. A collision is rejected by the UNIQUE constraint but shows a generic error.
- `rooms` UPDATE RLS is `USING (true)`: any signed-in user can write any room.
