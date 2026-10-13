# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Bank or Burn

A browser-based multiplayer poker card game. Originally built and shipped as **"Dare Dare Dare"**; the player-facing brand was renamed to **"Bank or Burn"** (see README.md for why — a trademark conflict with an earlier rename attempt). The rename touched only visible text (title, wordmark, in-game header) — bundle ID (`com.kinhang.guessnextcard`), package name, internal file names, and every game rule below are unchanged from the original "Dare Dare Dare" implementation. Don't be confused by "Dare Dare Dare" still appearing in bundle IDs, native Info.plist display name, or old filenames — that's expected, not a bug.

---

## Icons — inline SVG only, one deliberate exception

Every UI icon (buttons, badges, menu, modals) is inline SVG via `ICON_PATHS` + `icn()` in `game.js`, with static HTML using `<span data-icn="name"></span>` placeholders hydrated by `hydrateStaticIcons()` on load. **Never add a new UI icon as emoji or a Unicode symbol character.** This was verified directly, not assumed: the native iOS WKWebView (Capacitor) fails to fall back to any system glyph for characters outside the loaded web fonts — confirmed broken for plain emoji, emoji explicitly forced to `-apple-system`, emoji forced to `'Apple Color Emoji'`, and at normal font-weight (ruling out a bold-font theory). All four rendered as an identical blank "?" box on an iOS Simulator build.

**Exception, and an important caveat about where you test it:** the 30-option avatar picker (`EMOJI_AVATAR_LIST` in `game.js`) is real emoji on purpose, restored after a real iOS device (not the Simulator) showed it rendering correctly — directly contradicting the Simulator-based testing above. The Simulator appears to have its own font-loading quirk for this specific case that doesn't reflect real-device behavior. **If you're debugging icon/emoji rendering, test on a physical device before concluding something is broken** — for this one question, the Simulator is not trustworthy, even though it's fine for everything else (layout, color, animation, etc.). See README.md's "Running Locally" section for the real-device build/install commands (`xcrun devicectl`).

---

## Blaze mascot & Danger Meter

Offline play shows a fox mascot ("Blaze") and a 10-segment vertical meter above the card table — both purely cosmetic, left over from an abandoned "Hot Deck" push-your-luck redesign that was fully reverted back to the original rules below. They now just visualize the existing heat counter (`G.streakPunishment`, capped at 10) and react to game events (correct/wrong/Joker) with a reaction image + one-line dialogue. Config (color bands, dialogue pool) lives in `hotdeck-config.js` at the repo root — the filename is a leftover from the redesign attempt; it was not renamed because the churn wasn't worth it for a file that's just mascot/color config now.

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
- A **Punishment Picker** appears after player names — choose from 4 presets or a custom word (see Punishment Picker section).
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

When a player owes reps, the penalty zone shows a row of dot icons (`diceDisplay()` in `game.js`, capped at 12) representing the **cumulative reps this turn** (`G.turnPushUps`) alongside the current penalty count. Previously rendered as Unicode dice-face characters (⚀–⚅); switched to SVG dots for the same reason described in "Icons" above.

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

---

## Online Play on iOS

Online mode is available on both web and the native iOS app (previously hidden
on native via `IS_NATIVE`; re-enabled — see `public/game.js`). Native builds
connect to `SERVER_URL` (the deployed Render backend) explicitly, since a
Capacitor local-scheme WebView has no same-origin server to default to.

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
