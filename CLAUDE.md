# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Dare Dare Dare

A browser-based multiplayer poker card game named **"Dare Dare Dare"**.

---

## Deck Composition

- 52 standard cards (A, 2–10, J, Q, K across Hearts, Diamonds, Clubs, Spades)
- 2 Health Cards
- 1 Red Joker
- 1 Black Joker

**Total: 56 cards**

Card ranks: A=1, 2–10, J=11, Q=12, K=13

---

## Setup

- Player selection screen: user picks **2–10 players** before the game starts.
- Each player enters a name and chooses an avatar (emoji or camera photo).
- A **Punishment Picker** appears after player names — choose from 6 presets or a custom word (see Punishment Picker section).
- UI shows: scoreboard for all players + remaining undrawn cards.
- A **Start** button deals the first random card to begin the game.

---

## Core Turn Logic

The current player guesses what the **next card drawn** will be, relative to the current top card of the pool.

### If current card is a Number card (A, 2–10)
Three guess buttons: **Higher** | **Lower** | **Joker**

### If current card is a Face card (J, Q, K)
Three guess buttons: **Red** | **Black** | **Joker**

---

## Result Indicator

After each guess, the card area updates to show the comparison clearly:

- The left card label changes from **Current Card** to **Previous**.
- The right card label changes from **Next Card** to **Drawn**.
- A pill badge animates in between the cards: **✓ HIGHER**, **✗ RED**, **✓ JOKER**, etc.
- For a correct Joker guess, the left label stays **Current Card** and right shows **Joker Drawn**.
- When the player presses Pass, Continue, or Done, the labels reset and the badge disappears.

The badge animation replays on every reveal (including consecutive same-outcome guesses) via a forced reflow.

---

## Outcomes

### Correct guess
- Player may choose to **Pass** (end their turn, next player goes) or **Continue** guessing.

### Wrong guess
- Player does **1 rep** of the chosen punishment and must keep guessing until correct.

### Same number as current card
- Player does **2 reps** (regardless of guess).

### Same number AND same color as current card
- Player does **3 reps** (regardless of guess).

---

## Health Cards

Health cards sit in the deck and are drawn like any other card. When drawn, **no matter what the player guessed**, the player receives the health card. The current card does not change; play continues from the same card.

### Holding 1 or 2 health cards (penalty phase)
- A **Skip** button appears in the penalty zone when the player owes reps.
- Using Skip cancels the pending reps and permanently removes 1 health card from the game.

### Holding 2 health cards (guessing phase)
- A **Flip −2** button appears above the guess buttons.
- Pressing it reveals the next card as a peek without drawing it.
- Both health cards are shuffled back into the remaining deck at random positions.

---

## Joker Cards

### Player guesses "Joker" and is CORRECT
- All **other** players do **2 reps** each; a **Done** button appears for them to confirm.
- The Joker card is set aside (out of play).
- The current player continues guessing from the **previous card** (not the Joker).

### Player guesses "Joker" and is INCORRECT (or draws Joker unexpectedly)
- The **current player** does **2 reps**; a **Done** button appears.
- After pressing Done, the Joker is placed **to the side** (out of play).
- Play continues normally.

---

## Scoreboard

Displayed live for all players throughout the game. Each player entry shows their avatar, name, and cumulative penalty count (with the chosen punishment icon). The active player is highlighted. Health card icons (💚) are shown per card held.

---

## Player Avatars

During setup, each player has a circular avatar button next to their name input. Tapping it opens a picker with:
- **📷 Photo / Camera** — takes or picks a photo from the device; stored as a base64 data URI.
- **Emoji grid** — 30 preset emoji to choose from.

Avatars appear in scoreboard chips, the turn banner, and the challenge picker.

---

## Heat / Streak Mechanic

Each time the current player presses **Continue** (guessing again after a correct guess), a global heat counter (`G.streakPunishment`) increments by 1.

- The heat is shown as a 🔥 banner in the guess zone and action zone.
- Heat carries across player turns on Pass — it is **not reset** when the turn passes.
- Whoever next **gets a guess wrong** pays their normal penalty **plus all accumulated heat**, and the heat resets to 0.
- Heat also resets when a challenge ends the turn involuntarily (challenger penalised or challenged player penalised and turn passes).

---

## Dice Display

When a player owes reps, the penalty zone shows Unicode dice faces (⚀–⚅) representing the **cumulative reps this turn** (`G.turnPushUps`) alongside the current penalty count. Multiple dice stack when the total exceeds 6.

---

## Challenge Mechanic

On their turn (before guessing), the current player may tap **⚡ Challenge** to pick any other player and force them to guess instead.

- **Challenged player guesses wrong** → they do **1 rep** (always, regardless of same-rank/color); the challenger's turn resumes from the new current card.
- **Challenged player guesses right** → the challenger does **3 reps** and their turn ends (next player goes).

The Challenge button is shown during the guessing phase when there are at least 2 players. Implemented in both offline and online builds.

---

## In-Game Menu

A **☰** button in the game top-bar opens a bottom sheet with:
- **▶ Resume** — dismisses the menu, game continues.
- **↺ Reset Game** — keeps player names, avatars, and punishment type; resets all penalty scores; deals a fresh 56-card deck. Player 1 starts.
- **📖 How to Play** — opens the rules modal.
- **✕ Quit to Main** — returns to the home screen.

---

---

## Punishment Picker

Before the game starts, players choose what the punishment is. Options:

| id | Icon | Singular | Plural |
|----|------|----------|--------|
| `pushups` | 💪 | push-up | push-ups |
| `situps` | 🏋️ | sit-up | sit-ups |
| `squats` | 🦵 | squat | squats |
| `plank` | ⏱️ | sec plank | sec plank |
| `custom` | ✏️ | *(user input)* | *(input + "s")* |

### Implementation
- `PUNISHMENT_PRESETS` array holds the presets; `selectedPunishId` (module-level `let`) tracks the current selection.
- `renderPunishmentPicker()` renders chip buttons into `#punishment-picker`; "Custom…" reveals `#custom-punish-row` with a text input.
- `readPunishment()` is called inside `startOfflineGame()` and writes `G.punishSingular`, `G.punishPlural`, `G.punishIcon`.
- `punish(n)` helper returns `G.punishSingular` when `n === 1`, else `G.punishPlural`.
- `updateHTPPunishment()` patches `.htp-ps` / `.htp-pp` spans in the HTP modal, plus `#challenge-modal-sub` and `#challenge-splash-sub` text — called once at game start.
- Punishment is **preserved** (not reset) by `resetOfflineGame()`.
- Punishment picker is **offline-only**; online mode always uses the default push-up labels.

---

## Turn Order

Turns pass clockwise. A player's turn ends when they choose to Pass after a correct guess.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

### Project-specific skills (in `.claude/skills/`)

| Trigger | Skill |
|---------|-------|
| Run / start the game locally | `/run-game` |
| QA test game mechanics | `/game-qa` |
| Review game logic against rules | `/game-review` |
| Plan / spec a new feature | `/game-spec` |

### gstack skills (global)

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
