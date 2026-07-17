import { createGame } from './engine/game.js';
import { deserializeGame, serializeGame } from './engine/serialize.js';

export const STORAGE_KEY = 'yam-leslie-partie';
const STORAGE_VERSION = 1;

function resolveStorage(storage) {
  return storage ?? globalThis.localStorage;
}

export function saveGame(state, storage) {
  try {
    const target = resolveStorage(storage);
    const safeState = deserializeGame(serializeGame(state));
    target.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state: safeState }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage) {
  try {
    const serialized = resolveStorage(storage).getItem(STORAGE_KEY);
    if (!serialized) return createGame();
    const payload = JSON.parse(serialized);
    if (payload.version !== STORAGE_VERSION) return createGame();
    return deserializeGame(JSON.stringify(payload.state));
  } catch {
    return createGame();
  }
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
