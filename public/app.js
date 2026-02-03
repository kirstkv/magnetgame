// Backend URL can be set via `window.BACKEND_URL`. When running locally (localhost) the client will use the same origin.
// If hosting the frontend on GitHub Pages, set `window.BACKEND_URL` in `index.html` or replace the placeholder below with your Render URL.
const BACKEND_URL = window.BACKEND_URL || (location.hostname && location.hostname.indexOf('github.io') !== -1 ? 'https://<your-backend-url>' : location.origin);
if (BACKEND_URL.includes('<your-backend-url>')) {
  console.warn('BACKEND_URL is a placeholder. Replace with your deployed backend URL (Render) or set window.BACKEND_URL in index.html.');
}
const socket = io(BACKEND_URL);

let state = { roomId: null, playerId: null, name: null, hand: [], judgeId: null, isJudge: false, selectedColor: null };
const COLOR_PALETTE = ['#fff18e', '#ffd6e7', '#bff0c9', '#cfefff', '#f3d9ff', '#66d58c']; // yellow, pink, green, blue, purple, kirsten green
const PUNCTUATIONS = ['.', ',', '!', '?', ';', ':'];

// DOM
const login = document.getElementById('login');
const game = document.getElementById('game');
const nameInput = document.getElementById('name');
const createBtn = document.getElementById('create');
const joinBtn = document.getElementById('join');
const joinRoomId = document.getElementById('joinRoomId');
const status = document.getElementById('status');

const roomIdEl = document.getElementById('roomId');
const yourNameEl = document.getElementById('yourName');
const judgeEl = document.getElementById('judge');
const roundNumberEl = document.getElementById('roundNumber');
const promptEl = document.getElementById('prompt');
const promptChoicesEl = document.getElementById('promptChoices');
const playersBarEl = document.getElementById('playersBar');
const startRoundBtn = document.getElementById('startRound');
const handEl = document.getElementById('hand');
const handSizeEl = document.getElementById('handSize');
const handSizeControls = document.getElementById('handSizeControls');
const handSizeInput = document.getElementById('handSizeInput');
const setHandSizeBtn = document.getElementById('setHandSize');
const handCount = document.getElementById('handCount');
const postit = document.getElementById('postit');
const submitBtn = document.getElementById('submit');
const clearBtn = document.getElementById('clearPostit');
const submissionsEl = document.getElementById('submissions');
const playersList = document.getElementById('playersList');
const yourSubmission = document.getElementById('yourSubmission');

createBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) { status.textContent = 'Enter your name'; return; }
  // Single-room mode: `createRoom` joins the shared game
  socket.emit('createRoom', { name }, (res) => {
    if (res && res.ok) { state.roomId = res.roomId; state.playerId = res.playerId; state.name = name; joined(); }
    else status.textContent = 'Error joining game';
  });
};
// remove join button behavior in single-room mode (UI only shows 'Join Game')
try { document.getElementById('join').remove(); } catch (e) {}

// clear status when user starts typing a name
nameInput.addEventListener('input', () => { if (status.textContent) status.textContent = ''; });

function joined(){
  login.style.display = 'none';
  game.style.display = 'block';
  roomIdEl.textContent = state.roomId;
  yourNameEl.textContent = state.name;
  renderRoom({ players: [] });
}

socket.on('joinedRoom', (data) => {
  // data { room, playerId }
  if (data && data.playerId) state.playerId = data.playerId;
  if (data && data.room) renderRoom(data.room);
});

socket.on('promptChoices', ({ choices } = {}) => {
  // Only the judge receives this; render clickable choices
  promptChoicesEl.innerHTML = '';
  if (!choices || choices.length === 0) return;
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.textContent = c;
    btn.style.display = 'block';
    btn.style.marginTop = '6px';
    btn.onclick = () => {
      if (!confirm('Choose this prompt?')) return;
      socket.emit('choosePrompt', { roomId: state.roomId, prompt: c }, (res) => {});
    };
    promptChoicesEl.appendChild(btn);
  });
});

socket.on('promptChosen', ({ prompt, room } = {}) => {
  if (room) renderRoom(room);
  promptEl.textContent = prompt || '-';
  promptChoicesEl.innerHTML = '';
});

socket.on('hand', (hand) => {
  state.hand = hand || [];
  renderHand();
  renderPalette();
});

function renderPalette(){
  const el = document.getElementById('colorPalette');
  if (!el) return;
  el.innerHTML = '';
  COLOR_PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.className = 'color-btn';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => {
      state.selectedColor = c;
      // highlight
      Array.from(el.children).forEach(ch => ch.classList.remove('selected'));
      b.classList.add('selected');
    });
    el.appendChild(b);
  });
  // default selection
  if (!state.selectedColor) {
    state.selectedColor = COLOR_PALETTE[0];
    if (el.firstChild) el.firstChild.classList.add('selected');
  }
}

socket.on('roomState', (room) => {
  state.currentRoom = room;
  renderRoom(room);
});

socket.on('submissionsUpdated', ({ submissions }) => {
  // update submission count display and notes
  const count = Object.keys(submissions || {}).length;
  const total = (state.currentRoom && state.currentRoom.players) ? state.currentRoom.players.length : 0;
  const statusEl = document.getElementById('submissionStatus');
  if (statusEl) statusEl.textContent = `${count} of ${total} players submitted`;
  renderSubmissions(submissions);
});

socket.on('roundStarted', ({ room, judgeId }) => {
  renderRoom(room);
  state.judgeId = judgeId;
  state.isJudge = (state.playerId && room && state.playerId === room.judgeId);
  judgeEl.textContent = (room && room.judgeName) ? room.judgeName : (judgeId || '-');
  roundNumberEl.textContent = (room && room.round) ? room.round.number : '-';
  promptEl.textContent = (room && room.round) ? (room.round.prompt || '-') : '-';
  submissionsEl.innerHTML = '';
  yourSubmission.textContent = '';
  promptChoicesEl.innerHTML = '';
  // disable submit for judge
  updateSubmitState();
});

socket.on('submissionsUpdated', ({ submissions }) => {
  renderSubmissions(submissions);
});

socket.on('roundEnded', ({ winnerId, room }) => {
  renderRoom(room);
  submissionsEl.innerHTML = '<div class="info">Round ended. Winner: ' + (winnerId || '-') + '</div>';
});

function renderRoom(room){
  if (!room) return;
  playersList.innerHTML = '<h4>Players</h4>' + room.players.map(p => `<div>${p.name} (${p.score}) - hand ${p.handSize}</div>`).join('');
  judgeEl.textContent = room.judgeName || '-';
  roundNumberEl.textContent = (room.round && room.round.number) ? room.round.number : '-';
  promptEl.textContent = (room.round && room.round.prompt) ? room.round.prompt : '-';
  handSizeEl.textContent = room.handSize || '40';

  // top players bar
  playersBarEl.innerHTML = '';
  room.players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player-badge' + ((room.judgeId && room.judgeId === p.id) ? ' judge' : '');
    el.textContent = p.name + (room.judgeId && room.judgeId === p.id ? ' (Judge)' : '');
    playersBarEl.appendChild(el);
  });

  // show hand size controls to creator
  if (room.creatorId && state.playerId && room.creatorId === state.playerId) {
    handSizeControls.style.display = 'inline-block';
    handSizeInput.value = room.handSize || '';
  } else {
    handSizeControls.style.display = 'none';
  }

  // set local judge state and update submit/drag behaviour
  state.isJudge = (state.playerId && room.judgeId && state.playerId === room.judgeId);
  updateSubmitState();
  renderHand();
}

function renderHand(){
  handEl.innerHTML = '';
  handCount.textContent = state.hand.length;
  state.hand.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'tile';
    // visual cue for punctuation
    if (PUNCTUATIONS.includes(w)) d.classList.add('punct');
    // prevent drag if judge
    d.draggable = !state.isJudge;
    d.textContent = w;
    d.dataset.index = i;
    if (!state.isJudge) d.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', w); });
    handEl.appendChild(d);
  });
}

postit.addEventListener('dragover', (ev) => ev.preventDefault());
postit.addEventListener('drop', (ev) => {
  ev.preventDefault();
  const source = ev.dataTransfer.getData('source') || 'hand';
  if (source === 'postit') {
    const id = ev.dataTransfer.getData('wordId');
    const dragged = postit.querySelector('[data-id="' + id + '"]');
    if (!dragged) return;
    const target = ev.target.closest('.word');
    if (target && target !== dragged) {
      postit.insertBefore(dragged, target);
    } else if (!target) {
      postit.appendChild(dragged);
    }
    return;
  }
  const w = ev.dataTransfer.getData('text/plain');
  if (!w) return;
  addWordToPostit(w);
  // remove a single instance of w from hand
  const idx = state.hand.indexOf(w);
  if (idx !== -1) state.hand.splice(idx,1);
  renderHand();
});

function addWordToPostit(w){
  if (!w) return;
  const id = 'w' + Date.now() + Math.floor(Math.random()*1000);
  const span = document.createElement('span');
  span.className = 'word';
  span.dataset.id = id;
  span.textContent = w;
  span.title = 'Click to remove';

  // dragstart for reordering
  span.draggable = true;
  span.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('source', 'postit');
    ev.dataTransfer.setData('wordId', id);
    ev.dataTransfer.setData('text/plain', w);
  });

  // click to remove (only when clicking the span itself, not buttons)
  span.addEventListener('click', (e) => {
    if (e.target !== span) return;
    // remove and return to hand
    postit.removeChild(span);
    state.hand.push(w);
    renderHand();
  });

  // move buttons (helpful on touch devices)
  const left = document.createElement('button');
  left.className = 'move-left';
  left.textContent = '‹';
  left.addEventListener('click', (ev) => { ev.stopPropagation();
    const prev = span.previousElementSibling;
    if (prev) postit.insertBefore(span, prev);
  });
  const right = document.createElement('button');
  right.className = 'move-right';
  right.textContent = '›';
  right.addEventListener('click', (ev) => { ev.stopPropagation();
    const next = span.nextElementSibling;
    if (next) postit.insertBefore(next, span);
  });

  span.appendChild(left);
  span.appendChild(right);
  postit.appendChild(span);
}

submitBtn.addEventListener('click', () => {
  if (state.isJudge) return alert('Judge may not submit a sentence this round');
  const words = Array.from(postit.querySelectorAll('.word')).map(s => s.textContent);
  if (words.length === 0) return alert('Drop words onto the post-it first');
  const sentence = words.join(' ');
  const color = state.selectedColor || null;
  socket.emit('submitSentence', { roomId: state.roomId, playerId: state.playerId, sentence, words, color }, (res) => {
    if (res && res.ok) {
      yourSubmission.textContent = 'Submitted: ' + sentence;
      postit.innerHTML = '';
    } else if (res && res.error) {
      alert(res.error);
    }
  });
});

clearBtn.addEventListener('click', () => { postit.innerHTML = ''; });

function renderSubmissions(submissions){
  // render as colorful post-it notes under prompt area (notesArea)
  const notesArea = document.getElementById('notesArea');
  if (!notesArea) return;
  notesArea.innerHTML = '';
  const arr = Object.values(submissions || {});
  if (arr.length === 0) { notesArea.innerHTML = '<div class="info">No submissions yet</div>'; return; }
  arr.forEach(s => {
    const note = document.createElement('div');
    note.className = 'note';
    note.style.background = s.color || '#fff7a8';
    note.style.fontFamily = "'Patrick Hand', 'Shadows Into Light', cursive";

    // note text only (anonymous)
    const cleaned = removeAngleBrackets(s.sentence || '');
    note.innerHTML = `<div class="note-text">${escapeHtml(cleaned)}</div>`;

    // if current user is judge, show pick button on the note
    if (state.playerId === state.judgeId) {
      const btn = document.createElement('button');
      btn.textContent = 'Pick winner';
      btn.className = 'note-pick';
      btn.onclick = () => {
        if (!confirm('Pick this as winner?')) return;
        socket.emit('pickWinner', { roomId: state.roomId, winnerId: s.playerId });
      };
      note.appendChild(btn);
    }

    notesArea.appendChild(note);
  });
}

function removeAngleBrackets(str){
  if (!str) return '';
  return String(str).replace(/[<>]/g, '');
}

function escapeHtml(str){
  if (!str) return '';
  // remove angle brackets completely (formatting error) then escape
  const cleaned = String(str).replace(/[<>]/g, '');
  return cleaned.replace(/[&"']/g, function(c){ return {'&':'&amp;','"':'&quot;',"'":'&#39;'}[c]; });
}

startRoundBtn.addEventListener('click', () => {
  socket.emit('startRound', { roomId: state.roomId }, (res) => {});
});

setHandSizeBtn.addEventListener('click', () => {
  const v = parseInt(handSizeInput.value, 10);
  if (isNaN(v) || v < 5 || v > 100) return alert('Hand size must be between 5 and 100');
  socket.emit('setHandSize', { roomId: state.roomId, handSize: v }, (res) => {
    if (res && !res.ok && res.error) alert(res.error);
  });
});

function updateSubmitState(){
  // disable or enable submit for judge
  if (state.isJudge) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Judge cannot submit';
    submitBtn.style.opacity = '0.6';
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Sentence';
    submitBtn.style.opacity = '1';
  }
}
