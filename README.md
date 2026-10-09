# 🏁 F1 Dash

Dashboard **Formule 1 en direct** à lancer sur votre PC pour suivre chaque Grand Prix, **calé sur le délai de votre diffusion TV** (Canal+, myCANAL…).

![Sessions](https://img.shields.io/badge/course%20%C2%B7%20qualifs%20%C2%B7%20essais-e10600) ![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933)

## Ce que vous avez à l'écran

| Zone | Contenu |
|---|---|
| **Bandeau** | Bandeau pleine largeur, visible de loin, sous **drapeau rouge, SC, VSC**, drapeau jaune, et à la reprise. |
| **En-tête** | Grand Prix et session, **drapeau / état de la piste** (vert, jaune, SC, VSC, rouge, damier), tour en cours ou partie de qualif (Q1/Q2/Q3), temps restant, météo, **délai**. |
| **Classement** | Position (+ places gagnées depuis la grille), écart au leader, intervalle (en vert si le pilote revient), dernier et meilleur tour, secteurs et **mini-secteurs** (violet / vert / jaune), pneus + âge, nombre d'arrêts, speed trap. Étiquettes : STAND, SORTIE, ARRÊT, ABD, drapeau bleu, DRS. En qualif, la ligne rouge pointillée marque la limite d'élimination, avec le **temps à battre** et les pilotes en danger, et la colonne **Tour en cours** donne le temps prévu d'un tour lancé et la position visée. Changements de place surlignés en vert ou rouge, **favoris** : cliquez sur l’étoile ☆ à côté du nom (visible au survol de la ligne). Colonnes au choix. |
| **Circuit** | Tracé réel du circuit dessiné comme une piste (asphalte, bordures, ombre, largeur adaptée à la taille de la carte et au zoom), **numéros de virage**, ligne de départ en damier et flèche du sens de course, voitures avec **position + trigramme** (étiquettes placées pour ne pas se chevaucher) et **traînée** montrant direction et vitesse, **secteurs S1/S2/S3 et micro-secteurs** du chronométrage. Le menu **Calques** regroupe les éléments affichables (noms, traînées, virages, secteurs, numéros des micro-secteurs en zoom, zones, fond texturé — mémorisés d'une session à l'autre) ; boutons + / − / vue d'ensemble en bas à droite. On y voit aussi : **secteurs de commissaires sous drapeau jaune ou double jaune** (fanion sur la carte + légende : virages, secteur et micro-secteurs concernés), **carte entièrement rouge sous drapeau rouge**, **safety car** (piste orange, voiture de sécurité placée devant le leader — position estimée, « rentre à la fin du tour ») et **VSC** (piste en pointillés défilants), **zones « ligne droite »** (straight mode, pointillés verts « LD ») et **ligne de détection du mode dépassement** (rose) — estimées à partir de la télémétrie d'une séance du circuit (portions longues et rectilignes passées à fond ; détection ≈ entrée des stands, où la FIA place en général la ligne SC 1), la FIA ne les publiant pas sous forme de données (case « Zones LD / détection »), **secteurs de commissaires estimés** sur les tracés reconstruits par GPS, **toutes les voitures en mouvement** (GPS). **Zoom** à la molette, déplacement à la souris, **Suivre** pour centrer la carte sur le pilote sélectionné. |
| **Duel** | Choisissez 2 pilotes (boutons **A** / **B** du classement) : **écart en temps réel** (GPS, mis à jour en continu) et écart officiel, **tendance** (« X revient à −0,32 s/tour, rattrapage estimé dans ~6 tours »), graphique de l'écart en direct et à chaque tour (arrêts aux stands marqués), comparaison tour / secteurs / pneus / speed trap, derniers tours côte à côte, **courbe de rythme** des deux pilotes, télémétrie, photos. Boutons ⬆ / ⬇ : **duel automatique** contre la voiture de devant ou de derrière, qui suit les dépassements. |
| **Stands (simulateur)** | « Si X s'arrête maintenant, il ressort **P8, 1,2 s derrière Y** ». Utilise le temps perdu au stand du circuit (normal, SC ou VSC selon la situation), modifiable. |
| **Bagarres** | Toutes les paires à moins de 1,5 s, triées par écart, avec la tendance (« se rapproche de −0,2 s/tour ») et un bouton pour ouvrir le duel. |
| **Direction de course** | Tous les messages de la FIA avec drapeaux, pénalités, enquêtes, limites de piste… Les drapeaux bleus et les temps supprimés peuvent être masqués. |
| **Enquêtes** | Suivi de chaque incident signalé par les commissaires : noté → sous enquête → après la course → décision (pénalité, avertissement, pas d'action), avec les pilotes, le virage, le motif traduit et l'historique. Chaque sanction indique le pilote pénalisé, et un lien ouvre le document officiel de la FIA (convocation, décision) dès qu'il est publié sur fia.com. Pastille orange = enquêtes en cours. |
| **Limites de piste** | Tours / temps supprimés par pilote (virages concernés, dernier tour), drapeau noir et blanc et pénalités ; infractions matérialisées par des pastilles. |
| **Analyse** (inspiré de MultiViewer) | **Race trace** (écart de chaque pilote tour par tour : au leader, au rythme moyen ou à un pilote choisi ; arrêts marqués d'un point), **positions** tour par tour, **temps au tour** (seuil des tours lents réglable, 101 à 115 % du meilleur tour), **rythme** (boîte à moustaches des tours propres de chaque pilote, triée par médiane, et top 20 des tours les plus rapides), **historique des pneus** (tous les tours de chaque pilote colorés selon le pneu), **secteurs et vitesses** (meilleurs secteurs, tour idéal, vitesses aux intermédiaires et au speed trap, tri par colonne) et **télémétrie** du pilote suivi. Survol : valeurs de tous les pilotes pour le tour pointé. Bouton **⤓ PNG** pour enregistrer un graphique en image. |
| **Transcriptions** | Onglet dédié : chaque radio d'équipe **retranscrite en texte et traduite** (français, espagnol, allemand, italien ou anglais d'origine), avec le texte original en dessous et un bouton ▶ pour l'écouter. Tout est exécuté sur votre ordinateur. **Qualité haute** (automatique avec une carte graphique) : Whisper large-v3-turbo pour la transcription et un modèle de langage (Qwen3-4B-Instruct) pour la traduction, qui connaît le contexte F1 (« box » → « rentre aux stands », « copy » → « reçu », erreurs d'écoute corrigées) ; ~4,5 Go téléchargés une seule fois. **Qualité légère** (processeur) : Whisper base.en + OPUS-MT, ~130 Mo, plus approximative. Choix dans « Qualité » (Auto / Haute / Légère). |
| **Radios** | Radios d'équipe officielles, filtrables (favoris, pilotes du duel), avec **lecture automatique** des nouvelles radios au rythme de votre délai (une seule fenêtre joue le son). |
| **Arrêts** | Résumé (arrêt le plus rapide, médiane), vue chronologique (pneus retirés → montés, voie des stands et immobilisation avec barres de comparaison) ou par pilote (relais et arrêts). Les passages sans changement de pneus (drapeau rouge) sont distingués. |
| **Télémétrie** | Vitesse, rapport, régime, accélérateur, frein (et DRS avant 2026) du pilote suivi, avec la courbe de vitesse des 30 dernières secondes. |
| **Pneus** | Stratégie complète de chaque pilote (relais, gommes, nombre de tours), **rythme** du relais en cours et **usure** (évolution du temps au tour, en s/tour). |
| **Météo / Championnat** | Station météo du circuit ; projection du championnat en direct pendant les courses. |

### 🏆 Espace Saison

Le bouton 🏆 en haut ouvre une vue de toute la saison (inspirée de formula1dashboard.com, données Jolpica/Ergast, consultables hors ligne une fois chargées), avec un sélecteur d'année :

- **Accueil** : compte à rebours jusqu'à la prochaine séance, avancement de la saison, leaders des championnats, dernier vainqueur et top 10.
- **Calendrier** : toutes les manches (sprint, terminé / prochain / à venir), vainqueur et poleman, horaires de chaque séance à l'heure de votre ordinateur.
- **Classements** : courbe des points cumulés du top 10 et classements pilotes / constructeurs complets avec écart au leader.
- **Résultats & records** : plus de victoires, podiums, poles, meilleure moyenne, plus belle remontée, victoires les plus larges et les plus serrées, et le podium de chaque Grand Prix.
- **Coéquipiers** : duel en qualifications et en course, points, victoires, podiums, poles, arrivées dans les points et abandons.

**Statistiques détaillées** (analyse des archives officielles F1 Live Timing de chaque Grand Prix : la première fois environ 2 s par course, puis conservées sur le PC) :

- **Pilotes** : fiche complète par pilote (victoires, podiums, poles, meilleurs tours, points par course, moyennes au départ et à l'arrivée, places gagnées, duel qualif face au coéquipier, vitesse de pointe, temps d'arrêt moyen, régularité), graphique départ / arrivée course par course et tableau de toutes ses courses.
- **Régularité** : écart-type des tours « propres » (hors 1er tour, arrêts, safety car / VSC et tours anormalement lents), classement des plus réguliers, rythme de course (écart au plus rapide), carte thermique par Grand Prix et régularité des résultats.
- **Arrêts aux stands** : temps d'immobilisation officiels, médiane par écurie, 15 arrêts les plus rapides, arrêts sous 2,5 s, temps dans la voie des stands par Grand Prix.
- **Vitesses de pointe** : speed trap, ligne d'arrivée ou intermédiaires ; classement des écuries et des pilotes, carte thermique écurie × Grand Prix.
- **Profil des circuits** : tracé, longueur, virages, tours et distance, meilleur tour et vitesse moyenne, vitesse de pointe, arrêts, voie des stands, dépassements en piste estimés et part des tours neutralisés, avec jauges comparant les circuits (tri au choix).

## 🔔 Alertes

Son, message et notification Windows en option pour : SC, VSC, drapeau rouge, reprise, meilleur tour, arrêt ou message de la direction de course concernant **vos pilotes favoris**, abandons, arrivée. Elles sont déclenchées **au rythme de votre délai**, donc au moment où l'image passe à la TV et jamais avant. Réglages dans ⚙ ; touche `M` pour couper le son.

## 🎙 Commentaires en direct (F1 TV Pro)

Le bouton **🎙** (en haut à droite) lit le son de la vidéo F1 TV de la séance affichée — en direct ou en rediffusion — avec votre abonnement **F1 TV Pro** (connexion dans ⚙ Réglages, la même que pour le GPS) :

- **Canal** : « International » (commentaires TV, plusieurs langues) ou « F1 Live » (émission F1 TV) ; **langue** au choix parmi celles du flux (français, anglais, allemand, espagnol, néerlandais, portugais…).
- **Volume**, **🔇 couper le son** (ou touche **C**), **▶ / ⏹**.
- **Caler sur le dashboard** : le son est automatiquement positionné sur l'instant affiché par le dashboard (donc sur le délai Canal+), grâce à l'horodatage du flux ; **« Décalage du son »** pour affiner à l'oreille.
- Seul le son est téléchargé (pas la vidéo).
- **Abonnement requis : F1 TV Pro.** Avec F1 TV Access (seule offre proposée dans certains pays, dont la France), F1 TV refuse la vidéo (« technical package not available ») : l'offre détectée est affichée dans ⚙ Réglages.
- **Flux protégés (DRM Widevine)** : l'application Windows utilise Electron castlabs, qui contient le module Widevine (téléchargé au premier lancement). Si F1 TV refuse la licence, c'est qu'il exige une application **certifiée VMP** : voir « Signature VMP » ci-dessous ; en attendant, le lien « Ouvrir le dashboard dans le navigateur » du panneau 🎙 ouvre le dashboard dans Chrome/Edge (certifiés), l'application restant ouverte.
- La ligne d'état indique précisément ce qui se passe (format du flux, protection DRM, erreur F1 TV…). Si F1 TV protège le flux par DRM (Widevine), l'application Windows actuelle ne peut pas le lire : ouvrez alors le dashboard dans Chrome ou Edge (http://127.0.0.1:3000, l'application restant ouverte).

### 📻 Radio / flux audio

Dans le panneau 🎙, choisissez **« Radio / flux audio »** pour écouter la station de votre choix (par exemple une radio qui commente la course dans votre langue) :

- **＋ Ajouter** : nom, langue et adresse du flux (MP3/AAC, HLS `.m3u8`, listes `.pls` / `.m3u`) — les stations sont mémorisées ; 🗑 pour en supprimer une.
- **Retarder du délai du dashboard** : la radio étant en avance sur la TV, le son est automatiquement retardé du délai Canal+ réglé dans le dashboard (jusqu'à 170 s) ; **« Décalage du son »** pour affiner à l'oreille (la radio a elle-même quelques secondes de retard).
- Même volume, **🔇 / touche C** et **▶ / ⏹** que pour F1 TV.

#### Signature VMP (pour les flux DRM de F1 TV)

Les serveurs de licence Widevine exigent souvent une application signée « VMP ». La signature est faite automatiquement à la compilation (GitHub Actions) avec le service gratuit **castlabs EVS**, une fois ces deux étapes faites (une seule fois) :

1. Créer un compte EVS (Python requis) : `python -m pip install --upgrade castlabs-evs` puis `python -m castlabs_evs.account signup` (nom de compte, e-mail, mot de passe, puis code reçu par e-mail).
2. Dans GitHub : dépôt → **Settings → Secrets and variables → Actions → New repository secret**, ajouter `EVS_ACCOUNT_NAME` (nom du compte) et `EVS_PASSWD` (mot de passe).

Les versions publiées ensuite seront signées (le journal de compilation affiche « [vmp] signature de … »).

## 🧩 Disposition et deux écrans

La disposition est entièrement libre et conservée d'une session à l'autre :

- **Déplacer un panneau** : attrapez sa poignée **⠿** (en haut à droite du panneau) et déposez-le sur un autre panneau — à gauche ou à droite (nouvelle colonne), au-dessus ou en dessous (même colonne), ou au centre pour **échanger** les deux.
- **Redimensionner** : glissez les espaces entre les colonnes ou entre les panneaux (double-clic : partage égal).
- **⤢ agrandir** un panneau (Échap pour revenir), **✕ masquer** (réaffichable dans ⚙ → Affichage, avec les colonnes du classement).
- **⟲ Réinitialiser l'interface** (bouton en haut à droite) : disposition, panneaux masqués, colonnes et fenêtres secondaires reviennent à l'état par défaut.
- **↗ envoyer vers une autre fenêtre** (second écran) : si une fenêtre secondaire est déjà ouverte, un menu propose d'**ajouter le panneau à cette fenêtre** (plusieurs panneaux réunis dans une seule fenêtre) ou d'en ouvrir une nouvelle. Dans la fenêtre secondaire, les panneaux se disposent et se redimensionnent de la même façon ; **↙** remet un panneau dans la fenêtre principale. Les panneaux détachés disparaissent de la fenêtre principale et y reviennent quand on ferme leur fenêtre. Dans l'application Windows, la fenêtre s'ouvre directement en plein écran sur le second écran.
- Le délai, le pilote suivi (clic dans le classement → télémétrie, carte…), le duel et les réglages restent synchronisés entre toutes les fenêtres.
- Le classement s'agrandit pour occuper toute la hauteur disponible (désactivable dans ⚙ → Affichage).
- **Thème** : Noir (par défaut, fonds noirs neutres) ou Bleu nuit, dans ⚙ → Affichage.
- **Logos des écuries** : dans le classement et le championnat, chaque pilote a le logo officiel de son écurie sur une pastille à ses couleurs (logos chargés depuis formula1.com ; sans connexion, la pastille reste colorée). Option dans ⚙ → Affichage pour revenir aux barres de couleur.
- **Couleurs d'équipe contrastées** : une teinte bien distincte par équipe (bleu roi Red Bull, lavande Racing Bulls, bleu ciel Williams, rose Alpine, blanc Haas, gris Audi, or Cadillac…) au lieu des couleurs officielles, trop proches entre elles. Décochez l'option dans ⚙ → Affichage pour revenir aux couleurs officielles.
- **Application Windows** : à la fermeture, les fenêtres détachées (panneaux, position, taille, plein écran) sont mémorisées et rouvertes à leur place au prochain lancement. Option « Rouvrir les fenêtres détachées » dans ⚙ → Affichage. Une fenêtre placée sur un écran qui n'est plus branché rouvre sur l'écran principal.

## ⏱ Se caler sur le délai de Canal+

Le flux de chronométrage F1 arrive **avant** l'image TV. Le dashboard garde tout l'historique en mémoire et vous montre la course **telle qu'elle était il y a N secondes** : chronos, carte, drapeaux, duels, radios, tout est décalé ensemble.

- **Synchro TV (recommandé)** : cliquez sur **🎯 Synchro TV** (ou touche `S`). La fenêtre liste en temps réel les repères qui viennent de se produire : changement de tour du leader, drapeaux, SC, entrées aux stands, messages de la direction de course. Au moment **exact** où vous voyez l'un d'eux sur votre TV, cliquez **« Je le vois ! »** : le délai est calculé automatiquement.
  - Le plus précis : le **compteur de tours** qui change à l'écran (le leader franchit la ligne), ou l'extinction des feux.
  - **Anti-spoiler** : les événements pas encore visibles à la TV (pénalités, abandons, entrées aux stands…) sont masqués dans cette liste. Seuls les changements de tour restent affichés. Une case permet d'afficher le détail.
- **Réglage manuel** : boutons −5 / −1 / −0,1 / +0,1 / +1 / +5, saisie directe (ex. `42,5`), molette de la souris sur la valeur, ou clavier : `←` `→` ±1 s, `Maj` ±5 s, `Alt` ±0,1 s.
- **Préréglages** : enregistrez votre délai calibré (« Canal+ salon », « myCANAL PC »…) pour le retrouver en un clic la prochaine fois. Les deux préréglages Canal+ fournis ne sont que des **points de départ indicatifs** : le retard réel dépend de votre équipement (box, satellite, TNT, appli, navigateur) ; calibrez-le une fois avec la synchro TV.

Le délai peut aller jusqu'à 10 minutes (modifiable avec `MAX_DELAY_SECONDS`). Si vous augmentez le délai juste après avoir lancé le dashboard, un ⚠ vous signale qu'il n'y a pas encore assez d'historique : l'affichage devient exact dès que ce délai est écoulé. **Astuce : lancez le dashboard quelques minutes avant la session.**

## 🚀 Installation

### Option A : application Windows (sans rien installer d'autre)

Dans votre dépôt GitHub : onglet **Actions** → **Application de bureau** → **Run workflow**. Au bout de quelques minutes, téléchargez l'artefact **F1-Dash-Windows** : il contient un installateur et une version **portable** (`.exe`). Pousser un tag `v1.1.0` crée aussi une *Release* avec ces fichiers. Les données (réglages, enregistrements) sont stockées dans votre profil Windows.

> Windows peut afficher un avertissement SmartScreen car l'application n'est pas signée : « Informations complémentaires » → « Exécuter quand même ».

#### 🔄 Mise à jour automatique (installateur et version portable)

L'application vérifie les nouvelles versions au démarrage puis toutes les 6 h. Quand une version sort, elle la télécharge en arrière-plan et vérifie son empreinte SHA-256. Elle l'installe ensuite **à la fermeture de l'appli**, ou tout de suite avec le bouton « Redémarrer ». La version installée relance l'installateur en mode silencieux ; la version portable remplace son propre `.exe`. Réglages : ⚙ → *Mises à jour de l'application*.

Les versions sont lues sur les *Releases* de ce dépôt (public) : rien à configurer. Chaque version publiée (Actions → *Application de bureau* → *Run workflow* avec « Version à publier », ou tag `v*`) est proposée automatiquement à toutes les applis installées, à partir de la v1.2.1.

### Option B : avec Node.js

1. Installez **[Node.js](https://nodejs.org)** (version LTS, 18 ou plus).
2. Téléchargez ce dépôt (bouton *Code → Download ZIP*, puis décompressez) ou clonez-le.
3. Lancez :
   - **Windows** : double-cliquez sur **`Lancer F1 Dash.bat`** (installe tout au premier lancement et ouvre le navigateur).
   - **macOS / Linux** : `./start.sh`
   - ou manuellement : `npm install` puis `npm start`, et ouvrez <http://localhost:3000>.

Laissez la fenêtre du serveur ouverte pendant que vous regardez la course.

## 📡 Positions GPS en live : jeton F1 TV (optionnel)

Depuis 2025, la F1 réserve **les positions GPS et la télémétrie du flux live aux abonnés F1 TV**. Tout le reste (chronos, secteurs, écarts, drapeaux, direction de course, météo, radios, pneus…) est accessible sans compte.

- **Sans jeton** : la carte affiche des **positions estimées** à partir des passages aux mini-secteurs du chronométrage (indiqué « Positions estimées » en orange). Pour chaque circuit, le dashboard **calibre automatiquement** l'emplacement réel des boucles de chronométrage à partir de la dernière session archivée sur ce circuit (qui contient le GPS). Précision mesurée à Monza : ~1 % du tour en médiane (~55 m). Pour le duel, l'écart affiché est alors l'écart officiel.
- **Avec un abonnement F1 TV, dans l'application Windows** : ⚙ Réglages → **🔐 Se connecter à F1 TV**. Une fenêtre formula1.com s'ouvre ; une fois connecté, le jeton est récupéré automatiquement (et la session est mémorisée pour les fois suivantes).
- **Avec un abonnement F1 TV, dans le navigateur** : ⚙ Réglages → glissez le bouton **« 📡 F1 Dash : récupérer mon jeton »** dans votre barre de favoris, puis cliquez dessus quand vous êtes connecté sur formula1.com. Si le site empêche la lecture du cookie, collez manuellement la valeur du cookie `login-session` (instructions détaillées dans la fenêtre). La carte passe en **GPS** (vert), l'écart du duel devient continu et la télémétrie s'affiche. Le jeton reste sur votre PC (`config.json`) et expire au bout de quelques jours.

Vous pouvez aussi le fournir au démarrage : `F1TV_TOKEN=... npm start`.

## 💾 Enregistrements et ⏪ replay

Chaque session suivie en live est **enregistrée automatiquement** sur votre PC (`recordings/`). Si le dashboard redémarre en pleine course, l'historique est rechargé et le délai reste exact. Les enregistrements se rejouent depuis ⚙ → *Mes enregistrements*, sans attendre l'archive officielle.

⚙ Réglages → *Replay* : choisissez une saison, un Grand Prix et une session (essais, qualifs, sprint, course). Les archives officielles contiennent **toujours le GPS et la télémétrie**. Une barre de lecture permet pause (`Espace`), avance/retour de 10 s ou 60 s, **vitesse ×0,5 à ×8**, et saut au départ. Le délai et la synchro TV fonctionnent aussi en replay, ce qui est pratique pour suivre une rediffusion.

## ⚙ Options

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port de l'interface |
| `HOST` | `127.0.0.1` | Mettez `0.0.0.0` pour ouvrir le dashboard depuis une tablette ou un autre PC du réseau local (`http://IP-du-PC:3000`) |
| `MAX_DELAY_SECONDS` | `600` | Délai maximum réglable |
| `F1TV_TOKEN` | — | Jeton F1 TV (sinon via l'interface) |
| `F1DASH_DATA_DIR` | dossier du projet | Où ranger `config.json`, `.cache/` et `recordings/` |
| `NO_RECORDING` | — | Mettez `1` pour ne pas enregistrer les sessions live |

## 🔧 Fonctionnement

```
livetiming.formula1.com ──SignalR──▶ serveur Node local ──WebSocket──▶ navigateur
 (flux officiel F1)                  (historique horodaté,            (état reconstruit à
                                      délai propre à chaque onglet)    « maintenant − délai »)
```

- `server/live.js` : client du flux officiel F1 Live Timing (SignalR Core).
- `server/hub.js` : conserve tous les messages horodatés et envoie à chaque navigateur l'état à *maintenant − délai*. Augmenter le délai reconstruit l'état passé ; le réduire fait avancer le flux.
- `server/replay.js` : rejoue les archives officielles ou vos enregistrements comme un live (vitesse variable).
- `server/recorder.js` : enregistrement du flux live sur disque et relecture.
- `server/circuits.js` + `shared/calibrate.js` : tracés et calibration automatique des boucles de chronométrage.
- `desktop/` : application de bureau Electron (serveur intégré).
- `shared/` : fusion des mises à jour du flux et données dérivées (historique par tour, arrêts, repères de synchro), communs au serveur et au navigateur.
- `public/` : l'interface (JavaScript sans étape de build). Le GPS est recalé sur l'horloge officielle du flux, car il arrive environ 2 s après les chronos. Ainsi carte, chronos et TV restent alignés.
- Tracés des circuits : API publique MultiViewer (mise en cache dans `.cache/`). Pour un circuit absent de cette base (nouveau tracé), le tracé est reconstruit automatiquement à partir du GPS du meilleur tour d'une session archivée.

Tests : `npm test` (lancés aussi automatiquement sur GitHub à chaque modification).

> Projet non officiel, sans lien avec la Formula 1, la FIA ou Canal+. Les données proviennent du flux public F1 Live Timing et sont destinées à un usage personnel.

 [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/X6Y427QAUT)
