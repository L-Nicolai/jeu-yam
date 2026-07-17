import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/engine/game.js';
import { rollDice } from '../src/engine/rules.js';
import { scoreCategory } from '../src/engine/scoring.js';

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

test('équité U15 — Yam, Carré exact et Quinte servis suivent leurs fréquences théoriques', (t) => {
  const firstRolls = 200_000;
  const freshState = createGame();
  let yams = 0;
  let exactFourKinds = 0;
  let straights = 0;

  for (let roll = 0; roll < firstRolls; roll += 1) {
    const dice = rollDice(freshState).turn.dice;
    const counts = new Map();
    for (const face of dice) counts.set(face, (counts.get(face) ?? 0) + 1);
    if (scoreCategory('yam', dice).valid) yams += 1;
    if ([...counts.values()].some((count) => count === 4)) exactFourKinds += 1;
    if (scoreCategory('straight', dice).valid) straights += 1;
  }

  const measured = {
    yam: yams / firstRolls,
    fourKind: exactFourKinds / firstRolls,
    straight: straights / firstRolls,
  };
  const theoretical = {
    yam: 6 / (6 ** 5),
    fourKind: 150 / (6 ** 5),
    straight: 240 / (6 ** 5),
  };
  for (const event of Object.keys(measured)) {
    const minimum = theoretical[event] * 0.6;
    const maximum = theoretical[event] * 1.4;
    assert.ok(
      measured[event] >= minimum && measured[event] <= maximum,
      `${event} : ${(measured[event] * 100).toFixed(3)} % au lieu de ${(theoretical[event] * 100).toFixed(3)} %`,
    );
  }
  t.diagnostic(
    `Yam ${(measured.yam * 100).toFixed(3)} %, Carré ${(measured.fourKind * 100).toFixed(3)} %, Quinte ${(measured.straight * 100).toFixed(3)} %`,
  );
});
