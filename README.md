# ELCO — La roulette des 100 questions

Site statique (HTML/CSS/JS, aucune dépendance, aucun build, aucune clé API).

## Lancer en local

```
node serve.mjs
```
puis ouvrir http://localhost:5173. (Ouvrir `index.html` directement fonctionne aussi, sans le mode hors-ligne.)

## Publier en ligne (gratuit)

Il suffit d'envoyer **tout le dossier `elco/`** (sauf `serve.mjs` et ce README, facultatifs) :

- **Netlify Drop** : glisser-déposer le dossier sur https://app.netlify.com/drop
- **Vercel / Cloudflare Pages / GitHub Pages** : publier le dossier comme site statique (pas de commande de build, dossier de sortie = racine).

Après le premier chargement, le site fonctionne sans connexion (service worker, HTTPS requis).

## Fichiers

- `questions.js` : les 100 questions et les 8 catégories (données séparées de l'interface). `sensitive: true` affiche « Sujet sensible ».
- `app.js` : roulette, session, relais du micro, historique, mode enregistrement, gestion des questions.
- `styles.css`, `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`.

## Données locales (navigateur)

- `elco.v1.session` : progression, statuts, prénoms. `elco.v1.questions` : banque modifiée dans « Gérer les questions ».
- Les données restent sur l'appareil/navigateur utilisé. L'espace « Gérer » n'a pas de mot de passe (pas de serveur).

## Raccourcis

Espace/Entrée tirer · N tour suivant · P passer · M passer le micro · H historique · Échap quitter le mode enregistrement.
