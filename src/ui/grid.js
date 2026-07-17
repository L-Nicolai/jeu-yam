import { CATEGORIES, COLUMNS, UPPER_KEYS } from '../engine/constants.js';
import { getGameTotals } from '../engine/game.js';
import { getLegalActions } from '../engine/rules.js';

function cell(className, text, tag = 'div') {
  const element = document.createElement(tag);
  element.className = `grid-cell ${className}`;
  element.textContent = text;
  return element;
}

function completedCount(sheet) {
  return Object.values(sheet).reduce(
    (total, column) => total + Object.values(column).filter((value) => value !== null).length,
    0,
  );
}

export function renderGrid(container, state, { onCell = null } = {}) {
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];
  const sheet = player.sheet;
  const totals = getGameTotals(state).players[playerIndex];
  const actions = getLegalActions(state);
  const playable = new Set(actions.entries.map(({ column, category }) => `${column}:${category}`));
  const announceable = new Set(actions.announcements.map(({ column, category }) => `${column}:${category}`));

  container.replaceChildren();
  container.append(cell('grid-corner', 'Cases'));
  for (const column of COLUMNS) {
    container.append(cell('column-heading', column.shortLabel));
  }

  for (const category of CATEGORIES) {
    container.append(cell('row-heading', category.label));
    for (const column of COLUMNS) {
      const value = sheet[column.key][category.key];
      const key = `${column.key}:${category.key}`;
      const button = cell('score-cell', value === null ? '' : (value === 0 ? '×' : String(value)), 'button');
      button.type = 'button';
      button.dataset.column = column.key;
      button.dataset.category = category.key;
      button.disabled = (!playable.has(key) && !announceable.has(key)) || !onCell;
      button.classList.toggle('playable', playable.has(key));
      button.classList.toggle('announceable', announceable.has(key));
      button.classList.toggle('filled', value !== null);
      button.setAttribute('aria-label', `${category.label}, colonne ${column.label}${value === null ? '' : ` : ${value} points`}`);
      if (onCell) button.addEventListener('click', () => onCell(column.key, category.key, {
        playable: playable.has(key),
        announceable: announceable.has(key),
      }));
      container.append(button);
    }

    if (category.key === UPPER_KEYS.at(-1)) {
      container.append(cell('row-heading upper-total', 'Total (60)'));
      for (const column of COLUMNS) {
        const value = totals.columns[column.key].upperComplete ? totals.columns[column.key].upperTotal : '—';
        container.append(cell('total-cell upper-total', String(value)));
      }
    }
  }

  container.append(cell('row-heading grand-total', 'TOTAL'));
  for (const column of COLUMNS) {
    container.append(cell('total-cell grand-total', String(totals.columns[column.key].total)));
  }

  document.querySelector('#sheet-title').textContent = `Feuille de ${player.name}`;
  document.querySelector('#turn-progress').textContent = `${completedCount(sheet)} / 65`;
}
