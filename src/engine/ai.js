import { CATEGORY_KEYS } from './constants.js';
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

function entryValue(entry, rollCount) {
  let value = entry.points - CATEGORY_COST[entry.category];
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

function bestEntry(entries, rollCount) {
  return [...entries].sort((left, right) => {
    const difference = entryValue(right, rollCount) - entryValue(left, rollCount);
    if (difference) return difference;
    return right.points - left.points;
  })[0] ?? null;
}

function strongDryEntry(entries) {
  return entries
    .filter((entry) => entry.column === 'dry' && entry.validCombination)
    .filter((entry) => ['straight', 'full', 'fourKind', 'yam'].includes(entry.category) || entry.points >= 18)
    .sort((left, right) => entryValue(right, 1) - entryValue(left, 1))[0] ?? null;
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
  if (counts[0] >= 3 && open.has('fourKind')) return 'fourKind';
  return null;
}

function bestRequiredTamAnnouncement(state, announcements) {
  return [...announcements].sort((left, right) => {
    const leftScore = scoreCategory(left.category, state.turn.dice).points - CATEGORY_COST[left.category];
    const rightScore = scoreCategory(right.category, state.turn.dice).points - CATEGORY_COST[right.category];
    return rightScore - leftScore;
  })[0];
}

export function chooseHeldDice(dice) {
  const counts = countsFor(dice);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  if (groups[0][1] >= 2) {
    const target = groups[0][0];
    return dice.map((die) => die === target);
  }

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

export function chooseAiAction(state) {
  if (state.status !== 'playing') return { type: 'none' };
  if (state.turn.rollCount === 0) return { type: 'roll' };

  const legal = getLegalActions(state);
  if (legal.mustAnnounceTam) {
    const announcement = bestRequiredTamAnnouncement(state, legal.announcements);
    return { type: 'announce-tam', category: announcement.category };
  }

  const dry = state.turn.rollCount === 1 ? strongDryEntry(legal.entries) : null;
  if (dry) return { type: 'entry', column: dry.column, category: dry.category };

  if (state.turn.rollCount === 1 && !state.turn.tamAnnouncement && legal.announcements.length) {
    const target = tamTarget(state, legal.announcements);
    if (target) return { type: 'announce-tam', category: target };
  }

  const best = bestEntry(legal.entries, state.turn.rollCount);
  if (best && completedCombination(best) && best.points >= 40) {
    return { type: 'entry', column: best.column, category: best.category };
  }

  if (legal.canReroll) {
    return { type: 'reroll', held: chooseHeldDice(state.turn.dice) };
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

