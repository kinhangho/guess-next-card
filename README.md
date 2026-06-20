# Guess Next Card

A browser-based real-time multiplayer card guessing game — with a physical twist: wrong guesses mean push-ups.

## How to Play

1. Pick **2–10 players** on the start screen.
2. Hit **Start** — a card is dealt face-up to begin.
3. On your turn, guess what the next drawn card will be:
   - **Number card showing** (A, 2–10): guess **Higher**, **Lower**, or **Joker**
   - **Face card showing** (J, Q, K): guess **Red**, **Black**, or **Joker**
4. After a correct guess, choose to **Pass** (next player's turn) or **Continue** guessing.

## Challenge

Before guessing, tap **⚡ Challenge** to pick another player and make them guess for you.

| Result | Consequence |
|---|---|
| Challenged player guesses **wrong** | They do the push-ups; your turn resumes |
| Challenged player guesses **right** | You do 2 push-ups and lose your turn |

## Penalties

| Outcome | Push-ups |
|---|---|
| Wrong guess | 1 — keep guessing until correct |
| Same number as current card | 2 |
| Same number **and** same color | 3 |
| Correct Joker guess (others) | 2 each for all other players |
| Wrong Joker guess / unexpected Joker | 2 for current player |
| Lost a Challenge | 2 for the challenger |

## Deck (56 cards)

- 52 standard cards (A–K across ♥ ♦ ♣ ♠)
- 2 Health Cards
- 1 Red Joker + 1 Black Joker

Card ranks: A=1, 2–10, J=11, Q=12, K=13

## Health Cards

Drawn from the deck like any other card — penalty is waived when drawn.

| Cards held | Ability |
|---|---|
| 1 | **Skip** — avoid one push-up penalty (card removed from game) |
| 2 | **Skip −1** (same as above) **or Flip −2** — peek at the next card, but both health cards return to the deck at random |

## Jokers

- Correct Joker guess → all **other** players do 2 push-ups; Joker is set aside; current player continues from the previous card.
- Wrong Joker guess (or Joker drawn unexpectedly) → current player does 2 push-ups; Joker is set aside; play continues normally.

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO (real-time multiplayer)
- **Frontend**: Vanilla HTML / CSS / JS
- **Mobile**: Capacitor (iOS)

## Running Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.
