# Consignes du projet F1 Dash

- Le projet, les messages de commit et la documentation sont en français.
- **Chaque nouvelle version a son entrée dans `CHANGELOG.md`** : section `## vX.Y.Z — AAAA-MM-JJ`
  en tête du fichier (`— à venir` tant qu'elle n'est pas publiée), nouveautés écrites pour les
  utilisateurs, regroupées par thème (`### …`). Toute modification visible ajoutée à une version
  en préparation y est notée au fil de l'eau.
- Publication : remplacer « à venir » par la date du jour, fusionner la PR, puis lancer le workflow
  « Application de bureau » avec la version (ex. `v1.15.0`). La page de la version reprend la section
  du journal (`scripts/release-notes.mjs`) ; le workflow échoue si elle manque.
- Ne fusionner et publier que lorsque l'utilisateur le demande (« merge et publie »).
- Avant de pousser : `npm test`.
