const PIP_POSITIONS = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

export function renderDice(container, turn, {
  onToggle = null,
  pendingSync = false,
  preserveElements = false,
} = {}) {
  if (!preserveElements) container.replaceChildren();
  turn.dice.forEach((value, index) => {
    const die = preserveElements && container.children[index]
      ? container.children[index]
      : document.createElement('button');
    die.type = 'button';
    die.className = 'die';
    die.replaceChildren();
    for (const position of PIP_POSITIONS[value] ?? []) {
      const pip = document.createElement('span');
      pip.className = `pip pip-${position}`;
      die.append(pip);
    }
    die.classList.toggle('held', turn.held[index]);
    die.classList.toggle('pending-sync', pendingSync);
    die.disabled = turn.rollCount === 0 || turn.rollCount >= 3 || !onToggle;
    die.setAttribute('aria-label', `Dé ${index + 1} : ${value}${turn.held[index] ? ', gardé' : ''}`);
    die.setAttribute('aria-pressed', String(turn.held[index]));
    die.onclick = onToggle ? () => onToggle(index) : null;
    if (!die.parentNode) container.append(die);
  });
  if (preserveElements) {
    while (container.children.length > turn.dice.length) container.lastElementChild.remove();
  }
}

export function animateDice(container) {
  for (const die of container.querySelectorAll('.die:not(.held)')) {
    die.classList.remove('rolling');
    requestAnimationFrame(() => die.classList.add('rolling'));
  }
}

