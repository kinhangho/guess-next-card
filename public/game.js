// ── Mode & Online State ───────────────────────────────────────────────────────
let MODE = 'offline';   // 'offline' | 'online'
let socket = null;
let myPlayerIndex = -1;
let currentRoomId = null;
let isHost = false;

// ── Shared Game State (G) ─────────────────────────────────────────────────────
// In offline mode: mutated directly by game logic functions.
// In online mode:  populated from server 'game-state' events.
const G = {
  players: [],
  deck: [],             // offline only (full deck)
  deckCount: 0,         // online uses this
  currentCard: null,
  drawnCard: null,      // card revealed during current guess
  currentPlayerIndex: 0,
  sidePile: [],
  phase: 'guessing',
  pendingPushUps: 0,
  penaltyQueue: [],
  passAvailable: false,
  message: null,
  peekCard: null,
  status: 'lobby',
};

// ── Action Dispatch ───────────────────────────────────────────────────────────
// All game-altering calls go through ACTION so render functions are mode-agnostic.
const ACTION = {
  guess(choice) {
    if (MODE === 'online') socket.emit('guess', { roomId: currentRoomId, choice });
    else offlineGuess(choice);
  },
  pass() {
    if (MODE === 'online') socket.emit('pass', { roomId: currentRoomId });
    else offlinePass();
  },
  continuePlay() {
    if (MODE === 'online') socket.emit('continue-play', { roomId: currentRoomId });
    else offlineContinue();
  },
  donePenalty() {
    if (MODE === 'online') socket.emit('done-penalty', { roomId: currentRoomId });
    else offlineDonePenalty();
  },
  skipPenalty() {
    if (MODE === 'online') socket.emit('skip-penalty', { roomId: currentRoomId });
    else offlineSkipPenalty();
  },
  confirmOtherDone(idx) {
    if (MODE === 'online') socket.emit('confirm-other-done', { roomId: currentRoomId });
    else offlineConfirmOther(idx);
  },
  useFlip() {
    if (MODE === 'online') socket.emit('use-flip', { roomId: currentRoomId });
    else offlineUseFlip();
  },
  closePeek() {
    if (MODE === 'online') socket.emit('close-peek', { roomId: currentRoomId });
    else offlineClosePeek();
  },
};

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(id) {
  ['home-screen','online-screen','lobby-screen','setup-screen','game-screen']
    .forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id));
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Online: Socket setup ──────────────────────────────────────────────────────
function initSocket() {
  if (socket && socket.connected) return;
  socket = io();

  socket.on('game-state', (room) => {
    myPlayerIndex = room.myIndex;
    currentRoomId = room.id;
    isHost = room.hostSocketId === socket.id;

    // Sync G from server state
    G.players            = room.players;
    G.deckCount          = room.deckCount;
    G.currentCard        = room.currentCard;
    G.drawnCard          = room.drawnCard;
    G.currentPlayerIndex = room.currentPlayerIndex;
    G.sidePile           = room.sidePile;
    G.phase              = room.phase;
    G.pendingPushUps     = room.pendingPushUps;
    G.penaltyQueue       = room.penaltyQueue;
    G.passAvailable      = room.passAvailable;
    G.message            = room.message;
    G.peekCard           = room.peekCard;
    G.status             = room.status;

    if (room.status === 'lobby') {
      renderLobby(room);
    } else {
      showScreen('game-screen');
      renderAll();
    }

    if (room.peekCard) {
      renderCard('peek-card', room.peekCard);
      document.getElementById('peek-modal').classList.remove('hidden');
    }
  });

  socket.on('public-rooms', renderPublicRooms);

  socket.on('error', (msg) => {
    // Show error on whichever online screen is visible
    const onEl = document.getElementById('online-error');
    const lobEl = document.getElementById('lobby-error');
    if (!onEl.closest('#online-screen').classList.contains('hidden')) showError('online-error', msg);
    else showError('lobby-error', msg);
  });
}

// ── Online: Room management ───────────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { showError('online-error', 'Enter your name first'); return; }
  const isPrivate = document.getElementById('room-private').checked;
  socket.emit('create-room', { playerName: name, isPrivate });
}

function joinRoomByCode() {
  const name = document.getElementById('online-name').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) { showError('online-error', 'Enter your name first'); return; }
  if (!code) { showError('online-error', 'Enter a room code'); return; }
  socket.emit('join-room', { roomId: code, playerName: name });
}

function joinPublicRoom(roomId) {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { showError('online-error', 'Enter your name first'); return; }
  socket.emit('join-room', { roomId, playerName: name });
}

function startOnlineGame() {
  socket.emit('start-game', { roomId: currentRoomId });
}

function leaveRoom() {
  if (socket && currentRoomId) socket.emit('leave-room', { roomId: currentRoomId });
  currentRoomId = null;
  showScreen('home-screen');
}

function fetchPublicRooms() {
  if (socket) socket.emit('get-public-rooms');
}

function copyRoomCode() {
  const code = document.getElementById('room-code-value').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.querySelector('#room-code-box .btn') || document.querySelector('.room-code-box .btn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
}

// ── Online: Tab switching ─────────────────────────────────────────────────────
function switchTab(name) {
  ['create','join','browse'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
    document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === name);
  });
  if (name === 'browse') fetchPublicRooms();
  document.getElementById('online-error').classList.add('hidden');
}

// ── Online: Render lobby ──────────────────────────────────────────────────────
function renderLobby(room) {
  showScreen('lobby-screen');

  // Room code (private rooms only)
  const codeBox = document.getElementById('room-code-display');
  if (room.isPrivate) {
    document.getElementById('room-code-value').textContent = room.id;
    codeBox.classList.remove('hidden');
  } else {
    codeBox.classList.add('hidden');
  }

  // Player list
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  room.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'lobby-player' + (p.socketId === room.hostSocketId ? ' host' : '');
    div.innerHTML = `<div class="lp-dot"></div><span class="lp-name">${esc(p.name)}</span>${i === room.myIndex ? '<span style="color:#fbbf24;font-size:0.78rem;margin-left:auto">(you)</span>' : ''}`;
    list.appendChild(div);
  });

  // Status & start button
  const startBtn = document.getElementById('start-game-btn');
  const statusEl = document.getElementById('lobby-status');
  if (isHost) {
    startBtn.classList.toggle('hidden', room.players.length < 2);
    statusEl.textContent = room.players.length < 2 ? 'Waiting for at least 1 more player…' : `${room.players.length} players ready`;
  } else {
    startBtn.classList.add('hidden');
    statusEl.textContent = `Waiting for host to start… (${room.players.length} players)`;
  }
}

// ── Online: Render public rooms list ─────────────────────────────────────────
function renderPublicRooms(list) {
  const el = document.getElementById('public-rooms-list');
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="rooms-empty">No open rooms. Create one!</div>';
    return;
  }
  el.innerHTML = '';
  list.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `
      <div class="room-item-info">
        <div class="room-item-host">${esc(r.hostName)}'s room</div>
        <div class="room-item-count">${r.playerCount}/10 players</div>
      </div>
    `;
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-gold';
    joinBtn.textContent = 'Join';
    joinBtn.onclick = () => joinPublicRoom(r.id);
    div.appendChild(joinBtn);
    el.appendChild(div);
  });
}

// ── Offline: Setup ────────────────────────────────────────────────────────────
function initOfflineSetup() {
  const row = document.getElementById('count-row');
  if (row.children.length > 0) return; // already built
  for (let n = 2; n <= 10; n++) {
    const btn = document.createElement('button');
    btn.className = 'count-btn';
    btn.textContent = n;
    btn.onclick = () => selectCount(n, btn);
    row.appendChild(btn);
  }
}

function selectCount(n, btn) {
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const sec = document.getElementById('name-section');
  const inp = document.getElementById('name-inputs');
  inp.innerHTML = '';
  sec.classList.remove('hidden');
  for (let i = 1; i <= n; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Player ${i}`;
    input.value = `Player ${i}`;
    input.id = `pname-${i}`;
    inp.appendChild(input);
  }
}

function startOfflineGame() {
  MODE = 'offline';
  const inputs = document.querySelectorAll('#name-inputs input');
  G.players = [...inputs].map(inp => ({
    name: inp.value.trim() || inp.placeholder,
    pushUps: 0,
    healthCards: [],
  }));
  G.deck              = buildDeck();
  G.deckCount         = G.deck.length;
  G.currentPlayerIndex = 0;
  G.sidePile          = [];
  G.phase             = 'guessing';
  G.pendingPushUps    = 0;
  G.penaltyQueue      = [];
  G.passAvailable     = false;
  G.drawnCard         = null;
  G.message           = null;
  G.peekCard          = null;
  G.currentCard       = offlineDrawStartCard();
  showScreen('game-screen');
  renderAll();
}

// ── Shared Deck helpers ───────────────────────────────────────────────────────
function buildDeck() {
  const suits  = ['♠','♥','♦','♣'];
  const colors = { '♠':'black','♥':'red','♦':'red','♣':'black' };
  const ranks  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck   = [];
  for (const suit of suits)
    for (const rank of ranks)
      deck.push({ rank, suit, color: colors[suit], type: ['J','Q','K'].includes(rank) ? 'face' : 'number' });
  deck.push({ rank:'JOKER', suit:'★', color:'red',   type:'joker',  label:'Red Joker'   });
  deck.push({ rank:'JOKER', suit:'★', color:'black', type:'joker',  label:'Black Joker' });
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

function offlineDrawStartCard() {
  while (G.deck.length > 0) {
    const card = G.deck.shift();
    if (card.type === 'joker')  { G.sidePile.push(card); continue; }
    if (card.type === 'health') { G.players[0].healthCards.push(card); continue; }
    return card;
  }
  return null;
}

// ── Render (shared, reads G) ──────────────────────────────────────────────────
function renderAll() {
  renderScoreboard();
  renderCard('current-card', G.currentCard);
  renderCard('next-card', G.drawnCard);
  renderDeckCount();
  renderTurnBanner();
  renderFlipZone();
  renderWaitingBanner();
  renderGuessZone();
  renderActionZone();
  renderPenaltyZone();
  renderSidePile();
  if (G.message) showMsg(G.message.text, G.message.type);
  else clearMsg();
}

function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  el.innerHTML = '';
  G.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-entry' + (i === G.currentPlayerIndex ? ' active' : '');
    const isMe = MODE === 'online' && i === myPlayerIndex;
    div.innerHTML = `
      <div class="pname">${esc(p.name)}${isMe ? ' <span class="pme">(you)</span>' : ''}</div>
      <div class="pstats">💪 ${p.pushUps}</div>
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
    el.innerHTML = `<div class="special-label">Joker</div><div style="font-size:2rem">🃏</div><div class="special-label">${card.color}</div>`;
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
  const count = MODE === 'online' ? G.deckCount : G.deck.length;
  document.getElementById('deck-count').textContent = `🂠 ${count} cards`;
}

function renderTurnBanner() {
  const p = G.players[G.currentPlayerIndex];
  if (!p) return;
  const label = (MODE === 'online' && G.currentPlayerIndex === myPlayerIndex) ? `Your Turn (${p.name})` : `${p.name}'s Turn`;
  document.getElementById('turn-banner').textContent = label;
}

function renderFlipZone() {
  const zone = document.getElementById('flip-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;
  const activeIdx = MODE === 'online' ? myPlayerIndex : G.currentPlayerIndex;
  if (activeIdx !== G.currentPlayerIndex) return; // not your turn in online
  const p = G.players[G.currentPlayerIndex];
  if (p && p.healthCards.length >= 2)
    zone.appendChild(mkBtn('🔮 Flip −2 (peek next card)', 'btn btn-flip', () => ACTION.useFlip()));
}

function renderWaitingBanner() {
  const banner = document.getElementById('waiting-banner');
  if (MODE !== 'online' || G.phase !== 'guessing') { banner.classList.add('hidden'); return; }
  if (G.currentPlayerIndex === myPlayerIndex) { banner.classList.add('hidden'); return; }
  const name = G.players[G.currentPlayerIndex]?.name || '?';
  banner.textContent = `Waiting for ${name} to guess…`;
  banner.classList.remove('hidden');
}

function renderGuessZone() {
  const zone = document.getElementById('guess-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;
  // In online mode only show buttons to the active player
  if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) return;
  const card = G.currentCard;
  if (!card) return;
  if (card.type === 'number') {
    zone.appendChild(mkBtn('▲ Higher', 'btn btn-higher', () => ACTION.guess('higher')));
    zone.appendChild(mkBtn('▼ Lower',  'btn btn-lower',  () => ACTION.guess('lower')));
  } else {
    zone.appendChild(mkBtn('🔴 Red',   'btn btn-red',   () => ACTION.guess('red')));
    zone.appendChild(mkBtn('⚫ Black', 'btn btn-black', () => ACTION.guess('black')));
  }
  zone.appendChild(mkBtn('🃏 Joker', 'btn btn-joker', () => ACTION.guess('joker')));
}

function renderActionZone() {
  const zone = document.getElementById('action-zone');
  zone.innerHTML = '';
  if (G.phase !== 'correct') { zone.classList.add('hidden'); return; }
  // In online mode only active player controls Pass/Continue
  if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) { zone.classList.add('hidden'); return; }
  zone.classList.remove('hidden');
  if (G.passAvailable) zone.appendChild(mkBtn('Pass ➡', 'btn btn-pass', () => ACTION.pass()));
  zone.appendChild(mkBtn('Continue ▶', 'btn btn-continue', () => ACTION.continuePlay()));
}

function renderPenaltyZone() {
  const zone = document.getElementById('penalty-zone');
  zone.innerHTML = '';

  if (G.phase === 'wrong') {
    // In online mode, only the current player sees the Done/Skip buttons
    if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) {
      // Other players see a passive penalty display
      zone.classList.remove('hidden');
      const p = G.players[G.currentPlayerIndex];
      zone.innerHTML = `
        <div class="pushup-num">${G.pendingPushUps}×</div>
        <div class="pushup-label">${esc(p?.name ?? '')} doing push-ups…</div>
      `;
      return;
    }
    zone.classList.remove('hidden');
    const p = G.players[G.currentPlayerIndex];
    zone.innerHTML = `
      <div class="pushup-num">${G.pendingPushUps}×</div>
      <div class="pushup-label">${esc(p?.name ?? '')} — Push-Up${G.pendingPushUps > 1 ? 's' : ''}!</div>
    `;
    if (p && p.healthCards.length > 0)
      zone.appendChild(mkBtn('💚 Skip (use 1 health card)', 'btn btn-skip', () => ACTION.skipPenalty()));
    zone.appendChild(mkBtn('Done ✓', 'btn btn-done', () => ACTION.donePenalty()));

  } else if (G.phase === 'others-penalty') {
    if (G.penaltyQueue.length === 0) {
      if (MODE === 'offline') { offlineFinishOthersPenalty(); return; }
      zone.classList.add('hidden'); return;
    }

    if (MODE === 'online') {
      // Each penalised player sees their own Done button
      if (G.penaltyQueue.includes(myPlayerIndex)) {
        zone.classList.remove('hidden');
        zone.innerHTML = `
          <div class="pushup-num">2×</div>
          <div class="pushup-label">Joker penalty — do your push-ups!</div>
        `;
        zone.appendChild(mkBtn('Done ✓', 'btn btn-done', () => ACTION.confirmOtherDone(myPlayerIndex)));
      } else {
        zone.classList.remove('hidden');
        const names = G.penaltyQueue.map(i => G.players[i]?.name).filter(Boolean).join(', ');
        zone.innerHTML = `<div class="pushup-label" style="color:#9ca3af">Waiting for: ${esc(names)}</div>`;
      }
    } else {
      // Offline: show one at a time
      zone.classList.remove('hidden');
      const idx = G.penaltyQueue[0];
      const p = G.players[idx];
      zone.innerHTML = `
        <div class="pushup-num">2×</div>
        <div class="pushup-label">${esc(p?.name ?? '')} — Joker Penalty!</div>
      `;
      zone.appendChild(mkBtn(`${esc(p?.name ?? '')}: Done ✓`, 'btn btn-done', () => ACTION.confirmOtherDone(idx)));
    }
  } else {
    zone.classList.add('hidden');
  }
}

function renderSidePile() {
  const el = document.getElementById('side-pile');
  el.innerHTML = '';
  if (!G.sidePile || G.sidePile.length === 0) {
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

// ── Offline Game Logic ────────────────────────────────────────────────────────
function offlineEvaluate(choice, current, next) {
  const cv = rankVal(current.rank);
  const nv = rankVal(next.rank);
  if (cv === nv && current.color === next.color) return { correct: false, pushUps: 3, reason: 'Same rank & same color' };
  if (cv === nv)  return { correct: false, pushUps: 2, reason: 'Same rank' };
  let correct = false;
  if (current.type === 'number') {
    if (choice === 'higher') correct = nv > cv;
    if (choice === 'lower')  correct = nv < cv;
  } else {
    if (choice === 'red')   correct = next.color === 'red';
    if (choice === 'black') correct = next.color === 'black';
  }
  return { correct, pushUps: 1 };
}

function offlineGuess(choice) {
  if (G.deck.length === 0) { showMsg('Deck is empty — game over!', 'info'); return; }
  const next = G.deck.shift();
  G.drawnCard = next;

  if (next.type === 'health') {
    const p = G.players[G.currentPlayerIndex];
    p.healthCards.push(next);
    G.drawnCard = null;
    showMsg(`💚 Health Card! ${p.name} receives a health card. Keep guessing!`, 'health');
    renderScoreboard();
    renderFlipZone();
    renderGuessZone();
    return;
  }

  if (choice === 'joker') {
    if (next.type === 'joker') {
      G.sidePile.push(next);
      G.penaltyQueue = G.players.map((_, i) => i).filter(i => i !== G.currentPlayerIndex);
      G.penaltyQueue.forEach(i => { G.players[i].pushUps += 2; });
      showMsg(`🃏 Joker! Correct! All other players do 2 push-ups!`, 'correct');
      G.phase = 'others-penalty';
    } else {
      const p = G.players[G.currentPlayerIndex];
      p.pushUps += 2; G.pendingPushUps = 2;
      G.currentCard = next;
      G.phase = 'wrong';
      showMsg(`❌ Not a Joker! ${cardNameStr(next)}. ${p.name} does 2 push-ups!`, 'wrong');
    }
    renderAll();
    return;
  }

  if (next.type === 'joker') {
    G.sidePile.push(next);
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += 2; G.pendingPushUps = 2;
    showMsg(`🃏 Joker drawn! ${p.name} does 2 push-ups!`, 'wrong');
    G.phase = 'wrong';
    renderAll();
    return;
  }

  const result = offlineEvaluate(choice, G.currentCard, next);
  if (result.correct) {
    G.currentCard = next;
    G.passAvailable = true;
    G.phase = 'correct';
    showMsg(`✅ Correct! ${cardNameStr(next)}`, 'correct');
  } else {
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += result.pushUps;
    G.pendingPushUps = result.pushUps;
    G.currentCard = next;
    G.phase = 'wrong';
    showMsg(`❌ Wrong! ${result.reason ? result.reason + ' — ' : ''}${cardNameStr(next)}. ${p.name} does ${result.pushUps} push-up${result.pushUps > 1 ? 's' : ''}!`, 'wrong');
  }
  renderAll();
}

function offlineDonePenalty() {
  G.phase = 'guessing'; G.pendingPushUps = 0; G.drawnCard = null; clearMsg(); renderAll();
}

function offlineSkipPenalty() {
  const p = G.players[G.currentPlayerIndex];
  p.healthCards.pop();
  p.pushUps -= G.pendingPushUps;
  G.pendingPushUps = 0;
  G.phase = 'guessing';
  G.drawnCard = null;
  showMsg(`💚 Skip used! ${p.name} avoids the penalty.`, 'health');
  renderAll();
}

function offlineConfirmOther(idx) {
  G.penaltyQueue = G.penaltyQueue.filter(i => i !== idx);
  if (G.penaltyQueue.length === 0) offlineFinishOthersPenalty();
  else renderPenaltyZone();
}

function offlineFinishOthersPenalty() {
  G.phase = 'guessing'; clearMsg(); renderAll();
}

function offlinePass() {
  G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
  G.phase = 'guessing'; G.passAvailable = false; G.drawnCard = null; clearMsg(); renderAll();
}

function offlineContinue() {
  G.phase = 'guessing'; G.passAvailable = false; G.drawnCard = null; clearMsg(); renderAll();
}

function offlineUseFlip() {
  const p = G.players[G.currentPlayerIndex];
  if (p.healthCards.length < 2 || G.deck.length === 0) return;
  G.peekCard = G.deck[0];
  const hc1 = p.healthCards.pop();
  const hc2 = p.healthCards.pop();
  offlineInsertRandom(hc1);
  offlineInsertRandom(hc2);
  renderCard('peek-card', G.peekCard);
  document.getElementById('peek-modal').classList.remove('hidden');
  renderScoreboard();
  renderFlipZone();
}

function offlineClosePeek() {
  G.peekCard = null;
  document.getElementById('peek-modal').classList.add('hidden');
}

function offlineInsertRandom(card) {
  if (G.deck.length <= 1) { G.deck.push(card); return; }
  const pos = Math.floor(Math.random() * (G.deck.length - 1)) + 1;
  G.deck.splice(pos, 0, card);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkBtn(text, className, onClick) {
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

function cardNameStr(card) {
  if (card.type === 'health') return 'Health Card';
  if (card.type === 'joker')  return `${card.color} Joker`;
  return `${card.rank}${card.suit}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
