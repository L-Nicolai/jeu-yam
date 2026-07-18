import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEntry } from '../src/engine/game.js';
import { announceTam, getLegalActions, rollDice } from '../src/engine/rules.js';
import { createFakeOnlineService } from '../src/net/fake.js';
import { isMyRemoteTurn, onlineErrorMessage, onlineGateState, parseOnlineGameId } from '../src/ui/online.js';
import {
  ONLINE_PLACE_TOKENS_KEY,
  STORAGE_KEY,
  loadPlaceTokens,
  saveGame,
  savePlaceToken,
} from '../src/storage.js';

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function setupTwoPlayers() {
  const service = createFakeOnlineService({ random: mulberry32(20260718) });
  const alice = await service.createGame({ creatorName: 'Alice' });
  const basile = await service.joinGame(alice.game.gameId, { name: 'Basile' });
  const game = await service.startGame(alice.game.gameId, alice);
  return { service, gameId: game.gameId, alice, basile, game };
}

test('U2/AE1/AE6 — entrée atomique et prénoms uniques', async () => {
  const service = createFakeOnlineService({ random: mulberry32(1) });
  const alice = await service.createGame({ creatorName: 'Alice' });
  await service.joinGame(alice.game.gameId, { name: 'Léa' });
  await assert.rejects(service.joinGame(alice.game.gameId, { name: ' léa ' }), { code: 'name-taken' });
  const game = await service.readGame(alice.game.gameId);
  assert.deepEqual(game.players.map(({ name }) => name), ['Alice', 'Léa']);
  assert.equal('token' in game.players[0], false);
});

test('U2 — une seule des deux réclamations concurrentes gagne', async () => {
  const { service, gameId, basile } = await setupTwoPlayers();
  await service.setPresence(gameId, { ...basile, connected: false });
  const [first, second] = await Promise.allSettled([
    service.claimPlace(gameId, { playerId: basile.playerId }),
    service.claimPlace(gameId, { playerId: basile.playerId }),
  ]);
  assert.deepEqual([first.status, second.status].sort(), ['fulfilled', 'rejected']);
  assert.equal(second.status === 'rejected' ? second.reason.code : first.reason.code, 'place-taken');
});

test('U2/KTD2 — verrou de tour, version et manche', async () => {
  const { service, gameId, alice, basile, game } = await setupTwoPlayers();
  const next = rollDice(game.state, mulberry32(2), [1, 2, 3, 4, 5]);
  await assert.rejects(service.publishState(gameId, {
    ...basile, state: next, version: 2, round: 1,
  }), { code: 'not-your-turn' });
  await service.publishState(gameId, { ...alice, state: next, version: 2, round: 1 });
  await assert.rejects(service.publishState(gameId, {
    ...alice, state: next, version: 2, round: 1,
  }), { code: 'stale-version' });
  await assert.rejects(service.publishState(gameId, {
    ...alice, state: next, version: 3, round: 0,
  }), { code: 'old-round' });
});

test('U2/AE2 — deux clients jouent une partie complète publiée action par action', async () => {
  const { service, gameId, alice, basile } = await setupTwoPlayers();
  const credentials = new Map([[alice.playerId, alice], [basile.playerId, basile]]);
  const random = mulberry32(33);
  let document = await service.readGame(gameId);
  while (document.state.status === 'playing') {
    let state = rollDice(document.state, random);
    document = await service.publishState(gameId, {
      ...credentials.get(state.lastAction.playerId),
      state,
      version: document.version + 1,
      round: document.round,
    });
    let actions = getLegalActions(state);
    if (actions.mustAnnounceTam || (!actions.entries.length && actions.announcements.length)) {
      state = announceTam(state, actions.announcements[0].category);
      document = await service.publishState(gameId, {
        ...credentials.get(state.lastAction.playerId),
        state,
        version: document.version + 1,
        round: document.round,
      });
      actions = getLegalActions(state);
    }
    state = applyEntry(state, actions.entries[0].column, actions.entries[0].category);
    document = await service.publishState(gameId, {
      ...credentials.get(state.lastAction.playerId),
      state,
      version: document.version + 1,
      round: document.round,
    });
  }
  assert.equal(document.phase, 'finished');
  assert.equal(document.state.completedTurns, 130);
});

test('U2/AE3 — déconnexion et reprise mi-tour depuis un autre appareil', async () => {
  const { service, gameId, alice, game } = await setupTwoPlayers();
  const midTurn = rollDice(game.state, mulberry32(4), [6, 6, 2, 3, 4]);
  await service.publishState(gameId, { ...alice, state: midTurn, version: 2, round: 1 });
  await service.setPresence(gameId, { ...alice, connected: false });
  const claimed = await service.claimPlace(gameId, { playerId: alice.playerId });
  assert.notEqual(claimed.token, alice.token);
  assert.deepEqual(claimed.game.state.turn.dice, [6, 6, 2, 3, 4]);
  assert.equal(claimed.game.state.turn.rollCount, 1);
  const continued = rollDice(claimed.game.state, mulberry32(5), [6, 6, 6, 3, 4]);
  const published = await service.publishState(gameId, {
    ...claimed,
    state: continued,
    version: claimed.game.version + 1,
    round: claimed.game.round,
  });
  assert.equal(published.state.turn.rollCount, 2);
});

test('U2/AE7 — rejouer conserve les places, renouvelle la manche et vide les feuilles', async () => {
  const { service, gameId, alice, game } = await setupTwoPlayers();
  const finished = structuredClone(game.state);
  for (const player of finished.players) {
    for (const column of Object.values(player.sheet)) {
      for (const category of Object.keys(column)) column[category] = 0;
    }
  }
  finished.status = 'finished';
  const ended = await service.publishState(gameId, { ...alice, state: finished, version: 2, round: 1 });
  const replay = await service.replayGame(gameId, alice);
  assert.equal(ended.phase, 'finished');
  assert.equal(replay.round, 2);
  assert.deepEqual(replay.players.map(({ id }) => id), game.players.map(({ id }) => id));
  assert.equal(replay.state.completedTurns, 0);
  assert.equal(replay.state.players[0].sheet.free.one, null);
});

test('U2/AE4/KTD7 — jetons séparés et état distant absent de la sauvegarde locale', async () => {
  const storage = memoryStorage();
  const { alice, gameId, game } = await setupTwoPlayers();
  assert.equal(savePlaceToken(gameId, alice.playerId, alice.token, storage), true);
  assert.deepEqual(loadPlaceTokens(gameId, storage), { [alice.playerId]: alice.token });
  assert.equal(saveGame(game.state, storage), false);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.ok(storage.getItem(ONLINE_PLACE_TOKENS_KEY));
});

test('U4 — la porte adaptative distingue saisie, reprise et partie complète', () => {
  const lobby = { phase: 'lobby', players: [{ id: 'a', name: 'Alice', connected: true }] };
  assert.equal(onlineGateState(lobby).type, 'join');
  assert.deepEqual(onlineGateState(lobby, { a: 'secret' }), { type: 'automatic', playerId: 'a', token: 'secret' });
  const playing = { ...lobby, phase: 'playing' };
  assert.equal(onlineGateState(playing).type, 'full');
  playing.players[0].connected = false;
  assert.equal(onlineGateState(playing).type, 'claim');
  assert.equal(parseOnlineGameId('#p/abcdefgh1234'), 'abcdefgh1234');
});

test('U4/U5 — seuil de lancement et garde visuelle fondée sur ma place', async () => {
  const service = createFakeOnlineService({ random: mulberry32(19) });
  const alice = await service.createGame({ creatorName: 'Alice' });
  await assert.rejects(service.startGame(alice.game.gameId, alice), { code: 'not-enough-players' });
  const basile = await service.joinGame(alice.game.gameId, { name: 'Basile' });
  await assert.rejects(service.startGame(alice.game.gameId, basile), { code: 'creator-only' });
  const document = await service.startGame(alice.game.gameId, alice);
  assert.equal(isMyRemoteTurn(document, alice), true);
  assert.equal(isMyRemoteTurn(document, basile), false);
  assert.equal(document.state.players[0].kind, 'remote');
});

test('U5/AE5 — une annonce Tam publiée est propagée aux abonnés', async () => {
  const { service, gameId, alice, game } = await setupTwoPlayers();
  const announced = new Promise((resolve) => {
    const stop = service.subscribe(gameId, (document) => {
      if (document?.lastAction?.type === 'announce-tam') {
        stop();
        resolve(document.lastAction);
      }
    });
  });
  let state = rollDice(game.state, mulberry32(23), [1, 1, 2, 3, 4]);
  let document = await service.publishState(gameId, { ...alice, state, version: 2, round: 1 });
  state = announceTam(state, 'one');
  await service.publishState(gameId, { ...alice, state, version: document.version + 1, round: 1 });
  assert.deepEqual(await announced, { type: 'announce-tam', playerId: alice.playerId, category: 'one' });
});

test('U6/R13 — lien mort et panne réseau produisent deux issues distinctes', async () => {
  const service = createFakeOnlineService({ random: mulberry32(9) });
  assert.equal(await service.readGame('absent'), null);
  assert.equal(onlineErrorMessage({ code: 'not-found' }), 'Cette partie n’existe plus');
  service.setUnavailable(true);
  await assert.rejects(service.createGame({ creatorName: 'Alice' }), { code: 'connection' });
  assert.equal(onlineErrorMessage({ code: 'connection' }), 'Connexion impossible — réessayer');
});

test('U4 smoke — deux instances de simulation partagent la même salle', async () => {
  const storage = memoryStorage();
  const firstTab = createFakeOnlineService({ random: mulberry32(101), storage });
  const secondTab = createFakeOnlineService({ random: mulberry32(202), storage });
  const alice = await firstTab.createGame({ creatorName: 'Alice' });
  await secondTab.joinGame(alice.game.gameId, { name: 'Basile' });
  const seenByFirst = await firstTab.readGame(alice.game.gameId);
  assert.deepEqual(seenByFirst.players.map(({ name }) => name), ['Alice', 'Basile']);
});
