# Le Yam de Leslie

Une version téléphone du Yam familial de Leslie, jouable seule, contre un ordinateur correct mais battable, à 2 à 5 personnes sur le même téléphone ou à distance. Les règles et les barèmes sont ceux de la feuille maison — pas ceux du Yahtzee classique.

## Jouer

Ouvrir l’adresse du jeu dans Safari ou Chrome, puis lancer les dés. Après chaque lancer, toucher les dés à garder et choisir une case éclairée. La partie est sauvegardée automatiquement après chaque action.

Pour essayer le jeu localement sur un ordinateur :

```sh
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans le navigateur.

Pour essayer le parcours à distance sans compte Firebase, ouvrir
`http://localhost:8000/?simulation=1` dans deux onglets. La simulation partage
la salle entre les onglets via le stockage du navigateur et n’est utilisée que
pour le développement et les tests.

## Épingler sur un téléphone

Il est recommandé d’épingler le jeu avant de commencer une partie : sur iPhone, l’application épinglée utilise un stockage séparé de Safari.

- iPhone/iPad : ouvrir le jeu dans Safari, toucher **Partager**, puis **Sur l’écran d’accueil** et **Ajouter**.
- Android : ouvrir le jeu dans Chrome, ouvrir le menu, puis choisir **Ajouter à l’écran d’accueil** ou **Installer l’application**.

Le jeu s’ouvre ensuite en plein écran depuis son icône. Il faut revenir l’ouvrir régulièrement : le téléphone reste libre d’effacer le stockage local après une longue période sans visite.

## Lancer les tests

Node.js 20 ou plus récent suffit. Aucun paquet npm n’est nécessaire :

```sh
node --test tests/
```

Les icônes peuvent être régénérées, toujours sans paquet externe, avec `node scripts/generate-icons.js`.

L’équité des dés — faces et combinaisons rares — est vérifiée statistiquement à chaque exécution des tests.

## Préparer le compte Firebase pour le mode À distance

Cette étape n’est à faire qu’une seule fois, par Leslie. Les joueurs invités n’ont aucun compte à créer.

1. Dans la console Firebase, créer un projet gratuit, ajouter une application Web, puis créer une **Realtime Database** en **mode verrouillé**.
2. Dans l’onglet **Règles** de la base, remplacer le contenu par celui de `docs/reference/firebase-rules.json`, puis publier les règles. Elles empêchent de lire la racine et donc d’énumérer les parties.
3. Dans **Paramètres du projet > Vos applications**, copier la configuration Web dans `src/net/config.js`, puis passer `firebaseConfigured` à `true`. Ces identifiants sont publics par conception ; la protection repose sur les règles de la base.

Le SDK Firebase est chargé depuis le CDN officiel uniquement après avoir choisi « À distance ». Les trois modes locaux ne chargent aucune dépendance réseau et continuent de fonctionner hors ligne.

## Publier une mise à jour

Après vérification humaine, enregistrer les changements dans Git puis les pousser sur la branche publiée par GitHub Pages :

```sh
git add .
git commit -m "feat: décrire la mise à jour"
git push
```

GitHub Pages republie ensuite automatiquement le contenu statique. Il n’y a ni compilation, ni commande npm, ni fichier généré à envoyer séparément.
