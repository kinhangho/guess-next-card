const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path   = require('path');
const crypto = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Rooms ────────────────────────────────────────────────────────────────────
const rooms = new Map(); // roomId -> room

function makeRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createRoom(hostSocketId, hostName, isPrivate) {
  const id = makeRoomId();
  const room = {
    id,
    isPrivate,
    hostSocketId,
    status: 'lobby',
    players: [{ socketId: hostSocketId, name: hostName, pushUps: 0, healthCards: [], connected: true }],
    deck: [],
    currentCard: null,
    drawnCard: null,
    deckCount: 0,
    currentPlayerIndex: 0,
    sidePile: [],
    phase: 'guessing',
    pendingPushUps: 0,
    penaltyQueue: [],
    passAvailable: false,
    message: null,
    peekCard: null,
  };
  rooms.set(id, room);
  return room;
}

// ── Deck helpers ─────────────────────────────────────────────────────────────
function buildDeck() {
  const suits  = ['♠','♥','♦','♣'];
  const colors = { '♠':'black','♥':'red','♦':'red','♣':'black' };
  const ranks  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck   = [];
  for (const suit of suits)
    for (const rank of ranks)
      deck.push({ rank, suit, color: colors[suit], type: ['J','Q','K'].includes(rank) ? 'face' : 'number' });
  deck.push({ rank:'JOKER', suit:'★', color:'red',   type:'joker', label:'Red Joker'    });
  deck.push({ rank:'JOKER', suit:'★', color:'black', type:'joker', label:'Black Joker'  });
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

function cardName(card) {
  if (card.type === 'health') return 'Health Card';
  if (card.type === 'joker')  return `${card.color} Joker`;
  return `${card.rank}${card.suit}`;
}

function evaluate(choice, current, next) {
  const cv = rankVal(current.rank);
  const nv = rankVal(next.rank);
  if (cv === nv && current.color === next.color) return { correct: false, pushUps: 3, reason: 'Same rank & same color' };
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

function insertRandom(deck, card) {
  if (deck.length <= 1) { deck.push(card); return; }
  const pos = Math.floor(Math.random() * (deck.length - 1)) + 1;
  deck.splice(pos, 0, card);
}

function drawStartCard(room) {
  while (room.deck.length > 0) {
    const card = room.deck.shift();
    if (card.type === 'joker')  { room.sidePile.push(card); continue; }
    if (card.type === 'health') { room.players[0].healthCards.push(card); continue; }
    return card;
  }
  return null;
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
function broadcast(room) {
  room.deckCount = room.deck.length;
  room.players.forEach((p, idx) => {
    const s = io.sockets.sockets.get(p.socketId);
    if (!s) return;
    // Only send peekCard to the current player
    const payload = { ...room, deck: undefined, myIndex: idx };
    if (idx !== room.currentPlayerIndex) payload.peekCard = null;
    s.emit('game-state', payload);
  });
}

function publicRoomList() {
  const list = [];
  rooms.forEach(r => {
    if (!r.isPrivate && r.status === 'lobby')
      list.push({ id: r.id, playerCount: r.players.length, hostName: r.players[0]?.name ?? '?' });
  });
  return list;
}

// ── Disconnect / leave helper ─────────────────────────────────────────────────
function handleLeave(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const idx = room.players.findIndex(p => p.socketId === socket.id);
  if (idx === -1) return;
  socket.leave(roomId);
  room.players.splice(idx, 1);
  if (room.players.length === 0) { rooms.delete(roomId); io.emit('public-rooms', publicRoomList()); return; }
  if (room.hostSocketId === socket.id) room.hostSocketId = room.players[0].socketId;
  if (room.currentPlayerIndex >= room.players.length) room.currentPlayerIndex = 0;
  // remove from penalty queue
  room.penaltyQueue = room.penaltyQueue.filter(i => i !== idx).map(i => i > idx ? i - 1 : i);
  if (room.penaltyQueue.length === 0 && room.phase === 'others-penalty') {
    room.phase = 'guessing'; room.message = null;
  }
  broadcast(room);
  if (!room.isPrivate) io.emit('public-rooms', publicRoomList());
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('get-public-rooms', () => socket.emit('public-rooms', publicRoomList()));

  socket.on('create-room', ({ playerName, isPrivate }) => {
    const name = (playerName || 'Player 1').trim().slice(0, 20);
    const room = createRoom(socket.id, name, !!isPrivate);
    socket.join(room.id);
    broadcast(room);
    if (!isPrivate) io.emit('public-rooms', publicRoomList());
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const room = rooms.get((roomId || '').toUpperCase().trim());
    if (!room)                    { socket.emit('error', 'Room not found'); return; }
    if (room.status !== 'lobby')  { socket.emit('error', 'Game already started'); return; }
    if (room.players.length >= 10){ socket.emit('error', 'Room is full (max 10)'); return; }
    const name = (playerName || `Player ${room.players.length + 1}`).trim().slice(0, 20);
    room.players.push({ socketId: socket.id, name, pushUps: 0, healthCards: [], connected: true });
    socket.join(room.id);
    broadcast(room);
    if (!room.isPrivate) io.emit('public-rooms', publicRoomList());
  });

  socket.on('start-game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', 'Need at least 2 players to start'); return; }
    room.status = 'playing';
    room.deck = buildDeck();
    room.currentCard = drawStartCard(room);
    room.drawnCard = null;
    room.currentPlayerIndex = 0;
    room.sidePile = [];
    room.phase = 'guessing';
    room.pendingPushUps = 0;
    room.penaltyQueue = [];
    room.passAvailable = false;
    room.message = null;
    room.peekCard = null;
    broadcast(room);
    if (!room.isPrivate) io.emit('public-rooms', publicRoomList());
  });

  socket.on('guess', ({ roomId, choice }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing' || room.phase !== 'guessing') return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex) return;
    if (room.deck.length === 0) { room.message = { text: 'Deck empty — game over!', type: 'info' }; broadcast(room); return; }

    const next = room.deck.shift();
    room.drawnCard = next;

    if (next.type === 'health') {
      room.players[myIdx].healthCards.push(next);
      room.drawnCard = null; // health card absorbed, no display change
      room.message = { text: `💚 Health Card! ${room.players[myIdx].name} receives a health card. Keep guessing!`, type: 'health' };
      broadcast(room);
      return;
    }

    if (choice === 'joker') {
      if (next.type === 'joker') {
        room.sidePile.push(next);
        room.penaltyQueue = room.players.map((_,i) => i).filter(i => i !== myIdx);
        room.penaltyQueue.forEach(i => { room.players[i].pushUps += 2; });
        room.message = { text: `🃏 Joker! Correct! All other players do 2 push-ups!`, type: 'correct' };
        room.phase = 'others-penalty';
      } else {
        room.players[myIdx].pushUps += 2;
        room.pendingPushUps = 2;
        room.currentCard = next;
        room.phase = 'wrong';
        room.message = { text: `❌ Not a Joker! ${cardName(next)}. ${room.players[myIdx].name} does 2 push-ups!`, type: 'wrong' };
      }
      broadcast(room);
      return;
    }

    if (next.type === 'joker') {
      room.sidePile.push(next);
      room.players[myIdx].pushUps += 2;
      room.pendingPushUps = 2;
      room.message = { text: `🃏 Joker drawn! ${room.players[myIdx].name} does 2 push-ups!`, type: 'wrong' };
      room.phase = 'wrong';
      broadcast(room);
      return;
    }

    const result = evaluate(choice, room.currentCard, next);
    if (result.correct) {
      room.currentCard = next;
      room.passAvailable = true;
      room.phase = 'correct';
      room.message = { text: `✅ Correct! ${cardName(next)}`, type: 'correct' };
    } else {
      room.players[myIdx].pushUps += result.pushUps;
      room.pendingPushUps = result.pushUps;
      room.currentCard = next;
      room.phase = 'wrong';
      room.message = {
        text: `❌ Wrong! ${result.reason ? result.reason + ' — ' : ''}${cardName(next)}. ${room.players[myIdx].name} does ${result.pushUps} push-up${result.pushUps > 1 ? 's' : ''}!`,
        type: 'wrong',
      };
    }
    broadcast(room);
  });

  socket.on('pass', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex || room.phase !== 'correct') return;
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.phase = 'guessing';
    room.passAvailable = false;
    room.drawnCard = null;
    room.message = null;
    broadcast(room);
  });

  socket.on('continue-play', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex || room.phase !== 'correct') return;
    room.phase = 'guessing';
    room.passAvailable = false;
    room.drawnCard = null;
    room.message = null;
    broadcast(room);
  });

  socket.on('done-penalty', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex || room.phase !== 'wrong') return;
    room.phase = 'guessing';
    room.pendingPushUps = 0;
    room.drawnCard = null;
    room.message = null;
    broadcast(room);
  });

  socket.on('skip-penalty', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex || room.phase !== 'wrong') return;
    const p = room.players[myIdx];
    if (p.healthCards.length === 0) return;
    p.healthCards.pop();
    p.pushUps -= room.pendingPushUps;
    room.pendingPushUps = 0;
    room.phase = 'guessing';
    room.drawnCard = null;
    room.message = { text: `💚 Skip used! ${p.name} avoids the penalty.`, type: 'health' };
    broadcast(room);
  });

  socket.on('confirm-other-done', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'others-penalty') return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (!room.penaltyQueue.includes(myIdx)) return;
    room.penaltyQueue = room.penaltyQueue.filter(i => i !== myIdx);
    if (room.penaltyQueue.length === 0) { room.phase = 'guessing'; room.message = null; }
    broadcast(room);
  });

  socket.on('use-flip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'guessing') return;
    const myIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (myIdx !== room.currentPlayerIndex) return;
    const p = room.players[myIdx];
    if (p.healthCards.length < 2 || room.deck.length === 0) return;
    room.peekCard = room.deck[0];
    const hc1 = p.healthCards.pop();
    const hc2 = p.healthCards.pop();
    insertRandom(room.deck, hc1);
    insertRandom(room.deck, hc2);
    broadcast(room);
  });

  socket.on('close-peek', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.peekCard = null;
    broadcast(room);
  });

  socket.on('leave-room', ({ roomId }) => handleLeave(socket, roomId));

  socket.on('disconnect', () => {
    rooms.forEach((_, roomId) => {
      const room = rooms.get(roomId);
      if (room && room.players.some(p => p.socketId === socket.id))
        handleLeave(socket, roomId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Guess Next Card server → http://localhost:${PORT}`));
