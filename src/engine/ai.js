import { CATEGORY_KEYS, UPPER_KEYS } from './constants.js';
import { applyEntry } from './game.js';
import {
  announceTam,
  getLegalActions,
  rollDice,
  toggleHeldDie,
} from './rules.js';
import { scoreCategory } from './scoring.js';

const CATEGORY_COST = Object.freeze({
  one: 2,
  two: 5,
  three: 8,
  four: 11,
  five: 14,
  six: 17,
  straight: 44,
  full: 38,
  fourKind: 53,
  plus: 21,
  middle: 17,
  minus: 11,
  yam: 72,
});

function countsFor(dice) {
  const counts = new Map();
  for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
  return counts;
}

function upperMarginalValue(sheetColumn, category, points) {
  const face = UPPER_KEYS.indexOf(category) + 1;
  const current = UPPER_KEYS.reduce((total, key) => total + (sheetColumn[key] ?? 0), 0);
  const projected = current + points;
  let value;
  if (current >= 60) value = points * 5;
  else if (projected < 60) value = points * 6;
  else value = ((60 - current) * 6) + ((projected - 60) * 5) + 30;

  const target = face * 3;
  return value - (Math.max(0, target - points) * 4);
}

function entryValue(state, entry, rollCount) {
  let value = entry.points - CATEGORY_COST[entry.category];
  if (UPPER_KEYS.includes(entry.category)) {
    const sheetColumn = state.players[state.activePlayerIndex].sheet[entry.column];
    value = upperMarginalValue(sheetColumn, entry.category, entry.points) - CATEGORY_COST[entry.category];
  }
  if (!entry.validCombination) value -= 80;
  if (entry.column === 'dry' && rollCount === 1) {
    if (['straight', 'full', 'fourKind', 'yam'].includes(entry.category) && entry.validCombination) value += 120;
    else if (['one', 'two', 'three', 'four', 'five', 'six'].includes(entry.category) && entry.points >= 3 * Number(CATEGORY_KEYS.indexOf(entry.category) + 1)) value += 35;
    else value -= 20;
  }
  if (entry.column === 'descending' || entry.column === 'ascending') value += 3;
  if (entry.column === 'tam') value += 2;
  return value;
}

function bestEntry(state, entries, rollCount) {
  const protectedUpper = (entry) => {
    if (!UPPER_KEYS.includes(entry.category)) return false;
    const face = UPPER_KEYS.indexOf(entry.category) + 1;
    const count = entry.points / face;
    return (face >= 3 && count < 3) || (face === 2 && count < 2);
  };
  const saferEntries = entries.filter((entry) => !protectedUpper(entry));
  const candidates = saferEntries.length ? saferEntries : entries;
  return [...candidates].sort((left, right) => {
    const difference = entryValue(state, right, rollCount) - entryValue(state, left, rollCount);
    if (difference) return difference;
    return right.points - left.points;
  })[0] ?? null;
}

function strongDryEntry(state, entries) {
  return entries
    .filter((entry) => entry.column === 'dry' && entry.validCombination)
    .filter((entry) => ['straight', 'full', 'fourKind', 'yam'].includes(entry.category) || entry.points >= 18)
    .sort((left, right) => entryValue(state, right, 1) - entryValue(state, left, 1))[0] ?? null;
}

function completedCombination(entry) {
  return entry.validCombination && ['straight', 'full', 'fourKind', 'yam'].includes(entry.category);
}

function tamTarget(state, announcements) {
  const dice = state.turn.dice;
  const open = new Set(announcements.map(({ category }) => category));
  const counts = [...countsFor(dice).values()].sort((a, b) => b - a);
  if (counts[0] === 5 && open.has('yam')) return 'yam';
  if (counts[0] >= 4 && open.has('fourKind')) return 'fourKind';
  if (counts[0] === 3 && counts[1] === 2 && open.has('full')) return 'full';
  if (scoreCategory('straight', dice).valid && open.has('straight')) return 'straight';
  return null;
}

function bestRequiredTamAnnouncement(state, announcements) {
  return [...announcements].sort((left, right) => {
    const leftScore = targetPotential(state.turn.dice, left.category);
    const rightScore = targetPotential(state.turn.dice, right.category);
    return rightScore - leftScore;
  })[0];
}

function normalizedTarget(target) {
  if (!target) return null;
  return typeof target === 'string' ? { category: target, reason: 'opportunity' } : target;
}

function largestGroup(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0];
}

function straightHolds(dice) {
  const counts = countsFor(dice);
  const sequences = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
  const sequence = sequences.sort((left, right) => {
    const inRight = right.filter((face) => counts.has(face)).length;
    const inLeft = left.filter((face) => counts.has(face)).length;
    return inRight - inLeft;
  })[0];
  const kept = new Set();
  return dice.map((die) => {
    if (!sequence.includes(die) || kept.has(die)) return false;
    kept.add(die);
    return true;
  });
}

function targetPotential(dice, category) {
  const counts = countsFor(dice);
  const groups = [...counts.values()].sort((left, right) => right - left);
  if (UPPER_KEYS.includes(category)) {
    const face = UPPER_KEYS.indexOf(category) + 1;
    return (counts.get(face) ?? 0) * face * 8 - Math.max(0, 3 - (counts.get(face) ?? 0)) * face;
  }
  if (category === 'straight') return straightHolds(dice).filter(Boolean).length * 12;
  if (category === 'full') return (groups[0] * 10) + ((groups[1] ?? 0) * 8);
  if (category === 'fourKind') return groups[0] * 13;
  if (category === 'yam') return groups[0] * 9;
  if (category === 'plus') return dice.filter((die) => die >= 4).reduce((total, die) => total + die, 0) * 2;
  if (category === 'minus') return dice.filter((die) => die <= 3).reduce((total, die) => total + (7 - die), 0);
  if (category === 'middle') return dice.filter((die) => die >= 3 && die <= 5).length * 7;
  return 0;
}

export function chooseTurnTarget(state, legal = getLegalActions(state)) {
  if (state.turn.tamAnnouncement) {
    return { category: state.turn.tamAnnouncement, reason: 'tam' };
  }

  const available = new Set(legal.entries.map(({ category }) => category));
  const dice = state.turn.dice;
  const counts = countsFor(dice);
  const [groupFace, groupSize] = largestGroup(counts);
  const upperCategory = UPPER_KEYS[groupFace - 1];
  if (available.has('straight') && straightHolds(dice).filter(Boolean).length >= 4) {
    return { category: 'straight', reason: 'opportunity' };
  }
  if (available.has('full')) {
    const groups = [...counts.values()].sort((left, right) => right - left);
    if (groups[0] >= 3 || (groups[0] === 2 && groups[1] === 2)) {
      return { category: 'full', reason: 'opportunity' };
    }
  }
  if (available.has('fourKind') && groupSize >= 3) {
    return { category: 'fourKind', face: groupFace, reason: 'opportunity' };
  }
  if (available.has(upperCategory) && groupSize >= 2) {
    return { category: upperCategory, face: groupFace, reason: 'upper-total' };
  }

  const candidates = [...available]
    .filter((category) => category !== 'yam')
    .map((category) => ({ category, value: targetPotential(dice, category) }))
    .sort((left, right) => right.value - left.value || CATEGORY_COST[left.category] - CATEGORY_COST[right.category]);
  return candidates.length ? { category: candidates[0].category, reason: 'opportunity' } : null;
}

export function chooseHeldDice(dice, requestedTarget = null) {
  const counts = countsFor(dice);
  const target = normalizedTarget(requestedTarget);
  const category = target?.category;

  if (UPPER_KEYS.includes(category)) {
    const face = UPPER_KEYS.indexOf(category) + 1;
    return dice.map((die) => die === face);
  }
  if (category === 'straight') return straightHolds(dice);
  if (category === 'full') {
    const groupedFaces = [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((left, right) => right[1] - left[1] || right[0] - left[0]);
    if (groupedFaces.length) {
      const faces = new Set(groupedFaces.slice(0, 2).map(([face]) => face));
      return dice.map((die) => faces.has(die));
    }
    const face = largestGroup(counts)[0];
    return dice.map((die) => die === face);
  }
  if (category === 'fourKind' || category === 'yam') {
    const face = target.face ?? largestGroup(counts)[0];
    return dice.map((die) => die === face);
  }
  if (category === 'plus') return dice.map((die) => die >= 4);
  if (category === 'minus') return dice.map((die) => die <= 3);
  if (category === 'middle') return dice.map((die) => die >= 3 && die <= 5);

  const [groupFace, groupSize] = largestGroup(counts);
  if (groupSize >= 2) return dice.map((die) => die === groupFace);
  return straightHolds(dice);
}

export function chooseAiAction(state) {
  if (state.status !== 'playing') return { type: 'none' };
  if (state.turn.rollCount === 0) return { type: 'roll' };

  const legal = getLegalActions(state);
  if (legal.mustAnnounceTam) {
    const announcement = bestRequiredTamAnnouncement(state, legal.announcements);
    return { type: 'announce-tam', category: announcement.category };
  }

  const dry = state.turn.rollCount === 1 ? strongDryEntry(state, legal.entries) : null;
  if (dry) return { type: 'entry', column: dry.column, category: dry.category };

  if (state.turn.rollCount === 1 && !state.turn.tamAnnouncement && legal.announcements.length) {
    const target = tamTarget(state, legal.announcements);
    if (target) return { type: 'announce-tam', category: target };
  }

  const best = bestEntry(state, legal.entries, state.turn.rollCount);
  if (best && completedCombination(best)) {
    return { type: 'entry', column: best.column, category: best.category };
  }

  if (legal.canReroll) {
    const target = chooseTurnTarget(state, legal);
    return { type: 'reroll', held: chooseHeldDice(state.turn.dice, target), target };
  }

  if (!best && legal.announcements.length) {
    const announcement = bestRequiredTamAnnouncement(state, legal.announcements);
    return { type: 'announce-tam', category: announcement.category };
  }

  if (!best) throw new Error('L’ordinateur ne trouve aucun coup légal.');
  return { type: 'entry', column: best.column, category: best.category };
}

export function applyAiAction(state, action, random = Math.random) {
  if (action.type === 'roll') return rollDice(state, random);
  if (action.type === 'announce-tam') return announceTam(state, action.category);
  if (action.type === 'entry') return applyEntry(state, action.column, action.category);
  if (action.type === 'reroll') {
    let next = state;
    for (let index = 0; index < 5; index += 1) {
      if (next.turn.held[index] !== action.held[index]) next = toggleHeldDie(next, index);
    }
    return rollDice(next, random);
  }
  if (action.type === 'none') return state;
  throw new RangeError(`Action IA inconnue : ${action.type}`);
}

export function playAiTurn(initialState, random = Math.random) {
  const playerIndex = initialState.activePlayerIndex;
  let state = initialState;
  let decisions = 0;
  while (state.status === 'playing' && state.activePlayerIndex === playerIndex) {
    state = applyAiAction(state, chooseAiAction(state), random);
    decisions += 1;
    if (decisions > 12) throw new Error('Le tour de l’ordinateur ne se termine pas.');
  }
  return state;
}
