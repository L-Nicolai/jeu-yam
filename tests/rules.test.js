import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/engine/game.js';
import {
  announceTam,
  getLegalActions,
  getPlayableEntries,
  previewEntry,
  rollDice,
} from '../src/engine/rules.js';

function afterFirstRoll(dice = [1, 2, 3, 4, 5]) {
  return rollDice(createGame(), () => dice.shift?.() ?? 1, dice);
}

function fill(sheet, column, categories, value = 0) {
  for (const category of categories) sheet[column][category] = value;
}

test('AE4 — Tam annoncé et raté force zéro dans la case annoncée', () => {
  let state = afterFirstRoll([1, 1, 2, 3, 4]);
  state = announceTam(state, 'fourKind');
  state = rollDice(state, Math.random, [1, 2, 3, 4, 5]);
  const entries = getPlayableEntries(state);
  assert.deepEqual(entries.map(({ column, category }) => [column, category]), [
    ['tam', 'fourKind'],
  ]);
  assert.equal(entries[0].points, 0);
  assert.equal(entries[0].validCombination, false);
});

test('Tam refuse une case remplie, toute inscription et tout barrage sans annonce', () => {
  const state = afterFirstRoll([1, 2, 3, 4, 5]);
  state.players[0].sheet.tam.full = 30;
  assert.throws(() => announceTam(state, 'full'), /déjà remplie/);
  assert.equal(
    getPlayableEntries(state).some((entry) => entry.column === 'tam'),
    false,
  );
  assert.throws(
    () => previewEntry(state, 'tam', 'yam', { strike: true }),
    /annonce Tam/,
  );
});

test('AE5 — une Quinte servie vaut 50 en Sèche puis toute relance interdit la colonne', () => {
  let state = afterFirstRoll([2, 3, 4, 5, 6]);
  assert.equal(previewEntry(state, 'dry', 'straight').points, 50);
  state = rollDice(state, Math.random, [2, 3, 4, 5, 6]);
  assert.equal(
    getPlayableEntries(state).some((entry) => entry.column === 'dry'),
    false,
  );
  assert.throws(
    () => previewEntry(state, 'dry', 'straight', { strike: true }),
    /premier lancer/,
  );
});

test('Sèche chiffre : même un seul dé visé compte au premier lancer', () => {
  const state = afterFirstRoll([3, 1, 2, 5, 6]);
  assert.equal(previewEntry(state, 'dry', 'three').points, 3);
});

test('AE6 — + sous un Moyen de 18 affiche zéro avant confirmation', () => {
  const state = afterFirstRoll([3, 3, 3, 4, 4]);
  state.players[0].sheet.free.middle = 18;
  const preview = previewEntry(state, 'free', 'plus');
  assert.equal(preview.points, 0);
  assert.equal(preview.validCombination, false);
  assert.match(preview.reason, /supérieur à Moyen/);
});

test('le trio + > Moyen > − est vérifié contre toutes les valeurs déjà inscrites', () => {
  const state = afterFirstRoll([4, 4, 4, 4, 4]);
  state.players[0].sheet.free.plus = 21;
  state.players[0].sheet.free.minus = 19;
  assert.equal(previewEntry(state, 'free', 'middle').points, 20);
  state.players[0].sheet.free.minus = 20;
  assert.equal(previewEntry(state, 'free', 'middle').points, 0);
});

test('AE7 — Descendante et Montante imposent leur ordre, Libre reste libre', () => {
  const state = afterFirstRoll([1, 2, 3, 4, 5]);
  const initial = getPlayableEntries(state);
  assert.equal(initial.some((e) => e.column === 'descending' && e.category === 'one'), true);
  assert.equal(initial.some((e) => e.column === 'descending' && e.category === 'three'), false);
  assert.equal(initial.some((e) => e.column === 'ascending' && e.category === 'yam'), true);
  assert.equal(initial.some((e) => e.column === 'ascending' && e.category === 'one'), false);
  assert.equal(initial.some((e) => e.column === 'free' && e.category === 'three'), true);
});

test('AE8 — seules cases Sèche : relance bloquée avec explication', () => {
  const state = afterFirstRoll([1, 2, 3, 4, 5]);
  for (const column of ['descending', 'free', 'ascending', 'tam']) {
    fill(state.players[0].sheet, column, Object.keys(state.players[0].sheet[column]));
  }
  const actions = getLegalActions(state);
  assert.equal(actions.canReroll, false);
  assert.match(actions.rerollReason, /Sèche/);
  assert.equal(actions.entries.every((entry) => entry.column === 'dry'), true);
});

test('AE8 — seules cases Tam : annonce proposée d’office après le premier lancer', () => {
  const state = afterFirstRoll([1, 2, 3, 4, 5]);
  for (const column of ['descending', 'free', 'ascending', 'dry']) {
    fill(state.players[0].sheet, column, Object.keys(state.players[0].sheet[column]));
  }
  const actions = getLegalActions(state);
  assert.equal(actions.mustAnnounceTam, true);
  assert.equal(actions.announcements.length, 13);
  assert.equal(actions.entries.length, 0);
});

test('AE9 — + doit dépasser − directement, même quand Moyen est vide', () => {
  const state = afterFirstRoll([1, 2, 3, 4, 1]);
  state.players[0].sheet.free.minus = 20;
  const preview = previewEntry(state, 'free', 'plus');
  assert.equal(preview.points, 0);
  assert.equal(preview.validCombination, false);
  assert.match(preview.reason, /\+ doit être strictement supérieur à −/);
});

test('AE9 — inscrire − au-dessus du + déjà posé vaut zéro aussi', () => {
  const state = afterFirstRoll([6, 6, 5, 6, 5]);
  state.players[0].sheet.free.plus = 15;
  const preview = previewEntry(state, 'free', 'minus');
  assert.equal(preview.points, 0);
  assert.equal(preview.validCombination, false);
  assert.match(preview.reason, /\+ doit être strictement supérieur à −/);
});

test('AE10 — une case barrée (0) du trio ne contraint pas les autres', () => {
  const state = afterFirstRoll([4, 4, 3, 4, 3]);
  state.players[0].sheet.free.middle = 0;
  const preview = previewEntry(state, 'free', 'minus');
  assert.equal(preview.points, 18);
  assert.equal(preview.validCombination, true);
});

test('AE10 — + et − restent contraints entre eux malgré un Moyen barré', () => {
  const state = afterFirstRoll([2, 2, 2, 2, 3]);
  state.players[0].sheet.free.middle = 0;
  state.players[0].sheet.free.minus = 20;
  const preview = previewEntry(state, 'free', 'plus');
  assert.equal(preview.points, 0);
  assert.match(preview.reason, /\+ doit être strictement supérieur à −/);
});

