---
title: Multi en Ligne en Direct - Plan
type: feat
date: 2026-07-18
topic: multi-en-ligne
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Multi en Ligne en Direct - Plan

## Goal Capsule

- **Objectif :** un 4ᵉ mode « À distance » : Leslie crée une partie, partage un lien, et 2 à 5 personnes jouent la même partie de Yam en direct, chacune depuis son propre téléphone — règles familiales strictement identiques aux autres modes.
- **Autorité produit :** Leslie. Le contrat v1 (`docs/plans/2026-07-17-001-feat-jeu-yam-solo-plan.md`) reste le référentiel intangible des règles du jeu ; le présent contrat ne porte que le mode à distance.
- **Blocages ouverts :** aucun pour la planification. La création du compte de service (R11) interviendra pendant l'exécution, par Leslie, avec accompagnement pas à pas.

---

## Product Contract

### Summary

Depuis l'écran d'accueil, Leslie crée une partie « À distance » et obtient un lien à partager ; chaque invité l'ouvre, entre son prénom — sans aucun compte — et la partie se joue en direct : chacun voit les feuilles, les lancers et les annonces des autres au fil de l'eau.
La partie vit en ligne : elle attend les absents, se reprend depuis n'importe quel appareil, et ne dépend d'aucun téléphone en particulier.
Les modes locaux existants restent intacts et 100 % locaux, pour Leslie comme pour quiconque possède l'adresse du jeu.

### Key Decisions

- **Jeu en direct, tous connectés en même temps** (session-settled: user-directed — chosen over des tours par correspondance au long cours : reprise de la décision du cadrage v1, comme autour de la table).
- **Invitation par lien seulement** (session-settled: user-directed — chosen over lien + code court à dicter : la porte d'entrée la plus simple, un seul geste de partage).
- **La partie attend les absents, place réservée indéfiniment** (session-settled: user-directed — chosen over « l'hôte joue pour l'absent » et « tour sauté après délai » : esprit famille, personne ne joue à ta place, personne ne te saute).
- **Un unique compte de service, propriété de Leslie, créé une seule fois** (session-settled: user-approved — chosen over toute forme de comptes joueurs : les invités ne créent jamais rien ; clarifié en dialogue : ce compte héberge le « cahier partagé » des parties en direct, il ne se recrée pas par partie).
- **Reprise de place par prénom, depuis n'importe quel appareil** (session-settled: user-approved — chosen over une identité liée à l'appareil : un téléphone qui meurt ne bloque pas la partie ; le risque d'usurpation entre proches est assumé).
- **Pas d'ordinateur dans les parties en ligne** (session-settled: user-approved — chosen over des parties mixtes humains + IA : parties 100 % humaines en v1 du multi).

### Actors

- A1. Leslie — créatrice de la partie et joueuse ; propriétaire du compte de service.
- A2. Les invités — 2 à 4 autres personnes ; rejoignent par le lien, jouent sous leur prénom, ne créent jamais de compte.
- A3. Le service temps réel — système externe gratuit qui héberge l'état des parties en direct ; invisible pour les joueurs.

### Requirements

**Créer et rejoindre**

- R1. L'écran d'accueil propose le mode « À distance » ; créer une partie produit immédiatement un lien partageable (partage natif du téléphone + copie manuelle).
- R2. Ouvrir le lien mène à la partie : saisie du prénom, puis entrée — aucun compte, aucune installation, jamais.
- R3. 2 à 5 joueurs ; la créatrice voit les prénoms entrer dans la salle d'attente et lance la partie quand tout le monde est là ; une fois lancée, la partie n'accepte plus de nouveau joueur.
- R4. Chaque action de jeu (lancer, garde, annonce, inscription, barrage) apparaît chez tous les joueurs en quasi temps réel.

**Jouer ensemble**

- R5. Le tour d'un joueur distant s'affiche chez les autres comme le tour de l'ordinateur aujourd'hui : bascule sur sa feuille, ses dés, ses gardes, ses annonces, son inscription surlignée — au rythme réel du joueur.
- R6. Les onglets donnent accès aux feuilles de tous ; les annonces Tam s'affichent chez tout le monde ; le moteur, les barèmes et les garde-fous sont strictement ceux du contrat v1 — aucune divergence de règle entre les modes.
- R7. Écran de fin : classement complet des joueurs, égalités affichées comme telles, feuilles consultables.

**Absences et reprises**

- R8. En cas de déconnexion d'un joueur (téléphone fermé, réseau perdu), la partie attend : les autres voient « On attend {prénom}… » sans limite de temps ; sa place lui reste réservée.
- R9. Reprendre sa place : rouvrir le lien — depuis n'importe quel appareil — et toucher son prénom ; l'appareil d'origine, lui, reprend automatiquement sans étape.
- R10. Les parties en ligne vivent indépendamment des parties locales : démarrer ou effacer une partie locale sur un appareil n'affecte jamais une partie en ligne en cours, et réciproquement.

**Le service et la propriété**

- R11. Un unique compte de service gratuit, créé une seule fois par Leslie (accompagnée pas à pas) ; il n'apparaît jamais aux joueurs ; aucune donnée personnelle au-delà des prénoms choisis et de l'état des parties.
- R12. Les modes locaux restent utilisables par quiconque possède l'adresse du jeu, sans jamais solliciter le service ; l'usage familial du mode à distance tient dans l'offre gratuite du service.
- R13. La fluidité prime : toute attente liée au réseau est nommée à l'écran (« connexion… », « on attend… ») — l'interface ne fige jamais sans explication.

### Key Flows

- F1. Créer et inviter
  - **Trigger :** Leslie touche « À distance » sur l'écran d'accueil.
  - **Steps :** elle entre son prénom → la partie est créée et le lien affiché → partage (bouton natif ou copie) → chaque invité ouvre le lien, entre son prénom, apparaît dans la salle d'attente → Leslie lance quand tout le monde est là.
  - **Covers :** R1, R2, R3.
- F2. Un tour à distance
  - **Trigger :** c'est au tour d'un joueur.
  - **Steps :** il joue sur son téléphone avec exactement les gestes du jeu actuel (lancers, gardes, aperçu, confirmation) ; chez les autres, son tour s'affiche en direct comme un tour d'ordinateur aujourd'hui ; le passage au joueur suivant est automatique.
  - **Covers :** R4, R5, R6.
- F3. Déconnexion et reprise
  - **Trigger :** un joueur perd le réseau ou ferme son téléphone.
  - **Steps :** les autres voient « On attend {prénom}… » → il rouvre le lien (même appareil : reprise automatique ; autre appareil : il touche son prénom) → il reprend exactement où il en était, mi-tour compris.
  - **Covers :** R8, R9.

### Acceptance Examples

- AE1. **Covers R2.** Given un lien de partie partagé, When un invité l'ouvre et entre « Léa », Then elle apparaît dans la salle d'attente de la créatrice — sans avoir rien créé ni installé.
- AE2. **Covers R4, R5.** Given une partie lancée à trois, When le joueur au trait garde deux dés et relance, Then les deux autres voient la garde puis la relance en quasi temps réel, sur la feuille du joueur au trait.
- AE3. **Covers R8, R9.** Given Léa au trait qui ferme son téléphone, Then les autres voient « On attend Léa… » sans limite ; When elle rouvre le lien sur un autre appareil et touche « Léa », Then elle reprend mi-tour — dés, relances restantes et annonce Tam compris.
- AE4. **Covers R10.** Given une partie en ligne en cours, When la créatrice démarre une partie solo locale sur son téléphone, Then la partie en ligne reste intacte et rejoignable.
- AE5. **Covers R6.** Given une annonce « Tam : Full » d'un joueur distant, Then la bannière d'annonce s'affiche chez tous les joueurs.

### Success Criteria

- Une vraie partie familiale à trois téléphones ou plus se joue de bout en bout avec pour seule consigne : « clique le lien, mets ton prénom ».
- Une coupure réseau n'est jamais fatale : la partie attend, la reprise est complète, mi-tour compris.
- Les invités utilisent librement les modes locaux (solo, contre l'ordinateur, à plusieurs sur un téléphone) sans aucun effet sur les parties en ligne.

### Scope Boundaries

Hors périmètre de cette version : ordinateur dans les parties en ligne ; chat ou messages intégrés ; spectateurs ; parties par correspondance (tours étalés dans le temps) ; comptes joueurs ; historique des parties en ligne.

### Dependencies / Assumptions

- Le moteur de jeu existant est réutilisé tel quel (séparation moteur/interface et joueurs interchangeables du contrat v1) ; toute divergence de règle entre modes est un défaut.
- Le mode à distance requiert le réseau ; les modes locaux continuent de fonctionner sans.
- Le choix du service temps réel appartient au plan technique, sous contraintes : gratuit pour l'usage familial, sans serveur à entretenir, compatible avec un site statique, clés embarquables publiquement sans danger.

### Outstanding Questions

- **Deferred to Planning :** choix précis du service temps réel et du protocole de synchronisation ; mécanique de reconnaissance de l'appareil d'origine (R9) ; comportement pendant les micro-coupures réseau (R13) ; procédure guidée de création du compte (R11).
- **Resolve Before Planning :** aucun.
