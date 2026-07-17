import { applyAiAction, chooseAiAction } from '../engine/ai.js';
import { categoryLabel } from '../engine/constants.js';
import { applyEntry, createGame, GAME_MODES, getGameTotals } from '../engine/game.js';
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
  humanTotal: document.querySelector('#human-total'),
  computerTotal: document.querySelector('#computer-total'),
  newGame: document.querySelector('#new-game'),
  announcement: document.querySelector('#announcement-banner'),
  overlay: document.querySelector('#overlay-root'),
  app: document.querySelector('#app'),
  sheetTabs: document.querySelector('#sheet-tabs'),
  welcome: document.querySelector('#welcome-screen'),
  startSingle: document.querySelector('#start-single'),
  startComputer: document.querySelector('#start-computer'),
  scoreSeparator: document.querySelector('#score-separator'),
  computerScore: document.querySelector('#computer-score'),
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
  if (state.turn.rollCount === 0) return 'Lancez les cinq dés pour commencer.';
  if (actions.mustAnnounceTam) return 'Choisissez la case Tam obligatoire avant de continuer.';
  if (!actions.canReroll && actions.rerollReason) return actions.rerollReason;
  return 'Touchez un dé pour le garder, ou choisissez une case éclairée.';
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
  elements.humanTotal.textContent = totals[0].grandTotal;
  elements.computerTotal.textContent = totals[1]?.grandTotal ?? '';
  const singlePlayer = state.mode === GAME_MODES.SINGLE;
  elements.app.classList.toggle('single-player', singlePlayer);
  elements.sheetTabs.hidden = singlePlayer;
  elements.scoreSeparator.hidden = singlePlayer;
  elements.computerScore.hidden = singlePlayer;
  elements.message.textContent = messageFor(actions);
  elements.announcement.textContent = announcementText;
  elements.roll.textContent = state.turn.rollCount === 0 ? 'Lancer les dés' : `Relancer · ${3 - state.turn.rollCount}`;
  elements.roll.disabled = state.turn.rollCount === 0 ? !actions.canRoll : !actions.canReroll;
  elements.roll.disabled ||= inputLocked || player.kind !== 'human';
  for (const tab of elements.sheetTabs.querySelectorAll('[data-player-index]')) {
    const index = Number(tab.dataset.playerIndex);
    const selected = index === viewedPlayerIndex;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  }
  renderGrid(elements.grid, state, {
    highlightedEntry,
    onCell: player.kind === 'human' && !inputLocked && viewedPlayerIndex === state.activePlayerIndex
      ? handleCell
      : null,
    playerIndex: viewedPlayerIndex,
    showActions: viewedPlayerIndex === state.activePlayerIndex,
  });
  renderDice(elements.dice, state.turn, { onToggle: player.kind === 'human' && !inputLocked ? handleToggle : null });
  elements.app.classList.toggle('computer-thinking', player.kind === 'computer');

  if (state.status === 'finished') {
    showEndgame(elements.overlay, state, { onReplay: replay });
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
      announcementText = `Leslie annonce Tam : ${categoryLabel(category)}`;
      closePreview(elements.overlay);
      render();
    },
  });
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
  render();
}

elements.startSingle.addEventListener('click', () => startGame(GAME_MODES.SINGLE));
elements.startComputer.addEventListener('click', () => startGame(GAME_MODES.COMPUTER));

document.addEventListener('pointerdown', (event) => {
  if (inputLocked && pendingStep) {
    skipNextClick = true;
    setTimeout(() => { skipNextClick = false; }, 500);
    pendingStep();
  }
  if (!elements.overlay.childElementCount) return;
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
  if (event.key === 'Escape') closePreview(elements.overlay);
});

if (state) saveGame(state);
render();
requestPersistentStorage();
if (state?.players[state.activePlayerIndex].kind === 'computer') runComputerTurn();
