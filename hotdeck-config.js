// ── HOT DECK — data-driven config ───────────────────────────────────────────
// Danger Zone band thresholds/colors and Blaze's dialogue live here so tuning
// the visual identity never means touching game.js logic. (Scoring/punishment
// itself still runs on the original Heat/Streak rules in game.js — this file
// only drives the Danger Meter's color bands and Blaze's reactions to heat.)

// Danger Zone bands — heat level 1-10 maps to a band for the meter/Blaze.
const DANGER_BANDS = [
  { id: 'safe',      label: 'SAFE',      min: 1, max: 3,  color: '#2ED06E' },
  { id: 'risk',      label: 'RISK',      min: 4, max: 6,  color: '#FFB800' },
  { id: 'danger',    label: 'DANGER',    min: 7, max: 9,  color: '#FF6A00' },
  { id: 'meltdown',  label: 'MELTDOWN',  min: 10, max: 10, color: '#FF2D2D' },
];

function dangerBandFor(level) {
  return DANGER_BANDS.find(b => level >= b.min && level <= b.max) || DANGER_BANDS[0];
}

// ── Blaze — mascot states & dialogue ────────────────────────────────────────
// Each state maps to a cropped reference image + a pool of lines. Deliberately
// event-driven (never random state selection) — only the LINE within a state
// is randomized for variety.
const BLAZE_STATES = {
  idle: {
    img: 'img/hotdeck/blaze-confident.png',
    lines: ["Let's see what you've got.", "Deal 'em.", "I've seen braver plays."],
  },
  safe: {
    img: 'img/hotdeck/blaze-confident.png',
    lines: ["Easy money.", "Still warming up.", "That's the safe stuff."],
  },
  risk: {
    img: 'img/hotdeck/blaze-danger.png',
    lines: ["Ooh, now it's interesting.", "Getting spicy.", "You feel that heat?"],
  },
  danger: {
    img: 'img/hotdeck/blaze-danger.png',
    lines: ["This is where it gets fun.", "One wrong move, champ.", "I'd bank it. But I'm not you."],
  },
  maxDanger: {
    img: 'img/hotdeck/blaze-danger.png',
    lines: ["MELTDOWN. No more safety net.", "This is the whole thing. Go."],
  },
  correct: {
    img: 'img/hotdeck/blaze-confident.png',
    lines: ["CORRECT! Told you.", "That's what I'm talking about!", "Nice read."],
  },
  burned: {
    img: 'img/hotdeck/blaze-burned.png',
    lines: ["OOF. Too hot that time.", "BURNED! That's gonna sting.", "Should've banked it."],
  },
  joker: {
    img: 'img/hotdeck/blaze-joker.png',
    lines: ["Call it. I dare you.", "Jokers make the night interesting."],
  },
  winner: {
    img: 'img/hotdeck/blaze-confident.png',
    lines: ["Now THAT'S a heat king.", "Respect. You played it perfectly."],
  },
};

function blazeLine(state) {
  const entry = BLAZE_STATES[state] || BLAZE_STATES.idle;
  const lines = entry.lines;
  return { img: entry.img, text: lines[Math.floor(Math.random() * lines.length)] };
}

// Maps a heat level (0-10) to the Blaze state used for ambient reaction
// (separate from one-shot events like 'correct'/'burned'/'joker').
function blazeStateForDanger(level) {
  if (level <= 0) return 'idle';
  const band = dangerBandFor(level);
  if (band.id === 'safe') return 'safe';
  if (band.id === 'risk') return 'risk';
  if (band.id === 'danger') return 'danger';
  return 'maxDanger';
}
