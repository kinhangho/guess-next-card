// ── Native detection (Capacitor) ─────────────────────────────────────────────
const IS_NATIVE = !!(window.Capacitor?.isNativePlatform?.());
if (IS_NATIVE) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('online-btn')?.classList.add('hidden');
    document.getElementById('native-note')?.classList.add('hidden');
  });
}

// ── Mode & Online State ───────────────────────────────────────────────────────
let MODE = 'offline';
let socket = null;
let myPlayerIndex = -1;
let currentRoomId = null;
let isHost = false;

// ── Shared Game State ─────────────────────────────────────────────────────────
const G = {
  players: [],
  deck: [],
  deckCount: 0,
  currentCard: null,
  drawnCard: null,
  currentPlayerIndex: 0,
  sidePile: [],
  // phases: guessing | correct | wrong | others-penalty | ended
  phase: 'guessing',
  pendingPushUps: 0,
  penaltyQueue: [],    // indices of players still owing push-ups (joker-correct)
  passAfterPenalty: false, // if true, Done → next player instead of continue
  passAvailable: false,
  message: null,
  peekCard: null,
  revealPause: false,
  challengerId: null,  // index of player who issued the challenge
  challengedIdx: null, // index of player being challenged (null = no challenge active)
};

// ── Action Dispatch ───────────────────────────────────────────────────────────
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
  challenge(targetIdx) {
    if (MODE === 'online') socket.emit('challenge-player', { roomId: currentRoomId, targetIdx });
    else offlineChallenge(targetIdx);
  },
  challengeGuess(choice) {
    if (MODE === 'online') socket.emit('challenge-guess', { roomId: currentRoomId, choice });
    else offlineChallengeGuess(choice);
  },
  cancelChallenge() {
    document.getElementById('challenge-modal').classList.add('hidden');
  },
};

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(id) {
  ['home-screen','online-screen','lobby-screen','setup-screen','game-screen','end-screen']
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
    const prevPhase = G.phase;
    myPlayerIndex        = room.myIndex;
    currentRoomId        = room.id;
    isHost               = room.hostSocketId === socket.id;
    G.players            = room.players;
    G.deckCount          = room.deckCount;
    G.currentCard        = room.currentCard;
    G.drawnCard          = room.drawnCard;
    G.currentPlayerIndex = room.currentPlayerIndex;
    G.sidePile           = room.sidePile;
    G.phase              = room.phase;
    G.pendingPushUps     = room.pendingPushUps;
    G.penaltyQueue       = room.penaltyQueue;
    G.passAfterPenalty   = room.passAfterPenalty;
    G.passAvailable      = room.passAvailable;
    G.message            = room.message;
    G.peekCard           = room.peekCard;
    G.challengerId       = room.challengerId ?? null;
    G.challengedIdx      = room.challengedIdx ?? null;

    const justResolved = prevPhase === 'guessing' &&
      (G.phase === 'correct' || G.phase === 'wrong' || G.phase === 'others-penalty') &&
      G.drawnCard != null;

    if (room.status === 'lobby') {
      renderLobby(room);
    } else if (room.phase === 'ended') {
      showScreen('end-screen');
      renderEndScreen();
    } else {
      showScreen('game-screen');
      if (justResolved) {
        triggerReveal();
      } else {
        renderAll();
      }
      if (room.peekCard) {
        renderCard('peek-card', room.peekCard);
        document.getElementById('peek-modal').classList.remove('hidden');
      }
    }
  });

  socket.on('public-rooms', renderPublicRooms);

  socket.on('error', (msg) => {
    if (!document.getElementById('online-screen').classList.contains('hidden'))
      showError('online-error', msg);
    else showError('lobby-error', msg);
  });
}

// ── Online: Room management ───────────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('online-name').value.trim();
  if (!name) { showError('online-error', 'Enter your name first'); return; }
  socket.emit('create-room', { playerName: name, isPrivate: document.getElementById('room-private').checked });
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

function startOnlineGame() { socket.emit('start-game', { roomId: currentRoomId }); }

function leaveRoom() {
  if (socket && currentRoomId) socket.emit('leave-room', { roomId: currentRoomId });
  currentRoomId = null;
  showScreen('home-screen');
}

function fetchPublicRooms() { if (socket) socket.emit('get-public-rooms'); }

function copyRoomCode() {
  const code = document.getElementById('room-code-value').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.querySelector('.room-code-box .btn');
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
  const codeBox = document.getElementById('room-code-display');
  if (room.isPrivate) {
    document.getElementById('room-code-value').textContent = room.id;
    codeBox.classList.remove('hidden');
  } else {
    codeBox.classList.add('hidden');
  }
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  room.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'lobby-player' + (p.socketId === room.hostSocketId ? ' host' : '');
    div.innerHTML = `<div class="lp-dot"></div><span class="lp-name">${esc(p.name)}</span>${i === room.myIndex ? '<span style="color:#fbbf24;font-size:0.78rem;margin-left:auto">(you)</span>' : ''}`;
    list.appendChild(div);
  });
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
  if (!list || list.length === 0) { el.innerHTML = '<div class="rooms-empty">No open rooms. Create one!</div>'; return; }
  el.innerHTML = '';
  list.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `<div class="room-item-info"><div class="room-item-host">${esc(r.hostName)}'s room</div><div class="room-item-count">${r.playerCount}/10 players</div></div>`;
    const b = document.createElement('button');
    b.className = 'btn btn-gold'; b.textContent = 'Join'; b.onclick = () => joinPublicRoom(r.id);
    div.appendChild(b); el.appendChild(div);
  });
}

// ── Offline: Setup ────────────────────────────────────────────────────────────
function initOfflineSetup() {
  const row = document.getElementById('count-row');
  if (row.children.length > 0) return;
  for (let n = 2; n <= 10; n++) {
    const btn = document.createElement('button');
    btn.className = 'count-btn'; btn.textContent = n;
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
    input.type = 'text'; input.placeholder = `Player ${i}`; input.value = `Player ${i}`; input.id = `pname-${i}`;
    inp.appendChild(input);
  }
}

function startOfflineGame() {
  MODE = 'offline';
  const inputs = document.querySelectorAll('#name-inputs input');
  G.players = [...inputs].map(inp => ({ name: inp.value.trim() || inp.placeholder, pushUps: 0, healthCards: [] }));
  G.deck               = buildDeck();
  G.deckCount          = G.deck.length;
  G.currentPlayerIndex = 0;
  G.sidePile           = [];
  G.phase              = 'guessing';
  G.pendingPushUps     = 0;
  G.penaltyQueue       = [];
  G.passAfterPenalty   = false;
  G.passAvailable      = false;
  G.drawnCard          = null;
  G.message            = null;
  G.peekCard           = null;
  G.currentCard        = offlineDrawStartCard();
  showScreen('game-screen');
  renderAll();
}

// ── Deck helpers ──────────────────────────────────────────────────────────────
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

function rankVal(rank) { return { A:1, J:11, Q:12, K:13 }[rank] ?? parseInt(rank); }

function offlineDrawStartCard() {
  while (G.deck.length > 0) {
    const card = G.deck.shift();
    if (card.type === 'joker')  { G.sidePile.push(card); continue; }
    if (card.type === 'health') { G.players[0].healthCards.push(card); continue; }
    return card;
  }
  return null;
}

// ── Render (shared) ───────────────────────────────────────────────────────────
function renderAll() {
  renderScoreboard();
  renderCard('current-card', G.currentCard);
  renderCard('next-card', G.revealPause ? G.drawnCard : null);
  renderDeckCount();
  renderTurnBanner();
  renderFlipZone();
  renderChallengeZone();
  renderWaitingBanner();
  renderGuessZone();
  renderActionZone();
  renderPenaltyZone();
  renderSidePile();
  if (G.message) showMsg(G.message.text, G.message.type);
  else clearMsg();
}

function triggerReveal() {
  G.revealPause = true;
  renderAll();
  const nextEl = document.getElementById('next-card');
  nextEl.classList.remove('reveal-anim');
  void nextEl.offsetWidth;
  nextEl.classList.add('reveal-anim');
  setTimeout(() => {
    G.revealPause = false;
    renderCard('next-card', null);
    renderActionZone();
    renderPenaltyZone();
    document.getElementById('action-zone').classList.add('action-fadein');
    document.getElementById('penalty-zone').classList.add('action-fadein');
  }, 1100);
}

function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  const existing = el.querySelectorAll('.player-entry');
  G.players.forEach((p, i) => {
    // Reuse existing chip so CSS transition fires on class toggle
    let div = existing[i];
    if (!div) { div = document.createElement('div'); el.appendChild(div); }
    div.className = 'player-entry' + (i === G.currentPlayerIndex ? ' active' : '');
    const isMe = MODE === 'online' && i === myPlayerIndex;
    div.innerHTML = `
      <div class="pname">${esc(p.name)}${isMe ? ' <span class="pme">(you)</span>' : ''}</div>
      <div class="pstats"><span class="pi">💪</span><span class="pn">${p.pushUps}</span></div>
      ${p.healthCards.length ? `<div class="phealth">${'💚'.repeat(p.healthCards.length)}</div>` : ''}
    `;
  });
  while (el.children.length > G.players.length) el.removeChild(el.lastChild);
}

function renderCard(id, card) {
  const el = document.getElementById(id);
  if (!card) { el.className = 'card back'; el.innerHTML = '?'; return; }
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
  const banner = document.getElementById('turn-banner');
  const p = G.players[G.currentPlayerIndex];
  if (!p) return;
  if (G.challengedIdx !== null) {
    const challenger = G.players[G.challengerId];
    banner.textContent = `⚡ ${challenger?.name ?? '?'} → ${p.name}`;
    banner.classList.add('challenge-active');
    return;
  }
  banner.classList.remove('challenge-active');
  const isMe = MODE === 'online' && G.currentPlayerIndex === myPlayerIndex;
  banner.textContent = isMe ? `Your Turn (${p.name})` : `${p.name}'s Turn`;
}

function renderChallengeZone() {
  const zone = document.getElementById('challenge-zone');
  zone.innerHTML = '';
  // Hide when not guessing, challenge already active, only 1 player, or not my turn
  if (G.phase !== 'guessing' || G.challengedIdx !== null || G.players.length < 2) {
    zone.classList.add('hidden'); return;
  }
  const activeIdx = MODE === 'online' ? myPlayerIndex : G.currentPlayerIndex;
  if (activeIdx !== G.currentPlayerIndex) { zone.classList.add('hidden'); return; }
  zone.classList.remove('hidden');
  zone.appendChild(mkBtn('⚡ Challenge', 'btn btn-challenge', () => showChallengePicker()));
}

function showChallengePicker() {
  const targets = document.getElementById('challenge-targets');
  targets.innerHTML = '';
  G.players.forEach((p, i) => {
    if (i === G.currentPlayerIndex) return;
    const btn = document.createElement('button');
    btn.className = 'challenge-target-btn';
    btn.innerHTML = `<span class="ct-name">${esc(p.name)}</span><span class="ct-pushups">${p.pushUps} 💪</span>`;
    btn.onclick = () => {
      document.getElementById('challenge-modal').classList.add('hidden');
      ACTION.challenge(i);
    };
    targets.appendChild(btn);
  });
  document.getElementById('challenge-modal').classList.remove('hidden');
}

function renderFlipZone() {
  const zone = document.getElementById('flip-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;
  const activeIdx = MODE === 'online' ? myPlayerIndex : G.currentPlayerIndex;
  if (activeIdx !== G.currentPlayerIndex) return;
  const p = G.players[G.currentPlayerIndex];
  if (p && p.healthCards.length >= 2)
    zone.appendChild(mkBtn('🔮 Flip −2 (peek next card)', 'btn btn-flip', () => ACTION.useFlip()));
}

function renderWaitingBanner() {
  const banner = document.getElementById('waiting-banner');
  if (MODE !== 'online' || G.phase !== 'guessing') { banner.classList.add('hidden'); return; }
  if (G.currentPlayerIndex === myPlayerIndex) { banner.classList.add('hidden'); return; }
  banner.textContent = `Waiting for ${G.players[G.currentPlayerIndex]?.name ?? '?'} to guess…`;
  banner.classList.remove('hidden');
}

function renderGuessZone() {
  const zone = document.getElementById('guess-zone');
  zone.innerHTML = '';
  if (G.phase !== 'guessing') return;
  if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) return;
  const card = G.currentCard;
  if (!card) return;
  const isChallenge = G.challengedIdx !== null;
  const guess = (choice) => isChallenge ? ACTION.challengeGuess(choice) : ACTION.guess(choice);
  if (card.type === 'number') {
    zone.appendChild(mkBtn('▲ Higher', 'btn btn-higher', () => guess('higher')));
    zone.appendChild(mkBtn('▼ Lower',  'btn btn-lower',  () => guess('lower')));
  } else {
    zone.appendChild(mkBtn('🔴 Red',   'btn btn-red',   () => guess('red')));
    zone.appendChild(mkBtn('⚫ Black', 'btn btn-black', () => guess('black')));
  }
  zone.appendChild(mkBtn('🃏 Joker', 'btn btn-joker', () => guess('joker')));
}

function renderActionZone() {
  const zone = document.getElementById('action-zone');
  zone.innerHTML = '';
  zone.classList.remove('action-fadein');
  if (G.revealPause || G.phase !== 'correct') { zone.classList.add('hidden'); return; }
  if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) { zone.classList.add('hidden'); return; }
  zone.classList.remove('hidden');
  if (G.passAvailable) zone.appendChild(mkBtn('Pass ➡', 'btn btn-pass', () => ACTION.pass()));
  zone.appendChild(mkBtn('Continue ▶', 'btn btn-continue', () => ACTION.continuePlay()));
}

function renderPenaltyZone() {
  const zone = document.getElementById('penalty-zone');
  zone.innerHTML = '';
  zone.classList.remove('action-fadein');

  if (G.revealPause) { zone.classList.add('hidden'); return; }

  if (G.phase === 'wrong') {
    zone.classList.remove('hidden');
    const p = G.players[G.currentPlayerIndex];
    const n = G.pendingPushUps;
    zone.innerHTML = `
      <div class="pushup-num">${n}×</div>
      <div class="pushup-label">${esc(p?.name ?? '')} — Push-Up${n > 1 ? 's' : ''}!</div>
    `;
    if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) return;
    if (p?.healthCards.length > 0)
      zone.appendChild(mkBtn('💚 Skip (use 1 health card)', 'btn btn-skip', () => ACTION.skipPenalty()));
    zone.appendChild(mkBtn('Done ✓', 'btn btn-done', () => ACTION.donePenalty()));

  } else if (G.phase === 'others-penalty') {
    if (G.penaltyQueue.length === 0) {
      if (MODE === 'offline') { offlineFinishOthersPenalty(); return; }
      zone.classList.add('hidden'); return;
    }
    if (MODE === 'online') {
      if (G.penaltyQueue.includes(myPlayerIndex)) {
        zone.classList.remove('hidden');
        zone.innerHTML = `<div class="pushup-num">2×</div><div class="pushup-label">Joker penalty — do your push-ups!</div>`;
        zone.appendChild(mkBtn('Done ✓', 'btn btn-done', () => ACTION.confirmOtherDone(myPlayerIndex)));
      } else {
        zone.classList.remove('hidden');
        const names = G.penaltyQueue.map(i => G.players[i]?.name).filter(Boolean).join(', ');
        zone.innerHTML = `<div class="pushup-label" style="color:#9ca3af">Waiting for: ${esc(names)}</div>`;
      }
    } else {
      zone.classList.remove('hidden');
      const idx = G.penaltyQueue[0];
      const p = G.players[idx];
      zone.innerHTML = `<div class="pushup-num">2×</div><div class="pushup-label">${esc(p?.name ?? '')} — Joker Penalty!</div>`;
      zone.appendChild(mkBtn(`${esc(p?.name ?? '')}: Done ✓`, 'btn btn-done', () => ACTION.confirmOtherDone(idx)));
    }

  } else {
    zone.classList.add('hidden');
  }
}

function renderSidePile() {
  const badge = document.getElementById('joker-status');
  if (!badge) return;
  if (!G.sidePile || G.sidePile.length === 0) {
    badge.classList.add('hidden');
    return;
  }
  const icons = G.sidePile.map(c => c.color === 'red' ? '🔴' : '⚫').join('');
  badge.textContent = `🃏 ${icons} out`;
  badge.classList.remove('hidden');
}

// ── Offline Game Logic ────────────────────────────────────────────────────────
function offlineEvaluate(choice, current, next) {
  const cv = rankVal(current.rank);
  const nv = rankVal(next.rank);
  if (cv === nv && current.color === next.color) return { correct: false, pushUps: 3, reason: 'Same rank & color' };
  if (cv === nv) return { correct: false, pushUps: 2, reason: 'Same rank' };
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
  if (G.deck.length === 0) { offlineEndGame(); return; }
  const next = G.deck.shift();
  G.drawnCard = next;

  // ── Health card ──
  if (next.type === 'health') {
    G.players[G.currentPlayerIndex].healthCards.push(next);
    G.drawnCard = null;
    showMsg(`💚 Health Card! ${G.players[G.currentPlayerIndex].name} keeps a health card. Keep guessing!`, 'health');
    renderScoreboard();
    renderFlipZone();
    renderGuessZone();
    return;
  }

  // ── Player guessed "Joker" ──
  if (choice === 'joker') {
    if (next.type === 'joker') {
      // Correct — others do 2 push-ups, player continues from SAME current card
      G.sidePile.push(next);
      G.penaltyQueue = G.players.map((_, i) => i).filter(i => i !== G.currentPlayerIndex);
      G.penaltyQueue.forEach(i => { G.players[i].pushUps += 2; });
      showMsg(`🃏 Joker! Correct! All other players do 2 push-ups!`, 'correct');
      G.phase = 'others-penalty';
    } else {
      // Wrong joker guess — 2 push-ups, drawn card becomes current, next player's turn
      const p = G.players[G.currentPlayerIndex];
      p.pushUps += 2; G.pendingPushUps = 2;
      G.currentCard = next;
      G.phase = 'wrong';
      G.passAfterPenalty = true;
      showMsg(`❌ Not a Joker! ${cardNameStr(next)}. ${p.name} does 2 push-ups!`, 'wrong');
    }
    triggerReveal();
    return;
  }

  // ── Surprise Joker (player didn't guess joker) ──
  if (next.type === 'joker') {
    G.sidePile.push(next);
    const p = G.players[G.currentPlayerIndex];
    p.pushUps += 2; G.pendingPushUps = 2;
    G.phase = 'wrong';
    G.passAfterPenalty = true;
    showMsg(`🃏 Joker drawn! ${p.name} does 2 push-ups!`, 'wrong');
    triggerReveal();
    return;
  }

  // ── Normal card ──
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
    G.passAfterPenalty = false;
    showMsg(`❌ ${result.reason ? result.reason + ' — ' : ''}${cardNameStr(next)}. ${p.name} does ${result.pushUps} push-up${result.pushUps > 1 ? 's' : ''}!`, 'wrong');
  }
  triggerReveal();
}

function offlineDonePenalty() {
  const passNext = G.passAfterPenalty;
  // If challenged player just finished their penalty, return turn to challenger
  const returnToChallenger = G.challengedIdx !== null;
  G.phase = 'guessing'; G.pendingPushUps = 0; G.drawnCard = null; G.passAfterPenalty = false;
  if (returnToChallenger) {
    G.currentPlayerIndex = G.challengerId;
    G.challengerId = null; G.challengedIdx = null;
  } else if (passNext) {
    G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
  }
  clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  renderAll();
}

function offlineSkipPenalty() {
  const p = G.players[G.currentPlayerIndex];
  p.healthCards.pop();
  p.pushUps -= G.pendingPushUps;
  const passNext = G.passAfterPenalty;
  const returnToChallenger = G.challengedIdx !== null;
  G.pendingPushUps = 0; G.phase = 'guessing'; G.drawnCard = null; G.passAfterPenalty = false;
  if (returnToChallenger) {
    G.currentPlayerIndex = G.challengerId;
    G.challengerId = null; G.challengedIdx = null;
  } else if (passNext) {
    G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
  }
  showMsg(`💚 Skip used! ${p.name} avoids the penalty.`, 'health');
  renderAll();
}

function offlineChallenge(targetIdx) {
  G.challengerId = G.currentPlayerIndex;
  G.challengedIdx = targetIdx;
  G.currentPlayerIndex = targetIdx;
  renderAll();
}

function offlineChallengeGuess(choice) {
  if (G.deck.length === 0) { offlineEndGame(); return; }
  const next = G.deck.shift();
  G.drawnCard = next;

  const challengerIdx   = G.challengerId;
  const challengedName  = G.players[G.currentPlayerIndex].name;
  const challengerName  = G.players[challengerIdx].name;

  if (next.type === 'health') {
    G.players[G.currentPlayerIndex].healthCards.push(next);
    G.drawnCard = null;
    showMsg(`💚 Health Card! ${challengedName} keeps a health card. Keep guessing!`, 'health');
    renderScoreboard(); renderGuessZone();
    return;
  }

  if (choice === 'joker') {
    if (next.type === 'joker') {
      G.sidePile.push(next);
      G.currentCard = next;
      G.challengedIdx = null; G.challengerId = null;
      G.currentPlayerIndex = challengerIdx;
      G.players[challengerIdx].pushUps += 2;
      G.pendingPushUps = 2; G.phase = 'wrong'; G.passAfterPenalty = true;
      showMsg(`🃏 Joker! ${challengedName} wins the challenge — ${challengerName} does 2 push-ups!`, 'correct');
    } else {
      G.players[G.currentPlayerIndex].pushUps += 2;
      G.pendingPushUps = 2; G.currentCard = next;
      G.phase = 'wrong'; G.passAfterPenalty = false;
      showMsg(`❌ Not a Joker! ${cardNameStr(next)}. ${challengedName} does 2 push-ups!`, 'wrong');
    }
    triggerReveal(); return;
  }

  if (next.type === 'joker') {
    G.sidePile.push(next);
    G.players[G.currentPlayerIndex].pushUps += 2;
    G.pendingPushUps = 2; G.phase = 'wrong'; G.passAfterPenalty = false;
    showMsg(`🃏 Joker! ${challengedName} does 2 push-ups!`, 'wrong');
    triggerReveal(); return;
  }

  const result = offlineEvaluate(choice, G.currentCard, next);
  G.currentCard = next;
  if (result.correct) {
    // Challenged player won — challenger does 2 push-ups and loses their turn
    G.challengedIdx = null; G.challengerId = null;
    G.currentPlayerIndex = challengerIdx;
    G.players[challengerIdx].pushUps += 2;
    G.pendingPushUps = 2; G.phase = 'wrong'; G.passAfterPenalty = true;
    showMsg(`✅ ${cardNameStr(next)} — ${challengedName} wins! ${challengerName} does 2 push-ups!`, 'correct');
  } else {
    // Challenged player wrong — they do push-ups, turn returns to challenger after Done
    G.players[G.currentPlayerIndex].pushUps += result.pushUps;
    G.pendingPushUps = result.pushUps; G.phase = 'wrong'; G.passAfterPenalty = false;
    showMsg(`❌ ${result.reason ? result.reason + ' — ' : ''}${cardNameStr(next)}. ${challengedName} does ${result.pushUps} push-up${result.pushUps > 1 ? 's' : ''}!`, 'wrong');
  }
  triggerReveal();
}

function offlineConfirmOther(idx) {
  G.penaltyQueue = G.penaltyQueue.filter(i => i !== idx);
  if (G.penaltyQueue.length === 0) offlineFinishOthersPenalty();
  else renderPenaltyZone();
}

function offlineFinishOthersPenalty() {
  G.phase = 'guessing'; clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  renderAll();
}

function offlinePass() {
  G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
  G.phase = 'guessing'; G.passAvailable = false; G.drawnCard = null;
  clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  renderAll();
}

function offlineContinue() {
  G.phase = 'guessing'; G.passAvailable = false; G.drawnCard = null;
  clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  renderAll();
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

function offlineEndGame() {
  G.phase = 'ended';
  showScreen('end-screen');
  renderEndScreen();
}

function renderEndScreen() {
  // Fewest push-ups wins
  const sorted = [...G.players].sort((a, b) => a.pushUps - b.pushUps);
  const minPU  = sorted[0]?.pushUps ?? 0;
  const isTie  = sorted.length > 1 && sorted[1].pushUps === minPU;
  document.getElementById('end-winner-name').textContent =
    isTie ? "It's a tie! 🤝" : `🎉 ${sorted[0]?.name ?? ''} wins!`;
  const el = document.getElementById('end-players');
  el.innerHTML = '';
  const medals = ['🥇','🥈','🥉'];
  sorted.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'end-player' + (p.pushUps === minPU && !isTie ? ' end-winner' : '');
    div.innerHTML = `
      <span class="end-medal">${medals[i] || `${i + 1}.`}</span>
      <span class="end-name">${esc(p.name)}</span>
      <span class="end-score">${p.pushUps} 💪</span>
    `;
    el.appendChild(div);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkBtn(text, className, onClick) {
  const b = document.createElement('button');
  b.textContent = text; b.className = className; b.onclick = onClick;
  return b;
}

function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text; el.className = `msg ${type}`; el.classList.remove('hidden');
}

function clearMsg() { document.getElementById('msg').classList.add('hidden'); }

function cardNameStr(card) {
  if (card.type === 'health') return 'Health Card';
  if (card.type === 'joker')  return `${card.color} Joker`;
  return `${card.rank}${card.suit}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
