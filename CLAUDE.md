# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Guess Next Card

A browser-based multiplayer poker card game named **"Guess Next Card"**.

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

## Outcomes

### Correct guess
- Player may choose to **Pass** (end their turn, next player goes) or **Continue** guessing.

### Wrong guess
- Player does **1 push-up** and must keep guessing until correct.

### Same number as current card
- Player does **2 push-ups** (regardless of guess).

### Same number AND same color as current card
- Player does **3 push-ups** (regardless of guess).

---

## Health Cards

Health cards sit in the deck and are drawn like any other card. When drawn, **no matter what the player guessed**, the player receives the health card and may keep it or use it at any time.

### Holding 1 health card
- Player gets a **Skip** button.
- Using Skip avoids any push-up penalty once.
- The health card is permanently removed from the game after use.

### Holding 2 health cards
- Player gets a **Use** button.
- Pressing Use reveals two options:
  - **Skip −1**: same as the single-card Skip (consumes 1 health card).
  - **Flip −2**: peeks at the next card as a tip, but costs 2 health cards (both returned to the pool at a random position).

---

## Joker Cards

### Player guesses "Joker" and is CORRECT
- All **other** players do **2 push-ups** each; a **Done** button appears for them to confirm.
- The Joker card is set aside (out of play).
- The current player continues guessing from the **previous card** (not the Joker).

### Player guesses "Joker" and is INCORRECT (or draws Joker unexpectedly)
- The **current player** does **2 push-ups**; a **Done** button appears.
- After pressing Done, the Joker is placed **to the side** (out of play).
- Play continues normally.

---

## Scoreboard

Displayed live for all players throughout the game. (Scoring details TBD — push-up counts or point system to be defined.)

---

## Turn Order

Turns pass clockwise. A player's turn ends when they choose to Pass after a correct guess.
