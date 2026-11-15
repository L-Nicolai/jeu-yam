import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, GAME_MODES, applyEntry, acknowledgeHandoff, getGameTotals, isGameOver } from '../src/engine/game.js';
import { getLegalActions, previewEntry, rollDice, announceTam } from '../src/engine/rules.js';
import { CATEGORY_KEYS, COLUMN_KEYS } from '../src/engine/constants.js';
import { playAiTurn } from '../src/engine/ai.js';
import { serializeGame, deserializeGame } from '../src/engine/serialize.js';
import { createFakeOnlineService } from '../src/net/fake.js';
import { saveGame, loadSavedGame } from '../src/storage.js';

test('sans Sèche — la sauvegarde locale conserve le choix après rechargement', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = rollDice(createGame({ mode: GAME_MODES.SINGLE, includeDry: false }));
  assert.equal(saveGame(state, storage), true);
  assert.deepEqual(loadSavedGame(storage), state);
});

test('sans Sèche à distance — choix partagé du salon à la revanche', async () => {
  const service = createFakeOnlineService();
  const creator = await service.createGame({ creatorName: 'A', includeDry: false });
  const id = creator.game.gameId;
  assert.equal(creator.game.includeDry, false);
  const guest = await service.joinGame(id, { name: 'B' });
  assert.equal(guest.game.includeDry, false);
  const started = await service.startGame(id, creator);
  assert.equal(started.state.includeDry, false);
  const finished = structuredClone(started.state);
  finishSheetExcept(finished);
  finished.status = 'finished';
  await service.publishState(id, { ...creator, state: finished, version: 2, round: 1 });
  const replay = await service.replayGame(id, creator);
  assert.equal(replay.state.includeDry, false);
  assert.equal(replay.state.completedTurns, 0);
  assert.equal(replay.state.players[0].sheet.free.one, null);
});

function finishSheetExcept(state, except) {
  for (const player of state.players) {
    for (const column of COLUMN_KEYS.filter((key) => key !== 'dry' && key !== except)) {
      for (const category of CATEGORY_KEYS) player.sheet[column][category] = 0;
    }
  }
}

test('sans Sèche — la dernière case finit la partie et les totaux excluent la Sèche', () => {
  let state = createGame({ mode: GAME_MODES.SINGLE, includeDry: false });
  finishSheetExcept(state);
  state.players[0].sheet.free.yam = null;
  state.players[0].sheet.dry.yam = 90;
  state = rollDice(state, Math.random, [6, 6, 6, 6, 6]);
  state = applyEntry(state, 'free', 'yam');
  assert.equal(state.status, 'finished');
  assert.equal(isGameOver(state), true);
  const totals = getGameTotals(state).players[0];
  assert.deepEqual(Object.keys(totals.columns), COLUMN_KEYS.filter((key) => key !== 'dry'));
  assert.equal(totals.grandTotal, Object.values(totals.columns).reduce((sum, column) => sum + column.total, 0));
});

test('sans Sèche — annonce Tam obligatoire quand seule la colonne Tam reste vide', () => {
  let state = createGame({ mode: GAME_MODES.SINGLE, includeDry: false });
  finishSheetExcept(state, 'tam');
  state = rollDice(state, Math.random, [1, 2, 3, 4, 5]);
  assert.equal(getLegalActions(state).mustAnnounceTam, true);
  assert.equal(getLegalActions(state).canReroll, false);
  state = announceTam(state, 'straight');
  assert.equal(getLegalActions(state).canReroll, true);
});

test('sans Sèche — l’ordinateur peut terminer les 52 cases de chaque feuille', () => {
  let state = createGame({ includeDry: false });
  let seed = 83;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  for (let turns = 0; turns < 104; turns += 1) state = playAiTurn(state, random);
  assert.equal(state.status, 'finished');
  assert.equal(state.completedTurns, 104);
  assert.equal(isGameOver(state), true);
});

test('anciennes sauvegardes — la Sèche reste active si aucune option n’est enregistrée', () => {
  const state = createGame({ mode: GAME_MODES.SINGLE });
  delete state.includeDry;
  const restored = deserializeGame(serializeGame(state));
  assert.ok(getLegalActions(rollDice(restored)).entries.some(({ column }) => column === 'dry'));
  finishSheetExcept(restored);
  assert.equal(isGameOver(restored), false);
});

for (const [mode, count] of [[GAME_MODES.SINGLE, 1], [GAME_MODES.LOCAL, 2], [GAME_MODES.LOCAL, 5], [GAME_MODES.REMOTE, 2], [GAME_MODES.REMOTE, 5]]) {
  test(`sans Sèche — partie complète ${mode} à ${count} joueur(s)`, () => {
    const players = Array.from({ length: count }, (_, index) => ({
      id: `test-${index}`, name: `Test ${index}`, kind: mode === GAME_MODES.REMOTE ? 'remote' : 'human',
    }));
    let state = createGame({ mode, players, includeDry: false });
    for (let turn = 0; turn < count * 52; turn += 1) {
      if (state.handoffRequired) state = acknowledgeHandoff(state);
      state = rollDice(state, () => 0.5);
      let actions = getLegalActions(state);
      if (actions.mustAnnounceTam) {
        state = announceTam(state, actions.announcements[0].category);
        actions = getLegalActions(state);
      }
      assert.ok(actions.entries.length > 0);
      assert.ok(actions.entries.every(({ column }) => column !== 'dry'));
      const entry = actions.entries[0];
      state = applyEntry(state, entry.column, entry.category);
    }
    assert.equal(state.completedTurns, count * 52);
    assert.equal(state.status, 'finished');
    assert.ok(state.players.every(({ sheet }) => Object.values(sheet.dry).every((score) => score === null)));
  });
}

test('sans Sèche — aucun coup ni barrage ne peut viser la colonne désactivée', () => {
  const state = rollDice(createGame({ mode: GAME_MODES.SINGLE, includeDry: false }), Math.random, [2, 3, 4, 5, 6]);
  assert.equal(state.includeDry, false);
  assert.equal(getLegalActions(state).entries.some(({ column }) => column === 'dry'), false);
  assert.throws(() => previewEntry(state, 'dry', 'straight'), /désactivée/);
  assert.throws(() => applyEntry(state, 'dry', 'straight', { strike: true }), /désactivée/);
});
