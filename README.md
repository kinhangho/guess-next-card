# Dare Dare Dare

A pass-the-phone card game — wrong guesses mean punishment reps (push-ups, squats, or whatever the group decides).

> ### THE RULES ARE SIMPLE, THE PRESSURE ISN'T
> - Number card up? Guess Higher, Lower, or Joker.
> - Face card up? Guess Red, Black, or Joker.
> - Right guess: pass the phone or keep going.
> - Wrong guess: pay the penalty, then guess again.
>
> ### IT ESCALATES FAST
> - Heat climbs every time someone pushes their luck instead of passing — and it doesn't reset until somebody misses. Whoever that is pays for everyone's confidence.
> - Not feeling a card? Challenge someone else to guess in your place. Call it right and it's your win. Call it wrong and you're covering triple.
> - Guess Joker correctly and the whole table pays but you. Get caught off guard by one and you're the only one paying.
> - Health Cards turn up at random — hold one to dodge a penalty, hold two to sneak a peek at what's coming next.
>
> ### SET YOUR OWN STAKES
> Before you start, pick what losing costs: push-ups, sit-ups, squats, a timed plank, or write your own. Everyone picks an avatar — snap a photo or grab one of 30 emoji — and a live scoreboard keeps score of who's losing the hardest.

## How to Play

1. Pick **2–10 players**, set names, choose an avatar (emoji or photo), and pick a **punishment type**.
2. Hit **Start** — a card is dealt face-up to begin.
3. On your turn, guess what the next drawn card will be:
   - **Number card showing** (A, 2–10): guess **Higher**, **Lower**, or **Joker**
   - **Face card showing** (J, Q, K): guess **Red**, **Black**, or **Joker**
4. After the card is revealed, the labels show **Previous → Drawn** and a result badge (✓ / ✗) confirms your guess.
5. Correct guess → choose **Pass** (next player's turn) or **Continue** guessing.

## Punishment Picker

Before the game starts, pick what the group is doing for penalties:

| Option | |
|---|---|
| 💪 Push-ups | 🏋️ Sit-ups |
| 🦵 Squats | ⏱️ Sec. Plank |
| ✏️ Custom (type anything) | |

The chosen label replaces every "push-up" reference throughout the game. The selection is remembered if you reset mid-session.

## Penalties

| Outcome | Reps |
|---|---|
| Wrong guess | 1 — keep guessing until correct |
| Same number as current card | 2 |
| Same number **and** same color | 3 |
| Correct Joker guess → all other players | 2 each |
| Wrong Joker guess / unexpected Joker → current player | 2 |

Penalty counts are shown as dice faces (⚀–⚅) in the penalty zone.

## Heat / Streak

Every **Continue** adds 1 🔥 heat to a shared counter. Heat carries across turns — it doesn't reset when the turn passes. Whoever next **gets a guess wrong** pays their normal penalty **plus all accumulated heat**. The heat banner shows in the guess zone so everyone knows the risk.

## Deck (56 cards)

- 52 standard cards (A–K across ♥ ♦ ♣ ♠)
- 2 Health Cards
- 1 Red Joker + 1 Black Joker

Card ranks: A=1, 2–10, J=11, Q=12, K=13

## Health Cards

Drawn from the deck like any other card — no penalty when drawn; play continues from the same card.

| Cards held | Ability |
|---|---|
| 1 or 2 | **Skip** — appears when you owe penalties; uses 1 health card to cancel the penalty (card removed from game) |
| 2 | **Flip −2** — appears before guessing; peeks at the next card, but both health cards are shuffled back into the deck |

## Jokers

- **Correct Joker guess** → all other players do 2 reps each; Joker is set aside; current player continues from the same card.
- **Wrong Joker guess** (or Joker drawn unexpectedly) → current player does 2 reps; Joker is set aside; play continues normally.

## Challenge ⚡

Before guessing, tap **⚡ Challenge** to dare another player to guess for you.

| Outcome | Result |
|---|---|
| They guess **right** | You do **3 reps** and lose your turn |
| They guess **wrong** | They do **1 rep**, your turn resumes |

## In-Game Menu

Tap **☰** during the game to open the menu:
- **Resume** — close and keep playing
- **Reset Game** — keep names/avatars, wipe scores, deal a fresh deck
- **How to Play** — open the rules
- **Quit to Main** — return to the home screen

## Avatars

Each player picks an avatar during setup — choose from 30 emoji or take/upload a photo. Avatars appear in the scoreboard, turn banner, and challenge picker.

## Scoreboard

Tracks each player's penalty count live. The active player is highlighted in gold. Health card icons (💚) show per card held.

## Online Play 🌐

Create or join a room to play with friends on separate devices. Online mode mirrors
the offline ruleset exactly — same penalties, same Heat/Streak carry-over, same
Challenge payouts (3 reps if the challenger loses, 1 flat rep if the challenged
player is wrong). The punishment picker is offline-only; online rooms always use
the default push-up labels. Available on web and in the native iOS app.

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML / CSS / JS
- **Mobile**: Capacitor (iOS)
- **Sound**: Web Audio API (procedural sound effects, no audio files)

## Project Layout

`server.js` serves static assets from `public/` (`webDir` in `capacitor.config.json`
also points here) — that's the single source of truth for the web client.
`game.js`, `index.html`, and `style.css` at the repo root are kept as synced
copies for convenience when opening the file directly; always edit under
`public/` and re-copy, don't edit the root copies in place. Run `npx cap copy ios`
after any `public/` change to keep the bundled iOS build (`ios/App/App/public/`)
in sync.

## Running Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.
