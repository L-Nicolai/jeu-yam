import { createGame, GAME_MODES } from './engine/game.js';
import { deserializeGame, serializeGame } from './engine/serialize.js';

export const STORAGE_KEY = 'yam-leslie-partie';
const STORAGE_VERSION = 2;

function resolveStorage(storage) {
  return storage ?? globalThis.localStorage;
}

export function saveGame(state, storage) {
  try {
    const target = resolveStorage(storage);
    const safeState = deserializeGame(serializeGame(state));
    const mode = safeState.mode === GAME_MODES.SINGLE ? GAME_MODES.SINGLE : GAME_MODES.COMPUTER;
    safeState.mode = mode;
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
      return state;
    }
    if (payload.version !== STORAGE_VERSION || !Object.values(GAME_MODES).includes(payload.mode)) return null;
    const state = deserializeGame(JSON.stringify(payload.state));
    state.mode = payload.mode;
    if (state.players.length !== (payload.mode === GAME_MODES.SINGLE ? 1 : 2)) return null;
    return state;
  } catch {
    return null;
  }
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
