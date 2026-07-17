import { createGame, GAME_MODES } from './engine/game.js';
import { deserializeGame, serializeGame } from './engine/serialize.js';

export const STORAGE_KEY = 'yam-leslie-partie';
const STORAGE_VERSION = 3;

function resolveStorage(storage) {
  return storage ?? globalThis.localStorage;
}

export function saveGame(state, storage) {
  try {
    const target = resolveStorage(storage);
    const safeState = deserializeGame(serializeGame(state));
    const mode = Object.values(GAME_MODES).includes(safeState.mode) ? safeState.mode : GAME_MODES.COMPUTER;
    safeState.mode = mode;
    safeState.handoffRequired = Boolean(safeState.handoffRequired);
    if (!validModePlayers(mode, safeState.players)) return false;
    target.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, mode, state: safeState }));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedGame(storage) {
  try {
    const serialized = resolveStorage(storage).getItem(STORAGE_KEY);
    if (!serialized) return null;
    const payload = JSON.parse(serialized);
    if (payload.version === 1) {
      const state = deserializeGame(JSON.stringify(payload.state));
      state.mode = GAME_MODES.COMPUTER;
      state.handoffRequired = false;
      return validModePlayers(state.mode, state.players) ? state : null;
    }
    if (payload.version !== 2 && payload.version !== STORAGE_VERSION) return null;
    if (!Object.values(GAME_MODES).includes(payload.mode)) return null;
    if (payload.version === 2 && payload.mode === GAME_MODES.LOCAL) return null;
    const state = deserializeGame(JSON.stringify(payload.state));
    state.mode = payload.mode;
    state.handoffRequired = payload.version === 2 ? false : Boolean(state.handoffRequired);
    if (!validModePlayers(payload.mode, state.players)) return null;
    return state;
  } catch {
    return null;
  }
}

function validModePlayers(mode, players) {
  if (!Array.isArray(players)) return false;
  if (mode === GAME_MODES.SINGLE) return players.length === 1;
  if (mode === GAME_MODES.COMPUTER) return players.length === 2;
  return mode === GAME_MODES.LOCAL
    && players.length >= 2
    && players.length <= 5
    && players.every(({ kind }) => kind === 'human');
}

export function loadGame(storage) {
  return loadSavedGame(storage) ?? createGame();
}

export function clearSavedGame(storage) {
  try {
    resolveStorage(storage).removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function requestPersistentStorage(navigatorObject) {
  try {
    const navigatorValue = navigatorObject ?? globalThis.navigator;
    if (!navigatorValue?.storage?.persist) return false;
    return await navigatorValue.storage.persist();
  } catch {
    return false;
  }
}
