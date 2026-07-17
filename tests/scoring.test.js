import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreCategory,
  scoreUpperTotal,
} from '../src/engine/scoring.js';

test('AE1 — Total (60) applique exactement le barème maison', () => {
  assert.equal(scoreUpperTotal(63), 105);
  assert.equal(scoreUpperTotal(65), 115);
  assert.equal(scoreUpperTotal(60), 90);
  assert.equal(scoreUpperTotal(58), 48);
});

test('barèmes canoniques — chiffres, quintes, Full, Carré et Yam', () => {
  assert.deepEqual(scoreCategory('three', [3, 3, 3, 3, 3]), {
    points: 15,
    valid: true,
    reason: 'Somme des dés 3',
  });
  assert.equal(scoreCategory('straight', [1, 2, 3, 4, 5]).points, 45);
  assert.equal(scoreCategory('straight', [2, 3, 4, 5, 6]).points, 50);
  assert.equal(scoreCategory('full', [6, 6, 6, 5, 5]).points, 48);
  assert.equal(scoreCategory('fourKind', [6, 6, 6, 6, 2]).points, 64);
  assert.equal(scoreCategory('fourKind', [1, 1, 1, 1, 6]).points, 44);
  assert.equal(scoreCategory('yam', [6, 6, 6, 6, 6]).points, 90);
});

test('AE2 — un Yam de 6 inscrit au Full vaut 50', () => {
  assert.deepEqual(scoreCategory('full', [6, 6, 6, 6, 6]), {
    points: 50,
    valid: true,
    reason: 'Full : somme + 20',
  });
});

test('AE3 — Carré maison : quatre 4 valent 56 et un Yam de 2 vaut 50', () => {
  assert.equal(scoreCategory('fourKind', [4, 4, 4, 4, 2]).points, 56);
  assert.equal(scoreCategory('fourKind', [2, 2, 2, 2, 2]).points, 50);
});

test('les combinaisons manquées valent zéro avec une explication', () => {
  const result = scoreCategory('straight', [1, 2, 3, 4, 6]);
  assert.equal(result.points, 0);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Quinte non réalisée/);
});

