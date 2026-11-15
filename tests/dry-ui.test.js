import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, GAME_MODES } from '../src/engine/game.js';
import { renderGrid } from '../src/ui/grid.js';
import { showEndgame } from '../src/ui/endgame.js';

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener() {}
}

function withDocument(run) {
  const previous = globalThis.document;
  const nodes = { '#sheet-title': new Element('span'), '#turn-progress': new Element('span') };
  globalThis.document = { createElement: (tag) => new Element(tag), querySelector: (selector) => nodes[selector] };
  try { run(nodes); } finally { globalThis.document = previous; }
}

for (const includeDry of [false, true]) {
  test(`grille — ${includeDry ? 'avec' : 'sans'} Sèche, colonnes et progression cohérentes`, () => withDocument((nodes) => {
    const state = createGame({ mode: GAME_MODES.SINGLE, includeDry });
    const grid = new Element('div');
    renderGrid(grid, state);
    const count = includeDry ? 5 : 4;
    assert.equal(grid.children.filter((child) => child.className.includes('column-heading')).length, count);
    assert.equal(grid.children.filter((child) => child.tagName === 'button').length, count * 13);
    assert.equal(nodes['#turn-progress'].textContent, `0 / ${count * 13}`);
    assert.equal(grid.style['--column-count'], String(count));
  }));
}

test('bilan final sans Sèche — quatre colonnes seulement', () => withDocument(() => {
  const state = createGame({ mode: GAME_MODES.SINGLE, includeDry: false });
  for (const [key, column] of Object.entries(state.players[0].sheet)) {
    if (key !== 'dry') for (const category of Object.keys(column)) column[category] = 0;
  }
  state.status = 'finished';
  const root = new Element('div');
  showEndgame(root, state, { onReplay() {} });
  function descendants(element) { return [element, ...element.children.flatMap(descendants)]; }
  const rows = descendants(root).filter(({ tagName }) => tagName === 'tr');
  assert.ok(rows.length > 0);
  assert.ok(rows.every(({ children }) => children.length === 5));
  assert.equal(descendants(root).some(({ textContent }) => textContent === 'Sèche'), false);
}));
