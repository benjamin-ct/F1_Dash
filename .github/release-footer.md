Application de bureau Paddock Live.

**Windows**
- **Paddock-Live-…-x64-win.exe** : installateur (raccourci « Paddock Live »).
- **Paddock-Live-…-portable.exe** : se lance directement, sans installation.
- Windows peut afficher un avertissement SmartScreen (application non signée) : « Informations complémentaires » → « Exécuter quand même ».

**macOS** (13 Ventura ou plus récent)
- **Paddock-Live-…-mac-arm64.dmg** : Mac Apple Silicon (M1, M2, M3, M4…) ; **…-mac-x64.dmg** : Mac Intel.
- Ouvrir le .dmg et glisser Paddock Live dans Applications. L'appli n'étant pas certifiée par Apple, au premier lancement : clic droit → « Ouvrir », ou si macOS indique qu'elle est endommagée, dans le Terminal : `xattr -cr "/Applications/Paddock Live.app"`.
- Les fichiers .zip servent aux mises à jour automatiques.

**Linux** (x64 ou ARM)
- **Paddock-Live-…-linux-x86_64.AppImage** (ou **…-linux-arm64.AppImage**) : rendre le fichier exécutable (`chmod +x`) puis le lancer ; se met à jour tout seul.
- **Paddock-Live-…-linux-amd64.deb** : paquet Ubuntu / Debian (`sudo apt install ./Paddock-Live-…deb`), à réinstaller pour chaque nouvelle version.

Les applications déjà installées (Windows v1.2.1 ou plus, macOS et AppImage à partir de v1.12.0) se mettent à jour toutes seules à partir de cette page.
