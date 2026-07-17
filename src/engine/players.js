export function createPlayer({ id, name, kind = 'human' }) {
  if (!id || !name) throw new TypeError('Un joueur doit avoir un identifiant et un nom.');
  if (!['human', 'computer', 'remote'].includes(kind)) {
    throw new RangeError(`Type de joueur inconnu : ${kind}`);
  }
  return { id, name, kind };
}

export function isAutomatedPlayer(player) {
  return player.kind === 'computer';
}

