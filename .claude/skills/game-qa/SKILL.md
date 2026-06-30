---
name: game-qa
version: 1.0.0
description: QA test the Guess Next Card game mechanics — run the server, open the browser, and verify the key game flows work correctly.
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Agent
  - AskUserQuestion
triggers:
  - qa the game
  - test the game
  - test game mechanics
  - check the game works
  - game qa
---

## When to invoke this skill

Use when the user wants to QA test the game — e.g. "test the game", "qa the game", "check if the mechanics work". Proactively suggest after implementing game logic changes.

## QA Checklist

### Setup flow
- [ ] Player count picker (2–10) appears on load
- [ ] Player name inputs and avatar picker work
- [ ] Punishment picker shows all 6 presets; Custom… reveals text input
- [ ] Start button deals first card and enters game

### Core turn logic
- [ ] Number card → shows Higher / Lower / Joker buttons
- [ ] Face card (J/Q/K) → shows Red / Black / Joker buttons
- [ ] Correct guess → Pass and Continue buttons appear
- [ ] Wrong guess → penalty shown, keep guessing
- [ ] Same number → 2 reps penalty
- [ ] Same number + same color → 3 reps penalty

### Result indicator
- [ ] Left label changes to "Previous", right to "Drawn" after guess
- [ ] Outcome badge animates in (✓ HIGHER, ✗ RED, etc.)
- [ ] Labels reset and badge disappears on Pass/Continue/Done

### Special cards
- [ ] Health card drawn → no card change, Skip button appears when reps owed
- [ ] 2 health cards → Flip −2 button appears; peek works; cards reshuffled
- [ ] Joker guessed correctly → all others do 2 reps; guessing resumes from previous card
- [ ] Joker drawn unexpectedly → current player does 2 reps; Joker set aside

### Heat mechanic
- [ ] Continue increments heat counter (🔥 banner)
- [ ] Heat carries across turns on Pass
- [ ] Wrong guess pays normal reps + heat; heat resets

### Challenge mechanic
- [ ] ⚡ Challenge button visible during guessing phase (2+ players)
- [ ] Challenged player guesses wrong → 1 rep, challenger resumes
- [ ] Challenged player guesses right → challenger gets 3 reps, turn ends

### In-game menu
- [ ] ☰ opens bottom sheet with Resume / Reset / How to Play / Quit
- [ ] Reset keeps names/avatars/punishment; resets scores and deck

### Scoreboard
- [ ] Live penalty counts visible for all players
- [ ] Active player highlighted
- [ ] Health card icons (💚) shown correctly

## Steps

1. Start server (use `/run-game` if not already running)
2. Open `http://localhost:3000` via `/browse`
3. Walk through each checklist item; note failures
4. Fix any bugs found in `game.js` / `style.css` / `server.js`
5. Re-verify fixed items
6. Report final status

## Files to check

- [game.js](../../../game.js) — all game logic
- [index.html](../../../index.html) — markup
- [style.css](../../../style.css) — styles
- [server.js](../../../server.js) — Socket.io multiplayer server
