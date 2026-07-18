import { CATEGORY_KEYS, TRIO_KEYS, UPPER_KEYS } from './constants.js';
import { applyEntry } from './game.js';
import {
  announceTam,
  getLegalActions,
  getPlayableEntries,
  rollDice,
  toggleHeldDie,
} from './rules.js';
import { scoreCategory, scoreUpperTotal } from './scoring.js';

const MONTE_CARLO_ENDINGS = 260;
const MIN_SAMPLES_PER_TARGET = 12;

const EXPECTED_CATEGORY_POINTS = Object.freeze({
  straight: 31,
  full: 30,
  fourKind: 25,
  plus: 23,
  middle: 18,
  minus: 12,
  yam: 14,
});

function countsFor(dice) {
  const counts = new Map();
  for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
  return counts;
}

function filledCount(sheetColumn) {
  return CATEGORY_KEYS.reduce((total, category) => total + Number(sheetColumn[category] !== null), 0);
}

function sheetProgress(sheet) {
  return Object.values(sheet).reduce((total, column) => total + filledCount(column), 0);
}

function upperTarget(category) {
  return (UPPER_KEYS.indexOf(category) + 1) * 3;
}

function projectedUpperScore(sheetColumn, category, points) {
  let projected = 0;
  for (const upper of UPPER_KEYS) {
    if (upper === category) projected += points;
    else projected += sheetColumn[upper] ?? upperTarget(upper);
  }
  return scoreUpperTotal(projected);
}

function entryValue(state, entry) {
  const sheetColumn = state.players[state.activePlayerIndex].sheet[entry.column];
  let value;
  if (UPPER_KEYS.includes(entry.category)) {
    const realized = projectedUpperScore(sheetColumn, entry.category, entry.points);
    const completesUpper = UPPER_KEYS.every((key) => key === entry.category || sheetColumn[key] !== null);
    const marginal = realized - projectedUpperScore(sheetColumn, entry.category, 0);
    value = realized
      - projectedUpperScore(sheetColumn, entry.category, upperTarget(entry.category))
      + marginal * (completesUpper ? 0.25 : 0.05);
  } else {
    value = entry.points - EXPECTED_CATEGORY_POINTS[entry.category];
    if (entry.category === 'minus') value -= Math.max(0, entry.points - 12);
    if (entry.category === 'plus') value -= Math.max(0, 20 - entry.points);
  }

  if (!entry.validCombination) value -= 12;
  if (entry.column === 'descending' || entry.column === 'ascending') value += 4;
  if (entry.column === 'tam') value += 1;
  if (entry.column === 'dry' && entry.validCombination && !TRIO_KEYS.includes(entry.category)) value += 3;
  return value;
}

function bestEntry(state, entries) {
  return [...entries].sort((left, right) => {
    const difference = entryValue(state, right) - entryValue(state, left);
    if (difference) return difference;
    if (right.points !== left.points) return right.points - left.points;
    return CATEGORY_KEYS.indexOf(left.category) - CATEGORY_KEYS.indexOf(right.category);
  })[0] ?? null;
}

function strongDryEntry(state, entries) {
  return entries
    .filter((entry) => entry.column === 'dry' && entry.validCombination)
    .filter((entry) => {
      if (['straight', 'full', 'fourKind', 'yam'].includes(entry.category)) return true;
      if (!UPPER_KEYS.includes(entry.category)) return false;
      const face = UPPER_KEYS.indexOf(entry.category) + 1;
      return entry.points >= face * 3;
    })
    .sort((left, right) => entryValue(state, right) - entryValue(state, left))[0] ?? null;
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
    return (counts.get(face) ?? 0) * face * 8;
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

function candidateTargets(entries, dice) {
  const categories = [...new Set(entries.map(({ category }) => category))];
  const groupFace = largestGroup(countsFor(dice))[0];
  return categories.map((category) => ({
    category,
    ...(['fourKind', 'yam'].includes(category) ? { face: groupFace } : {}),
    reason: 'simulation',
  }));
}

function randomizeUnheld(dice, held, random) {
  return dice.map((die, index) => (held[index] ? die : Math.floor(random() * 6) + 1));
}

function stateForEnding(state, dice, tamCategory = state.turn.tamAnnouncement) {
  return {
    ...state,
    turn: {
      ...state.turn,
      dice,
      rollCount: 3,
      rerolled: true,
      tamAnnouncement: tamCategory,
    },
  };
}

function simulateTarget(state, target, random, samples, tamCategory = state.turn.tamAnnouncement) {
  let total = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    let dice = [...state.turn.dice];
    for (let roll = state.turn.rollCount; roll < 3; roll += 1) {
      dice = randomizeUnheld(dice, chooseHeldDice(dice, target), random);
    }
    const ending = stateForEnding(state, dice, tamCategory);
    const entry = bestEntry(ending, getPlayableEntries(ending));
    total += entry ? entryValue(ending, entry) : -500;
  }
  return {
    expectedValue: total / samples,
    target,
    held: chooseHeldDice(state.turn.dice, target),
  };
}

function bestSimulation(state, targets, random, tamCategory = state.turn.tamAnnouncement) {
  if (!targets.length) return null;
  const samples = Math.max(MIN_SAMPLES_PER_TARGET, Math.floor(MONTE_CARLO_ENDINGS / targets.length));
  return targets
    .map((target) => simulateTarget(state, target, random, samples, tamCategory))
    .sort((left, right) => right.expectedValue - left.expectedValue)[0];
}

function bestRerollPlan(state, legal, random) {
  return bestSimulation(state, candidateTargets(legal.entries, state.turn.dice), random);
}

function bestTamPlan(state, announcements, random) {
  const targets = announcements.map(({ category }) => ({ category, reason: 'tam-simulation' }));
  const plans = targets.map((target) => {
    const samples = Math.max(MIN_SAMPLES_PER_TARGET, Math.floor(MONTE_CARLO_ENDINGS / targets.length));
    return simulateTarget(state, target, random, samples, target.category);
  });
  return plans.sort((left, right) => right.expectedValue - left.expectedValue)[0] ?? null;
}

function servedTamTarget(state, announcements) {
  const open = new Set(announcements.map(({ category }) => category));
  const dice = state.turn.dice;
  const counts = [...countsFor(dice).values()].sort((left, right) => right - left);
  if (counts[0] === 5 && open.has('yam')) return 'yam';
  if (counts[0] >= 4 && open.has('fourKind')) return 'fourKind';
  if (counts[0] === 3 && counts[1] === 2 && open.has('full')) return 'full';
  if (scoreCategory('straight', dice).valid && open.has('straight')) return 'straight';
  return null;
}

function tamIsBehindSchedule(state) {
  const sheet = state.players[state.activePlayerIndex].sheet;
  const completed = sheetProgress(sheet);
  const tamCompleted = filledCount(sheet.tam);
  return tamCompleted < Math.floor(completed / 5);
}

export function chooseTurnTarget(state, legal = getLegalActions(state), random = Math.random) {
  if (state.turn.tamAnnouncement) return { category: state.turn.tamAnnouncement, reason: 'tam' };
  const plan = bestRerollPlan(state, legal, random);
  if (plan) return plan.target;

  const candidates = [...new Set(legal.entries.map(({ category }) => category))]
    .map((category) => ({ category, value: targetPotential(state.turn.dice, category) }))
    .sort((left, right) => right.value - left.value);
  return candidates.length ? { category: candidates[0].category, reason: 'opportunity' } : null;
}

export function chooseAiAction(state, random = Math.random) {
  if (state.status !== 'playing') return { type: 'none' };
  if (state.turn.rollCount === 0) return { type: 'roll' };

  const legal = getLegalActions(state);
  if (legal.mustAnnounceTam) {
    const plan = bestTamPlan(state, legal.announcements, random);
    return { type: 'announce-tam', category: plan.target.category };
  }

  const dry = state.turn.rollCount === 1 ? strongDryEntry(state, legal.entries) : null;
  if (dry) return { type: 'entry', column: dry.column, category: dry.category };

  if (state.turn.rollCount === 1 && !state.turn.tamAnnouncement && legal.announcements.length) {
    const served = servedTamTarget(state, legal.announcements);
    if (served) return { type: 'announce-tam', category: served };

    const rerollPlan = legal.canReroll ? bestRerollPlan(state, legal, random) : null;
    const tamPlan = bestTamPlan(state, legal.announcements, random);
    const normalValue = Math.max(
      bestEntry(state, legal.entries) ? entryValue(state, bestEntry(state, legal.entries)) : -500,
      rerollPlan?.expectedValue ?? -500,
    );
    const scheduleAllowance = tamIsBehindSchedule(state) ? 24 : 0;
    if (tamPlan && tamPlan.expectedValue + scheduleAllowance >= normalValue) {
      return { type: 'announce-tam', category: tamPlan.target.category };
    }
  }

  const immediate = bestEntry(state, legal.entries);
  if (!legal.canReroll) {
    if (!immediate) throw new Error('L’ordinateur ne trouve aucun coup légal.');
    return { type: 'entry', column: immediate.column, category: immediate.category };
  }

  const plan = bestRerollPlan(state, legal, random);
  if (!plan || (immediate && entryValue(state, immediate) >= plan.expectedValue - 0.5)) {
    if (!immediate) throw new Error('L’ordinateur ne trouve aucun coup légal.');
    return { type: 'entry', column: immediate.column, category: immediate.category };
  }
  return { type: 'reroll', held: plan.held, target: plan.target };
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
    state = applyAiAction(state, chooseAiAction(state, random), random);
    decisions += 1;
    if (decisions > 12) throw new Error('Le tour de l’ordinateur ne se termine pas.');
  }
  return state;
}
