# Guess Next Card

A pass-the-phone card game — wrong guesses mean push-ups.

## How to Play

1. Pick **2–10 players** on the start screen and enter names.
2. Hit **Start** — a card is dealt face-up to begin.
3. On your turn, guess what the next drawn card will be:
   - **Number card showing** (A, 2–10): guess **Higher**, **Lower**, or **Joker**
   - **Face card showing** (J, Q, K): guess **Red**, **Black**, or **Joker**
4. After the card is revealed, the labels show **Previous → Drawn** and a result badge (✓ / ✗) confirms your guess.
5. Correct guess → choose **Pass** (next player's turn) or **Continue** guessing.

## Penalties

| Outcome | Push-ups |
|---|---|
| Wrong guess | 1 — keep guessing until correct |
| Same number as current card | 2 |
| Same number **and** same color | 3 |
| Correct Joker guess → all other players | 2 each |
| Wrong Joker guess / unexpected Joker → current player | 2 |

## Deck (56 cards)

- 52 standard cards (A–K across ♥ ♦ ♣ ♠)
- 2 Health Cards
- 1 Red Joker + 1 Black Joker

Card ranks: A=1, 2–10, J=11, Q=12, K=13

## Health Cards

Drawn from the deck like any other card — no penalty when drawn; play continues from the same card.

| Cards held | Ability |
|---|---|
| 1 or 2 | **Skip** — appears when you owe push-ups; uses 1 health card to cancel the penalty (card removed from game) |
| 2 | **Flip −2** — appears before guessing; peeks at the next card, but both health cards are shuffled back into the deck |

## Jokers

- **Correct Joker guess** → all other players do 2 push-ups each; Joker is set aside; current player continues from the same card.
- **Wrong Joker guess** (or Joker drawn unexpectedly) → current player does 2 push-ups; Joker is set aside; play continues normally.

## Scoreboard

Tracks each player's push-up count live throughout the game.

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML / CSS / JS
- **Mobile**: Capacitor (iOS)

## Running Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.
