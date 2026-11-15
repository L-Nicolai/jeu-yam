import { CATEGORIES, getColumns, UPPER_KEYS } from '../engine/constants.js';
import { getGameTotals } from '../engine/game.js';
import { getLegalActions } from '../engine/rules.js';

function cell(className, text, tag = 'div') {
  const element = document.createElement(tag);
  element.className = `grid-cell ${className}`;
  element.textContent = text;
  return element;
}

function completedCount(sheet, columns) {
  return columns.reduce(
    (total, { key }) => total + Object.values(sheet[key]).filter((value) => value !== null).length,
    0,
  );
}

export function renderGrid(container, state, {
  highlightedEntry = null,
  onCell = null,
  playerIndex = state.activePlayerIndex,
  showActions = playerIndex === state.activePlayerIndex,
} = {}) {
  const player = state.players[playerIndex];
  const sheet = player.sheet;
  const columns = getColumns(state);
  const totals = getGameTotals(state).players[playerIndex];
  const actions = showActions ? getLegalActions(state) : { entries: [], announcements: [] };
  const playable = new Set(actions.entries.map(({ column, category }) => `${column}:${category}`));
  const announceable = new Set(actions.announcements.map(({ column, category }) => `${column}:${category}`));
  const potential = new Map([...actions.entries, ...actions.announcements]
    .filter(({ points }) => points !== undefined)
    .map(({ column, category, points }) => [`${column}:${category}`, points]));

  container.replaceChildren();
  container.style.setProperty('--column-count', String(columns.length));
  container.append(cell('grid-corner', 'Cases'));
  for (const column of columns) {
    container.append(cell('column-heading', column.shortLabel));
  }

  for (const category of CATEGORIES) {
    container.append(cell('row-heading', category.label));
    for (const column of columns) {
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
      button.classList.toggle(
        'recent-entry',
        highlightedEntry?.playerId === player.id
          && highlightedEntry.column === column.key
          && highlightedEntry.category === category.key,
      );
      if (value === null && potential.has(key)) {
        const ghost = document.createElement('span');
        ghost.className = 'potential-points';
        ghost.textContent = String(potential.get(key));
        button.append(ghost);
      }
      const potentialLabel = value === null && potential.has(key)
        ? `, rapporterait ${potential.get(key)} point${potential.get(key) > 1 ? 's' : ''}`
        : '';
      button.setAttribute('aria-label', `${category.label}, colonne ${column.label}${value === null ? '' : ` : ${value} points`}${potentialLabel}`);
      if (onCell) button.addEventListener('click', () => onCell(column.key, category.key, {
        playable: playable.has(key),
        announceable: announceable.has(key),
      }));
      container.append(button);
    }

    if (category.key === UPPER_KEYS.at(-1)) {
      container.append(cell('row-heading upper-subtotal', 'Somme 1-6'));
      for (const column of columns) {
        const started = UPPER_KEYS.some((key) => sheet[column.key][key] !== null);
        container.append(cell('total-cell upper-subtotal', started ? String(totals.columns[column.key].upperRaw) : '—'));
      }
      container.append(cell('row-heading upper-total', 'Total (60)'));
      for (const column of columns) {
        const value = totals.columns[column.key].upperComplete ? totals.columns[column.key].upperTotal : '—';
        container.append(cell('total-cell upper-total', String(value)));
      }
    }
  }

  container.append(cell('row-heading grand-total', 'TOTAL'));
  for (const column of columns) {
    container.append(cell('total-cell grand-total', String(totals.columns[column.key].total)));
  }

  document.querySelector('#sheet-title').textContent = `Feuille de ${player.name}`;
  document.querySelector('#turn-progress').textContent = `${completedCount(sheet, columns)} / ${CATEGORIES.length * columns.length}`;
}
