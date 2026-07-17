import { applyAiAction, chooseAiAction } from '../engine/ai.js';
import { categoryLabel } from '../engine/constants.js';
import { applyEntry, createGame, getGameTotals } from '../engine/game.js';
import { announceTam, getLegalActions, previewEntry, rollDice, toggleHeldDie } from '../engine/rules.js';
import { animateDice, renderDice } from './dice.js';
import { renderGrid } from './grid.js';
import {
  clearSavedGame,
  loadGame,
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
};

let state = loadGame();
let inputLocked = false;
let announcementText = '';

function updateState(nextState) {
  state = nextState;
  saveGame(state);
}

function messageFor(actions) {
  if (state.turn.rollCount === 0) return 'Lancez les cinq dés pour commencer.';
  if (actions.mustAnnounceTam) return 'Choisissez la case Tam obligatoire avant de continuer.';
  if (!actions.canReroll && actions.rerollReason) return actions.rerollReason;
  return 'Touchez un dé pour le garder, ou choisissez une case éclairée.';
}

function render() {
  const actions = getLegalActions(state);
  const totals = getGameTotals(state).players;
  const player = state.players[state.activePlayerIndex];
  elements.turnName.textContent = player.name;
  elements.humanTotal.textContent = totals[0].grandTotal;
  elements.computerTotal.textContent = totals[1].grandTotal;
  elements.message.textContent = messageFor(actions);
  elements.announcement.textContent = announcementText;
  elements.roll.textContent = state.turn.rollCount === 0 ? 'Lancer les dés' : `Relancer · ${3 - state.turn.rollCount}`;
  elements.roll.disabled = state.turn.rollCount === 0 ? !actions.canRoll : !actions.canReroll;
  elements.roll.disabled ||= inputLocked || player.kind !== 'human';
  renderGrid(elements.grid, state, player.kind === 'human' && !inputLocked ? { onCell: handleCell } : {});
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

function pause(duration = 430) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function runComputerTurn() {
  if (state.status !== 'playing' || state.players[state.activePlayerIndex].kind !== 'computer') return;
  inputLocked = true;
  render();
  const computerIndex = state.activePlayerIndex;
  while (state.status === 'playing' && state.activePlayerIndex === computerIndex) {
    const action = chooseAiAction(state);
    if (action.type === 'roll') elements.message.textContent = 'L’ordinateur lance les dés…';
    if (action.type === 'reroll') {
      const kept = action.held.filter(Boolean).length;
      elements.message.textContent = `L’ordinateur garde ${kept} dé${kept > 1 ? 's' : ''} et relance…`;
    }
    if (action.type === 'announce-tam') {
      elements.message.textContent = `L’ordinateur annonce Tam : ${categoryLabel(action.category)}.`;
    }
    if (action.type === 'entry') {
      elements.message.textContent = `L’ordinateur inscrit ${categoryLabel(action.category)}…`;
    }
    await pause();
    updateState(applyAiAction(state, action));
    if (action.type === 'entry' && lastEntryIsYam()) celebrateYam();
    if (action.type === 'announce-tam') {
      announcementText = `L’ordinateur annonce Tam : ${categoryLabel(action.category)}`;
    }
    render();
    if (action.type === 'roll' || action.type === 'reroll') animateDice(elements.dice);
  }
  inputLocked = false;
  render();
}

elements.roll.addEventListener('click', handleRoll);
elements.newGame.addEventListener('click', () => {
  if (window.confirm('Commencer une nouvelle partie ? La partie actuelle sera effacée.')) {
    clearSavedGame();
    updateState(createGame());
    announcementText = '';
    closePreview(elements.overlay);
    render();
  }
});

function replay() {
  clearSavedGame();
  updateState(createGame());
  announcementText = '';
  closePreview(elements.overlay);
  render();
}

document.addEventListener('pointerdown', (event) => {
  if (!elements.overlay.childElementCount) return;
  if (event.target.closest('.preview-card') || event.target.closest('.score-grid')) return;
  closePreview(elements.overlay);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePreview(elements.overlay);
});

saveGame(state);
render();
requestPersistentStorage();
if (state.players[state.activePlayerIndex].kind === 'computer') runComputerTurn();
