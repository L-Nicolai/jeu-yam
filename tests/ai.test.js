import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  applyAiAction,
  chooseAiAction,
  chooseHeldDice,
  playAiTurn,
} from '../src/engine/ai.js';
import { applyEntry, createGame, getGameTotals, isGameOver } from '../src/engine/game.js';
import { announceTam, getLegalActions, rollDice } from '../src/engine/rules.js';

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function playRandomTurn(initialState, random) {
  let state = rollDice(initialState, random);
  let actions = getLegalActions(state);
  if (actions.mustAnnounceTam || !actions.entries.length) {
    const announcement = actions.announcements[Math.floor(random() * actions.announcements.length)];
    state = announceTam(state, announcement.category);
    actions = getLegalActions(state);
  }
  const entry = actions.entries[Math.floor(random() * actions.entries.length)];
  return applyEntry(state, entry.column, entry.category, { strike: random() < 0.08 });
}

test('bon sens — avec 6-6-6-2-1, l’IA garde les trois 6', () => {
  assert.deepEqual(chooseHeldDice([6, 6, 6, 2, 1]), [true, true, true, false, false]);
});

test('bon sens — une Quinte servie au premier lancer est inscrite en Sèche', () => {
  let state = createGame();
  state = rollDice(state, Math.random, [2, 3, 4, 5, 6]);
  const action = chooseAiAction(state);
  assert.deepEqual(
    { type: action.type, column: action.column, category: action.category },
    { type: 'entry', column: 'dry', category: 'straight' },
  );
});

test('cohérence Tam — un simple brelan ne déclenche jamais une annonce Carré', () => {
  let state = createGame();
  for (const category of Object.keys(state.players[0].sheet.dry)) {
    state.players[0].sheet.dry[category] = 0;
  }
  state = rollDice(state, Math.random, [6, 6, 6, 2, 1]);
  const action = chooseAiAction(state);
  assert.notDeepEqual(
    { type: action.type, category: action.category },
    { type: 'announce-tam', category: 'fourKind' },
  );
});

test('cohérence Tam — un Carré déjà servi peut être annoncé', () => {
  let state = createGame();
  for (const category of Object.keys(state.players[0].sheet.dry)) {
    state.players[0].sheet.dry[category] = 0;
  }
  state = rollDice(state, Math.random, [6, 6, 6, 6, 1]);
  assert.deepEqual(chooseAiAction(state), { type: 'announce-tam', category: 'fourKind' });
});

test('arrêt raisonné — un Full modeste déjà servi n’est pas détruit par une relance', () => {
  const state = createGame();
  const sheet = state.players[0].sheet;
  for (const column of Object.keys(sheet)) {
    for (const category of Object.keys(sheet[column])) sheet[column][category] = 0;
  }
  sheet.free.full = null;
  state.turn.dice = [2, 2, 2, 1, 1];
  state.turn.rollCount = 1;
  assert.deepEqual(chooseAiAction(state), { type: 'entry', column: 'free', category: 'full' });
});

test('placement relatif — une case 1 vide est sacrifiée avant un Yam', () => {
  const state = createGame();
  const sheet = state.players[0].sheet;
  for (const column of Object.keys(sheet)) {
    for (const category of Object.keys(sheet[column])) sheet[column][category] = 0;
  }
  sheet.free.one = null;
  sheet.free.yam = null;
  state.turn.dice = [2, 3, 4, 5, 6];
  state.turn.rollCount = 3;
  state.turn.rerolled = true;
  assert.deepEqual(chooseAiAction(state), { type: 'entry', column: 'free', category: 'one' });
});

test('protection du Total — trois 6 vont dans la colonne qui franchit le seuil de 60', () => {
  const state = createGame();
  const sheet = state.players[0].sheet;
  Object.assign(sheet.descending, { one: 0, two: 0, three: 0, four: 0, five: 0 });
  Object.assign(sheet.free, { one: 3, two: 6, three: 9, four: 12, five: 15 });
  for (const column of ['ascending', 'tam', 'dry']) {
    for (const category of Object.keys(sheet[column])) sheet[column][category] = 0;
  }
  state.turn = {
    dice: [6, 6, 6, 2, 1],
    held: [false, false, false, false, false],
    rollCount: 3,
    rerolled: true,
    tamAnnouncement: null,
  };
  assert.deepEqual(chooseAiAction(state), { type: 'entry', column: 'free', category: 'six' });
});

test('légalité — 1 000 parties IA auto-jouées terminent sans blocage ni coup illégal', () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const random = mulberry32(seed);
    let state = createGame();
    let turns = 0;
    while (!isGameOver(state) && turns < 131) {
      state = playAiTurn(state, random);
      turns += 1;
    }
    assert.equal(turns, 130, `nombre de tours, partie ${seed}`);
    assert.equal(isGameOver(state), true, `partie ${seed} non terminée`);
  }
});

test('performance — une partie complète auto-jouée prend moins d’une seconde', () => {
  const random = mulberry32(20260717);
  let state = createGame();
  const startedAt = performance.now();
  while (!isGameOver(state)) state = playAiTurn(state, random);
  assert.ok(performance.now() - startedAt < 1000);
});

test('calibrage U9 — au moins 95 % de victoires sur 300 parties contre le joueur aléatoire légal', (t) => {
  let wins = 0;
  let totalAiScore = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const random = mulberry32(seed * 7919);
    let state = createGame();
    while (!isGameOver(state)) {
      state = state.activePlayerIndex === 0
        ? playAiTurn(state, random)
        : playRandomTurn(state, random);
    }
    const [ai, randomPlayer] = getGameTotals(state).players;
    if (ai.grandTotal > randomPlayer.grandTotal) wins += 1;
    totalAiScore += ai.grandTotal;
  }
  const average = totalAiScore / 300;
  assert.ok(wins >= 285, `seulement ${wins}/300 victoires`);
  assert.ok(average > 100 && average < 1500, `score moyen inattendu : ${average}`);
  t.diagnostic(`${wins}/300 victoires, score moyen ${average.toFixed(1)}`);
});

test('toute décision IA est applicable par le même moteur de règles', () => {
  const random = mulberry32(42);
  let state = createGame();
  for (let step = 0; step < 20; step += 1) {
    const action = chooseAiAction(state, random);
    state = applyAiAction(state, action, random);
    assert.ok(state);
  }
});
