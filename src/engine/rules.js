import {
  CATEGORY_KEYS,
  COLUMN_KEYS,
  TRIO_KEYS,
  categoryLabel,
} from './constants.js';
import { scoreCategory } from './scoring.js';

function clone(value) {
  return structuredClone(value);
}

function activeSheet(state) {
  return state.players[state.activePlayerIndex].sheet;
}

function emptyCategories(sheet, column) {
  return CATEGORY_KEYS.filter((category) => sheet[column][category] === null);
}

function orderedCategory(sheet, column) {
  if (column === 'descending') {
    return CATEGORY_KEYS.find((category) => sheet[column][category] === null) ?? null;
  }
  if (column === 'ascending') {
    return [...CATEGORY_KEYS].reverse().find((category) => sheet[column][category] === null) ?? null;
  }
  return null;
}

function columnAllowsCategory(state, column, category) {
  const sheet = activeSheet(state);
  if (!COLUMN_KEYS.includes(column) || !CATEGORY_KEYS.includes(category)) return false;
  if (sheet[column][category] !== null) return false;
  if (column === 'descending' || column === 'ascending') {
    return orderedCategory(sheet, column) === category;
  }
  if (column === 'tam') return state.turn.tamAnnouncement === category;
  if (column === 'dry') return state.turn.rollCount === 1;
  return true;
}

function trioConstraint(sheetColumn, category, points) {
  if (!TRIO_KEYS.includes(category)) return null;
  const written = (value) => (value === null || value === 0 ? null : value);
  const plus = category === 'plus' ? points : written(sheetColumn.plus);
  const middle = category === 'middle' ? points : written(sheetColumn.middle);
  const minus = category === 'minus' ? points : written(sheetColumn.minus);
  if (plus !== null && middle !== null && plus <= middle) return '+ doit être strictement supérieur à Moyen';
  if (middle !== null && minus !== null && middle <= minus) return 'Moyen doit être strictement supérieur à −';
  if (plus !== null && minus !== null && plus <= minus) return '+ doit être strictement supérieur à −';
  return null;
}

function assertTurnReady(state) {
  if (state.status !== 'playing') throw new Error('La partie est terminée.');
  if (state.handoffRequired) throw new Error('Validez d’abord le passage du téléphone.');
  if (state.turn.rollCount === 0) throw new Error('Il faut lancer les dés avant d’inscrire.');
}

export function previewEntry(state, column, category, { strike = false } = {}) {
  assertTurnReady(state);
  const sheet = activeSheet(state);
  if (!COLUMN_KEYS.includes(column) || !CATEGORY_KEYS.includes(category)) {
    throw new RangeError('Case inconnue.');
  }
  if (sheet[column][category] !== null) throw new Error('Cette case est déjà remplie.');
  if (column === 'tam' && state.turn.tamAnnouncement !== category) {
    throw new Error('Cette inscription exige une annonce Tam sur cette case.');
  }
  if (state.turn.tamAnnouncement && (column !== 'tam' || category !== state.turn.tamAnnouncement)) {
    throw new Error('L’annonce Tam oblige à inscrire la case annoncée.');
  }
  if (column === 'dry' && state.turn.rollCount !== 1) {
    throw new Error('La Sèche est réservée au premier lancer, inscription et barrage compris.');
  }
  if (!columnAllowsCategory(state, column, category)) {
    throw new Error('Cette case ne respecte pas l’ordre de sa colonne.');
  }

  const scored = scoreCategory(category, state.turn.dice);
  const constraint = trioConstraint(sheet[column], category, scored.points);
  const validCombination = !constraint && scored.valid;
  return {
    column,
    category,
    points: strike || !validCombination ? 0 : scored.points,
    rawPoints: scored.points,
    validCombination,
    reason: strike ? `Barrer ${categoryLabel(category)}` : (constraint ?? scored.reason),
    canStrike: true,
  };
}

export function getPlayableEntries(state) {
  if (state.status !== 'playing' || state.turn.rollCount === 0) return [];
  const candidates = [];
  if (state.turn.tamAnnouncement) {
    candidates.push(['tam', state.turn.tamAnnouncement]);
  } else {
    const sheet = activeSheet(state);
    for (const column of ['descending', 'free', 'ascending']) {
      const categories = column === 'free'
        ? emptyCategories(sheet, column)
        : [orderedCategory(sheet, column)].filter(Boolean);
      for (const category of categories) candidates.push([column, category]);
    }
    if (state.turn.rollCount === 1) {
      for (const category of emptyCategories(sheet, 'dry')) candidates.push(['dry', category]);
    }
  }
  return candidates.map(([column, category]) => previewEntry(state, column, category));
}

export function getLegalActions(state) {
  if (state.status !== 'playing') {
    return { canRoll: false, canReroll: false, rerollReason: 'La partie est terminée.', entries: [], announcements: [], mustAnnounceTam: false };
  }
  if (state.handoffRequired) {
    return { canRoll: false, canReroll: false, rerollReason: 'Passez le téléphone au joueur suivant.', entries: [], announcements: [], mustAnnounceTam: false };
  }
  if (state.turn.rollCount === 0) {
    return { canRoll: true, canReroll: false, rerollReason: '', entries: [], announcements: [], mustAnnounceTam: false };
  }

  const sheet = activeSheet(state);
  const announcements = state.turn.rollCount === 1 && !state.turn.tamAnnouncement
    ? emptyCategories(sheet, 'tam').map((category) => ({ type: 'announce-tam', column: 'tam', category }))
    : [];
  const entries = getPlayableEntries(state);
  const emptyOutsideDry = ['descending', 'free', 'ascending'].some((column) => emptyCategories(sheet, column).length > 0);
  const onlyTamRemains = COLUMN_KEYS.every((column) => column === 'tam' || emptyCategories(sheet, column).length === 0)
    && emptyCategories(sheet, 'tam').length > 0;
  const onlyDryRemains = COLUMN_KEYS.every((column) => column === 'dry' || emptyCategories(sheet, column).length === 0)
    && emptyCategories(sheet, 'dry').length > 0;

  let canReroll = state.turn.rollCount < 3 && (Boolean(state.turn.tamAnnouncement) || emptyOutsideDry);
  let rerollReason = '';
  if (state.turn.rollCount >= 3) rerollReason = 'Trois lancers ont déjà été effectués.';
  else if (onlyDryRemains) rerollReason = 'La relance est impossible : seules des cases Sèche restent jouables.';
  else if (onlyTamRemains && !state.turn.tamAnnouncement) rerollReason = 'Annoncez d’abord la case Tam obligatoire.';
  else if (!canReroll) rerollReason = 'Aucune case ne resterait jouable après une relance.';

  return {
    canRoll: false,
    canReroll,
    rerollReason,
    entries,
    announcements,
    mustAnnounceTam: onlyTamRemains && !state.turn.tamAnnouncement && state.turn.rollCount === 1,
  };
}

export function announceTam(state, category) {
  if (state.status !== 'playing' || state.turn.rollCount !== 1 || state.turn.tamAnnouncement) {
    throw new Error('Une annonce Tam se fait uniquement juste après le premier lancer.');
  }
  if (!CATEGORY_KEYS.includes(category)) throw new RangeError('Case Tam inconnue.');
  if (activeSheet(state).tam[category] !== null) throw new Error('Cette case Tam est déjà remplie.');
  const next = clone(state);
  next.turn.tamAnnouncement = category;
  next.lastAction = { type: 'announce-tam', playerId: next.players[next.activePlayerIndex].id, category };
  return next;
}

export function toggleHeldDie(state, index) {
  if (state.turn.rollCount === 0 || state.turn.rollCount >= 3) throw new Error('Aucun dé ne peut être gardé maintenant.');
  if (!Number.isInteger(index) || index < 0 || index > 4) throw new RangeError('Dé inconnu.');
  const next = clone(state);
  next.turn.held[index] = !next.turn.held[index];
  next.lastAction = {
    type: 'hold',
    playerId: next.players[next.activePlayerIndex].id,
    index,
    held: next.turn.held[index],
  };
  return next;
}

export function rollDice(state, random = Math.random, forcedDice = null) {
  if (state.status !== 'playing') throw new Error('La partie est terminée.');
  if (state.handoffRequired) throw new Error('Validez d’abord le passage du téléphone.');
  if (state.turn.rollCount > 0) {
    const actions = getLegalActions(state);
    if (!actions.canReroll) throw new Error(actions.rerollReason);
  }
  if (state.turn.rollCount >= 3) throw new Error('Trois lancers maximum.');
  if (forcedDice && (!Array.isArray(forcedDice) || forcedDice.length !== 5)) {
    throw new TypeError('Le lancer forcé doit contenir cinq dés.');
  }

  const next = clone(state);
  const wasReroll = next.turn.rollCount > 0;
  for (let index = 0; index < 5; index += 1) {
    if (!wasReroll || !next.turn.held[index]) {
      next.turn.dice[index] = forcedDice?.[index] ?? Math.floor(random() * 6) + 1;
    }
  }
  next.turn.rollCount += 1;
  next.turn.rerolled ||= wasReroll;
  next.lastAction = {
    type: 'roll',
    playerId: next.players[next.activePlayerIndex].id,
    rollCount: next.turn.rollCount,
    dice: [...next.turn.dice],
  };
  return next;
}
