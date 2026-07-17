import { categoryLabel } from '../engine/constants.js';

function button(label, className, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

function shell(root, title) {
  root.replaceChildren();
  const backdrop = document.createElement('div');
  backdrop.className = 'preview-backdrop';
  const card = document.createElement('section');
  card.className = 'preview-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.append(heading);
  root.append(backdrop, card);
  return card;
}

export function closePreview(root) {
  root.replaceChildren();
}

export function showEntryPreview(root, preview, { onConfirm, onStrike, onCancel }) {
  const card = shell(root, categoryLabel(preview.category));
  const score = document.createElement('p');
  score.className = 'preview-score';
  score.textContent = preview.points === 0 ? 'Cette case vaudrait 0' : `${preview.points} points`;
  const reason = document.createElement('p');
  reason.className = 'preview-reason';
  reason.textContent = preview.reason;
  const actions = document.createElement('div');
  actions.className = 'preview-actions';
  actions.append(
    button('Annuler', 'secondary-button', onCancel),
    button('Barrer · 0', 'danger-button', onStrike),
    button(preview.points === 0 ? 'Inscrire 0' : 'Inscrire', 'confirm-button', onConfirm),
  );
  card.append(score, reason, actions);
}

export function showTamConfirmation(root, category, { onConfirm, onCancel }) {
  const card = shell(root, `Annoncer Tam : ${categoryLabel(category)} ?`);
  const explanation = document.createElement('p');
  explanation.className = 'preview-reason';
  explanation.textContent = 'Cette case deviendra obligatoire à la fin du tour, réussie ou non.';
  const actions = document.createElement('div');
  actions.className = 'preview-actions';
  actions.append(
    button('Annuler', 'secondary-button', onCancel),
    button('Annoncer Tam', 'confirm-button', onConfirm),
  );
  card.append(explanation, actions);
}

export function showTamPicker(root, announcements, { onSelect }) {
  const card = shell(root, 'Une annonce Tam est obligatoire');
  const explanation = document.createElement('p');
  explanation.className = 'preview-reason';
  explanation.textContent = 'Choisissez la case Tam à tenter pour continuer.';
  const picker = document.createElement('div');
  picker.className = 'tam-picker';
  for (const { category } of announcements) {
    picker.append(button(categoryLabel(category), '', () => onSelect(category)));
  }
  card.append(explanation, picker);
}

export function showHandoff(root, playerName, { onReady }) {
  const card = shell(root, `Passez le téléphone à ${playerName}`);
  card.classList.add('handoff-card');
  const explanation = document.createElement('p');
  explanation.className = 'preview-reason';
  explanation.textContent = 'Touchez le bouton seulement quand la bonne personne a le téléphone.';
  const actions = document.createElement('div');
  actions.className = 'preview-actions handoff-actions';
  actions.append(button(`Je suis ${playerName}`, 'confirm-button', onReady));
  card.append(explanation, actions);
}
