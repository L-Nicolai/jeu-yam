import { CATEGORIES, TRIO_KEYS, UPPER_KEYS } from './constants.js';

function sum(dice) {
  return dice.reduce((total, die) => total + die, 0);
}

function validateDice(dice) {
  if (!Array.isArray(dice) || dice.length !== 5 || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    throw new TypeError('Un lancer doit contenir cinq dés compris entre 1 et 6.');
  }
}

function invalid(reason) {
  return { points: 0, valid: false, reason };
}

export function scoreCategory(category, dice) {
  validateDice(dice);
  const definition = CATEGORIES.find(({ key }) => key === category);
  if (!definition) throw new RangeError(`Case inconnue : ${category}`);

  if (definition.face) {
    return {
      points: dice.filter((die) => die === definition.face).length * definition.face,
      valid: true,
      reason: `Somme des dés ${definition.face}`,
    };
  }

  const counts = new Map();
  for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
  const total = sum(dice);

  if (category === 'straight') {
    const ordered = [...new Set(dice)].sort((a, b) => a - b).join('');
    return ordered === '12345' || ordered === '23456'
      ? { points: total + 30, valid: true, reason: 'Quinte : somme + 30' }
      : invalid('Quinte non réalisée');
  }

  if (category === 'full') {
    const groups = [...counts.values()].sort((a, b) => b - a);
    return (groups[0] === 3 && groups[1] === 2) || groups[0] === 5
      ? { points: total + 20, valid: true, reason: 'Full : somme + 20' }
      : invalid('Full non réalisé');
  }

  if (category === 'fourKind') {
    const group = [...counts.entries()].find(([, count]) => count >= 4);
    if (!group) return invalid('Carré non réalisé');
    const [face, count] = group;
    return {
      points: face * (count === 5 ? 5 : 4) + 40,
      valid: true,
      reason: count === 5 ? 'Yam au Carré : somme + 40' : 'Carré : quatre dés + 40',
    };
  }

  if (TRIO_KEYS.includes(category)) {
    return { points: total, valid: true, reason: 'Somme des cinq dés' };
  }

  if (category === 'yam') {
    return counts.size === 1
      ? { points: total + 60, valid: true, reason: 'Yam : somme + 60' }
      : invalid('Yam non réalisé');
  }

  throw new RangeError(`Case inconnue : ${category}`);
}

export function scoreUpperTotal(total) {
  if (!Number.isFinite(total)) throw new TypeError('Le total supérieur doit être un nombre.');
  return total >= 60 ? 90 + 5 * (total - 60) : total - 5 * (60 - total);
}

export function scoreColumn(column) {
  const upperRaw = UPPER_KEYS.reduce((total, key) => total + (column[key] ?? 0), 0);
  const upperComplete = UPPER_KEYS.every((key) => column[key] !== null);
  const upperTotal = upperComplete ? scoreUpperTotal(upperRaw) : 0;
  const lowerTotal = Object.entries(column)
    .filter(([key]) => !UPPER_KEYS.includes(key))
    .reduce((total, [, points]) => total + (points ?? 0), 0);
  return { upperRaw, upperComplete, upperTotal, lowerTotal, total: upperTotal + lowerTotal };
}
