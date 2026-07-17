export function renderDice(container, turn, { onToggle = null } = {}) {
  container.replaceChildren();
  turn.dice.forEach((value, index) => {
    const die = document.createElement('button');
    die.type = 'button';
    die.className = 'die';
    die.textContent = value;
    die.classList.toggle('held', turn.held[index]);
    die.disabled = turn.rollCount === 0 || turn.rollCount >= 3 || !onToggle;
    die.setAttribute('aria-label', `Dé ${index + 1} : ${value}${turn.held[index] ? ', gardé' : ''}`);
    die.setAttribute('aria-pressed', String(turn.held[index]));
    if (onToggle) die.addEventListener('click', () => onToggle(index));
    container.append(die);
  });
}

export function animateDice(container) {
  for (const die of container.querySelectorAll('.die:not(.held)')) {
    die.classList.remove('rolling');
    requestAnimationFrame(() => die.classList.add('rolling'));
  }
}

