---
name: game-review
version: 1.0.0
description: Review game.js changes for correctness against the official game rules in CLAUDE.md — catches logic bugs, rule mismatches, and edge cases.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
triggers:
  - review the game logic
  - check the rules
  - verify game rules
  - game review
  - review game changes
---

## When to invoke this skill

Use when the user wants to verify that code changes match the game rules — e.g. "review the game logic", "check if I implemented this correctly", "make sure the rules are right".

## Review process

### 1. Read the source of truth
Read `CLAUDE.md` in full — it is the authoritative game spec.

### 2. Diff the change
```bash
git diff HEAD game.js
```

### 3. Check each rule area against the code

**Deck composition** — 52 cards + 2 Health + 1 Red Joker + 1 Black Joker = 56 total
- Grep for deck initialization and confirm counts

**Turn logic** — Number card → Higher/Lower/Joker; Face card → Red/Black/Joker
- Confirm button rendering is gated on card type correctly

**Outcomes**
- Correct → Pass or Continue (no penalty)
- Wrong → 1 rep, keep guessing
- Same number → 2 reps
- Same number AND same color → 3 reps

**Heat mechanic** — increments on Continue; resets on wrong guess or challenge end; carries on Pass

**Health card logic**
- When drawn: current card unchanged, no guess outcome
- 1–2 held: Skip button in penalty zone cancels reps, removes 1 health card permanently
- 2 held: Flip −2 peeks next card without drawing; both cards reshuffled back

**Joker — correct guess**
- All OTHER players: 2 reps + Done button
- Joker set aside (out of play)
- Guessing resumes from PREVIOUS card (not the Joker)

**Joker — wrong/unexpected**
- CURRENT player: 2 reps + Done button
- Joker set aside (out of play)
- Play continues normally

**Challenge mechanic**
- Challenged wrong → 1 rep always (no same-rank/color bonus); challenger resumes from new card
- Challenged right → challenger gets 3 reps; their turn ends

**In-game menu** — Reset preserves names/avatars/punishment; resets scores and deals fresh 56-card deck

### 4. Report findings

List each issue as:
- **[Rule]**: what the rule says → what the code does → verdict (✓ correct / ✗ bug)

Flag any edge case not covered.
