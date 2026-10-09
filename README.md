# ELCO — Les femmes dans le BTP au Sénégal

Application web statique (HTML/CSS/JS, sans dépendance ni build) : roulette de questions, neuf modes + « Tous les thèmes », mode tournage, historique, administration.

## Lancer en local
```
node serve.mjs
```
puis http://localhost:5173

## Publier
Déposer le dossier sur n'importe quel hébergement statique (GitHub Pages, Netlify…). Fonctionne hors ligne après le premier chargement.

## Fichiers
- `data.js` : banque d'origine (thématiques, modes, questions).
- `app.js`, `styles.css`, `index.html`, `sw.js`, `manifest.webmanifest`, `logo.webp`, `icon.svg`.

## Données locales
Navigateur uniquement : `elco.v2.bank` (questions modifiées), `elco.v2.session`, `elco.v2.sessions` (historique), préférences de fond et de sons.
L'administration n'a pas de mot de passe (aucun serveur).

## Raccourcis
Espace/Entrée lancer · N suivante · P passer · M micro · H historique · Échap quitter le tournage.

## Aperçu direct
`?mode=flash&vue=question|roulette|mode|tournage&fond=blanc|sombre`
