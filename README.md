# Icebreaker 2.0

A multiplayer party game app built with Expo (React Native). Get your friends together, pick a game, and break the ice.

## Games

| Game | Players | Description |
|------|---------|-------------|
| Nobody's Got Talent | 3-8 | Perform prompts, buzz or golden buzz, vote for the winner across 3 rounds |
| 1 to 100 | 1+ | Guess numeric trivia answers — lowest penalty wins |
| Pie Charts | 3+ | "Who's most likely to..." vote and reveal as donut charts |
| Smarty Pot | 3-8 | Turn-based hot potato trivia — answer, skip, or risk the growing pot |
| Blind Ranking | 2-5 | Rank items one at a time with no take-backs, then vote for the best list |
| 10 Second Tasks | 3-6 | Stack tasks and beat the timer — judges vote pass or fail |
| Bid Wars | 2-4 | Auction draft showdown — bid on items with $20, build the best collection |

## Tech Stack

- **Expo SDK 58** + Expo Router (file-based routing)
- **React Native** with StyleSheet (no NativeWind)
- **Supabase** — auth, database, realtime (replaces Socket.io from v1)
- **Zustand** — state management
- **Reanimated** + Gesture Handler — animations
- **react-native-svg** — SVG rendering (intro splash, charts)
- **Inter** font family via @expo-google-fonts

## Getting Started

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on iOS simulator
npx expo start --ios
```

## Project Structure

```
app/
  _layout.tsx          — Root layout, fonts, auth init, intro splash
  index.tsx            — Auth redirect
  welcome.tsx          — Landing screen
  username-setup.tsx   — Pick username
  lobby.tsx            — Room lobby (code, players, game picker)
  game-info.tsx        — Game instructions screen
  (tabs)/              — Main tab screens (Play, Games, Profile)
  games/               — Individual game screens
src/
  stores/              — Zustand stores (authStore, roomStore)
  components/          — Shared UI components
  data/                — Game prompts, questions, item banks
  utils/               — Helpers (deck system, trophies)
  lib/supabase.ts      — Supabase client
  theme.ts             — Colors, fonts, gradients, spacing
assets/
  game-logos/           — PNG logos for each game
```

## Features

- Anonymous auth with persistent credentials (no sign-up required)
- Real-time multiplayer via Supabase Realtime
- Trophy system (win = gain trophies, lose = lose 1)
- Per-game win tracking and profile stats
- Custom game logos with themed card art
- Cinematic intro splash (icy bolt shatter animation)
- Room management (transfer host, end room, leave)
- Player count validation per game
- Feedback form (bug reports, feature requests)
- Edit profile (display name, username, avatar)

## Environment

Requires a Supabase project with:
- `users` table (id, username, username_lower, display_name, avatar_url, wins, games_played, trophies, per_game_wins)
- `rooms` table (id, code, host_id, status, game_type, game_state, updated_at)
- `room_players` table (id, room_id, user_id, username, score, is_host, joined_at)
- `feedback` table (id, user_id, username, type, message, created_at)
- Realtime enabled on rooms and room_players tables
