export function serializeGame(state) {
  return JSON.stringify(state);
}

export function deserializeGame(serialized) {
  const state = JSON.parse(serialized);
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.players) || !state.turn) {
    throw new Error('État de partie incompatible.');
  }
  return state;
}

