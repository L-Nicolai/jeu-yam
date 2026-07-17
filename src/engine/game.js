import { CATEGORY_KEYS, COLUMN_KEYS, createEmptySheet } from './constants.js';
import { scoreColumn } from './scoring.js';
import { createPlayer } from './players.js';
import { previewEntry } from './rules.js';

export const GAME_MODES = Object.freeze({
  SINGLE: 'single',
  COMPUTER: 'computer',
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

export function createGame(options = {}) {
  const legacyPlayers = Array.isArray(options) ? options : null;
  const mode = legacyPlayers
    ? (legacyPlayers.length === 1 ? GAME_MODES.SINGLE : GAME_MODES.COMPUTER)
    : (options.mode ?? GAME_MODES.COMPUTER);
  if (!Object.values(GAME_MODES).includes(mode)) throw new RangeError(`Mode de jeu inconnu : ${mode}`);
  const playerDefinitions = legacyPlayers ?? options.players ?? playersForMode(mode);
  if (!Array.isArray(playerDefinitions) || playerDefinitions.length < 1) {
    throw new TypeError('Une partie exige au moins un joueur.');
  }
  return {
    schemaVersion: 1,
    mode,
    players: playerDefinitions.map((player) => ({ ...player, sheet: createEmptySheet() })),
    activePlayerIndex: 0,
    completedTurns: 0,
    status: 'playing',
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
  return next;
}

export function getGameOutcome(state) {
  if (!isGameOver(state)) return null;
  const totals = getGameTotals(state).players;
  if (totals.length === 1) {
    return { type: 'single', winnerIndex: null, totals: [totals[0].grandTotal] };
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
