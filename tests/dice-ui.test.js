import test from 'node:test';
import assert from 'node:assert/strict';

import { renderDice } from '../src/ui/dice.js';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  toggle(name, force) {
    const classes = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    if (force) classes.add(name);
    else classes.delete(name);
    this.owner.className = [...classes].join(' ');
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [...children];
    for (const child of children) child.parentNode = this;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(name, listener) {
    this[`on${name}`] = listener;
  }
}

function turn({ dice = [1, 2, 3, 4, 5], held = [false, false, false, false, false] } = {}) {
  return { dice, held, rollCount: 1 };
}

test('sélectionner un dé conserve son bouton pour laisser la transition se dérouler', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  try {
    const container = new FakeElement('div');
    const selections = [];
    renderDice(container, turn(), { onToggle: (index) => selections.push(`ancien-${index}`) });
    const firstDie = container.children[0];

    renderDice(container, turn({ held: [true, false, false, false, false] }), {
      onToggle: (index) => selections.push(`nouveau-${index}`),
      preserveElements: true,
    });

    assert.equal(container.children[0], firstDie);
    assert.match(firstDie.className, /\bheld\b/);
    firstDie.onclick();
    assert.deepEqual(selections, ['nouveau-0']);
  } finally {
    globalThis.document = originalDocument;
  }
});