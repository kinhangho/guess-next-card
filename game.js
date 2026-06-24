// ── State ──────────────────────────────────────────────────────────────────
const G = {
  players: [],            // { name, pushUps, healthCards }
  deck: [],
  currentCard: null,
  lastGuess: null,
  currentPlayerIndex: 0,
  sidePile: [],           // jokers removed from play
  phase: 'guessing',      // guessing | correct | wrong | others-penalty
  pendingPushUps: 0,
  penaltyQueue: [],       // player indices still owing push-ups (joker penalty)
  passAvailable: false,
};

// ── Deck ───────────────────────────────────────────────────────────────────
function buildDeck() {
  const suits  = ['♠','♥','♦','♣'];
  const colors = { '♠':'black','♥':'red','♦':'red','♣':'black' };
  const ranks  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck   = [];

  for (const suit of suits)
    for (const rank of ranks)
      deck.push({ rank, suit, color: colors[suit],
                  type: ['J','Q','K'].includes(rank) ? 'face' : 'number' });

  deck.push({ rank:'JOKER', suit:'★', color:'red',   type:'joker', label:'Red Joker'   });
  deck.push({ rank:'JOKER', suit:'★', color:'black', type:'joker', label:'Black Joker' });
  deck.push({ rank:'❤',     suit:'✚', color:'green', type:'health', label:'Health Card' });
  deck.push({ rank:'❤',     suit:'✚', color:'green', type:'health', label:'Health Card' });

  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rankVal(rank) {
  return { A:1, J:11, Q:12, K:13 }[rank] ?? parseInt(rank);
}

// ── Setup ──────────────────────────────────────────────────────────────────
(function initSetup() {
  const row = document.getElementById('count-row');
  for (let n = 2; n <= 10; n++) {
    const btn = document.createElement('button');
    btn.className = 'count-btn';
    btn.textContent = n;
    btn.onclick = () => selectCount(n, btn);
    row.appendChild(btn);
  }
})();

function selectCount(n, btn) {
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const sec = document.getElementById('name-section');
  const inp = document.getElementById('name-inputs');
  inp.innerHTML = '';
  sec.classList.remove('hidden');

  for (let i = 1; i <= n; i++) {
    const input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = `Player ${i}`;
    input.value       = `Player ${i}`;
    input.id          = `pname-${i}`;
    inp.appendChild(input);
  }
}

function startGame() {
  const inputs = document.querySelectorAll('#name-inputs input');
  G.players = [...inputs].map(inp => ({
    name: inp.value.trim() || inp.placeholder,
    pushUps: 0,
    healthCards: [],
  }));

  G.deck              = buildDeck();
  G.currentPlayerIndex = 0;
  G.sidePile          = [];
  G.phase             = 'guessing';
  G.pendingPushUps    = 0;
  G.penaltyQueue      = [];
  G.passAvailable     = false;
  G.lastGuess         = null;

  // First card must be a number or face card
  G.currentCard = drawStartCard();

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  renderAll();
}

function drawStartCard() {
  while (G.deck.length > 0) {
    const card = G.deck.shift();
    if (card.type === 'joker')  { G.sidePile.push(card); continue; }
    if (card.type === 'health') { G.players[0].healthCards.push(card); continue; }
    return card;
  }
  return null;
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderAll() {
  renderScoreboard();
  renderCard('current-card', G.currentCard);
  renderCard('next-card', null);
  renderDeckCount();
  renderTurnBanner();
  renderResultIndicator();
  renderFlipZone();
  renderGuessZone();
  renderActionZone();
  renderPenaltyZone();
  renderSidePile();
  clearMsg();
}

function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  el.innerHTML = '';
  G.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-entry' + (i === G.currentPlayerIndex ? ' active' : '');
    div.innerHTML = `
      <div class="pname">${esc(p.name)}</div>
      <div class="pstats">💪 Push-ups: ${p.pushUps}</div>
      ${p.healthCards.length ? `<div class="phealth">${'💚'.repeat(p.healthCards.length)}</div>` : ''}
    `;
    el.appendChild(div);
  });
}

function renderCard(id, card) {
  const el = document.getElementById(id);
  if (!card) {
    el.className = 'card back';
    el.innerHTML = '?';
    return;
  }

  el.className = 'card';

  if (card.type === 'health') {
    el.classList.add('health-card');
    el.innerHTML = `<div class="special-label">Health</div><div style="font-size:2.2rem">❤️</div>`;
    return;
  }

  if (card.type === 'joker') {
    el.classList.add('joker-card', card.color === 'red' ? 'red-card' : 'black-card');
    el.innerHTML = `
      <div class="special-label">Joker</div>
      <div style="font-size:2rem">🃏</div>
      <div class="special-label">${card.color}</div>
    `;
    return;
  }

  el.classList.add(card.color === 'red' ? 'red-card' : 'black-card');
  el.innerHTML = `
    <div class="corner-tl">${card.rank}<br>${card.suit}</div>
    <div class="rank">${card.rank}</div>
    <div class="suit">${card.suit}</div>
    <div class="corner-br">${card.rank}<br>${card.suit}</div>
  `;
}

function renderDeckCount() {
  document.getElementById('deck-count').textContent = `🂠 ${G.deck.length} cards`;
}

function renderTurnBanner() {
  const p = G.players[G.currentPlayerIndex];
  document.getElementById('turn-banner').textContent = `${p.name}'s Turn`;
}

function renderFlipZone() {
  const zone = document.getElementById('flip-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;
  const p = G.players[G.currentPlayerIndex];
  if (p.healthCards.length >= 2) {
    zone.appendChild(btn('🔮 Flip −2 (peek next card)', 'btn btn-flip', useFlip));
  }
}

function renderGuessZone() {
  const zone = document.getElementById('guess-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;

  const card = G.currentCard;
  if (!card) return;

  if (card.type === 'number') {
    zone.appendChild(btn('▲ Higher', 'btn btn-higher', () => guess('higher')));
    zone.appendChild(btn('▼ Lower',  'btn btn-lower',  () => guess('lower')));
  } else {
    zone.appendChild(btn('🔴 Red',   'btn btn-red',    () => guess('red')));
    zone.appendChild(btn('⚫ Black', 'btn btn-black',  () => guess('black')));
  }
  zone.appendChild(btn('🃏 Joker', 'btn btn-joker', () => guess('joker')));
}

function renderActionZone() {
  const zone = document.getElementById('action-zone');
  zone.innerHTML = '';
  if (G.phase !== 'correct') { zone.classList.add('hidden'); return; }
  zone.classList.remove('hidden');
  if (G.passAvailable)
    zone.appendChild(btn('Pass ➡', 'btn btn-pass', passPlayer));
  zone.appendChild(btn('Continue ▶', 'btn btn-continue', continuePlay));
}

function renderPenaltyZone() {
  const zone = document.getElementById('penalty-zone');
  zone.innerHTML = '';

  if (G.phase === 'wrong') {
    zone.classList.remove('hidden');
    const p = G.players[G.currentPlayerIndex];
    const count = G.pendingPushUps;
    zone.innerHTML = `
      <div class="pushup-num">${count}×</div>
      <div class="pushup-label">${p.name} — Push-Up${count > 1 ? 's' : ''}!</div>
    `;
    // Skip option if player has health cards
    if (p.healthCards.length > 0) {
      zone.appendChild(btn('💚 Skip (use 1 health card)', 'btn btn-skip', skipPenalty));
    }
    zone.appendChild(btn('Done ✓', 'btn btn-done', donePenalty));

  } else if (G.phase === 'others-penalty') {
    if (G.penaltyQueue.length === 0) { finishOthersPenalty(); return; }
    zone.classList.remove('hidden');
    const idx = G.penaltyQueue[0];
    const p = G.players[idx];
    zone.innerHTML = `
      <div class="pushup-num">2×</div>
      <div class="pushup-label">${p.name} — Joker Penalty!</div>
    `;
    zone.appendChild(btn(`${p.name}: Done ✓`, 'btn btn-done', () => confirmOtherDone(idx)));

  } else {
    zone.classList.add('hidden');
  }
}

function renderResultIndicator() {
  const labelCurrent = document.getElementById('label-current');
  const labelNext    = document.getElementById('label-next');
  const badge        = document.getElementById('result-badge');

  if (G.phase === 'guessing') {
    labelCurrent.textContent = 'Current Card';
    labelNext.textContent    = 'Next Card';
    badge.className = 'result-badge hidden';
    badge.textContent = '';
    return;
  }

  if (G.phase === 'others-penalty') {
    labelCurrent.textContent = 'Current Card';
    labelNext.textContent    = 'Joker Drawn';
    badge.textContent = '✓ JOKER';
    badge.className   = 'result-badge correct-badge';
    return;
  }

  labelCurrent.textContent = 'Previous';
  labelNext.textContent    = 'Drawn';

  const labels = {
    higher: 'HIGHER', lower: 'LOWER',
    red: 'RED', black: 'BLACK', joker: 'JOKER',
  };
  const guessLabel = labels[G.lastGuess] ?? G.lastGuess.toUpperCase();
  const correct = G.phase === 'correct';
  badge.textContent = correct ? `✓ ${guessLabel}` : `✗ ${guessLabel}`;
  badge.className = '';
  void badge.offsetWidth; // force reflow to restart animation
  badge.className = `result-badge ${correct ? 'correct-badge' : 'wrong-badge'}`;
}

function renderSidePile() {
  const el = document.getElementById('side-pile');
  el.innerHTML = '';
  if (G.sidePile.length === 0) {
    el.innerHTML = '<div style="color:#4b5563;font-size:0.78rem;text-align:center">Empty</div>';
    return;
  }
  G.sidePile.forEach(c => {
    const d = document.createElement('div');
    d.className = `side-card ${c.color === 'red' ? 'red-joker' : 'black-joker'}`;
    d.innerHTML = `<div>🃏</div><div>${c.color}</div>`;
    el.appendChild(d);
  });
}

// ── Guess Logic ────────────────────────────────────────────────────────────
function guess(choice) {
  if (G.deck.length === 0) { showMsg('Deck is empty — game over!', 'info'); return; }

  G.lastGuess = choice;

  const next = G.deck.shift();
  renderCard('next-card', next);
  renderDeckCount();

  // Health card: player collects it, no penalty, no card change
  if (next.type === 'health') {
    const p = G.players[G.currentPlayerIndex];
    p.healthCards.push(next);
    showMsg(`💚 Health Card! ${p.name} receives a health card. Keep guessing!`, 'health');
    renderScoreboard();
    renderFlipZone();
    // Current card unchanged, stay in guessing phase
    setTimeout(() => {
      renderGuessZone();
    }, 100);
    return;
  }

  // Joker guess
  if (choice === 'joker') {
    handleJokerGuess(next);
    return;
  }

  // Unexpected joker
  if (next.type === 'joker') {
    G.sidePile.push(next);
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += 2;
    G.pendingPushUps = 2;
    showMsg(`🃏 Joker drawn! ${p.name} does 2 push-ups! Joker goes to side pile.`, 'wrong');
    G.phase = 'wrong';
    renderScoreboard();
    renderResultIndicator();
    renderGuessZone();
    renderActionZone();
    renderPenaltyZone();
    renderSidePile();
    return;
  }

  // Normal evaluation
  const result = evaluate(choice, G.currentCard, next);

  if (result.correct) {
    G.currentCard = next;
    G.passAvailable = true;
    G.phase = 'correct';
    showMsg(`✅ Correct! ${cardName(next)}`, 'correct');
  } else {
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += result.pushUps;
    G.pendingPushUps = result.pushUps;
    G.currentCard = next;
    G.phase = 'wrong';
    showMsg(
      `❌ Wrong! ${result.reason ? result.reason + ' — ' : ''}${cardName(next)}. ` +
      `${p.name} does ${result.pushUps} push-up${result.pushUps > 1 ? 's' : ''}!`,
      'wrong'
    );
  }

  renderScoreboard();
  renderResultIndicator();
  renderGuessZone();
  renderActionZone();
  renderPenaltyZone();
}

function evaluate(choice, current, next) {
  const cv = rankVal(current.rank);
  const nv = rankVal(next.rank);
  const sameRank  = (cv === nv);
  const sameColor = (current.color === next.color);

  if (sameRank && sameColor) return { correct: false, pushUps: 3, reason: 'Same rank & same color' };
  if (sameRank)               return { correct: false, pushUps: 2, reason: 'Same rank' };

  let correct = false;
  if (current.type === 'number') {
    if (choice === 'higher') correct = nv > cv;
    if (choice === 'lower')  correct = nv < cv;
  } else { // face
    if (choice === 'red')   correct = next.color === 'red';
    if (choice === 'black') correct = next.color === 'black';
  }
  return { correct, pushUps: 1 };
}

function handleJokerGuess(next) {
  if (next.type === 'joker') {
    // Correct: others penalised, current player continues from same card
    G.sidePile.push(next);
    G.penaltyQueue = G.players.map((_, i) => i).filter(i => i !== G.currentPlayerIndex);
    G.penaltyQueue.forEach(i => { G.players[i].pushUps += 2; });
    showMsg(`🃏 Joker! Correct! All other players do 2 push-ups!`, 'correct');
    G.phase = 'others-penalty';
  } else {
    // Wrong: current player does 2 push-ups, next card becomes current
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += 2;
    G.pendingPushUps = 2;
    G.currentCard = next;
    G.phase = 'wrong';
    showMsg(`❌ Not a Joker! ${cardName(next)}. ${p.name} does 2 push-ups!`, 'wrong');
  }
  renderScoreboard();
  renderResultIndicator();
  renderGuessZone();
  renderActionZone();
  renderPenaltyZone();
  renderSidePile();
}

// ── Penalty Buttons ────────────────────────────────────────────────────────
function donePenalty() {
  G.phase = 'guessing';
  G.pendingPushUps = 0;
  clearMsg();
  renderAll();
}

function skipPenalty() {
  const p = G.players[G.currentPlayerIndex];
  p.healthCards.pop();
  // Push-ups NOT added to count (cancel the pending ones)
  p.pushUps -= G.pendingPushUps; // remove the pushups we added earlier
  G.pendingPushUps = 0;
  G.phase = 'guessing';
  showMsg(`💚 Skip used! ${p.name} avoids the penalty.`, 'health');
  renderAll();
}

function confirmOtherDone(idx) {
  G.penaltyQueue = G.penaltyQueue.filter(i => i !== idx);
  if (G.penaltyQueue.length === 0) finishOthersPenalty();
  else renderPenaltyZone();
}

function finishOthersPenalty() {
  G.phase = 'guessing';
  clearMsg();
  renderAll();
}

// ── Pass / Continue ────────────────────────────────────────────────────────
function passPlayer() {
  G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
  G.phase = 'guessing';
  G.passAvailable = false;
  clearMsg();
  renderAll();
}

function continuePlay() {
  G.phase = 'guessing';
  G.passAvailable = false;
  clearMsg();
  renderAll();
}

// ── Health: Flip −2 ────────────────────────────────────────────────────────
function useFlip() {
  const p = G.players[G.currentPlayerIndex];
  if (p.healthCards.length < 2 || G.deck.length === 0) return;

  const peekCard = G.deck[0]; // peek without removing

  // Return both health cards to random positions in the remaining deck (not pos 0)
  const hc1 = p.healthCards.pop();
  const hc2 = p.healthCards.pop();
  insertRandom(hc1);
  insertRandom(hc2);

  // Show peek modal
  renderCard('peek-card', peekCard);
  document.getElementById('peek-modal').classList.remove('hidden');

  renderScoreboard();
  renderFlipZone();
}

function insertRandom(card) {
  if (G.deck.length <= 1) { G.deck.push(card); return; }
  const pos = Math.floor(Math.random() * (G.deck.length - 1)) + 1;
  G.deck.splice(pos, 0, card);
}

function closePeek() {
  document.getElementById('peek-modal').classList.add('hidden');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function btn(text, className, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = className;
  b.onclick = onClick;
  return b;
}

function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = `msg ${type}`;
  el.classList.remove('hidden');
}

function clearMsg() {
  document.getElementById('msg').classList.add('hidden');
}

function cardName(card) {
  if (card.type === 'health') return 'Health Card';
  if (card.type === 'joker')  return `${card.color} Joker`;
  return `${card.rank}${card.suit}`;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
