import { createGame as createEngineGame, GAME_MODES } from '../engine/game.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizedName(name) {
  return String(name ?? '').trim().toLocaleLowerCase('fr');
}

function publicDocument(document) {
  if (!document) return null;
  return clone({
    gameId: document.gameId,
    phase: document.phase,
    creatorPlayerId: document.creatorPlayerId,
    players: document.players.map(({ token: _token, ...player }) => player),
    state: document.state,
    version: document.version,
    round: document.round,
    turnToken: document.turnToken,
    lastAction: document.lastAction,
  });
}

function randomId(random, length = 20) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(random() * alphabet.length)];
  }
  return result;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const SHARED_FAKE_KEY = 'yam-leslie-online-simulation';

export function createFakeOnlineService({ random = Math.random, unavailable = false, storage = null } = {}) {
  let connectionUnavailable = unavailable;
  const games = new Map();
  const subscribers = new Map();
  const channel = storage && typeof window !== 'undefined' && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('yam-leslie-online-simulation')
    : null;

  function syncFromStorage() {
    if (!storage) return;
    try {
      const saved = JSON.parse(storage.getItem(SHARED_FAKE_KEY) ?? '{}');
      games.clear();
      for (const [id, document] of Object.entries(saved)) games.set(id, document);
    } catch {
      // Une simulation corrompue repart simplement vide.
    }
  }

  function persist() {
    if (!storage) return;
    storage.setItem(SHARED_FAKE_KEY, JSON.stringify(Object.fromEntries(games)));
  }

  syncFromStorage();

  function ensureAvailable() {
    if (connectionUnavailable) fail('connection', 'Connexion impossible — réessayer');
  }

  function documentFor(gameId) {
    ensureAvailable();
    syncFromStorage();
    const document = games.get(gameId);
    if (!document) fail('not-found', 'Cette partie n’existe plus');
    return document;
  }

  function playerFor(document, playerId) {
    const player = document.players.find(({ id }) => id === playerId);
    if (!player) fail('place-not-found', 'Cette place n’existe pas.');
    return player;
  }

  function authenticate(document, playerId, token) {
    const player = playerFor(document, playerId);
    if (!token || player.token !== token) fail('invalid-token', 'Cette place est déjà utilisée.');
    return player;
  }

  function notify(gameId) {
    persist();
    const snapshot = publicDocument(games.get(gameId));
    for (const listener of subscribers.get(gameId) ?? []) queueMicrotask(() => listener(snapshot));
    channel?.postMessage(gameId);
  }

  channel?.addEventListener('message', ({ data: changedGameId }) => {
    syncFromStorage();
    const snapshot = publicDocument(games.get(changedGameId));
    for (const listener of subscribers.get(changedGameId) ?? []) listener(snapshot);
  });

  function newPlace(name, creator = false) {
    return {
      id: `place-${randomId(random, 10)}`,
      name: String(name).trim(),
      kind: 'remote',
      connected: true,
      creator,
      token: randomId(random, 32),
    };
  }

  async function createOnlineGame({ creatorName }) {
    ensureAvailable();
    if (!normalizedName(creatorName)) fail('invalid-name', 'Entre ton prénom.');
    let gameId;
    do gameId = randomId(random); while (games.has(gameId));
    const creator = newPlace(creatorName, true);
    const document = {
      gameId,
      phase: 'lobby',
      creatorPlayerId: creator.id,
      players: [creator],
      state: null,
      version: 0,
      round: 0,
      turnToken: null,
      lastAction: null,
    };
    games.set(gameId, document);
    notify(gameId);
    return { game: publicDocument(document), playerId: creator.id, token: creator.token };
  }

  async function readGame(gameId) {
    ensureAvailable();
    syncFromStorage();
    return publicDocument(games.get(gameId) ?? null);
  }

  async function joinGame(gameId, { name }) {
    const document = documentFor(gameId);
    if (document.phase !== 'lobby') fail('game-started', 'Partie en cours — complète');
    if (!normalizedName(name)) fail('invalid-name', 'Entre ton prénom.');
    if (document.players.some((player) => normalizedName(player.name) === normalizedName(name))) {
      fail('name-taken', 'Ce prénom est déjà pris — ajoute une initiale ou un surnom.');
    }
    if (document.players.length >= 5) fail('game-full', 'La partie est complète.');
    const player = newPlace(name);
    document.players.push(player);
    notify(gameId);
    return { game: publicDocument(document), playerId: player.id, token: player.token };
  }

  async function claimPlace(gameId, { playerId, token = null }) {
    const document = documentFor(gameId);
    const player = playerFor(document, playerId);
    if (token && player.token === token) {
      player.connected = true;
      notify(gameId);
      return { game: publicDocument(document), playerId, token };
    }
    if (player.connected) fail('place-taken', 'Cette place est déjà utilisée.');
    player.token = randomId(random, 32);
    player.connected = true;
    const activeId = document.state?.players[document.state.activePlayerIndex]?.id;
    if (activeId === playerId) document.turnToken = player.token;
    notify(gameId);
    return { game: publicDocument(document), playerId, token: player.token };
  }

  async function startGame(gameId, { playerId, token }) {
    const document = documentFor(gameId);
    authenticate(document, playerId, token);
    if (playerId !== document.creatorPlayerId) fail('creator-only', 'Seule la créatrice peut lancer la partie.');
    if (document.phase !== 'lobby') fail('already-started', 'La partie a déjà commencé.');
    if (document.players.length < 2 || document.players.filter(({ connected }) => connected).length < 2) {
      fail('not-enough-players', 'Il faut au moins deux joueurs présents.');
    }
    document.round = 1;
    document.version = 1;
    document.phase = 'playing';
    document.state = createEngineGame({
      mode: GAME_MODES.REMOTE,
      players: document.players.map(({ id, name }) => ({ id, name, kind: 'remote' })),
    });
    document.turnToken = document.players[document.state.activePlayerIndex].token;
    document.lastAction = null;
    notify(gameId);
    return publicDocument(document);
  }

  async function publishState(gameId, { playerId, token, version, round, state }) {
    const document = documentFor(gameId);
    authenticate(document, playerId, token);
    if (document.phase !== 'playing') fail('not-playing', 'La partie n’est pas en cours.');
    const active = document.state.players[document.state.activePlayerIndex];
    if (active.id !== playerId || document.turnToken !== token) {
      fail('not-your-turn', 'Ce n’est pas ton tour.');
    }
    if (round !== document.round) fail('old-round', 'Cette action appartient à une ancienne manche.');
    if (!Number.isInteger(version) || version <= document.version) {
      fail('stale-version', 'Une action plus récente a déjà été reçue.');
    }
    if (state?.mode !== GAME_MODES.REMOTE || state.players.length !== document.players.length) {
      fail('invalid-state', 'État de partie invalide.');
    }
    document.state = clone(state);
    document.version = version;
    document.lastAction = clone(state.lastAction);
    document.phase = state.status === 'finished' ? 'finished' : 'playing';
    const nextActiveId = state.players[state.activePlayerIndex]?.id;
    document.turnToken = playerFor(document, nextActiveId).token;
    notify(gameId);
    return publicDocument(document);
  }

  function subscribe(gameId, listener) {
    ensureAvailable();
    syncFromStorage();
    if (!subscribers.has(gameId)) subscribers.set(gameId, new Set());
    subscribers.get(gameId).add(listener);
    queueMicrotask(() => listener(publicDocument(games.get(gameId) ?? null)));
    return () => subscribers.get(gameId)?.delete(listener);
  }

  async function setPresence(gameId, { playerId, token, connected }) {
    const document = documentFor(gameId);
    const player = authenticate(document, playerId, token);
    player.connected = Boolean(connected);
    notify(gameId);
    return publicDocument(document);
  }

  async function replayGame(gameId, { playerId, token }) {
    const document = documentFor(gameId);
    authenticate(document, playerId, token);
    if (playerId !== document.creatorPlayerId) fail('creator-only', 'Seule la créatrice peut relancer une manche.');
    if (document.phase !== 'finished') fail('not-finished', 'La manche n’est pas terminée.');
    document.round += 1;
    document.version += 1;
    document.phase = 'playing';
    document.state = createEngineGame({
      mode: GAME_MODES.REMOTE,
      players: document.players.map(({ id, name }) => ({ id, name, kind: 'remote' })),
    });
    document.turnToken = document.players[0].token;
    document.lastAction = null;
    notify(gameId);
    return publicDocument(document);
  }

  return {
    createGame: createOnlineGame,
    readGame,
    joinGame,
    claimPlace,
    startGame,
    publishState,
    subscribe,
    setPresence,
    replayGame,
    setUnavailable(value) { connectionUnavailable = Boolean(value); },
  };
}
