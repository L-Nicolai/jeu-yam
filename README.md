# Le Yam de Leslie

Une version téléphone du Yam familial de Leslie, jouable seule contre un ordinateur correct mais battable. Les règles et les barèmes sont ceux de la feuille maison — pas ceux du Yahtzee classique.

## Jouer

Ouvrir l’adresse du jeu dans Safari ou Chrome, puis lancer les dés. Après chaque lancer, toucher les dés à garder et choisir une case éclairée. La partie est sauvegardée automatiquement après chaque action.

Pour essayer le jeu localement sur un ordinateur :

```sh
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans le navigateur.

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

## Publier une mise à jour

Après vérification humaine, enregistrer les changements dans Git puis les pousser sur la branche publiée par GitHub Pages :

```sh
git add .
git commit -m "feat: décrire la mise à jour"
git push
```

GitHub Pages republie ensuite automatiquement le contenu statique. Il n’y a ni compilation, ni commande npm, ni fichier généré à envoyer séparément.
