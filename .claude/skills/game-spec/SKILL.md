---
name: game-spec
version: 1.0.0
description: Turn a game feature idea into a backlog-ready spec — covers rules impact, UI changes, edge cases, and implementation notes for Guess Next Card.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
triggers:
  - write a spec for
  - spec this out
  - design this feature
  - how should we build
  - plan this feature
---

## When to invoke this skill

Use when the user wants to design or spec a new game feature before implementing it — e.g. "spec out the tournament mode", "how should we build a replay feature", "write a spec for leaderboards".

## Spec template

Produce a spec with these sections:

### Feature: [Name]

**Summary** — 1–2 sentence description of what it does and why.

**Rules impact** — How does this change or extend the existing game rules in CLAUDE.md? List every rule that needs updating.

**UI changes**
- Setup screen
- In-game HUD / guess zone / penalty zone
- Scoreboard
- In-game menu

**Game state changes** — What new fields are needed in `G` (the global game state object in `game.js`)?

**Edge cases**
- List at least 3 edge cases that need handling

**Implementation notes**
- Files to change: `game.js`, `server.js`, `index.html`, `style.css`
- Estimated complexity: Small / Medium / Large
- Risks or open questions

**Acceptance criteria** — Bullet checklist of what "done" looks like; can be dropped straight into `/game-qa`.

## Context

- Game state object is `G` (global in `game.js`)
- Offline play is fully client-side in `game.js`
- Online play uses Socket.io events in `server.js`; any new game state must be synced via events
- CLAUDE.md is the authoritative spec — update it when the feature ships
