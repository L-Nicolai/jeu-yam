import { createGame as createEngineGame, GAME_MODES } from '../engine/game.js';
import { firebaseConfig, firebaseConfigured } from './config.js';

const FIREBASE_VERSION = '12.2.1';
const DEFAULT_TIMEOUT_MS = 6500;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function publicDocument(document) {
  if (!document) return null;
  return clone({
    ...document,
    players: document.players.map(({ token: _token, ...player }) => player),
    mutation: undefined,
  });
}

function randomId(length = 20) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

function namedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function withTimeout(promise, timeoutMs, message = 'Connexion impossible — réessayer') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(namedError('connection', message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function createFirebaseOnlineService({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!firebaseConfigured || !firebaseConfig.databaseURL) {
    throw namedError('not-configured', 'Connexion impossible — réessayer');
  }

  // Le SDK n’est demandé au réseau qu’ici, après l’entrée explicite en mode À distance.
  const [{ initializeApp }, databaseSdk] = await withTimeout(Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
  ]), timeoutMs);
  const {
    getDatabase,
    get,
    onDisconnect,
    onValue,
    ref,
    runTransaction,
    set,
  } = databaseSdk;
  const database = getDatabase(initializeApp(firebaseConfig));

  async function requireConnection() {
    await withTimeout(new Promise((resolve) => {
      // Si la connexion est déjà établie, onValue rappelle de façon SYNCHRONE :
      // stop n’est alors pas encore assigné, d’où le désabonnement différé.
      let connected = false;
      let stop = null;
      stop = onValue(ref(database, '.info/connected'), (snapshot) => {
        if (snapshot.val() !== true || connected) return;
        connected = true;
        if (stop) stop();
        resolve();
      });
      if (connected) stop();
    }), timeoutMs);
  }

  async function armPresence(gameId, playerId) {
    const connectedRef = ref(database, `games/${gameId}/players/${playerId}/connected`);
    await onDisconnect(connectedRef).set(false);
    await set(connectedRef, true);
  }

  function asStoredPlayers(players) {
    return Object.fromEntries(players.map((player) => [player.id, player]));
  }

  function fromStored(snapshot) {
    if (!snapshot) return null;
    const players = Array.isArray(snapshot.players)
      ? snapshot.players
      : Object.values(snapshot.players ?? {});
    // L’état voyage en chaîne JSON : la base supprime les valeurs null des objets,
    // or chaque case vide de la feuille est un null indispensable au moteur.
    const state = typeof snapshot.state === 'string' ? JSON.parse(snapshot.state) : snapshot.state ?? null;
    return { ...snapshot, players, state, lastAction: snapshot.lastAction ?? null };
  }

  async function createGame({ creatorName }) {
    await requireConnection();
    const name = String(creatorName ?? '').trim();
    if (!name) throw namedError('invalid-name', 'Entre ton prénom.');
    const gameId = randomId();
    const playerId = `place-${randomId(10)}`;
    const token = randomId(32);
    const creator = { id: playerId, name, kind: 'remote', connected: true, creator: true, token };
    const document = {
      gameId,
      phase: 'lobby',
      creatorPlayerId: playerId,
      players: asStoredPlayers([creator]),
      state: null,
      version: 0,
      round: 0,
      turnToken: '',
      lastAction: null,
      mutation: { type: 'create', playerId, token },
    };
    await withTimeout(set(ref(database, `games/${gameId}`), document), timeoutMs);
    await armPresence(gameId, playerId);
    return { game: publicDocument(fromStored(document)), playerId, token };
  }

  async function readGame(gameId) {
    await requireConnection();
    const snapshot = await withTimeout(get(ref(database, `games/${gameId}`)), timeoutMs);
    return snapshot.exists() ? publicDocument(fromStored(snapshot.val())) : null;
  }

  async function mutate(gameId, update, fallbackCode = 'conflict') {
    await requireConnection();
    let rejection = null;
    let sawMissing = false;
    let result;
    try {
      result = await withTimeout(runTransaction(ref(database, `games/${gameId}`), (stored) => {
        if (!stored) {
          // Cache froid : la transaction peut recevoir null alors que la partie existe.
          // Proposer une écriture vide force l’aller-retour serveur ; si la partie
          // existe, Firebase relance cette fonction avec les vraies données.
          sawMissing = true;
          return null;
        }
        sawMissing = false;
        const document = fromStored(stored);
        try {
          const next = update(document);
          return {
            ...next,
            players: asStoredPlayers(next.players),
            state: next.state == null ? null : JSON.stringify(next.state),
          };
        } catch (error) {
          rejection = error;
          return undefined;
        }
      }, { applyLocally: false }), timeoutMs);
    } catch (error) {
      if (rejection) throw rejection;
      // L’écriture vide d’une partie réellement absente est refusée par les règles.
      if (sawMissing && error?.code !== 'connection') {
        throw namedError('not-found', 'Cette partie n’existe plus');
      }
      throw error;
    }
    if (!result.committed) throw rejection ?? namedError(fallbackCode, 'La partie a changé — réessaie.');
    if (!result.snapshot.exists()) throw namedError('not-found', 'Cette partie n’existe plus');
    return fromStored(result.snapshot.val());
  }

  function authenticate(document, playerId, token) {
    const player = document.players.find(({ id }) => id === playerId);
    if (!player || !token || player.token !== token) {
      throw namedError('invalid-token', 'Cette place est déjà utilisée.');
    }
    return player;
  }

  async function joinGame(gameId, { name: rawName }) {
    const name = String(rawName ?? '').trim();
    const token = randomId(32);
    const playerId = `place-${randomId(10)}`;
    const document = await mutate(gameId, (current) => {
      if (current.phase !== 'lobby') throw namedError('game-started', 'Partie en cours — complète');
      if (!name) throw namedError('invalid-name', 'Entre ton prénom.');
      if (current.players.some((player) => player.name.localeCompare(name, 'fr', { sensitivity: 'base' }) === 0)) {
        throw namedError('name-taken', 'Ce prénom est déjà pris — ajoute une initiale ou un surnom.');
      }
      if (current.players.length >= 5) throw namedError('game-full', 'La partie est complète.');
      current.players.push({ id: playerId, name, kind: 'remote', connected: true, creator: false, token });
      current.mutation = { type: 'join', playerId, token };
      return current;
    });
    await armPresence(gameId, playerId);
    return { game: publicDocument(document), playerId, token };
  }

  async function claimPlace(gameId, { playerId, token: existingToken = null }) {
    let claimedToken = existingToken;
    const document = await mutate(gameId, (current) => {
      const player = current.players.find(({ id }) => id === playerId);
      if (!player) throw namedError('place-not-found', 'Cette place n’existe pas.');
      if (existingToken && player.token === existingToken) {
        player.connected = true;
      } else {
        if (player.connected) throw namedError('place-taken', 'Cette place est déjà utilisée.');
        claimedToken = randomId(32);
        player.token = claimedToken;
        player.connected = true;
        const activeId = current.state?.players[current.state.activePlayerIndex]?.id;
        if (activeId === playerId) current.turnToken = claimedToken;
      }
      current.mutation = { type: 'claim', playerId, token: claimedToken };
      return current;
    });
    await armPresence(gameId, playerId);
    return { game: publicDocument(document), playerId, token: claimedToken };
  }

  async function startGame(gameId, credentials) {
    const document = await mutate(gameId, (current) => {
      authenticate(current, credentials.playerId, credentials.token);
      if (credentials.playerId !== current.creatorPlayerId) throw namedError('creator-only', 'Seule la créatrice peut lancer.');
      if (current.phase !== 'lobby') throw namedError('already-started', 'La partie a déjà commencé.');
      if (current.players.filter(({ connected }) => connected).length < 2) {
        throw namedError('not-enough-players', 'Il faut au moins deux joueurs présents.');
      }
      current.state = createEngineGame({
        mode: GAME_MODES.REMOTE,
        players: current.players.map(({ id, name }) => ({ id, name, kind: 'remote' })),
      });
      current.phase = 'playing';
      current.round = 1;
      current.version = 1;
      current.turnToken = current.players[0].token;
      current.mutation = { type: 'start', ...credentials };
      return current;
    });
    return publicDocument(document);
  }

  async function publishState(gameId, { playerId, token, version, round, state }) {
    const document = await mutate(gameId, (current) => {
      authenticate(current, playerId, token);
      const activeId = current.state?.players[current.state.activePlayerIndex]?.id;
      if (activeId !== playerId || current.turnToken !== token) throw namedError('not-your-turn', 'Ce n’est pas ton tour.');
      if (round !== current.round) throw namedError('old-round', 'Cette action appartient à une ancienne manche.');
      if (!Number.isInteger(version) || version <= current.version) throw namedError('stale-version', 'Action déjà dépassée.');
      current.state = clone(state);
      current.version = version;
      current.lastAction = clone(state.lastAction);
      current.phase = state.status === 'finished' ? 'finished' : 'playing';
      const nextId = state.players[state.activePlayerIndex].id;
      current.turnToken = current.players.find(({ id }) => id === nextId).token;
      current.mutation = { type: 'publish', playerId, token };
      return current;
    });
    return publicDocument(document);
  }

  function subscribe(gameId, listener, onError = () => {}) {
    return onValue(ref(database, `games/${gameId}`), (snapshot) => {
      listener(snapshot.exists() ? publicDocument(fromStored(snapshot.val())) : null);
    }, () => onError(namedError('connection', 'Connexion impossible — réessayer')));
  }

  async function setPresence(gameId, { playerId, token, connected }) {
    if (connected) {
      await requireConnection();
      await armPresence(gameId, playerId);
    }
    const document = await mutate(gameId, (current) => {
      const player = authenticate(current, playerId, token);
      player.connected = Boolean(connected);
      current.mutation = { type: 'presence', playerId, token };
      return current;
    });
    return publicDocument(document);
  }

  async function replayGame(gameId, credentials) {
    const document = await mutate(gameId, (current) => {
      authenticate(current, credentials.playerId, credentials.token);
      if (credentials.playerId !== current.creatorPlayerId) throw namedError('creator-only', 'Seule la créatrice peut rejouer.');
      if (current.phase !== 'finished') throw namedError('not-finished', 'La manche n’est pas terminée.');
      current.round += 1;
      current.version += 1;
      current.phase = 'playing';
      current.state = createEngineGame({
        mode: GAME_MODES.REMOTE,
        players: current.players.map(({ id, name }) => ({ id, name, kind: 'remote' })),
      });
      current.turnToken = current.players[0].token;
      current.lastAction = null;
      current.mutation = { type: 'replay', ...credentials };
      return current;
    });
    return publicDocument(document);
  }

  return { createGame, readGame, joinGame, claimPlace, startGame, publishState, subscribe, setPresence, replayGame };
}
