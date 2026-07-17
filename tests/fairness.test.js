import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/engine/game.js';
import { rollDice } from '../src/engine/rules.js';

const ROLL_COUNT = 60_000;
const MIN_RATE = 0.146;
const MAX_RATE = 0.187;

test('équité U11 — chaque face est uniforme dans chacune des cinq positions sur 60 000 lancers', () => {
  const freshState = createGame();
  const countsByPosition = Array.from({ length: 5 }, () => Array(7).fill(0));

  for (let roll = 0; roll < ROLL_COUNT; roll += 1) {
    const dice = rollDice(freshState).turn.dice;
    dice.forEach((face, position) => {
      countsByPosition[position][face] += 1;
    });
  }

  countsByPosition.forEach((faceCounts, position) => {
    for (let face = 1; face <= 6; face += 1) {
      const rate = faceCounts[face] / ROLL_COUNT;
      assert.ok(
        rate >= MIN_RATE && rate <= MAX_RATE,
        `position ${position + 1}, face ${face} : ${(rate * 100).toFixed(2)} %`,
      );
    }
  });
});
