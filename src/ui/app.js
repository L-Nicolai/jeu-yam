import { applyAiAction, chooseAiAction } from '../engine/ai.js';
import { categoryLabel } from '../engine/constants.js';
import {
  acknowledgeHandoff,
  applyEntry,
  createGame,
  GAME_MODES,
  getGameTotals,
} from '../engine/game.js';
import { announceTam, getLegalActions, previewEntry, rollDice, toggleHeldDie } from '../engine/rules.js';
import { animateDice, renderDice } from './dice.js';
import { renderGrid } from './grid.js';
import {
  clearSavedGame,
  loadSavedGame,
  requestPersistentStorage,
  saveGame,
} from '../storage.js';
import {
  closePreview,
  showEntryPreview,
  showHandoff,
  showTamConfirmation,
  showTamPicker,
} from './preview.js';
import { celebrateYam, showEndgame } from './endgame.js';

const elements = {
  grid: document.querySelector('#score-grid'),
  dice: document.querySelector('#dice-row'),
  roll: document.querySelector('#roll-button'),
  message: document.querySelector('#turn-message'),
  turnName: document.querySelector('#turn-name'),
  scoreSummary: document.querySelector('#score-summary'),
  newGame: document.querySelector('#new-game'),
  announcement: document.querySelector('#announcement-banner'),
  overlay: document.querySelector('#overlay-root'),
  app: document.querySelector('#app'),
  sheetTabs: document.querySelector('#sheet-tabs'),
  welcome: document.querySelector('#welcome-screen'),
  startSingle: document.querySelector('#start-single'),
  startComputer: document.querySelector('#start-computer'),
  startLocal: document.querySelector('#start-local'),
  modeActions: document.querySelector('.mode-actions'),
  localSetup: document.querySelector('#local-setup'),
  localPlayerCount: document.querySelector('#local-player-count'),
  localPlayerNames: document.querySelector('#local-player-names'),
  cancelLocal: document.querySelector('#cancel-local'),
};

let state = loadSavedGame();
let inputLocked = false;
let announcementText = '';
let computerMessage = '';
let highlightedEntry = null;
let viewedPlayerIndex = state?.activePlayerIndex ?? 0;
let pendingStep = null;
let skipNextClick = false;

function updateState(nextState) {
  state = nextState;
  saveGame(state);
}

function messageFor(actions) {
  if (computerMessage) return computerMessage;
  if (state.handoffRequired) return actions.rerollReason;
  if (state.turn.rollCount === 0) return 'Lancez les cinq dés pour commencer.';
  if (actions.mustAnnounceTam) return 'Choisissez la case Tam obligatoire avant de continuer.';
  if (!actions.canReroll && actions.rerollReason) return actions.rerollReason;
  return 'Touchez un dé pour le garder, ou choisissez une case éclairée.';
}

function renderPlayerNavigation(totals) {
  elements.scoreSummary.replaceChildren();
  elements.sheetTabs.replaceChildren();
  state.players.forEach((player, index) => {
    const score = document.createElement('span');
    const total = document.createElement('b');
    total.textContent = totals[index].grandTotal;
    const name = document.createElement('small');
    name.textContent = player.name;
    score.append(total, name);
    elements.scoreSummary.append(score);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'sheet-tab';
    tab.dataset.playerIndex = String(index);
    tab.setAttribute('role', 'tab');
    tab.textContent = player.name;
    const selected = index === viewedPlayerIndex;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    elements.sheetTabs.append(tab);
  });
}

function render() {
  if (!state) {
    elements.welcome.hidden = false;
    elements.app.hidden = true;
    closePreview(elements.overlay);
    return;
  }
  elements.welcome.hidden = true;
  elements.app.hidden = false;
  if (!state.players[viewedPlayerIndex]) viewedPlayerIndex = state.activePlayerIndex;
  const actions = getLegalActions(state);
  const totals = getGameTotals(state).players;
  const player = state.players[state.activePlayerIndex];
  elements.turnName.textContent = player.name;
  renderPlayerNavigation(totals);
  const singlePlayer = state.mode === GAME_MODES.SINGLE;
  elements.app.classList.toggle('single-player', singlePlayer);
  elements.sheetTabs.hidden = singlePlayer;
  elements.message.textContent = messageFor(actions);
  elements.announcement.textContent = announcementText;
  elements.roll.textContent = state.turn.rollCount === 0 ? 'Lancer les dés' : `Relancer · ${3 - state.turn.rollCount}`;
  elements.roll.disabled = state.turn.rollCount === 0 ? !actions.canRoll : !actions.canReroll;
  elements.roll.disabled ||= inputLocked || player.kind !== 'human';
  const handoffRequired = state.mode === GAME_MODES.LOCAL && state.handoffRequired;
  renderGrid(elements.grid, state, {
    highlightedEntry,
    onCell: player.kind === 'human' && !inputLocked && !handoffRequired && viewedPlayerIndex === state.activePlayerIndex
      ? handleCell
      : null,
    playerIndex: viewedPlayerIndex,
    showActions: viewedPlayerIndex === state.activePlayerIndex,
  });
  renderDice(elements.dice, state.turn, {
    onToggle: player.kind === 'human' && !inputLocked && !handoffRequired ? handleToggle : null,
  });
  elements.app.classList.toggle('computer-thinking', player.kind === 'computer');

  if (state.status === 'finished') {
    showEndgame(elements.overlay, state, { onReplay: replay });
    return;
  }

  if (handoffRequired) {
    if (!elements.overlay.querySelector('.handoff-card')) {
      showHandoff(elements.overlay, player.name, { onReady: finishHandoff });
    }
    return;
  }

  if (actions.mustAnnounceTam && player.kind === 'human' && !elements.overlay.childElementCount) {
    showTamPicker(elements.overlay, actions.announcements, { onSelect: openTamConfirmation });
  }
}

function lastEntryIsYam() {
  const dice = state.lastAction?.dice;
  return state.lastAction?.type === 'entry'
    && state.lastAction.points > 0
    && Array.isArray(dice)
    && dice.every((die) => die === dice[0]);
}

function handleRoll() {
  closePreview(elements.overlay);
  updateState(rollDice(state));
  render();
  animateDice(elements.dice);
}

function handleToggle(index) {
  updateState(toggleHeldDie(state, index));
  render();
}

function handleCell(column, category, availability) {
  if (availability.announceable && column === 'tam') {
    openTamConfirmation(category);
    return;
  }
  const preview = previewEntry(state, column, category);
  showEntryPreview(elements.overlay, preview, {
    onCancel: () => closePreview(elements.overlay),
    onConfirm: () => finishHumanEntry(column, category, false),
    onStrike: () => finishHumanEntry(column, category, true),
  });
}

function openTamConfirmation(category) {
  showTamConfirmation(elements.overlay, category, {
    onCancel: () => {
      closePreview(elements.overlay);
      render();
    },
    onConfirm: () => {
      updateState(announceTam(state, category));
      announcementText = `${state.players[state.activePlayerIndex].name} annonce Tam : ${categoryLabel(category)}`;
      closePreview(elements.overlay);
      render();
    },
  });
}

function finishHandoff() {
  updateState(acknowledgeHandoff(state));
  viewedPlayerIndex = state.activePlayerIndex;
  announcementText = '';
  closePreview(elements.overlay);
  render();
}

async function finishHumanEntry(column, category, strike) {
  updateState(applyEntry(state, column, category, { strike }));
  if (lastEntryIsYam()) celebrateYam();
  closePreview(elements.overlay);
  render();
  await runComputerTurn();
}

function pause(duration) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingStep = null;
      resolve();
    }, duration);
    pendingStep = () => {
      clearTimeout(timeout);
      pendingStep = null;
      resolve();
    };
  });
}

function applyComputerHolds(held) {
  let next = state;
  for (let index = 0; index < held.length; index += 1) {
    if (next.turn.held[index] !== held[index]) next = toggleHeldDie(next, index);
  }
  updateState(next);
}

async function runComputerTurn() {
  if (state.status !== 'playing' || state.players[state.activePlayerIndex].kind !== 'computer') return;
  inputLocked = true;
  viewedPlayerIndex = state.activePlayerIndex;
  render();
  const computerIndex = state.activePlayerIndex;
  while (state.status === 'playing' && state.activePlayerIndex === computerIndex) {
    const action = chooseAiAction(state);
    if (action.type === 'roll') {
      updateState(applyAiAction(state, action));
      computerMessage = `L’ordinateur lance les dés · lancer ${state.turn.rollCount}/3`;
      render();
      animateDice(elements.dice);
      await pause(1000);
      continue;
    }
    if (action.type === 'reroll') {
      const kept = action.held.filter(Boolean).length;
      applyComputerHolds(action.held);
      computerMessage = `L’ordinateur garde ${kept} dé${kept > 1 ? 's' : ''}.`;
      render();
      await pause(1000);
      updateState(rollDice(state));
      computerMessage = `L’ordinateur relance · lancer ${state.turn.rollCount}/3`;
      render();
      animateDice(elements.dice);
      await pause(1000);
      continue;
    }
    if (action.type === 'announce-tam') {
      updateState(applyAiAction(state, action));
      announcementText = `L’ordinateur annonce Tam : ${categoryLabel(action.category)}`;
      computerMessage = announcementText;
      render();
      await pause(1000);
      continue;
    }
    if (action.type === 'entry') {
      updateState(applyAiAction(state, action));
      highlightedEntry = state.lastAction;
      computerMessage = `L’ordinateur inscrit ${categoryLabel(action.category)} : ${state.lastAction.points} point${state.lastAction.points > 1 ? 's' : ''}.`;
      if (lastEntryIsYam()) celebrateYam();
      render();
      await pause(2500);
      highlightedEntry = null;
      continue;
    }
  }
  inputLocked = false;
  computerMessage = '';
  viewedPlayerIndex = state.activePlayerIndex;
  render();
}

elements.roll.addEventListener('click', handleRoll);
elements.sheetTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-player-index]');
  if (!tab) return;
  viewedPlayerIndex = Number(tab.dataset.playerIndex);
  render();
});
elements.newGame.addEventListener('click', () => {
  if (window.confirm('Commencer une nouvelle partie ? La partie actuelle sera effacée.')) {
    clearSavedGame();
    state = null;
    announcementText = '';
    computerMessage = '';
    highlightedEntry = null;
    viewedPlayerIndex = 0;
    closePreview(elements.overlay);
    render();
  }
});

function replay() {
  clearSavedGame();
  state = null;
  announcementText = '';
  viewedPlayerIndex = 0;
  closePreview(elements.overlay);
  render();
}

function startGame(mode) {
  updateState(createGame({ mode }));
  announcementText = '';
  computerMessage = '';
  highlightedEntry = null;
  viewedPlayerIndex = 0;
  closePreview(elements.overlay);
  elements.localSetup.hidden = true;
  elements.modeActions.hidden = false;
  render();
}

elements.startSingle.addEventListener('click', () => startGame(GAME_MODES.SINGLE));
elements.startComputer.addEventListener('click', () => startGame(GAME_MODES.COMPUTER));

function renderLocalNameInputs() {
  const count = Number(elements.localPlayerCount.value);
  const previous = [...elements.localPlayerNames.querySelectorAll('input')].map(({ value }) => value);
  elements.localPlayerNames.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement('label');
    label.textContent = `Prénom ${index + 1}`;
    const input = document.createElement('input');
    input.name = `player-${index + 1}`;
    input.required = true;
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.placeholder = `Joueur ${index + 1}`;
    input.value = previous[index] ?? (index === 0 ? 'Leslie' : '');
    label.append(input);
    elements.localPlayerNames.append(label);
  }
}

function closeLocalSetup() {
  elements.localSetup.hidden = true;
  elements.modeActions.hidden = false;
}

elements.startLocal.addEventListener('click', () => {
  elements.modeActions.hidden = true;
  elements.localSetup.hidden = false;
  renderLocalNameInputs();
  elements.localPlayerNames.querySelector('input')?.focus();
});
elements.cancelLocal.addEventListener('click', closeLocalSetup);
elements.localPlayerCount.addEventListener('change', renderLocalNameInputs);
elements.localSetup.addEventListener('submit', (event) => {
  event.preventDefault();
  const names = [...elements.localPlayerNames.querySelectorAll('input')].map(({ value }) => value.trim());
  if (names.some((name) => !name)) return;
  const players = names.map((name, index) => ({ id: `local-${index + 1}`, name, kind: 'human' }));
  updateState(createGame({ mode: GAME_MODES.LOCAL, players }));
  announcementText = '';
  computerMessage = '';
  highlightedEntry = null;
  viewedPlayerIndex = 0;
  closePreview(elements.overlay);
  closeLocalSetup();
  render();
});

document.addEventListener('pointerdown', (event) => {
  if (inputLocked && pendingStep) {
    skipNextClick = true;
    setTimeout(() => { skipNextClick = false; }, 500);
    pendingStep();
  }
  if (!elements.overlay.childElementCount) return;
  if (state?.handoffRequired) return;
  if (event.target.closest('.preview-card') || event.target.closest('.score-grid')) return;
  closePreview(elements.overlay);
});

document.addEventListener('click', (event) => {
  if (!skipNextClick) return;
  skipNextClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !state?.handoffRequired) closePreview(elements.overlay);
});

if (state) saveGame(state);
render();
requestPersistentStorage();
if (state?.players[state.activePlayerIndex].kind === 'computer') runComputerTurn();
