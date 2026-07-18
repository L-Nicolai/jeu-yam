import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledgeHandoff,
  applyEntry,
  createGame,
  GAME_MODES,
  getGameTotals,
  getGameOutcome,
  isGameOver,
} from '../src/engine/game.js';
import {
  announceTam,
  getLegalActions,
  rollDice,
  toggleHeldDie,
} from '../src/engine/rules.js';
import { deserializeGame, serializeGame } from '../src/engine/serialize.js';
import {
  clearSavedGame,
  loadGame,
  loadSavedGame,
  saveGame,
} from '../src/storage.js';
import { playAiTurn } from '../src/engine/ai.js';

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function playLegalRandomGame(seed) {
  const random = mulberry32(seed);
  let state = createGame();
  let turns = 0;
  while (!isGameOver(state) && turns < 131) {
    state = rollDice(state, random);
    let actions = getLegalActions(state);
    if (actions.mustAnnounceTam || (!actions.entries.length && actions.announcements.length)) {
      const choice = actions.announcements[Math.floor(random() * actions.announcements.length)];
      state = announceTam(state, choice.category);
      actions = getLegalActions(state);
    }
    assert.ok(actions.entries.length > 0, `aucun coup légal, partie ${seed}, tour ${turns}`);
    const entry = actions.entries[Math.floor(random() * actions.entries.length)];
    state = applyEntry(state, entry.column, entry.category, { strike: random() < 0.05 });
    turns += 1;
  }
  assert.equal(turns, 130);
  assert.equal(isGameOver(state), true);
  return state;
}

test('un tour inscrit exactement une case et passe au joueur interchangeable suivant', () => {
  let state = createGame();
  state = rollDice(state, Math.random, [1, 1, 1, 2, 3]);
  state = applyEntry(state, 'free', 'one');
  assert.equal(state.players[0].sheet.free.one, 3);
  assert.equal(state.activePlayerIndex, 1);
  assert.equal(state.turn.rollCount, 0);
  assert.throws(() => applyEntry(state, 'free', 'one'), /lancer/);
});

test('les totaux de colonne et le TOTAL général appliquent la ligne Total (60)', () => {
  const state = createGame();
  Object.assign(state.players[0].sheet.free, {
    one: 3,
    two: 6,
    three: 9,
    four: 12,
    five: 15,
    six: 18,
    straight: 45,
    full: 30,
    fourKind: 50,
    plus: 20,
    middle: 15,
    minus: 10,
    yam: 70,
  });
  const totals = getGameTotals(state).players[0];
  assert.equal(totals.columns.free.upperRaw, 63);
  assert.equal(totals.columns.free.upperTotal, 105);
  assert.equal(totals.columns.free.total, 345);
  assert.equal(totals.grandTotal, 345);
});

test('sérialisation — aller-retour strict, y compris mi-tour avec annonce Tam active', () => {
  let state = createGame();
  state = rollDice(state, Math.random, [6, 6, 6, 2, 1]);
  state = announceTam(state, 'fourKind');
  state.turn.held = [true, true, true, false, false];
  assert.deepEqual(deserializeGame(serializeGame(state)), state);
});

test('parties génératives — 500 parties aléatoires terminent 130 tours sans blocage', () => {
  for (let seed = 1; seed <= 500; seed += 1) playLegalRandomGame(seed);
});

test('mode Jouer seule — une partie générative complète termine 65 tours sans blocage', () => {
  const random = mulberry32(20260717);
  let state = createGame({ mode: GAME_MODES.SINGLE });
  let turns = 0;
  while (!isGameOver(state) && turns < 66) {
    state = rollDice(state, random);
    let actions = getLegalActions(state);
    if (actions.mustAnnounceTam || (!actions.entries.length && actions.announcements.length)) {
      state = announceTam(state, actions.announcements[0].category);
      actions = getLegalActions(state);
    }
    assert.ok(actions.entries.length > 0, `aucun coup légal au tour ${turns}`);
    const entry = actions.entries[Math.floor(random() * actions.entries.length)];
    state = applyEntry(state, entry.column, entry.category);
    turns += 1;
  }
  assert.equal(turns, 65);
  assert.equal(state.completedTurns, 65);
  assert.equal(isGameOver(state), true);
  assert.equal(getGameOutcome(state).type, 'single');
  assert.equal(getGameOutcome(state).winnerIndex, null);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('sauvegarde locale — aller-retour exact, y compris annonce Tam active', () => {
  const storage = memoryStorage();
  let state = createGame();
  state = rollDice(state, Math.random, [6, 6, 6, 2, 1]);
  state = announceTam(state, 'fourKind');
  state.turn.held = [true, true, true, false, false];
  saveGame(state, storage);
  assert.deepEqual(loadGame(storage), state);
});

test('sauvegarde v3 — le mode Jouer seule est conservé à la reprise', () => {
  const storage = memoryStorage();
  const state = createGame({ mode: GAME_MODES.SINGLE });
  saveGame(state, storage);
  assert.deepEqual(loadSavedGame(storage), state);
  const payload = JSON.parse(storage.getItem('yam-leslie-partie'));
  assert.equal(payload.version, 3);
  assert.equal(payload.mode, GAME_MODES.SINGLE);
});

test('migration douce — un payload v1 reprend en mode contre l’ordinateur', () => {
  const storage = memoryStorage();
  const legacyState = createGame();
  legacyState.mode = 'solo';
  storage.setItem('yam-leslie-partie', JSON.stringify({ version: 1, state: legacyState }));
  const restored = loadSavedGame(storage);
  assert.equal(restored.mode, GAME_MODES.COMPUTER);
  assert.equal(restored.players.length, 2);
  assert.deepEqual(restored.players, legacyState.players);
  saveGame(restored, storage);
  const upgraded = JSON.parse(storage.getItem('yam-leslie-partie'));
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.mode, GAME_MODES.COMPUTER);
});

test('migration douce — un payload v2 est restauré sans changer son mode', () => {
  const storage = memoryStorage();
  const legacyState = createGame({ mode: GAME_MODES.SINGLE });
  delete legacyState.handoffRequired;
  storage.setItem('yam-leslie-partie', JSON.stringify({
    version: 2,
    mode: GAME_MODES.SINGLE,
    state: legacyState,
  }));
  const restored = loadSavedGame(storage);
  assert.equal(restored.mode, GAME_MODES.SINGLE);
  assert.equal(restored.players.length, 1);
  assert.equal(restored.handoffRequired, false);
});

test('écran d’accueil — aucune sauvegarde valide ne représente une partie en cours', () => {
  const storage = memoryStorage();
  assert.equal(loadSavedGame(storage), null);
  storage.setItem('yam-leslie-partie', '{pas du json');
  assert.equal(loadSavedGame(storage), null);
});

test('sauvegarde locale — JSON corrompu ou version inconnue démarre une partie propre', () => {
  const storage = memoryStorage();
  storage.setItem('yam-leslie-partie', '{pas du json');
  assert.deepEqual(loadGame(storage), createGame());
  storage.setItem('yam-leslie-partie', JSON.stringify({ version: 99, state: {} }));
  assert.deepEqual(loadGame(storage), createGame());
});

test('reprise ordinateur — une sauvegarde à son tour est terminée sans blocage', () => {
  const storage = memoryStorage();
  let state = createGame();
  state.activePlayerIndex = 1;
  state = rollDice(state, Math.random, [6, 6, 6, 2, 1]);
  saveGame(state, storage);
  const restored = loadGame(storage);
  const completed = playAiTurn(restored, mulberry32(77));
  assert.equal(completed.activePlayerIndex, 0);
  assert.equal(completed.completedTurns, 1);
});

test('effacement explicite — la sauvegarde reste intacte tant que clearSavedGame n’est pas appelé', () => {
  const storage = memoryStorage();
  const state = createGame();
  saveGame(state, storage);
  assert.deepEqual(loadGame(storage), state);
  clearSavedGame(storage);
  assert.deepEqual(loadGame(storage), createGame());
});

test('fin de partie — une égalité exacte reste une égalité sans vainqueur désigné', () => {
  const state = createGame();
  for (const player of state.players) {
    for (const column of Object.values(player.sheet)) {
      for (const category of Object.keys(column)) column[category] = 0;
    }
  }
  state.status = 'finished';
  assert.deepEqual(getGameOutcome(state), {
    type: 'tie',
    winnerIndex: null,
    totals: [-1500, -1500],
  });
});

test('U14 — une partie locale à 3 joueurs termine 195 tours sans blocage', () => {
  const random = mulberry32(20260718);
  let state = createGame({
    mode: GAME_MODES.LOCAL,
    players: [
      { id: 'local-1', name: 'Alice', kind: 'human' },
      { id: 'local-2', name: 'Basile', kind: 'human' },
      { id: 'local-3', name: 'Chloé', kind: 'human' },
    ],
  });
  let turns = 0;
  while (!isGameOver(state) && turns < 196) {
    if (state.handoffRequired) state = acknowledgeHandoff(state);
    state = rollDice(state, random);
    let actions = getLegalActions(state);
    if (actions.mustAnnounceTam || (!actions.entries.length && actions.announcements.length)) {
      state = announceTam(state, actions.announcements[0].category);
      actions = getLegalActions(state);
    }
    assert.ok(actions.entries.length > 0, `aucun coup légal au tour ${turns}`);
    const entry = actions.entries[Math.floor(random() * actions.entries.length)];
    state = applyEntry(state, entry.column, entry.category);
    turns += 1;
  }
  assert.equal(turns, 195);
  assert.equal(state.completedTurns, 195);
  assert.equal(isGameOver(state), true);
});

test('U14 — le classement complet attribue le même rang aux égalités', () => {
  const state = createGame({
    mode: GAME_MODES.LOCAL,
    players: [
      { id: 'local-1', name: 'Alice', kind: 'human' },
      { id: 'local-2', name: 'Basile', kind: 'human' },
      { id: 'local-3', name: 'Chloé', kind: 'human' },
    ],
  });
  for (const player of state.players) {
    for (const column of Object.values(player.sheet)) {
      for (const category of Object.keys(column)) column[category] = 0;
    }
  }
  state.players[0].sheet.free.plus = 20;
  state.players[1].sheet.free.plus = 20;
  state.status = 'finished';
  const outcome = getGameOutcome(state);
  assert.equal(outcome.type, 'ranking');
  assert.deepEqual(outcome.winnerIndexes, [0, 1]);
  assert.deepEqual(outcome.ranking.map(({ rank, playerIndex }) => ({ rank, playerIndex })), [
    { rank: 1, playerIndex: 0 },
    { rank: 1, playerIndex: 1 },
    { rank: 3, playerIndex: 2 },
  ]);
});

test('U14 — la reprise conserve le bon joueur et l’écran de passage', () => {
  const storage = memoryStorage();
  let state = createGame({
    mode: GAME_MODES.LOCAL,
    players: [
      { id: 'local-1', name: 'Alice', kind: 'human' },
      { id: 'local-2', name: 'Basile', kind: 'human' },
    ],
  });
  state = rollDice(state, Math.random, [1, 1, 2, 3, 4]);
  state = applyEntry(state, 'free', 'one');
  saveGame(state, storage);
  const restored = loadSavedGame(storage);
  assert.equal(restored.activePlayerIndex, 1);
  assert.equal(restored.handoffRequired, true);
  assert.equal(getLegalActions(restored).canRoll, false);
  const ready = acknowledgeHandoff(restored);
  assert.equal(ready.activePlayerIndex, 1);
  assert.equal(ready.handoffRequired, false);
  assert.equal(getLegalActions(ready).canRoll, true);
});

function remotePlayers() {
  return [
    { id: 'place-a', name: 'Alice', kind: 'remote' },
    { id: 'place-b', name: 'Basile', kind: 'remote' },
    { id: 'place-c', name: 'Chloé', kind: 'remote' },
  ];
}

test('U1 multi — une partie distante à 3 joueurs termine sans passage de téléphone', () => {
  const random = mulberry32(18072026);
  let state = createGame({ mode: GAME_MODES.REMOTE, players: remotePlayers() });
  while (!isGameOver(state)) {
    state = rollDice(state, random);
    let actions = getLegalActions(state);
    if (actions.mustAnnounceTam || (!actions.entries.length && actions.announcements.length)) {
      state = announceTam(state, actions.announcements[0].category);
      actions = getLegalActions(state);
    }
    state = applyEntry(state, actions.entries[0].column, actions.entries[0].category);
    assert.equal(state.handoffRequired, false);
  }
  assert.equal(state.completedTurns, 195);
});

test('U1 multi — classement complet avec égalité', () => {
  const state = createGame({ mode: GAME_MODES.REMOTE, players: remotePlayers() });
  for (const player of state.players) {
    for (const column of Object.values(player.sheet)) {
      for (const category of Object.keys(column)) column[category] = 0;
    }
  }
  state.status = 'finished';
  const outcome = getGameOutcome(state);
  assert.equal(outcome.type, 'ranking');
  assert.deepEqual(outcome.winnerIndexes, [0, 1, 2]);
  assert.deepEqual(outcome.ranking.map(({ rank }) => rank), [1, 1, 1]);
});

test('U1 multi — sérialisation exacte mi-tour et garde attribuée au joueur', () => {
  let state = createGame({ mode: GAME_MODES.REMOTE, players: remotePlayers() });
  state = rollDice(state, mulberry32(7), [6, 6, 6, 2, 1]);
  state = toggleHeldDie(state, 0);
  assert.equal(state.lastAction.playerId, 'place-a');
  assert.deepEqual(deserializeGame(serializeGame(state)), state);
});
