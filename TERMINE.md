# Compte rendu d’implémentation — Yam solo

Date : 17 juillet 2026

## Résultat

Les unités U1 à U7 ont été implémentées localement. Conformément à l’exception demandée, aucun dépôt GitHub n’a été créé, aucune page GitHub Pages n’a été activée et aucun contenu n’a été poussé. Tous les fichiers locaux prévus par U7 sont présents : `package.json`, `manifest.webmanifest`, `icons/`, `README.md` et `.nojekyll`.

## Unités réalisées

- U1 — moteur pur : barèmes maison, colonnes ordonnées, Tam, Sèche, trio +/Moyen/−, déroulé des tours, joueurs interchangeables et état JSON transportable. Les tests ont été écrits avant le moteur : exemples canoniques, puis AE1 à AE8, puis implémentation.
- U2 — ordinateur heuristique : gardes par motifs, relances, choix relatif des cases, Tam et Sèche opportunistes. Vérifié sur 1 000 parties complètes, plus 200 parties de calibrage contre un joueur légal aléatoire.
- U3 — écran de jeu : en-tête, feuille complète 5 colonnes × 15 lignes calculées, dés tactiles, animation CSS, palette crème/terracotta et CSS responsive sans défilement de la page de jeu.
- U4 — déroulé complet : aperçu des points, confirmation, barrage, confirmation Tam distincte, remplacement/annulation de l’aperçu, proposition Tam obligatoire, relance Sèche bloquée et tour ordinateur lisible étape par étape.
- U5 — persistance : sauvegarde versionnée après chaque mutation, reprise mi-tour et mi-tour ordinateur, annonce Tam et dés gardés inclus, corruption/version inconnue ignorée, demande de stockage persistant.
- U6 — fin : deux feuilles détaillées, totaux, victoire ou égalité exacte, rejeu sans confirmation et célébration Yam unique sans son.
- U7 — paquet statique local : manifeste relatif, icônes PNG 32/180/192/512, README en français, `.nojekyll` et `package.json` réduit à `{ "type": "module" }`. Aucune publication n’a été effectuée.

## Definition of Done — vérification point par point

- [ ] Partie complète au doigt sur URL publique, iPhone et Android : non vérifiable et non publiée, conformément à l’exception de publication. L’environnement ne fournit en outre aucun navigateur contrôlable.
- [x] `node --test tests/` entièrement vert : 29/29 tests.
- [x] AE1 à AE8 tracés par des tests portant explicitement leur identifiant.
- [x] Parties génératives : 500 parties légales aléatoires et 1 000 parties IA complètes sans blocage ; 200 parties de calibrage passées.
- [x] Barèmes canoniques exacts : 63→105, 65→115, 60→90, 58→48, ainsi que les exemples Quinte, Full, Carré, Yam et chiffres.
- [x] Persistance testée au niveau moteur/stockage, y compris mi-tour avec annonce Tam active, payload corrompu et reprise du tour ordinateur.
- [ ] Fermeture/réouverture réelle du navigateur : non vérifiable ici, car l’ouverture d’un port local est interdite et aucun navigateur intégré n’est disponible.
- [x] Zéro paquet npm, zéro bundler, zéro framework, aucun `node_modules` et aucune API réseau dans l’application.
- [x] README en français : jouer, épingler sur iPhone/Android, tester et publier une mise à jour.
- [x] Moteur sans DOM : aucun `document` ni `window` sous `src/engine/`.
- [x] Manifeste et chemins de déploiement relatifs ; dimensions des quatre PNG vérifiées.

## Sortie complète de `node --test tests/`

```text
✔ AE1 — Total (60) applique exactement le barème maison (0.610583ms)
✔ barèmes canoniques — chiffres, quintes, Full, Carré et Yam (0.616375ms)
✔ AE2 — un Yam de 6 inscrit au Full vaut 50 (0.061542ms)
✔ AE3 — Carré maison : quatre 4 valent 56 et un Yam de 2 vaut 50 (0.05325ms)
✔ les combinaisons manquées valent zéro avec une explication (0.08175ms)
✔ AE4 — Tam annoncé et raté force zéro dans la case annoncée (0.856666ms)
✔ Tam refuse une case remplie, toute inscription et tout barrage sans annonce (0.437042ms)
✔ AE5 — une Quinte servie vaut 50 en Sèche puis toute relance interdit la colonne (0.350084ms)
✔ Sèche chiffre : même un seul dé visé compte au premier lancer (0.098125ms)
✔ AE6 — + sous un Moyen de 18 affiche zéro avant confirmation (0.145625ms)
✔ le trio + > Moyen > − est vérifié contre toutes les valeurs déjà inscrites (0.088292ms)
✔ AE7 — Descendante et Montante imposent leur ordre, Libre reste libre (0.12925ms)
✔ AE8 — seules cases Sèche : relance bloquée avec explication (0.142791ms)
✔ AE8 — seules cases Tam : annonce proposée d’office après le premier lancer (0.084875ms)
✔ un tour inscrit exactement une case et passe au joueur interchangeable suivant (0.140541ms)
✔ les totaux de colonne et le TOTAL général appliquent la ligne Total (60) (0.162959ms)
✔ sérialisation — aller-retour strict, y compris mi-tour avec annonce Tam active (0.856875ms)
✔ parties génératives — 500 parties aléatoires terminent 130 tours sans blocage (2081.063792ms)
✔ sauvegarde locale — aller-retour exact, y compris annonce Tam active (0.294375ms)
✔ sauvegarde locale — JSON corrompu ou version inconnue démarre une partie propre (0.382541ms)
✔ reprise ordinateur — une sauvegarde à son tour est terminée sans blocage (0.32675ms)
✔ effacement explicite — la sauvegarde reste intacte tant que clearSavedGame n’est pas appelé (0.099041ms)
✔ fin de partie — une égalité exacte reste une égalité sans vainqueur désigné (0.103875ms)
✔ bon sens — avec 6-6-6-2-1, l’IA garde les trois 6 (0.051458ms)
✔ bon sens — une Quinte servie au premier lancer est inscrite en Sèche (0.078208ms)
✔ légalité — 1 000 parties IA auto-jouées terminent sans blocage ni coup illégal (12556.2135ms)
✔ performance — une partie complète auto-jouée prend moins d’une seconde (12.721959ms)
✔ calibrage — sur 200 parties l’IA bat nettement le joueur légal aléatoire sans score démesuré (1677.905833ms)
✔ toute décision IA est applicable par le même moteur de règles (0.639167ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16394.0775
```

## Écarts et limites rencontrés

1. **Commits unitaires impossibles dans cet environnement.** Le dépôt `.git` est monté en lecture seule. Les tentatives de `git add`/`git commit` aux frontières d’U1 et U2 ont échoué avec `Unable to create '.git/index.lock': Operation not permitted`. Aucun commit n’a donc pu être créé, malgré la séparation logique des travaux par unité. Les fichiers de travail sont tous présents mais non suivis dans le worktree.
2. **Smokes navigateur et captures non exécutables.** `python3 -m http.server` échoue sur `socket.bind` avec `Operation not permitted`, et le navigateur intégré indique qu’aucun navigateur n’est disponible (`browsers: []`). Les vérifications de syntaxe, structure, chemins et overflow CSS ont été faites, mais les vues 390/768/1280 px et la partie manuelle complète restent à valider humainement.
3. **Publication et appareils réels volontairement non testés.** C’est l’exception explicite de la demande. La validation iPhone/Android, l’épinglage et la survie réelle du stockage devront être faits après revue humaine et publication.
4. **Génération des icônes adaptée.** `sips` ne pouvait pas rasteriser directement le SVG dans cet environnement. Les PNG sont donc générés de façon déterministe par `scripts/generate-icons.js`, avec uniquement les modules standards de Node, puis leurs dimensions ont été contrôlées avec `sips`. Aucun paquet n’a été ajouté.
