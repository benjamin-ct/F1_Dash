<img src="public/icon-512.png" alt="Paddock Live" width="84" align="right">

# 🏁 Paddock Live

Dashboard **Formule 1 en direct** pour suivre chaque Grand Prix sur votre ordinateur, **calé sur le délai de votre diffusion TV** (chaîne TV, box, appli de streaming…). Windows, macOS et Linux.

![Paddock Live pendant une séance (replay des qualifications du Grand Prix d'Azerbaïdjan 2026)](docs/screenshots/tableau-de-bord.png)

<sub>Design « Pitwall » en mode sombre. L'application suit par défaut le mode clair ou sombre de l'ordinateur ou du téléphone (voir plus bas).</sub>

## ✨ En bref

- **Classement en direct** : écarts, secteurs et mini-secteurs, pneus, arrêts, vitesse de pointe, logos officiels des écuries dans leurs vraies couleurs ; en qualif, limite d'élimination et temps à battre.
- **Barre d'état de la séance** : drapeau, tour et progression de la course, temps restant, **heure locale du circuit**, météo, état de la piste.
- **Carte du circuit** : toutes les voitures en mouvement (GPS), drapeaux par secteur, safety car, zones ligne droite et détection.
- **Synchro TV** : tout (chronos, carte, drapeaux, radios, alertes) est retardé pour coller à votre image, **sans spoiler** ; le délai peut même se régler tout seul en écoutant la TV (expérimental).
- **Pneus du week-end** : jeux neufs et utilisés de chaque pilote sur toutes les séances, composés choisis par Pirelli et ses préconisations (stratégie attendue).
- **Duels, bagarres et simulateur d'arrêt** : écart en temps réel, tendance, « s'il s'arrête maintenant, il ressort P8 ».
- **Analyse** : race trace, positions, temps au tour, rythme, pneus, secteurs, télémétrie.
- **Direction de course et enquêtes**, avec les documents officiels de la FIA.
- **Radios d'équipe** façon MultiViewer : photo du pilote, écoute avec progression, chaque radio retranscrite et traduite en français (par le serveur Paddock Live, ou sur votre ordinateur) ; en expérimental, toutes les radios captées sur le son des caméras embarquées F1 TV.
- **Commentaires F1 TV Pro** ou radio de votre choix, synchronisés sur le dashboard.
- **Espace Actu** : toute l'actualité de la F1 au même endroit (F1, FIA, chaînes officielles des écuries et des pilotes, une trentaine de médias en 8 langues), traduite en français, regroupée par sujet, avec alertes et anti-spoiler.
- **Espace Saison** : calendrier, classements, notes des pilotes (S à F), écart en qualification entre coéquipiers, statistiques par pilote, régularité, arrêts, vitesses, profils des circuits, évolutions techniques et éléments moteur (documents FIA).
- **Replays** de toutes les sessions archivées, avec les **moments clés** cliquables (départ, drapeaux, leaders, arrêts, incidents, pénalités), disposition libre des panneaux, second écran.
- **Mini-classement flottant** toujours au premier plan, à poser par-dessus la vidéo de la course.
- **Résultats** et **résumé** de la séance en cartes (podium, remontées, stratégies, neutralisations, classement complet), **radar de la pluie** autour du circuit, **rappels** avant chaque séance et **calendrier** à ajouter à votre agenda.
- **Pronostics entre amis** (pole et podium) avec classement de la saison, et **lumières connectées** (Philips Hue, Home Assistant) aux couleurs des drapeaux, en expérimental.
- **En français ou en anglais** (Réglages → Affichage → Langue / Language).
- **Sauvegarde des réglages** dans un fichier, à restaurer après une réinstallation ou sur un autre ordinateur.
- **Sur votre téléphone ou tablette** : l'ordinateur affiche un QR code ; scannez-le pour retrouver le dashboard sur le réseau Wi-Fi de la maison, calé sur le même délai TV.

| | |
|---|---|
| ![Classement](docs/screenshots/classement.png) | ![Carte](docs/screenshots/carte.png) |
| ![Analyse : rythme](docs/screenshots/analyse-rythme.png) | ![Saison : accueil](docs/screenshots/saison-accueil.png) |
| ![Saison : fiche pilote](docs/screenshots/saison-pilote.png) | ![Saison : évolutions techniques](docs/screenshots/saison-evolutions-techniques.png) |
| ![Replay : moments clés](docs/screenshots/moments.png) | ![Résultats de la séance : podium, remontées, stratégies, classement complet](docs/screenshots/resultats.png) |
| ![Saison : course au titre, et quand le titre peut se jouer](docs/screenshots/saison-course-au-titre.png) | ![Saison : duels entre coéquipiers ou pilote contre pilote](docs/screenshots/saison-duels.png) |
| ![Météo : radar de la pluie autour du circuit](docs/screenshots/radar.png) | ![Saison : pronostics entre amis](docs/screenshots/pronostics.png) |
| ![Radios d'équipe retranscrites et traduites](docs/screenshots/radios.png) | ![Analyse : comparaison de deux tours, secteur par secteur](docs/screenshots/analyse-comparaison.png) |

<img src="docs/screenshots/mini-classement.png" alt="Mini-classement flottant, toujours au premier plan" width="380" align="right">

**Mini-classement** (bouton Mini de la barre latérale) : une petite fenêtre toujours au premier plan, à poser sur la vidéo de la course. Positions, intervalle ou écart au leader, pneus, favoris, au rythme de votre délai TV.

<br clear="right">

![Espace Actu : l'actualité de la F1 traduite en français](docs/screenshots/actu.png)

**Mode sombre ou clair** (Réglages → Affichage → Apparence) : automatique par défaut (suit le réglage de l'ordinateur ou du téléphone), ou toujours sombre, ou toujours clair.

![Le design Pitwall en mode sombre et en mode clair](docs/screenshots/apparence.png)

## 🚀 Installation

Téléchargez la dernière version sur la page **[Releases](https://github.com/benjamin-ct/paddock-live/releases/latest)** :

| Système | Fichier | Remarque |
|---|---|---|
| **Windows** | `…-x64-win.exe` (installateur) ou `…-portable.exe` | Avertissement SmartScreen : « Informations complémentaires » → « Exécuter quand même ». |
| **macOS** (Apple Silicon / Intel) | `…-mac-arm64.dmg` / `…-mac-x64.dmg` | Glissez Paddock Live dans Applications. L'appli n'est pas certifiée par Apple : au premier lancement, clic droit → « Ouvrir » (si macOS la dit endommagée : `xattr -cr "/Applications/Paddock Live.app"` dans le Terminal). |
| **Linux** (x64 / ARM) | `…-linux-x86_64.AppImage` / `…-linux-arm64.AppImage`, ou `…-linux-amd64.deb` | AppImage : `chmod +x` puis lancez-la. Paquet : `sudo apt install ./Paddock-Live-…deb`. |

L'application **se met à jour toute seule** (sauf le paquet `.deb`).

**Sans installer l'application** : avec [Node.js](https://nodejs.org) 22 ou plus, téléchargez ce dépôt puis lancez `Lancer Paddock Live.bat` (Windows) ou `./start.sh` (macOS / Linux), ou `npm install && npm start`, et ouvrez <http://localhost:3000>.

## ⏱ Se caler sur la TV

Le flux de chronométrage arrive **avant** l'image TV : le dashboard vous montre la course telle qu'elle était il y a N secondes.

1. Lancez le dashboard quelques minutes avant la session.
2. Cliquez sur **🎯 Synchro TV** (touche `S`), puis **Écouter la TV** : le micro de l'ordinateur reconnaît la prochaine radio d'équipe diffusée et règle le délai tout seul (expérimental). Ou, à la main : au moment où vous voyez un repère sur votre TV (changement de tour, drapeau…), cliquez **« Je le vois ! »**.
3. Enregistrez ce délai en préréglage (« TV du salon »…) pour la prochaine fois.

Ajustement fin : `←` `→` ±1 s, `Maj` ±5 s, `Alt` ±0,1 s.

## 📡 Avec un abonnement F1 TV (optionnel)

Tout fonctionne sans compte. Avec F1 TV, connectez-vous dans ⚙ Réglages pour avoir **les positions GPS exactes et la télémétrie** en direct (sinon les positions sont estimées). **F1 TV Pro** donne en plus les **commentaires en direct** (bouton 🎙).

## 📱 Sur téléphone ou tablette

Sur l'ordinateur : ⚙ Réglages → Application → **« Autoriser l'accès depuis le réseau local »**, puis scannez le QR code avec le téléphone (même Wi-Fi). Le téléphone reprend le délai TV de l'ordinateur et affiche un panneau à la fois, avec des onglets en bas. Pour l'avoir comme une appli : « Ajouter à l'écran d'accueil ». Détails dans le [guide](docs/GUIDE.md#-sur-téléphone-ou-tablette).

![Paddock Live sur téléphone : classement, carte et actualités](docs/screenshots/telephone.png)

## ⌨ Raccourcis

`S` synchro TV · `←` `→` délai (± `Maj` / `Alt`) · `Espace` pause en replay · `M` couper les alertes · `C` couper les commentaires · `Échap` réduire le panneau agrandi

## 📖 Pour aller plus loin

Le **[guide complet](docs/GUIDE.md)** détaille chaque panneau, l'espace Saison, les alertes, les commentaires et la radio, la disposition et le second écran, les replays et enregistrements, les options de lancement et le fonctionnement interne.

Les nouveautés de chaque version sont dans le **[journal des modifications](CHANGELOG.md)** (aussi visible dans l'application : Réglages → Application).

Tests : `npm test`.

**Statistiques anonymes (facultatives)** : au premier lancement, Paddock Live demande s'il peut envoyer des statistiques d'utilisation anonymes (fonctions utilisées, version, système). Ni compte, ni identifiant, ni contenu ; refusable et modifiable à tout moment dans Réglages → Application. Détails dans le [guide](docs/GUIDE.md#-statistiques-dutilisation-anonymes).

> Projet non officiel, sans lien avec la Formula 1, la FIA ni aucun diffuseur TV. Les données proviennent du flux public F1 Live Timing et sont destinées à un usage personnel.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/X6Y427QAUT)
