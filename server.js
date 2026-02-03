const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ROOMS_FILE = process.env.NODE_ENV === 'test' ? path.join(__dirname, 'rooms.test.json') : path.join(__dirname, 'rooms.json');
const WORDS_FILE = path.join(__dirname, 'words.json');
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');

let rooms = {};
let masterWords = [];
let prompts = []; 
const HAND_SIZE = 40; // number of tiles per player
const MAX_PUNCTUATION_PER_HAND = 5;
const PUNCTUATIONS = ['.', ',', '!', '?', ';', ':'];
// approximate noun list (subset of words.json + extras)
const NOUNS = new Set([
  'home','house','garden','car','road','river','sky','tree','door','cat','dog','child','friend','family','neighbor','stranger','bench','parcel','plant','plants','book','recipe','shelf','box','bench','rose','pet','meeting','parking','noticeboard','poster','parcel'
]);

// positional pronouns / location words we want at least a few of in every hand
const POSITIONAL_PRONOUNS = new Set([
  'here','there','left','right','behind','in-front','next-to','underneath','on-top','between','around','opposite','nearby','adjacent','below','above','beside','inside','outside','near'
]);

// Kirsten-themed words we want at least one of in each hand
const KIRSTEN_WORDS = new Set(['Kirsten','birthday','presents','cake','slice','candles','balloons','streamers','party','party-hat','pass-the-parcel','party-game','gift','gifts','surprise','unwrap','icing','confetti','happy-birthday','sing','Loki','loki','cat']);

function drawFromDeckBySet(room, wordSet, count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    let foundIdx = -1;
    for (let j = room.deck.length - 1; j >= 0; j--) {
      if (wordSet.has(room.deck[j])) { foundIdx = j; break; }
    }
    if (foundIdx !== -1) {
      const [w] = room.deck.splice(foundIdx, 1);
      result.push(w);
    } else break;
  }
  return result;
}

function drawNouns(room, count) {
  return drawFromDeckBySet(room, NOUNS, count);
} 

function pickPromptChoices(count = 5) {
  const copy = prompts.slice();
  shuffle(copy);
  return copy.slice(0, Math.min(count, copy.length));
} 
function loadPrompts() {
  try {
    prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8')) || [];
    // shuffle prompts on load so judges consistently see varied choices
    shuffle(prompts);
    console.log('Loaded', prompts.length, 'prompts (shuffled)');
  } catch (err) {
    console.error('Error loading prompts:', err);
    prompts = [];
  }
}


function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')) || {};
      console.log('Loaded rooms from', ROOMS_FILE);
    }
  } catch (err) {
    console.error('Error loading rooms:', err);
    rooms = {};
  }
}

function saveRooms() {
  try {
    const tmp = ROOMS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rooms, null, 2));
    fs.renameSync(tmp, ROOMS_FILE);
  } catch (err) {
    console.error('Error saving rooms:', err);
  }
}

function loadMasterWords() {
  try {
    masterWords = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8')) || [];
    // ensure punctuation tokens are present in the main deck so punctuation behaves like words
    if (!masterWords.some(w => PUNCTUATIONS.includes(w))) {
      for (const p of PUNCTUATIONS) {
        for (let i = 0; i < 10; i++) masterWords.push(p);
      }
    }
    console.log('Loaded', masterWords.length, 'master words (including punctuation)');
  } catch (err) {
    console.error('Error loading words:', err);
    masterWords = [];
  }
} 

function generateId(len = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createRoom() {
  const id = generateId(5);
  const deck = masterWords.slice();
  shuffle(deck);
  const room = {
    id,
    players: [],
    creatorId: null,
    judgeId: null,
    handSize: HAND_SIZE,
    state: 'lobby', // 'lobby' | 'round' | 'judging'
    round: { number: 0, submissions: {}, prompt: null },
    deck,
    discard: []
  };
  rooms[id] = room;
  saveRooms();
  return room;
} 

function sanitizeRoom(room) {
  const judge = room.players.find(p => p.id === room.judgeId);
  return {
    id: room.id,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, handSize: p.hand.length })),
    creatorId: room.creatorId || null,
    handSize: room.handSize || HAND_SIZE,
    judgeId: room.judgeId,
    judgeName: judge ? judge.name : null,
    state: room.state,
    round: room.round ? { number: room.round.number, submissionsCount: Object.keys(room.round.submissions || {}).length, prompt: room.round.prompt || null } : null
  };
}

function findPlayer(room, socketId) {
  return room.players.find(p => p.socketId === socketId);
}

function drawWords(room, count) {
  const result = [];
  while (result.length < count) {
    if (room.deck.length === 0) {
      // reshuffle discard into deck
      room.deck = room.discard.slice();
      room.discard = [];
      shuffle(room.deck);
      if (room.deck.length === 0) break; // nothing available
    }
    result.push(room.deck.pop());
  }
  return result;
}

function refillPlayerHand(room, player) {
  const targetSize = room.handSize || HAND_SIZE;
  let needed = targetSize - player.hand.length;
  if (needed <= 0) return;

  // ensure at least 10 nouns in the hand
  const currentNouns = player.hand.filter(w => NOUNS.has(w)).length;
  const nounsNeeded = Math.max(0, 10 - currentNouns);
  if (nounsNeeded > 0) {
    const nounsDrawn = drawFromDeckBySet(room, NOUNS, nounsNeeded);
    player.hand.push(...nounsDrawn);
  }

  // ensure at least 5 positional/location words
  const currentPos = player.hand.filter(w => POSITIONAL_PRONOUNS.has(w)).length;
  const posNeeded = Math.max(0, 5 - currentPos);
  if (posNeeded > 0) {
    const posDrawn = drawFromDeckBySet(room, POSITIONAL_PRONOUNS, posNeeded);
    player.hand.push(...posDrawn);
  }

  // ensure at least 1 Kirsten-themed word
  const currentK = player.hand.filter(w => KIRSTEN_WORDS.has(w)).length;
  const kNeeded = Math.max(0, 1 - currentK);
  if (kNeeded > 0) {
    const kDrawn = drawFromDeckBySet(room, KIRSTEN_WORDS, kNeeded);
    player.hand.push(...kDrawn);
  }

  needed = targetSize - player.hand.length;
  if (needed <= 0) return;

  // fill remaining from deck (punctuation now comes from the deck)
  const drawn = drawWords(room, needed);
  player.hand.push(...drawn);

  // enforce punctuation cap: if we have more punctuation than allowed, return extras to top of deck
  let punctCount = player.hand.filter(w => PUNCTUATIONS.includes(w)).length;
  while (punctCount > MAX_PUNCTUATION_PER_HAND) {
    const idx = player.hand.findIndex(w => PUNCTUATIONS.includes(w));
    if (idx === -1) break;
    const [p] = player.hand.splice(idx, 1);
    room.deck.unshift(p);
    punctCount--;
  }

  // if player ended up with more than targetSize (unlikely), trim extras back to deck
  while (player.hand.length > targetSize) {
    const card = player.hand.pop();
    room.deck.unshift(card);
  }
}  

function addPlayerToRoom(room, name, socketId) {
  const player = { id: generateId(8), name: name || 'Player', socketId, score: 0, hand: [] };
  const wasEmpty = room.players.length === 0;
  room.players.push(player);
  if (wasEmpty) room.creatorId = player.id; // first player becomes creator
  refillPlayerHand(room, player);
  // send the player's hand directly to their socket so client can render words
  try { io.to(player.socketId).emit('hand', player.hand); } catch (e) {}
  saveRooms();
  return player;
}

function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.round = { number: (room.round.number || 0) + 1, submissions: {} };
  // rotate judge: pick next player after current judge or first player
  if (!room.judgeId) {
    room.judgeId = room.players.length ? room.players[0].id : null;
  } else {
    const idx = room.players.findIndex(p => p.id === room.judgeId);
    const next = (idx + 1) % Math.max(room.players.length, 1);
    room.judgeId = room.players[next].id;
  }
  room.state = 'round';
  // refill hands and tell each player their updated hand
  room.players.forEach(p => {
    refillPlayerHand(room, p);
    try { io.to(p.socketId).emit('hand', p.hand); } catch (e) {}
  });
  saveRooms();
}

function endRoundWithWinner(roomId, winnerId) {
  const room = rooms[roomId];
  if (!room) return;
  const winner = room.players.find(p => p.id === winnerId);
  if (winner) winner.score = (winner.score || 0) + 1;
  room.state = 'lobby';
  // move used words to discard
  if (room.round && room.round.submissions) {
    for (const s of Object.values(room.round.submissions)) {
      if (Array.isArray(s.words)) room.discard.push(...s.words);
    }
  }
  // cap discard size to avoid unbounded growth
  if (room.discard.length > masterWords.length * 2) room.discard = room.discard.slice(-masterWords.length);
  saveRooms();
  // announce updated room state and send refreshed hands to players
  io.to(room.id).emit('roomState', sanitizeRoom(room));
  room.players.forEach(p => { try { io.to(p.socketId).emit('hand', p.hand); } catch(e) {} });
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('createRoom', ({ name } = {}, cb) => {
    const room = createRoom();
    const player = addPlayerToRoom(room, name, socket.id);
    socket.join(room.id);
    socket.emit('joinedRoom', { room: sanitizeRoom(room), playerId: player.id });
    // send initial hand to the creating player
    socket.emit('hand', player.hand);
    io.to(room.id).emit('roomState', sanitizeRoom(room));
    if (cb) cb({ ok: true, roomId: room.id, playerId: player.id });
  });

  socket.on('joinRoom', ({ roomId, name } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) {
      if (cb) cb({ ok: false, error: 'Room not found' });
      return;
    }
    const player = addPlayerToRoom(room, name, socket.id);
    socket.join(room.id);
    socket.emit('joinedRoom', { room: sanitizeRoom(room), playerId: player.id });
    // send initial hand to the joining player
    socket.emit('hand', player.hand);
    io.to(room.id).emit('roomState', sanitizeRoom(room));
    if (cb) cb({ ok: true, roomId: room.id, playerId: player.id });
  });

  socket.on('startRound', ({ roomId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) return;
    startRound(roomId);
    io.to(roomId).emit('roundStarted', { room: sanitizeRoom(room), judgeId: room.judgeId });
    // send prompt choices to the judge so they can pick one
    const judge = room.players.find(p => p.id === room.judgeId);
    if (judge && judge.socketId) {
      const choices = pickPromptChoices(5);
      try { io.to(judge.socketId).emit('promptChoices', { choices }); } catch (e) {}
    }
    if (cb) cb({ ok: true });
  }); 

  socket.on('submitSentence', ({ roomId, playerId, sentence, words, color } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) return;
    const actor = findPlayer(room, socket.id);
    if (!actor) return;
    // prevent judge from submitting
    if (actor.id === room.judgeId) {
      if (cb) cb({ ok: false, error: 'Judge may not submit a sentence' });
      return;
    }
    if (!room.round) room.round = { number: 0, submissions: {} };
    room.round.submissions[playerId] = {
      sentence: sentence || '',
      words: Array.isArray(words) ? words : [],
      playerId,
      playerName: actor.name,
      color: color || null
    };
    saveRooms();
    io.to(roomId).emit('submissionsUpdated', { submissions: room.round.submissions });
    if (cb) cb({ ok: true });
  });

  socket.on('pickWinner', ({ roomId, winnerId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) return;
    const actor = findPlayer(room, socket.id);
    if (!actor || actor.id !== room.judgeId) {
      if (cb) cb({ ok: false, error: 'Only judge may pick a winner' });
      return;
    }
    endRoundWithWinner(roomId, winnerId);
    io.to(roomId).emit('roundEnded', { winnerId, room: sanitizeRoom(room) });
    if (cb) cb({ ok: true });
  });

  socket.on('getRoom', ({ roomId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) {
      if (cb) cb({ ok: false, error: 'Room not found' });
      return;
    }
    if (cb) cb({ ok: true, room: sanitizeRoom(room) });
  });

  socket.on('choosePrompt', ({ roomId, prompt } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) return;
    const actor = findPlayer(room, socket.id);
    if (!actor || actor.id !== room.judgeId) {
      if (cb) cb({ ok: false, error: 'Only judge may pick a prompt' });
      return;
    }
    room.round = room.round || { number: 0, submissions: {} };
    room.round.prompt = prompt || null;
    saveRooms();
    io.to(roomId).emit('promptChosen', { prompt: room.round.prompt, room: sanitizeRoom(room) });
    if (cb) cb({ ok: true });
  });

  socket.on('setHandSize', ({ roomId, handSize } = {}, cb) => {
    const room = rooms[roomId];
    if (!room) return;
    const actor = findPlayer(room, socket.id);
    if (!actor || actor.id !== room.creatorId) {
      if (cb) cb({ ok: false, error: 'Only room creator may set hand size' });
      return;
    }
    const size = parseInt(handSize, 10);
    if (isNaN(size) || size < 5 || size > 100) {
      if (cb) cb({ ok: false, error: 'handSize must be between 5 and 100' });
      return;
    }
    // update room handSize
    room.handSize = size;
    // adjust each player's hand to the new size
    room.players.forEach(p => {
      if (p.hand.length > size) {
        // return excess to top of deck
        while (p.hand.length > size) {
          const c = p.hand.pop();
          room.deck.unshift(c);
        }
      } else if (p.hand.length < size) {
        refillPlayerHand(room, p);
      }
      try { io.to(p.socketId).emit('hand', p.hand); } catch (e) {}
    });
    saveRooms();
    io.to(roomId).emit('roomState', sanitizeRoom(room));
    if (cb) cb({ ok: true, handSize: room.handSize });
  });

  socket.on('disconnect', () => {
    // remove player from any rooms
    for (const room of Object.values(rooms)) {
      const idx = room.players.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        // if removed judge, clear judgeId
        if (room.judgeId && !room.players.find(p => p.id === room.judgeId)) room.judgeId = null;
        saveRooms();
        io.to(room.id).emit('roomState', sanitizeRoom(room));
      }
      // Optionally remove empty rooms
      if (room.players.length === 0) {
        delete rooms[room.id];
        saveRooms();
      }
    }
  });
});

loadMasterWords();
loadPrompts();
loadRooms();

module.exports = {
  ROOMS_FILE,
  WORDS_FILE,
  PROMPTS_FILE,
  rooms,
  masterWords,
  prompts,
  HAND_SIZE,
  PUNCTUATIONS,
  MAX_PUNCTUATION_PER_HAND,
  NOUNS,
  POSITIONAL_PRONOUNS,
  KIRSTEN_WORDS,
  generateId,
  shuffle,
  createRoom,
  sanitizeRoom,
  findPlayer,
  drawWords,
  refillPlayerHand,
  addPlayerToRoom,
  startRound,
  pickPromptChoices,
  endRoundWithWinner,
  loadRooms,
  loadMasterWords,
  loadPrompts,
  saveRooms,
  setRoomHandSize: function(roomId, size, actorId) {
    const room = rooms[roomId];
    if (!room) return { ok: false, error: 'Room not found' };
    if (!actorId || actorId !== room.creatorId) return { ok: false, error: 'Only room creator may set hand size' };
    const s = parseInt(size, 10);
    if (isNaN(s) || s < 5 || s > 100) return { ok: false, error: 'handSize must be between 5 and 100' };
    room.handSize = s;
    // adjust hands
    room.players.forEach(p => {
      if (p.hand.length > s) {
        while (p.hand.length > s) {
          const c = p.hand.pop();
          room.deck.unshift(c);
        }
      } else if (p.hand.length < s) {
        refillPlayerHand(room, p);
      }
    });
    saveRooms();
    return { ok: true, handSize: room.handSize };
  }
};

if (require.main === module) {
  server.listen(PORT, () => console.log('Server listening on', PORT));
}
