import { CATEGORIES, COLUMNS } from '../engine/constants.js';
import { getGameOutcome, getGameTotals } from '../engine/game.js';

function createPlayerSheet(player, totals) {
  const section = document.createElement('section');
  section.className = 'final-sheet';
  const heading = document.createElement('h3');
  heading.textContent = `${player.name} · ${totals.grandTotal} points`;
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(document.createElement('th'));
  for (const column of COLUMNS) {
    const cell = document.createElement('th');
    cell.textContent = column.shortLabel;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const category of CATEGORIES) {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.textContent = category.label;
    row.append(label);
    for (const column of COLUMNS) {
      const score = document.createElement('td');
      score.textContent = player.sheet[column.key][category.key];
      row.append(score);
    }
    body.append(row);
  }
  const totalRow = document.createElement('tr');
  const totalLabel = document.createElement('th');
  totalLabel.textContent = 'TOTAL';
  totalRow.append(totalLabel);
  for (const column of COLUMNS) {
    const value = document.createElement('td');
    value.textContent = totals.columns[column.key].total;
    totalRow.append(value);
  }
  body.append(totalRow);
  table.append(head, body);
  section.append(heading, table);
  return section;
}

export function showEndgame(root, state, { onReplay }) {
  const outcome = getGameOutcome(state);
  const totals = getGameTotals(state).players;
  root.replaceChildren();
  const screen = document.createElement('section');
  screen.className = 'endgame-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-label', 'Fin de la partie');
  const heading = document.createElement('h2');
  if (outcome.type === 'single') heading.textContent = 'Partie terminée';
  else if (outcome.type === 'tie') heading.textContent = 'Égalité parfaite';
  else if (outcome.type === 'ranking') {
    heading.textContent = outcome.winnerIndexes.length > 1
      ? 'Égalité en tête !'
      : `${state.players[outcome.winnerIndexes[0]].name} gagne !`;
  } else heading.textContent = `${state.players[outcome.winnerIndex].name} gagne !`;
  const summary = document.createElement('p');
  if (outcome.type === 'single') summary.textContent = `TOTAL général : ${totals[0].grandTotal} points`;
  else if (outcome.type === 'ranking') summary.textContent = 'Classement final';
  else summary.textContent = `${state.players[0].name} ${totals[0].grandTotal} — ${totals[1].grandTotal} ${state.players[1].name}`;
  const ranking = document.createElement('ol');
  ranking.className = 'final-ranking';
  if (outcome.type === 'ranking') {
    for (const entry of outcome.ranking) {
      const item = document.createElement('li');
      item.value = entry.rank;
      item.textContent = `${state.players[entry.playerIndex].name} — ${entry.total} points`;
      ranking.append(item);
    }
  }
  const sheets = document.createElement('div');
  sheets.className = 'final-sheets';
  sheets.classList.toggle('single-player', outcome.type === 'single');
  state.players.forEach((player, index) => sheets.append(createPlayerSheet(player, totals[index])));
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'confirm-button replay-button';
  replay.textContent = 'Rejouer';
  replay.addEventListener('click', onReplay);
  screen.append(heading, summary);
  if (outcome.type === 'ranking') screen.append(ranking);
  screen.append(sheets, replay);
  root.append(screen);
}

export function celebrateYam() {
  const celebration = document.createElement('div');
  celebration.className = 'yam-celebration';
  celebration.setAttribute('role', 'status');
  celebration.textContent = 'YAM !';
  document.body.append(celebration);
  celebration.addEventListener('animationend', () => celebration.remove(), { once: true });
  setTimeout(() => celebration.remove(), 1600);
}
