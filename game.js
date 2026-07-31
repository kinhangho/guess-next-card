// ── Native detection (Capacitor) ─────────────────────────────────────────────
const IS_NATIVE = !!(window.Capacitor?.isNativePlatform?.());
if (IS_NATIVE) {
  document.addEventListener('DOMContentLoaded', () => {
    window.Capacitor?.Plugins?.GameCenter?.authenticate().catch(() => {});
  });
}

// ── Mode & Online State ───────────────────────────────────────────────────────
let MODE = 'offline';
let penaltyRenderGen = 0;
let socket = null;
let myPlayerIndex = -1;
let currentRoomId = null;
let isHost = false;
let gcScoreSubmitted = false;

// ── Shared Game State ─────────────────────────────────────────────────────────
const G = {
  players: [],
  deck: [],
  deckCount: 0,
  currentCard: null,
  drawnCard: null,
  revealFrom: null,    // card in the left slot before the guess (so both slots differ during reveal)
  lastGuess: null,     // the guess choice for the result badge
  currentPlayerIndex: 0,
  sidePile: [],
  // phases: guessing | correct | wrong | others-penalty | ended
  phase: 'guessing',
  pendingPushUps: 0,
  turnPushUps: 0,      // running push-up total for current player's turn (resets on turn change)
  streakPunishment: 0, // global heat — grows on every Continue, paid by whoever gets it wrong
  penaltyQueue: [],    // indices of players still owing push-ups (joker-correct)
  passAfterPenalty: false, // if true, Done → next player instead of continue
  passAvailable: false,
  message: null,
  peekCard: null,
  revealPause: false,
  challengerId: null,  // index of player who issued the challenge
  challengedIdx: null, // index of player being challenged (null = no challenge active)
  // punishment (set at game start from picker, preserved across Reset)
  punishSingular: 'push-up',
  punishPlural:   'push-ups',
  punishIcon:     '💪',
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
// Native builds load their HTML from a local Capacitor scheme, not from the
// backend, so io() has no same-origin server to default to — point it at the
// deployed server explicitly. Web keeps same-origin (empty string = current page).
const SERVER_URL = IS_NATIVE ? 'https://dare-dare-dare.onrender.com' : '';

function initSocket() {
  if (socket && socket.connected) return;
  socket = io(SERVER_URL);

  socket.on('game-state', (room) => {
    MODE = 'online';
    const prevPhase = G.phase;
    const prevChallengedIdx = G.challengedIdx;
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
    G.turnPushUps        = room.turnPushUps ?? 0;
    G.streakPunishment   = room.streakPunishment ?? 0;
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
      gcScoreSubmitted = false;
      renderLobby(room);
    } else if (room.phase === 'ended') {
      showScreen('end-screen');
      renderEndScreen();
    } else {
      showScreen('game-screen');
      if (prevChallengedIdx === null && G.challengedIdx !== null) AUDIO.challenge();
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
  document.getElementById('room-code-value').textContent = room.id;
  codeBox.classList.remove('hidden');
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

// ── Punishment picker ─────────────────────────────────────────────────────────
const PUNISHMENT_PRESETS = [
  { id: 'pushups', icon: '💪', label: 'Push-ups',    s: 'push-up',    p: 'push-ups' },
  { id: 'situps',  icon: '🏋️', label: 'Sit-ups',     s: 'sit-up',     p: 'sit-ups' },
  { id: 'squats',  icon: '🦵', label: 'Squats',       s: 'squat',      p: 'squats' },
  { id: 'plank',   icon: '⏱️', label: 'Sec. Plank',   s: 'sec plank',  p: 'sec plank' },
  { id: 'custom',  icon: '✏️', label: 'Custom…',      s: null,         p: null },
];
let selectedPunishId = 'pushups';
let customPunishText = '';

function renderPunishmentPicker() {
  const picker = document.getElementById('punishment-picker');
  if (!picker) return;
  picker.innerHTML = '';
  PUNISHMENT_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'punish-chip' + (preset.id === selectedPunishId ? ' selected' : '');
    btn.textContent = `${preset.icon} ${preset.label}`;
    btn.onclick = () => {
      selectedPunishId = preset.id;
      renderPunishmentPicker();
    };
    picker.appendChild(btn);
  });
  const customRow = document.getElementById('custom-punish-row');
  if (customRow) customRow.classList.toggle('hidden', selectedPunishId !== 'custom');
}

function readPunishment() {
  const preset = PUNISHMENT_PRESETS.find(p => p.id === selectedPunishId) ?? PUNISHMENT_PRESETS[0];
  if (preset.id === 'custom') {
    const raw = (document.getElementById('custom-punish-input')?.value ?? '').trim() || 'rep';
    customPunishText = raw;
    return { s: raw, p: raw + 's', icon: '✏️' };
  }
  return { s: preset.s, p: preset.p, icon: preset.icon };
}

// ── Avatar helpers ────────────────────────────────────────────────────────────
const PLAYER_DEFAULT_EMOJIS = ['🦁','🐼','🦊','🐸','🐨','🐙','🦋','🐶','🐱','🐻'];
const EMOJI_AVATAR_LIST = [
  '🦁','🐯','🦊','🐼','🐸','🐨','🐙','🦋','🐶','🐱',
  '🐻','🦄','🦅','🤖','👻','🔥','⚡','🌈','🎮','🏆',
  '🎯','🎲','💎','🚀','🌙','⭐','🍀','🎭','🐲','🦸',
];
let setupAvatars = {};     // { 1: '🦁', 2: 'data:image/...', ... }
let avatarEditingIdx = null;

function avatarHTML(avatar, cls) {
  if (!avatar) return `<div class="${cls}"></div>`;
  if (avatar.startsWith('data:')) {
    return `<div class="${cls}" style="background-image:url('${avatar}');background-size:cover;background-position:center;font-size:0"></div>`;
  }
  return `<div class="${cls}">${avatar}</div>`;
}

function openAvatarPicker(idx) {
  avatarEditingIdx = idx;
  // Populate emoji grid once
  const grid = document.getElementById('emoji-grid');
  if (!grid.children.length) {
    EMOJI_AVATAR_LIST.forEach(em => {
      const b = document.createElement('button');
      b.className = 'emoji-opt'; b.textContent = em; b.type = 'button';
      b.onclick = () => pickAvatarEmoji(em);
      grid.appendChild(b);
    });
  }
  // Highlight current selection
  const cur = setupAvatars[idx] ?? '';
  grid.querySelectorAll('.emoji-opt').forEach(b => b.classList.toggle('selected', b.textContent === cur));
  document.getElementById('avatar-sheet').classList.remove('hidden');
}

function closeAvatarSheet() {
  document.getElementById('avatar-sheet').classList.add('hidden');
  avatarEditingIdx = null;
}

function pickAvatarEmoji(emoji) {
  if (avatarEditingIdx === null) return;
  setupAvatars[avatarEditingIdx] = emoji;
  _refreshAvBtn(avatarEditingIdx);
  closeAvatarSheet();
}

function triggerAvatarFile() {
  document.getElementById('avatar-file-input').click();
}

function handleAvatarFile(input) {
  const file = input.files[0];
  if (!file || avatarEditingIdx === null) return;
  const reader = new FileReader();
  reader.onload = e => {
    setupAvatars[avatarEditingIdx] = e.target.result;
    _refreshAvBtn(avatarEditingIdx);
    closeAvatarSheet();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function _refreshAvBtn(idx) {
  const btn = document.getElementById(`av-btn-${idx}`);
  if (!btn) return;
  const av = setupAvatars[idx] ?? '';
  if (av.startsWith('data:')) {
    btn.textContent = '';
    btn.style.backgroundImage = `url('${av}')`;
    btn.classList.add('has-photo');
  } else {
    btn.style.backgroundImage = '';
    btn.textContent = av;
    btn.classList.remove('has-photo');
  }
}

// ── Offline: Setup ────────────────────────────────────────────────────────────
function initOfflineSetup() {
  const row = document.getElementById('count-row');
  if (row.children.length > 0) { renderPunishmentPicker(); return; }
  for (let n = 2; n <= 10; n++) {
    const btn = document.createElement('button');
    btn.className = 'count-btn'; btn.textContent = n;
    btn.onclick = () => selectCount(n, btn);
    row.appendChild(btn);
  }
  renderPunishmentPicker();
}

function selectCount(n, btn) {
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const sec = document.getElementById('name-section');
  const inp = document.getElementById('name-inputs');
  inp.innerHTML = '';
  setupAvatars = {};
  sec.classList.remove('hidden');
  for (let i = 1; i <= n; i++) {
    const emoji = PLAYER_DEFAULT_EMOJIS[i - 1] || '😀';
    setupAvatars[i] = emoji;
    const row = document.createElement('div');
    row.className = 'player-setup-row';
    row.innerHTML = `
      <button class="av-btn" id="av-btn-${i}" type="button" onclick="openAvatarPicker(${i})">${emoji}</button>
      <input type="text" placeholder="Player ${i}" value="Player ${i}" id="pname-${i}" />
    `;
    inp.appendChild(row);
  }
}

function startOfflineGame() {
  MODE = 'offline';
  const inputs = document.querySelectorAll('#name-inputs input');
  G.players = [...inputs].map((inp, i) => ({
    name: inp.value.trim() || inp.placeholder,
    avatar: setupAvatars[i + 1] ?? PLAYER_DEFAULT_EMOJIS[i] ?? '😀',
    pushUps: 0, healthCards: [], challengesIssued: 0,
  }));
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
  G.revealFrom         = null;
  G.lastGuess          = null;
  G.turnPushUps        = 0;
  G.streakPunishment   = 0;
  G.message            = null;
  G.peekCard           = null;
  const punishDef      = readPunishment();
  G.punishSingular     = punishDef.s;
  G.punishPlural       = punishDef.p;
  G.punishIcon         = punishDef.icon;
  G.currentCard        = offlineDrawStartCard();
  showScreen('game-screen');
  updateHTPPunishment();
  renderAll();
}

// ── Game Menu ─────────────────────────────────────────────────────────────────
function openGameMenu() {
  document.getElementById('game-menu').classList.remove('hidden');
}

function closeGameMenu() {
  document.getElementById('game-menu').classList.add('hidden');
}

function resetOfflineGame() {
  closeGameMenu();
  const players = G.players.map(p => ({ name: p.name, avatar: p.avatar }));
  G.players            = players.map(p => ({ ...p, pushUps: 0, healthCards: [], challengesIssued: 0 }));
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
  G.revealFrom         = null;
  G.lastGuess          = null;
  G.turnPushUps        = 0;
  G.streakPunishment   = 0;
  G.message            = null;
  G.peekCard           = null;
  G.challengerId       = null;
  G.challengedIdx      = null;
  G.revealPause        = false;
  G.currentCard        = offlineDrawStartCard();
  clearMsg();
  renderAll();
}

function quitToHome() {
  closeGameMenu();
  showScreen('home-screen');
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
  const leftCard = (G.revealPause && G.revealFrom) ? G.revealFrom : G.currentCard;
  renderCard('current-card', leftCard);
  renderCard('next-card', G.revealPause ? G.drawnCard : null);
  renderDeckCount();
  renderTurnBanner();
  renderResultIndicator();
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
  AUDIO.cardFlip();
  G.revealPause = true;
  renderAll();
  const nextEl = document.getElementById('next-card');
  nextEl.classList.remove('reveal-anim');
  void nextEl.offsetWidth;
  nextEl.classList.add('reveal-anim');
  setTimeout(() => {
    G.revealPause = false;
    G.revealFrom  = null;
    G.lastGuess   = null;
    renderCard('current-card', G.currentCard);
    renderResultIndicator();
    renderCard('next-card', null);
    renderActionZone();
    renderPenaltyZone();
    document.getElementById('action-zone').classList.add('action-fadein');
    document.getElementById('penalty-zone').classList.add('action-fadein');
    if (G.phase === 'correct' || G.phase === 'others-penalty') AUDIO.correct();
    else if (G.phase === 'wrong') AUDIO.wrong();
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
      ${avatarHTML(p.avatar ?? '', 'av-sm')}
      <div class="pname">${esc(p.name)}${isMe ? ' <span class="pme">(you)</span>' : ''}</div>
      <div class="pstats"><span class="pi">${G.punishIcon}</span><span class="pn">${p.pushUps}</span></div>
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
  const avPrefix = (p.avatar && !p.avatar.startsWith('data:')) ? `${p.avatar} ` : '';
  banner.textContent = isMe ? `Your Turn (${p.name})` : `${avPrefix}${p.name}'s Turn`;
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
    btn.innerHTML = `${avatarHTML(p.avatar ?? '', 'av-sm')}<span class="ct-name">${esc(p.name)}</span><span class="ct-pushups">${p.pushUps} ${G.punishIcon}</span>`;
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
  // Heat indicator — shows when player has built up a streak from Continue's
  if (G.streakPunishment > 0) {
    const heat = document.createElement('div');
    heat.className = 'heat-banner';
    heat.innerHTML = `<span class="heat-dice">${diceDisplay(G.streakPunishment)}</span><span class="heat-text">🔥 ${G.streakPunishment} heat — whoever gets it wrong pays this!</span>`;
    zone.appendChild(heat);
  }
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
  const next = G.streakPunishment + 1;
  if (G.streakPunishment > 0) {
    const heat = document.createElement('div');
    heat.className = 'heat-banner';
    heat.innerHTML = `<span class="heat-dice">${diceDisplay(G.streakPunishment)}</span><span class="heat-text">🔥 ${G.streakPunishment} heat riding · Continue → ${next} · whoever gets it wrong pays!</span>`;
    zone.appendChild(heat);
  }
  if (G.passAvailable) zone.appendChild(mkBtn('Pass ➡', 'btn btn-pass', () => ACTION.pass()));
  const contLabel = G.streakPunishment > 0 ? `Continue ▶ (+1 🔥 → ${next})` : 'Continue ▶';
  zone.appendChild(mkBtn(contLabel, 'btn btn-continue', () => ACTION.continuePlay()));
}

function diceDisplay(n) {
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  if (n <= 0) return '';
  const parts = [];
  let rem = n;
  while (rem > 0) { const v = Math.min(rem, 6); parts.push(faces[v - 1]); rem -= v; }
  return parts.join(' ');
}

function punish(n) {
  return n === 1 ? G.punishSingular : G.punishPlural;
}

function updateHTPPunishment() {
  document.querySelectorAll('.htp-ps').forEach(el => { el.textContent = G.punishSingular; });
  document.querySelectorAll('.htp-pp').forEach(el => { el.textContent = G.punishPlural; });
  const cm = document.getElementById('challenge-modal-sub');
  if (cm) cm.textContent = `Pick a player to guess for you. If they're right, you do 3 ${G.punishPlural}.`;
  const cs = document.getElementById('challenge-splash-sub');
  if (cs) cs.innerHTML = `Guess right → they do 3 ${G.punishPlural}<br>Guess wrong → you do 1 ${G.punishSingular}`;
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
    const dice = diceDisplay(G.turnPushUps);
    zone.innerHTML = `
      ${dice ? `<div class="dice-row">${dice}</div>` : ''}
      <div class="pushup-num slam-in">${n}×</div>
      <div class="pushup-label">${esc(p?.name ?? '')} — ${punish(n).charAt(0).toUpperCase() + punish(n).slice(1)}!</div>
    `;
    AUDIO.slam();
    if (MODE === 'online' && G.currentPlayerIndex !== myPlayerIndex) return;
    const gen = ++penaltyRenderGen;
    setTimeout(() => {
      if (penaltyRenderGen !== gen) return;
      if (p?.healthCards.length > 0)
        zone.appendChild(mkBtn('💚 Skip (use 1 health card)', 'btn btn-skip', () => ACTION.skipPenalty()));
      zone.appendChild(mkBtn('Done ✓', 'btn btn-done', () => ACTION.donePenalty()));
    }, 550);

  } else if (G.phase === 'others-penalty') {
    if (G.penaltyQueue.length === 0) {
      if (MODE === 'offline') { offlineFinishOthersPenalty(); return; }
      zone.classList.add('hidden'); return;
    }
    if (MODE === 'online') {
      if (G.penaltyQueue.includes(myPlayerIndex)) {
        zone.classList.remove('hidden');
        zone.innerHTML = `<div class="pushup-num">2×</div><div class="pushup-label">Joker penalty — do your ${G.punishPlural}!</div>`;
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

function renderResultIndicator() {
  const labelCurrent = document.getElementById('label-current');
  const labelNext    = document.getElementById('label-next');
  const badge        = document.getElementById('result-badge');

  if (!G.revealPause) {
    labelCurrent.textContent = 'Current';
    labelNext.textContent    = 'Next';
    badge.className = 'result-badge hidden';
    badge.textContent = '';
    return;
  }

  const guessMap = { higher: 'HIGHER', lower: 'LOWER', red: 'RED', black: 'BLACK', joker: 'JOKER' };
  const guessLabel = guessMap[G.lastGuess] ?? '';
  const correct = G.phase === 'correct' || G.phase === 'others-penalty';
  const correctJokerGuess = G.lastGuess === 'joker' && G.phase === 'others-penalty';

  labelCurrent.textContent = correctJokerGuess ? 'Current' : 'Previous';
  labelNext.textContent    = correctJokerGuess ? 'Joker Drawn' : 'Drawn';
  badge.textContent = correct ? `✓ ${guessLabel}` : `✗ ${guessLabel}`;
  badge.className = '';
  void badge.offsetWidth;
  badge.className = `result-badge ${correct ? 'correct-badge' : 'wrong-badge'}`;
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

// ── Handoff & Challenge Splash helpers (offline only) ────────────────────────
function showHandoff(name, sub, onReady) {
  document.getElementById('handoff-name').textContent = name;
  document.getElementById('handoff-sub').textContent = sub;
  const btn = document.getElementById('handoff-ready-btn');
  btn.onclick = () => {
    document.getElementById('handoff-overlay').classList.add('hidden');
    onReady();
  };
  document.getElementById('handoff-overlay').classList.remove('hidden');
}

function showChallengeSplash(challengerName) {
  document.getElementById('splash-title').textContent = `⚡ ${challengerName} challenged you!`;
  const btn = document.getElementById('challenge-accept-btn');
  btn.onclick = () => {
    document.getElementById('challenge-splash').classList.add('hidden');
    renderAll();
  };
  document.getElementById('challenge-splash').classList.remove('hidden');
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
  G.revealFrom = G.currentCard;
  G.lastGuess  = choice;
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
      showMsg(`🃏 Joker! Correct! All other players do 2 ${G.punishPlural}!`, 'correct');
      G.phase = 'others-penalty';
    } else {
      // Wrong joker guess — 2 push-ups + heat, drawn card becomes current, next player's turn
      const p = G.players[G.currentPlayerIndex];
      const heat = G.streakPunishment; G.streakPunishment = 0;
      const total = 2 + heat;
      p.pushUps += total; G.pendingPushUps = total; G.turnPushUps += total;
      G.currentCard = next;
      G.phase = 'wrong';
      G.passAfterPenalty = true;
      showMsg(`❌ Not a Joker! ${cardNameStr(next)}. ${p.name} does ${total} ${punish(total)}${heat > 0 ? ` (🔥 +${heat} heat)` : ''}!`, 'wrong');
    }
    triggerReveal();
    return;
  }

  // ── Surprise Joker (player didn't guess joker) ──
  if (next.type === 'joker') {
    G.sidePile.push(next);
    const p = G.players[G.currentPlayerIndex];
    const heat = G.streakPunishment; G.streakPunishment = 0;
    const total = 2 + heat;
    p.pushUps += total; G.pendingPushUps = total; G.turnPushUps += total;
    G.phase = 'wrong';
    G.passAfterPenalty = true;
    showMsg(`🃏 Joker drawn! ${p.name} does ${total} ${punish(total)}${heat > 0 ? ` (🔥 +${heat} heat)` : ''}!`, 'wrong');
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
    const heat = G.streakPunishment; G.streakPunishment = 0;
    const total = result.pushUps + heat;
    p.pushUps += total;
    G.pendingPushUps = total; G.turnPushUps += total;
    G.currentCard = next;
    G.phase = 'wrong';
    G.passAfterPenalty = false;
    showMsg(`❌ ${result.reason ? result.reason + ' — ' : ''}${cardNameStr(next)}. ${p.name} does ${total} ${punish(total)}${heat > 0 ? ` (🔥 +${heat} heat)` : ''}!`, 'wrong');
  }
  triggerReveal();
}

function offlineDonePenalty() {
  const passNext = G.passAfterPenalty;
  const returnToChallenger = G.challengedIdx !== null;
  G.phase = 'guessing'; G.pendingPushUps = 0; G.drawnCard = null; G.passAfterPenalty = false;
  if (returnToChallenger) {
    G.currentPlayerIndex = G.challengerId;
    G.challengerId = null; G.challengedIdx = null;
    G.turnPushUps = 0; G.streakPunishment = 0;
  } else if (passNext) {
    G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
    G.turnPushUps = 0; G.streakPunishment = 0;
  }
  clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  if (returnToChallenger) {
    showHandoff(G.players[G.currentPlayerIndex].name, '⚡ Back to you, challenger!', renderAll);
  } else if (passNext) {
    showHandoff(G.players[G.currentPlayerIndex].name, 'Your turn!', renderAll);
  } else {
    renderAll();
  }
}

function offlineSkipPenalty() {
  const p = G.players[G.currentPlayerIndex];
  p.healthCards.pop();
  p.pushUps -= G.pendingPushUps;
  G.turnPushUps = Math.max(0, G.turnPushUps - G.pendingPushUps);
  const passNext = G.passAfterPenalty;
  const returnToChallenger = G.challengedIdx !== null;
  G.pendingPushUps = 0; G.phase = 'guessing'; G.drawnCard = null; G.passAfterPenalty = false;
  if (returnToChallenger) {
    G.currentPlayerIndex = G.challengerId;
    G.challengerId = null; G.challengedIdx = null;
    G.turnPushUps = 0; G.streakPunishment = 0;
  } else if (passNext) {
    G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.players.length;
    G.turnPushUps = 0; G.streakPunishment = 0;
  }
  showMsg(`💚 Skip used! ${p.name} avoids the penalty.`, 'health');
  if (returnToChallenger) {
    showHandoff(G.players[G.currentPlayerIndex].name, '⚡ Back to you, challenger!', renderAll);
  } else if (passNext) {
    showHandoff(G.players[G.currentPlayerIndex].name, 'Your turn!', renderAll);
  } else {
    renderAll();
  }
}

function offlineChallenge(targetIdx) {
  AUDIO.challenge();
  G.turnPushUps = 0;
  G.challengerId = G.currentPlayerIndex;
  G.players[G.challengerId].challengesIssued++;
  G.challengedIdx = targetIdx;
  G.currentPlayerIndex = targetIdx;
  const challengerName = G.players[G.challengerId].name;
  showHandoff(
    G.players[targetIdx].name,
    "⚡ You've been challenged!",
    () => showChallengeSplash(challengerName)
  );
}

function offlineChallengeGuess(choice) {
  if (G.deck.length === 0) { offlineEndGame(); return; }
  G.revealFrom = G.currentCard;
  G.lastGuess  = choice;
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
      // Challenged won (correct joker) — challenger does 3 push-ups and loses their turn
      // Joker is set aside (out of play); current card stays as-is, same as the non-challenge case.
      G.sidePile.push(next);
      G.challengedIdx = null; G.challengerId = null;
      G.currentPlayerIndex = challengerIdx;
      G.players[challengerIdx].pushUps += 3;
      G.pendingPushUps = 3; G.turnPushUps = 3; G.streakPunishment = 0; G.phase = 'wrong'; G.passAfterPenalty = true;
      showMsg(`🃏 Joker! ${challengedName} wins the challenge — ${challengerName} does 3 ${G.punishPlural}!`, 'correct');
    } else {
      // Challenged wrong (guessed joker, not joker) — always 1 push-up, challenger's turn resumes
      G.players[G.currentPlayerIndex].pushUps += 1;
      G.pendingPushUps = 1; G.turnPushUps += 1; G.currentCard = next;
      G.phase = 'wrong'; G.passAfterPenalty = false;
      showMsg(`❌ Not a Joker! ${cardNameStr(next)}. ${challengedName} does 1 ${G.punishSingular}!`, 'wrong');
    }
    triggerReveal(); return;
  }

  if (next.type === 'joker') {
    // Surprise joker during challenge — challenged does 1 push-up, challenger's turn resumes
    G.sidePile.push(next);
    G.players[G.currentPlayerIndex].pushUps += 1;
    G.pendingPushUps = 1; G.turnPushUps += 1; G.phase = 'wrong'; G.passAfterPenalty = false;
    showMsg(`🃏 Joker drawn! ${challengedName} does 1 ${G.punishSingular}!`, 'wrong');
    triggerReveal(); return;
  }

  const result = offlineEvaluate(choice, G.currentCard, next);
  G.currentCard = next;
  if (result.correct) {
    // Challenged player won — challenger does 3 push-ups and loses their turn
    G.challengedIdx = null; G.challengerId = null;
    G.currentPlayerIndex = challengerIdx;
    G.players[challengerIdx].pushUps += 3;
    G.pendingPushUps = 3; G.turnPushUps = 3; G.streakPunishment = 0; G.phase = 'wrong'; G.passAfterPenalty = true;
    showMsg(`✅ ${cardNameStr(next)} — ${challengedName} wins! ${challengerName} does 3 ${G.punishPlural}!`, 'correct');
  } else {
    // Challenged player wrong — always 1 push-up, turn returns to challenger after Done
    G.players[G.currentPlayerIndex].pushUps += 1;
    G.pendingPushUps = 1; G.turnPushUps += 1; G.phase = 'wrong'; G.passAfterPenalty = false;
    showMsg(`❌ ${cardNameStr(next)}. ${challengedName} does 1 ${G.punishSingular}!`, 'wrong');
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
  G.phase = 'guessing'; G.passAvailable = false; G.drawnCard = null; G.turnPushUps = 0;
  clearMsg();
  if (G.deck.length === 0) { offlineEndGame(); return; }
  const heat = G.streakPunishment;
  const sub = heat > 0 ? `🔥 ${heat} heat riding — get it wrong and you pay!` : 'Your turn!';
  showHandoff(G.players[G.currentPlayerIndex].name, sub, renderAll);
}

function offlineContinue() {
  G.streakPunishment++;
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
  spawnConfetti();

  const trophy = document.getElementById('end-trophy');
  if (trophy) {
    trophy.classList.remove('trophy-bounce');
    void trophy.offsetWidth;
    trophy.classList.add('trophy-bounce');
  }

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
      <span class="end-score">${p.pushUps} ${G.punishIcon}</span>
    `;
    el.appendChild(div);
  });

  if (MODE === 'online' && IS_NATIVE && !gcScoreSubmitted && myPlayerIndex >= 0) {
    gcScoreSubmitted = true;
    const myScore = G.players[myPlayerIndex]?.pushUps ?? 0;
    window.Capacitor?.Plugins?.GameCenter?.submitScore({
      score: myScore,
      leaderboardID: 'online_fewest_penalties',
    }).catch(() => {});
  }

  const statsEl = document.getElementById('end-stats');
  statsEl.innerHTML = '';
  const total = G.players.reduce((s, p) => s + p.pushUps, 0);
  const statItems = [];
  if (total > 0) statItems.push({ icon: '📊', text: `${total} total ${G.punishPlural} across all players` });
  if (G.players.length > 1) {
    const maxPU = Math.max(...G.players.map(p => p.pushUps));
    if (maxPU > 0) {
      const hardest = G.players.filter(p => p.pushUps === maxPU).map(p => esc(p.name)).join(' &amp; ');
      statItems.push({ icon: '🔥', text: `Hardest hit: ${hardest} (${maxPU} ${G.punishPlural})` });
    }
  }
  const maxChallenge = Math.max(...G.players.map(p => p.challengesIssued || 0));
  if (maxChallenge > 0) {
    const boldest = G.players.filter(p => (p.challengesIssued || 0) === maxChallenge).map(p => esc(p.name)).join(' &amp; ');
    statItems.push({ icon: '⚡', text: `Most challenges issued: ${boldest} (${maxChallenge})` });
  }
  statItems.forEach(({ icon, text }) => {
    const div = document.createElement('div');
    div.className = 'end-stat';
    div.innerHTML = `<span class="end-stat-icon">${icon}</span><span>${text}</span>`;
    statsEl.appendChild(div);
  });
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#F2AD00','#ef4444','#22c55e','#3b82f6','#a855f7','#ec4899','#f97316'];
  for (let i = 0; i < 45; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const size = 5 + Math.random() * 7;
    piece.style.cssText = [
      `left:${Math.random() * 100}%`,
      `width:${size}px`,
      `height:${size * (0.7 + Math.random() * 0.9)}px`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `border-radius:${Math.random() > 0.45 ? '50%' : '2px'}`,
      `animation-duration:${1 + Math.random() * 1.6}s`,
      `animation-delay:${Math.random() * 0.9}s`,
    ].join(';');
    container.appendChild(piece);
  }
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
