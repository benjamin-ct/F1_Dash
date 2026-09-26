# 🏁 F1 Dash

Dashboard **Formule 1 en direct** à lancer sur votre PC pour suivre chaque Grand Prix, **calé sur le délai de votre diffusion TV** (Canal+, myCANAL…).

![Sessions](https://img.shields.io/badge/course%20%C2%B7%20qualifs%20%C2%B7%20essais-e10600) ![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933)

## Ce que vous avez à l'écran

| Zone | Contenu |
|---|---|
| **En-tête** | Grand Prix et session, **drapeau / état de la piste** (vert, jaune, SC, VSC, rouge, damier), tour en cours ou partie de qualif (Q1/Q2/Q3), temps restant, météo, **délai**. |
| **Classement** | Position (+ places gagnées depuis la grille), écart au leader, intervalle (en vert si le pilote revient), dernier et meilleur tour, secteurs et **mini-secteurs** (violet / vert / jaune), pneus + âge, nombre d'arrêts, speed trap. Étiquettes : STAND, SORTIE, ARRÊT, ABD, drapeau bleu, DRS. En qualif, la ligne rouge pointillée marque la limite d'élimination. |
| **Circuit** | Tracé réel du circuit, numéros de virage, ligne de départ, **secteurs sous drapeau jaune ou double jaune**, piste colorée sous SC/VSC ou drapeau rouge, **toutes les voitures en mouvement** (GPS). |
| **Duel** | Choisissez 2 pilotes (boutons **A** / **B** du classement) : **écart en temps réel** (GPS, mis à jour en continu) et écart officiel, **tendance** (« X revient à −0,32 s/tour, rattrapage estimé dans ~6 tours »), graphique de l'écart en direct et à chaque tour (arrêts aux stands marqués), comparaison tour / secteurs / pneus / speed trap, derniers tours côte à côte, télémétrie des deux voitures. |
| **Direction de course** | Tous les messages de la FIA avec drapeaux, pénalités, enquêtes, limites de piste… |
| **Radios** | Radios d'équipe officielles, à écouter directement. |
| **Arrêts** | Temps passé dans la voie des stands, et immobilisation quand la F1 la publie. |
| **Télémétrie** | Vitesse, rapport, régime, accélérateur, frein (et DRS avant 2026) du pilote suivi, avec la courbe de vitesse des 30 dernières secondes. |
| **Pneus** | Stratégie complète de chaque pilote (relais, gommes, nombre de tours). |
| **Météo / Championnat** | Station météo du circuit ; projection du championnat en direct pendant les courses. |

## ⏱ Se caler sur le délai de Canal+

Le flux de chronométrage F1 arrive **avant** l'image TV. Le dashboard garde tout l'historique en mémoire et vous montre la course **telle qu'elle était il y a N secondes** : chronos, carte, drapeaux, duels, radios, tout est décalé ensemble.

- **Synchro TV (recommandé)** : cliquez sur **🎯 Synchro TV** (ou touche `S`). La fenêtre liste en temps réel les repères qui viennent de se produire : changement de tour du leader, drapeaux, SC, entrées aux stands, messages de la direction de course. Au moment **exact** où vous voyez l'un d'eux sur votre TV, cliquez **« Je le vois ! »** : le délai est calculé automatiquement.
  - Le plus précis : le **compteur de tours** qui change à l'écran (le leader franchit la ligne), ou l'extinction des feux.
- **Réglage manuel** : boutons −5 / −1 / −0,1 / +0,1 / +1 / +5, saisie directe (ex. `42,5`), molette de la souris sur la valeur, ou clavier : `←` `→` ±1 s, `Maj` ±5 s, `Alt` ±0,1 s.
- **Préréglages** : enregistrez votre délai calibré (« Canal+ salon », « myCANAL PC »…) pour le retrouver en un clic la prochaine fois. Les deux préréglages Canal+ fournis ne sont que des **points de départ indicatifs** : le retard réel dépend de votre équipement (box, satellite, TNT, appli, navigateur) ; calibrez-le une fois avec la synchro TV.

Le délai peut aller jusqu'à 10 minutes (modifiable avec `MAX_DELAY_SECONDS`). Si vous augmentez le délai juste après avoir lancé le dashboard, un ⚠ vous signale qu'il n'y a pas encore assez d'historique : l'affichage devient exact dès que ce délai est écoulé. **Astuce : lancez le dashboard quelques minutes avant la session.**

## 🚀 Installation

1. Installez **[Node.js](https://nodejs.org)** (version LTS, 18 ou plus).
2. Téléchargez ce dépôt (bouton *Code → Download ZIP*, puis décompressez) ou clonez-le.
3. Lancez :
   - **Windows** : double-cliquez sur **`Lancer F1 Dash.bat`** (installe tout au premier lancement et ouvre le navigateur).
   - **macOS / Linux** : `./start.sh`
   - ou manuellement : `npm install` puis `npm start`, et ouvrez <http://localhost:3000>.

Laissez la fenêtre du serveur ouverte pendant que vous regardez la course.

## 📡 Positions GPS en live : jeton F1 TV (optionnel)

Depuis 2025, la F1 réserve **les positions GPS et la télémétrie du flux live aux abonnés F1 TV**. Tout le reste (chronos, secteurs, écarts, drapeaux, direction de course, météo, radios, pneus…) est accessible sans compte.

- **Sans jeton** : la carte affiche des **positions estimées** à partir des passages aux mini-secteurs du chronométrage (indiqué « Positions estimées » en orange). Précision typique : quelques centaines de mètres. Pour le duel, l'écart affiché est alors l'écart officiel.
- **Avec un abonnement F1 TV** : ⚙ Réglages → collez la valeur du cookie `login-session` de formula1.com (instructions détaillées dans la fenêtre). La carte passe en **GPS** (vert), l'écart du duel devient continu et la télémétrie s'affiche. Le jeton reste sur votre PC (`config.json`) et expire au bout de quelques jours.

Vous pouvez aussi le fournir au démarrage : `F1TV_TOKEN=... npm start`.

## ⏪ Replay

⚙ Réglages → *Replay* : choisissez une saison, un Grand Prix et une session (essais, qualifs, sprint, course). Les archives officielles contiennent **toujours le GPS et la télémétrie**. Une barre de lecture permet pause (`Espace`), avance/retour de 10 s ou 60 s, et saut au départ. Le délai et la synchro TV fonctionnent aussi en replay, ce qui est pratique pour suivre une rediffusion.

## ⚙ Options

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port de l'interface |
| `HOST` | `127.0.0.1` | Mettez `0.0.0.0` pour ouvrir le dashboard depuis une tablette ou un autre PC du réseau local (`http://IP-du-PC:3000`) |
| `MAX_DELAY_SECONDS` | `600` | Délai maximum réglable |
| `F1TV_TOKEN` | — | Jeton F1 TV (sinon via l'interface) |

## 🔧 Fonctionnement

```
livetiming.formula1.com ──SignalR──▶ serveur Node local ──WebSocket──▶ navigateur
 (flux officiel F1)                  (historique horodaté,            (état reconstruit à
                                      délai propre à chaque onglet)    « maintenant − délai »)
```

- `server/live.js` : client du flux officiel F1 Live Timing (SignalR Core).
- `server/hub.js` : conserve tous les messages horodatés et envoie à chaque navigateur l'état à *maintenant − délai*. Augmenter le délai reconstruit l'état passé ; le réduire fait avancer le flux.
- `server/replay.js` : rejoue les archives officielles comme un live.
- `shared/` : fusion des mises à jour du flux et données dérivées (historique par tour, arrêts, repères de synchro), communs au serveur et au navigateur.
- `public/` : l'interface (JavaScript sans étape de build). Le GPS est recalé sur l'horloge officielle du flux, car il arrive environ 2 s après les chronos. Ainsi carte, chronos et TV restent alignés.
- Tracés des circuits : API publique MultiViewer (mise en cache dans `.cache/`).

Tests : `npm test`.

> Projet non officiel, sans lien avec la Formula 1, la FIA ou Canal+. Les données proviennent du flux public F1 Live Timing et sont destinées à un usage personnel.
