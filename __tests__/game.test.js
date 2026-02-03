const server = require('../server');
const {
  generateId,
  shuffle,
  createRoom,
  rooms,
  masterWords,
  drawWords,
  refillPlayerHand,
  addPlayerToRoom,
  startRound,
  sanitizeRoom,
  pickPromptChoices,
  endRoundWithWinner
} = server;

describe('game core functions', () => {
  test('generateId produces string of given length', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(6);

    const id8 = generateId(8);
    expect(id8.length).toBe(8);
    expect(/^[A-Z0-9]+$/.test(id8)).toBe(true);
  });

  test('shuffle returns a permutation of array', () => {
    const arr = [1,2,3,4,5,6,7,8,9,10];
    const copy = arr.slice();
    shuffle(copy);
    expect(copy.sort()).toEqual(arr.slice().sort());
  });

  test('createRoom creates a room with deck based on masterWords', () => {
    const beforeRooms = Object.keys(rooms).length;
    const room = createRoom();
    expect(room).toBeDefined();
    expect(room.id).toBeDefined();
    expect(Object.keys(rooms).length).toBeGreaterThanOrEqual(beforeRooms + 1);
    expect(Array.isArray(room.deck)).toBe(true);
    expect(room.deck.length).toBe(masterWords.length);
  });

  test('drawWords removes from deck and returns requested count', () => {
    const room = createRoom();
    const initialDeck = room.deck.length;
    const drawn = drawWords(room, 5);
    expect(drawn.length).toBe(5);
    expect(room.deck.length).toBe(initialDeck - 5);
  });

  test('refillPlayerHand fills player to HAND_SIZE words and adds punctuation', () => {
    const room = createRoom();
    const player = { hand: [] };
    refillPlayerHand(room, player);
    expect(player.hand.length).toBeLessThanOrEqual(require('../server').HAND_SIZE);
    // punctuation count should not exceed MAX_PUNCTUATION_PER_HAND
    const punctCount = player.hand.filter(w => require('../server').PUNCTUATIONS.includes(w)).length;
    expect(punctCount).toBeLessThanOrEqual(require('../server').MAX_PUNCTUATION_PER_HAND);
    // after fill, subsequent refill leaves it at HAND_SIZE
    const prev = player.hand.length;
    refillPlayerHand(room, player);
    expect(player.hand.length).toBeGreaterThanOrEqual(prev);
    expect(player.hand.length).toBeLessThanOrEqual(require('../server').HAND_SIZE);
  });

  test('addPlayerToRoom adds player and gives them a hand', () => {
    const room = createRoom();
    const player = addPlayerToRoom(room, 'Test', 'socket:test');
    expect(player).toBeDefined();
    expect(player.id).toBeDefined();
    expect(Array.isArray(player.hand)).toBe(true);
    expect(player.hand.length).toBeLessThanOrEqual(require('../server').HAND_SIZE);
    const punctCount = player.hand.filter(w => require('../server').PUNCTUATIONS.includes(w)).length;
    expect(punctCount).toBeLessThanOrEqual(require('../server').MAX_PUNCTUATION_PER_HAND);
    expect(room.players.find(p => p.id === player.id)).toBeDefined();
  });

  test('startRound initializes round and sets judge', () => {
    const room = createRoom();
    const p1 = addPlayerToRoom(room, 'A', 's1');
    const p2 = addPlayerToRoom(room, 'B', 's2');
    startRound(room.id);
    expect(room.round).toBeDefined();
    expect(room.round.number).toBeGreaterThanOrEqual(1);
    expect(room.judgeId).toBeDefined();
  });

  test('sanitizeRoom includes judgeName and round number', () => {
    const room = createRoom();
    const p1 = addPlayerToRoom(room, 'Alpha', 's1');
    const p2 = addPlayerToRoom(room, 'Beta', 's2');
    startRound(room.id);
    const s = sanitizeRoom(room);
    expect(s.judgeName).toBeDefined();
    expect(s.round.number).toBe(room.round.number);
    // judgeName should match one of the players
    expect(['Alpha','Beta']).toContain(s.judgeName);
  });

  test('pickPromptChoices returns up to 5 choices', () => {
    const choices = require('../server').pickPromptChoices(5);
    expect(Array.isArray(choices)).toBe(true);
    expect(choices.length).toBeLessThanOrEqual(5);
    choices.forEach(c => expect(typeof c).toBe('string'));
  });

  test('tests use rooms.test.json file', () => {
    const rf = require('../server').ROOMS_FILE;
    expect(rf).toMatch(/rooms\.test\.json$/);
  });

  test('refillPlayerHand ensures at least 10 nouns in hand', () => {
    const room = createRoom();
    const player = { hand: [] };
    refillPlayerHand(room, player);
    const nounCount = player.hand.filter(w => require('../server').NOUNS.has(w)).length;
    expect(nounCount).toBeGreaterThanOrEqual(10);
  });

  test('refillPlayerHand ensures at least 5 positional pronouns in hand', () => {
    const room = createRoom();
    const player = { hand: [] };
    refillPlayerHand(room, player);
    const posCount = player.hand.filter(w => require('../server').POSITIONAL_PRONOUNS.has(w)).length;
    expect(posCount).toBeGreaterThanOrEqual(5);
  });

  test('refillPlayerHand ensures at least 1 Kirsten-themed word in hand', () => {
    const room = createRoom();
    const player = { hand: [] };
    refillPlayerHand(room, player);
    const kCount = player.hand.filter(w => require('../server').KIRSTEN_WORDS.has(w)).length;
    expect(kCount).toBeGreaterThanOrEqual(1);
  });

  test('addPlayerToRoom gives player a hand with at least 10 nouns', () => {
    const room = createRoom();
    const player = addPlayerToRoom(room, 'Test', 'socket:test');
    const nounCount = player.hand.filter(w => require('../server').NOUNS.has(w)).length;
    expect(nounCount).toBeGreaterThanOrEqual(10);
  });

  test('creator can change hand size and hands adjust', () => {
    const room = createRoom();
    const p1 = addPlayerToRoom(room, 'Creator', 's1');
    const p2 = addPlayerToRoom(room, 'Other', 's2');
    // creator sets hand size to 30
    const res = require('../server').setRoomHandSize(room.id, 30, p1.id);
    expect(res.ok).toBe(true);
    expect(room.handSize).toBe(30);
    // all players should have hand length <= 30
    room.players.forEach(p => expect(p.hand.length).toBeLessThanOrEqual(30));
  });

  test('non-creator cannot change hand size', () => {
    const room = createRoom();
    const p1 = addPlayerToRoom(room, 'Creator', 's1');
    const p2 = addPlayerToRoom(room, 'Other', 's2');
    const res = require('../server').setRoomHandSize(room.id, 20, p2.id);
    expect(res.ok).toBe(false);
  });

  test('endRoundWithWinner increments score and moves words to discard', () => {
    const room = createRoom();
    const p1 = addPlayerToRoom(room, 'Winner', 's1');
    const p2 = addPlayerToRoom(room, 'Other', 's2');
    startRound(room.id);
    // simulate submission for p2
    room.round.submissions = {};
    room.round.submissions[p2.id] = { words: ['apple', 'banana'], playerId: p2.id };
    const beforeScore = p2.score;
    endRoundWithWinner(room.id, p2.id);
    expect(p2.score).toBe(beforeScore + 1);
    expect(room.discard).toEqual(expect.arrayContaining(['apple','banana']));
    expect(room.state).toBe('lobby');
  });

  test('master wordlist includes Kirsten-themed words', () => {
    const mw = require('../server').masterWords;
    expect(mw.includes('Kirsten') || mw.includes('kirsten')).toBe(true);
    expect(mw.includes('birthday')).toBe(true);
    expect(mw.includes('presents')).toBe(true);
  });

  test('prompts include Kirsten birthday prompts', () => {
    const prompts = require('../server').prompts;
    expect(prompts.some(p => p.includes('Kirsten') || p.includes('birthday') || p.includes('pass-the-parcel') || p.includes('cake'))).toBe(true);
  });

  test('prompts list has at least 90 prompts', () => {
    const prompts = require('../server').prompts;
    expect(Array.isArray(prompts)).toBe(true);
    expect(prompts.length).toBeGreaterThanOrEqual(90);
  });

  test('master wordlist includes Loki and cat', () => {
    const mw = require('../server').masterWords;
    expect(mw.includes('Loki') || mw.includes('loki')).toBe(true);
    expect(mw.includes('cat')).toBe(true);
  });

  test('master wordlist includes poor-quality synonyms for prompt words', () => {
    const mw = require('../server').masterWords;
    const syns = ['ant','bug','pest','pants','trousers','jeans','get-rid','remove','exterminator','thingy','stuff','whatchamacallit'];
    syns.forEach(s => expect(mw.includes(s)).toBe(true));
  });

  test('master wordlist includes common prepositions', () => {
    const mw = require('../server').masterWords;
    const preps = ['in','on','at','by','with','for','about','between','through','under'];
    preps.forEach(p => expect(mw.includes(p)).toBe(true));
  });
});
