import { loadPlaceTokens, savePlaceToken } from '../storage.js';

export function parseOnlineGameId(hash = '') {
  const match = /^#p\/([A-Za-z0-9_-]{8,64})$/.exec(hash);
  return match?.[1] ?? null;
}

export function onlineGateState(document, tokens = {}) {
  if (!document) return { type: 'missing' };
  const owned = document.players.filter((player) => tokens[player.id]);
  if (owned.length === 1) return { type: 'automatic', playerId: owned[0].id, token: tokens[owned[0].id] };
  if (owned.length > 1) {
    return {
      type: 'claim',
      places: document.players.map((player) => ({ ...player, available: !player.connected })),
      tokens,
    };
  }
  if (document.phase === 'lobby') return { type: 'join' };
  const places = document.players.map((player) => ({ ...player, available: !player.connected }));
  return places.some(({ available }) => available) ? { type: 'claim', places } : { type: 'full', places };
}

export function isMyRemoteTurn(document, credentials) {
  const state = document?.state;
  return Boolean(state && credentials?.playerId === state.players[state.activePlayerIndex]?.id);
}

export function onlineErrorMessage(error) {
  return error?.code === 'not-found' ? 'Cette partie n’existe plus' : 'Connexion impossible — réessayer';
}

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

export function createOnlineController({
  root,
  service,
  storage = globalThis.localStorage,
  locationObject = globalThis.location,
  navigatorObject = globalThis.navigator,
  onGame = () => {},
  onCredentials = () => {},
  onExit = () => {},
  onError = () => {},
}) {
  let gameId = null;
  let snapshot = null;
  let credentials = null;
  let unsubscribe = null;

  function show() {
    root.hidden = false;
    root.replaceChildren();
  }

  function actionButton(label, handler, className = 'confirm-button') {
    const button = element('button', className, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function showConnecting() {
    show();
    root.append(element('p', 'online-status', 'connexion…'));
  }

  function showFailure(error, retry) {
    show();
    const message = onlineErrorMessage(error);
    root.append(element('p', 'online-error', message));
    const actions = element('div', 'online-actions');
    if (message.startsWith('Cette partie')) {
      actions.append(actionButton('Retour à l’accueil', exit, 'secondary-button'));
    } else {
      actions.append(actionButton('Réessayer', retry));
    }
    root.append(actions);
    onError(error);
  }

  function invitationUrl() {
    return `${locationObject.href.split('#')[0]}#p/${gameId}`;
  }

  function renderLobby() {
    show();
    const heading = element('h2', '', 'Salle d’attente');
    const link = element('p', 'invitation-link', invitationUrl());
    const list = element('ul', 'online-player-list');
    for (const player of snapshot.players) {
      list.append(element('li', player.connected ? 'connected' : 'disconnected', `${player.name}${player.connected ? '' : ' · absent'}`));
    }
    const creator = snapshot.players.find(({ id }) => id === snapshot.creatorPlayerId);
    const waiting = element('p', 'online-status', `En attente du lancement par ${creator.name}…`);
    const actions = element('div', 'online-actions');
    actions.append(actionButton('Partager le lien', async () => {
      const url = invitationUrl();
      if (navigatorObject.share) await navigatorObject.share({ title: 'Partie de Yam', url });
      else await navigatorObject.clipboard?.writeText(url);
    }));
    actions.append(actionButton('Copier', async () => navigatorObject.clipboard?.writeText(invitationUrl()), 'secondary-button'));
    if (credentials?.playerId === snapshot.creatorPlayerId) {
      const start = actionButton('Commencer', async () => {
        start.disabled = true;
        try {
          await service.startGame(gameId, credentials);
        } catch (error) {
          start.disabled = false;
          showFailure(error, renderLobby);
        }
      });
      start.disabled = snapshot.players.filter(({ connected }) => connected).length < 2;
      actions.append(start);
    }
    root.append(heading, link, list, waiting, actions);
  }

  function renderJoin() {
    show();
    const form = element('form', 'online-join-form');
    const heading = element('h2', '', 'Rejoindre la partie');
    const label = element('label', '', 'Ton prénom');
    const input = element('input');
    input.name = 'name';
    input.required = true;
    input.maxLength = 24;
    input.autocomplete = 'given-name';
    label.append(input);
    const message = element('p', 'online-error');
    const submit = element('button', 'confirm-button', 'Entrer');
    submit.type = 'submit';
    form.append(heading, label, message, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await acceptCredentials(await service.joinGame(gameId, { name: input.value }));
      } catch (error) {
        submit.disabled = false;
        message.textContent = error.message;
      }
    });
    root.append(form);
    const disconnected = snapshot.players.filter(({ connected }) => !connected);
    if (disconnected.length) {
      const resume = element('div', 'online-place-list');
      resume.append(element('p', 'online-status', 'Ou reprends ta place :'));
      for (const place of disconnected) {
        resume.append(actionButton(place.name, async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await acceptCredentials(await service.claimPlace(gameId, { playerId: place.id }));
          } catch (error) {
            button.disabled = false;
            message.textContent = error.message;
          }
        }, 'mode-button'));
      }
      root.append(resume);
    }
    input.focus();
  }

  function renderClaims(gate) {
    show();
    root.append(element('h2', '', 'Partie en cours'));
    const list = element('div', 'online-place-list');
    for (const place of gate.places) {
      const button = actionButton(place.name, async () => {
        button.disabled = true;
        try {
          await acceptCredentials(await service.claimPlace(gameId, {
            playerId: place.id,
            token: gate.tokens?.[place.id] ?? null,
          }));
        } catch (error) {
          button.disabled = false;
          showFailure(error, () => open(gameId));
        }
      }, 'mode-button');
      button.disabled = !place.available;
      if (!place.available) button.title = 'Place active';
      list.append(button);
    }
    root.append(list);
    if (gate.type === 'full') root.append(element('p', 'online-status', 'Partie en cours — complète'));
  }

  async function acceptCredentials(result) {
    credentials = { playerId: result.playerId, token: result.token };
    savePlaceToken(gameId, result.playerId, result.token, storage);
    onCredentials(credentials);
    snapshot = result.game;
    attach();
    routeSnapshot();
  }

  function routeSnapshot() {
    if (!snapshot) {
      showFailure(Object.assign(new Error(), { code: 'not-found' }), () => open(gameId));
      return;
    }
    if (credentials && snapshot.phase === 'lobby') renderLobby();
    else if (credentials && snapshot.state) {
      root.hidden = true;
      onGame(snapshot);
    } else {
      const gate = onlineGateState(snapshot, loadPlaceTokens(gameId, storage));
      if (gate.type === 'join') renderJoin();
      else renderClaims(gate);
    }
  }

  function attach() {
    unsubscribe?.();
    unsubscribe = service.subscribe(gameId, (next) => {
      snapshot = next;
      routeSnapshot();
    }, (error) => showFailure(error, () => open(gameId)));
  }

  async function open(nextGameId) {
    gameId = nextGameId;
    showConnecting();
    try {
      snapshot = await service.readGame(gameId);
      if (!snapshot) {
        showFailure(Object.assign(new Error(), { code: 'not-found' }), () => open(gameId));
        return;
      }
      const gate = onlineGateState(snapshot, loadPlaceTokens(gameId, storage));
      if (gate.type === 'automatic') {
        await acceptCredentials(await service.claimPlace(gameId, gate));
        return;
      }
      routeSnapshot();
    } catch (error) {
      showFailure(error, () => open(gameId));
    }
  }

  function showCreate() {
    show();
    const form = element('form', 'online-join-form');
    const label = element('label', '', 'Ton prénom');
    const input = element('input');
    input.required = true;
    input.maxLength = 24;
    label.append(input);
    const message = element('p', 'online-error');
    const submit = element('button', 'confirm-button', 'Créer la partie');
    submit.type = 'submit';
    form.append(element('h2', '', 'Jouer à distance'), label, message, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      showConnecting();
      try {
        const result = await service.createGame({ creatorName: input.value });
        gameId = result.game.gameId;
        locationObject.hash = `p/${gameId}`;
        await acceptCredentials(result);
      } catch (error) {
        showFailure(error, showCreate);
      }
    });
    root.append(form);
    input.focus();
  }

  async function publish(state) {
    if (!snapshot || !credentials) throw new Error('Session distante absente.');
    return service.publishState(gameId, {
      ...credentials,
      state,
      version: snapshot.version + 1,
      round: snapshot.round,
    });
  }

  async function replay() {
    return service.replayGame(gameId, credentials);
  }

  async function exit() {
    unsubscribe?.();
    if (credentials) service.setPresence(gameId, { ...credentials, connected: false }).catch(() => {});
    locationObject.hash = '';
    root.hidden = true;
    onExit();
  }

  return { open, showCreate, publish, replay, exit, getSnapshot: () => snapshot, getCredentials: () => credentials };
}
