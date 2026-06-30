---
name: run-game
version: 1.0.0
description: Start the Guess Next Card game server locally and open it in the browser for manual testing.
allowed-tools:
  - Bash
  - Read
triggers:
  - run the game
  - start the game
  - start the server
  - open the game
  - run locally
---

## When to invoke this skill

Use when the user wants to run or preview the game locally — e.g. "run the game", "start the server", "open the game in the browser".

## Steps

1. Kill any existing server on port 3000:
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
```

2. Start the server in the background:
```bash
cd "/Users/kinhang_jo/Downloads/dare dare dare" && node server.js &
sleep 2 && echo "Server started on http://localhost:3000"
```

3. Open the game in the browser using `/browse`:
- Navigate to `http://localhost:3000`
- Confirm the player setup screen loads
- Report what you see

## Game entry points

- **Offline (local play):** `http://localhost:3000` — tap "Play Offline"
- **Online (multiplayer):** `http://localhost:3000` — tap "Play Online" and create/join a room

## Notes

- The server uses Express + Socket.io (`server.js`)
- Static files are in `public/` and root (`index.html`, `game.js`, `style.css`)
- Default port is 3000
