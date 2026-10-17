# Consignes du projet Paddock Live

- Le projet, les messages de commit et la documentation sont en français.
- **Chaque nouvelle version a son entrée dans `CHANGELOG.md`** : section `## vX.Y.Z — AAAA-MM-JJ`
  en tête du fichier (`— à venir` tant qu'elle n'est pas publiée), nouveautés écrites pour les
  utilisateurs, regroupées par thème (`### …`). Toute modification visible ajoutée à une version
  en préparation y est notée au fil de l'eau.
- Publication : remplacer « à venir » par la date du jour, fusionner la PR, puis lancer le workflow
  « Application de bureau » avec la version (ex. `v1.15.0`). La page de la version reprend la section
  du journal (`scripts/release-notes.mjs`) ; le workflow échoue si elle manque.
- Ne fusionner et publier que lorsque l'utilisateur le demande (« merge et publie »).
- **Modifications du serveur seul, sans nouvelle version de l'appli** : quand une PR ne touche que le serveur des
  statistiques (Worker : `analytics/**`, page du Studio, `scripts/build-studio.mjs`, et les fichiers de `shared/`
  que l'appli n'importe pas, ni directement ni par un autre fichier de `shared/` — vérifier avec
  `grep -rl <fichier> public server shared`), pas d'entrée dans `CHANGELOG.md` ni de
  version : le workflow « Statistiques » déploie le Worker tout seul à chaque push. « Merge et publie » = fusionner la
  PR, sans lancer « Application de bureau ». Dès qu'un fichier de l'appli change (`public/`, `server/`, `desktop/`,
  fichier de `shared/` importé par l'appli), c'est une version normale.
- Avant de pousser : `npm test`.
- **Version anglaise** : tout nouveau texte affiché a sa traduction dans `public/js/i18n-en.js` (clé = texte
  français, `{}` pour les valeurs) ; `node scripts/i18n-missing.mjs` liste ceux qui manquent.
- **Ponytail** (`.claude/skills/ponytail*`, licence MIT, github.com/DietrichGebert/ponytail) : la plus petite
  modification qui règle tout le problème, réutiliser l'existant, rien « pour plus tard ». `/ponytail-review`
  (une modification), `/ponytail-audit` (tout le dépôt), `/ponytail-debt` (raccourcis `shortcut:` en attente).
  Ces consignes priment sur ses règles : réponses, rapports et commentaires en français, journal et
  traductions anglaises toujours tenus.
