import { CATEGORY_KEYS, COLUMN_KEYS, createEmptySheet } from './constants.js';
import { scoreColumn } from './scoring.js';
import { createPlayer } from './players.js';
import { previewEntry } from './rules.js';

export const GAME_MODES = Object.freeze({
  SINGLE: 'single',
  COMPUTER: 'computer',
  LOCAL: 'local',
});

function clone(value) {
  return structuredClone(value);
}

function freshTurn() {
  return {
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollCount: 0,
    rerolled: false,
    tamAnnouncement: null,
  };
}

function playersForMode(mode) {
  const players = [createPlayer({ id: 'local', name: 'Leslie', kind: 'human' })];
  if (mode === GAME_MODES.COMPUTER) {
    players.push(createPlayer({ id: 'computer', name: 'L’ordinateur', kind: 'computer' }));
  }
  return players;
}

function validatePlayers(mode, players) {
  if (!Array.isArray(players) || players.length < 1) {
    throw new TypeError('Une partie exige au moins un joueur.');
  }
  if (mode === GAME_MODES.SINGLE && players.length !== 1) {
    throw new RangeError('Le mode Jouer seule exige exactement une joueuse.');
  }
  if (mode === GAME_MODES.COMPUTER && players.length !== 2) {
    throw new RangeError('Le mode Contre l’ordinateur exige exactement deux joueurs.');
  }
  if (mode === GAME_MODES.LOCAL) {
    if (players.length < 2 || players.length > 5) {
      throw new RangeError('Le mode À plusieurs exige de 2 à 5 joueurs.');
    }
    if (players.some(({ kind }) => kind !== 'human')) {
      throw new RangeError('Le mode À plusieurs accepte uniquement des joueurs humains locaux.');
    }
  }
  const ids = new Set();
  for (const player of players) {
    createPlayer(player);
    if (ids.has(player.id)) throw new RangeError('Chaque joueur doit avoir un identifiant unique.');
    ids.add(player.id);
  }
}

export function createGame(options = {}) {
  const legacyPlayers = Array.isArray(options) ? options : null;
  const mode = legacyPlayers
    ? (legacyPlayers.length === 1 ? GAME_MODES.SINGLE : GAME_MODES.COMPUTER)
    : (options.mode ?? GAME_MODES.COMPUTER);
  if (!Object.values(GAME_MODES).includes(mode)) throw new RangeError(`Mode de jeu inconnu : ${mode}`);
  const playerDefinitions = legacyPlayers ?? options.players ?? (mode === GAME_MODES.LOCAL ? null : playersForMode(mode));
  validatePlayers(mode, playerDefinitions);
  return {
    schemaVersion: 1,
    mode,
    players: playerDefinitions.map((player) => ({ ...player, sheet: createEmptySheet() })),
    activePlayerIndex: 0,
    completedTurns: 0,
    status: 'playing',
    handoffRequired: false,
    turn: freshTurn(),
    lastAction: null,
  };
}

export function isSheetComplete(sheet) {
  return COLUMN_KEYS.every((column) => CATEGORY_KEYS.every((category) => sheet[column][category] !== null));
}

export function isGameOver(state) {
  return state.players.every(({ sheet }) => isSheetComplete(sheet));
}

export function applyEntry(state, column, category, { strike = false } = {}) {
  const preview = previewEntry(state, column, category, { strike });
  const next = clone(state);
  const player = next.players[next.activePlayerIndex];
  const points = strike ? 0 : preview.points;
  player.sheet[column][category] = points;
  next.completedTurns += 1;
  next.lastAction = {
    type: 'entry',
    playerId: player.id,
    column,
    category,
    points,
    struck: strike || !preview.validCombination,
    dice: [...state.turn.dice],
  };
  next.activePlayerIndex = (next.activePlayerIndex + 1) % next.players.length;
  next.turn = freshTurn();
  next.status = isGameOver(next) ? 'finished' : 'playing';
  next.handoffRequired = next.status === 'playing' && next.mode === GAME_MODES.LOCAL;
  return next;
}

export function acknowledgeHandoff(state) {
  if (state.mode !== GAME_MODES.LOCAL || !state.handoffRequired || state.status !== 'playing') {
    throw new Error('Aucun passage de téléphone n’est attendu.');
  }
  const next = clone(state);
  next.handoffRequired = false;
  next.lastAction = {
    type: 'handoff',
    playerId: next.players[next.activePlayerIndex].id,
  };
  return next;
}

export function getGameRanking(state) {
  const totals = getGameTotals(state).players;
  const ordered = totals
    .map(({ playerId, grandTotal }, playerIndex) => ({ playerId, playerIndex, total: grandTotal }))
    .sort((left, right) => right.total - left.total || left.playerIndex - right.playerIndex);
  let previousTotal = null;
  let previousRank = 0;
  return ordered.map((entry, index) => {
    const rank = index > 0 && entry.total === previousTotal ? previousRank : index + 1;
    previousTotal = entry.total;
    previousRank = rank;
    return { ...entry, rank };
  });
}

export function getGameOutcome(state) {
  if (!isGameOver(state)) return null;
  const totals = getGameTotals(state).players;
  if (totals.length === 1) {
    return { type: 'single', winnerIndex: null, totals: [totals[0].grandTotal] };
  }
  if (state.mode === GAME_MODES.LOCAL) {
    const ranking = getGameRanking(state);
    return {
      type: 'ranking',
      winnerIndexes: ranking.filter(({ rank }) => rank === 1).map(({ playerIndex }) => playerIndex),
      ranking,
      totals: totals.map(({ grandTotal }) => grandTotal),
    };
  }
  if (totals[0].grandTotal === totals[1].grandTotal) {
    return { type: 'tie', winnerIndex: null, totals: totals.map(({ grandTotal }) => grandTotal) };
  }
  const winnerIndex = totals[0].grandTotal > totals[1].grandTotal ? 0 : 1;
  return { type: 'winner', winnerIndex, totals: totals.map(({ grandTotal }) => grandTotal) };
}

export function getGameTotals(state) {
  return {
    players: state.players.map((player) => {
      const columns = Object.fromEntries(COLUMN_KEYS.map((key) => [key, scoreColumn(player.sheet[key])]));
      return {
        playerId: player.id,
        columns,
        grandTotal: Object.values(columns).reduce((total, column) => total + column.total, 0),
      };
    }),
  };
}
