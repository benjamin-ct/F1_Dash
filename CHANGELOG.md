# Journal des modifications

Toutes les nouveautés de F1 Dash, version par version. Chaque nouvelle version publiée doit avoir
sa section ici : elle est reprise telle quelle sur la page de la version (GitHub) et dans
l'application (Réglages → Application → Nouveautés).

## v1.23.1 — 2026-10-14

### Corrections
- **Synchro TV par le son** : si le calcul de reconnaissance ne peut pas démarrer (fichier bloqué, mémoire…), l'écoute ne reste plus figée indéfiniment sur « En écoute ».
- **Pronostics** : un pseudo comme « constructor » ou « __proto__ » est refusé avec un message clair au lieu de faire échouer l'enregistrement.
- Une année invalide demandée à F1 Dash (« 99999 », « 1800 », « 2025.5 ») ouvre la saison en cours au lieu d'afficher une erreur des serveurs de résultats ou de créer une saison vide sur le disque.
- Une requête mal formée envoyée au serveur de F1 Dash est refusée proprement (erreur 400) au lieu de provoquer une erreur interne, y compris pour l'adresse d'une radio en ligne vide ou invalide.
- Sécurité : des données de course ou des traductions contenant des noms réservés du langage JavaScript ne peuvent plus modifier le fonctionnement interne de l'application.

## v1.23.0 — 2026-10-14

### Interface en anglais
- **F1 Dash existe maintenant en anglais** : Réglages → Affichage → **Langue / Language** (Français ou English). Toute l'interface suit : menus, panneaux, légendes, infobulles, graphiques, carte, Saison, Actu, réglages, messages et alertes, mini-classement, téléphone, écran de démarrage de l'application.
- En anglais, les textes rédigés par F1 Dash le sont directement en anglais : résumé de la séance, moments clés du replay, calendrier à ajouter à l'agenda. Les actualités sont traduites en anglais, les radios restent en version originale (anglais) par défaut, et les documents de la FIA et les communiqués de Pirelli s'affichent tels quels.
- Nombres et dates au format anglais (0.5 s, 14 Oct).
- Première ouverture : l'interface prend la langue de l'ordinateur ou du téléphone (français, sinon anglais). Les installations existantes restent en français.

### Arrêts aux stands au plus juste
- **Un passage par les stands n'est plus compté comme un arrêt** quand les pneus ne changent pas : passage imposé par la direction de course sous voiture de sécurité (« tout le monde par la voie des stands »), drive-through… La F1 les compte pourtant comme des arrêts. Le nombre d'arrêts est maintenant juste partout : classement (colonne Arr.), duel, stratégie (le relais n'est plus coupé en deux), résumé de la séance, moments clés du replay, statistiques de la saison (« Arrêts par pilote »). À Bakou 2026, la plupart des pilotes passaient de 2 arrêts affichés à 1, comme en réalité.
- **Simulateur d'arrêt** : le temps perdu au stand est **mesuré pendant la course** sur les vrais arrêts sous drapeau vert (tour d'entrée et tour de sortie comparés aux tours normaux du pilote, un arrêt raté ne faussant pas la mesure), dès que 3 arrêts sont disponibles ; sinon la valeur du circuit. Sous voiture de sécurité ou VSC, la perte est réduite dans la même proportion. L'origine de la valeur est indiquée (« mesuré sur 12 arrêts de la course »).
- Statistiques de la saison : les arrêts sans temps d'immobilisation publié par la F1 sont désormais comptés.

### Replay
- **Barre de lecture sur toute la largeur** : les commandes (±10 s, drapeaux, vitesses, moments clés…) passent sur la ligne du titre, la barre de la séance s'étire d'un bord à l'autre (plus de deux fois plus longue sur un écran d'ordinateur) : placement plus précis, drapeaux et moments mieux séparés.

## v1.22.0 — 2026-10-14

### Synchro TV par le son (expérimental)
- **Le délai se règle tout seul** : dans la fenêtre Synchro TV, bouton **Écouter la TV**. Le micro de l'ordinateur écoute votre TV et, dès qu'une **radio d'équipe** passe à l'antenne, F1 Dash la reconnaît (même avec les commentateurs qui parlent par-dessus) et en déduit le retard exact de votre diffusion. Plus besoin de guetter le compteur de tours pour cliquer au bon moment.
- L'écoute continue ensuite pour confirmer avec les radios suivantes (15 minutes au plus) ; un point clignotant sur le bouton Synchro TV indique qu'elle est en cours.
- **Correction** de ±0,5 s si le calage par le son est toujours un peu en avance ou en retard sur votre image.
- Le son reste sur l'ordinateur : rien n'est enregistré ni envoyé. Disponible dans l'application et le navigateur de l'ordinateur (pas sur le téléphone).

## v1.21.0 — 2026-10-14

### Pendant la course
- **Mini-classement flottant** (bouton Mini de la barre latérale) : petite fenêtre toujours au premier plan, à poser par-dessus la vidéo de la course (F1 TV, Canal+…) : drapeau, tour, classement avec intervalle ou écart au leader, pneus, pilotes suivis et favoris. Même délai TV que la fenêtre principale.
- **Résumé de la séance** (bouton Résumé de la barre latérale) : la course racontée en français — vainqueur et écart, remontées, stratégies, voitures de sécurité, abandons, pénalités, meilleur tour (pole et éliminés en qualifications) — à copier pour le partager. Rien n'est dévoilé en avance : il suit votre délai TV.
- **Radar de la pluie** (onglet Météo) : les deux dernières heures d'images radar autour du circuit, en animation, pour voir la pluie arriver.

### Replays
- **Moments clés** (bouton Moments de la barre de lecture) : départ, drapeaux, changements de leader, dépassements pour le podium, arrêts, abandons, incidents, pénalités, meilleur tour, arrivée — un clic pour y aller, repères de couleur sur la barre. Les moments pas encore vus restent masqués (anti-spoiler).

### Week-ends
- **Rappel avant chaque séance** (Réglages → Alertes) : message, son et notification, de 5 min à 1 h avant (15 min par défaut).
- **Calendrier** : toutes les séances de la saison ou d'un week-end à ajouter à votre agenda (Google, Apple, Outlook), avec une alarme 15 min avant chaque séance, même F1 Dash fermé.
- **Pronostics entre amis** (Saison → Pronostics) : pole et podium de chaque Grand Prix, sur l'ordinateur ou le téléphone, choix cachés jusqu'à la fermeture, points et classement de la saison.

### Lumières connectées (expérimental)
- Vos ampoules **Philips Hue** ou **Home Assistant** prennent la couleur des drapeaux au rythme de votre délai TV (vert, jaune, safety car, VSC, rouge, damier). Mode simulation à l'écran pour essayer sans ampoule. Réglages → Alertes.

### Fluidité
- La carte consomme moins : 30 images par seconde quand elle est petite (60 en grand), et plus aucun calcul pendant une pause du replay.
- Téléphone : tableaux de l'espace Saison plus compacts, colonne du pilote figée pendant le défilement.

## v1.20.2 — 2026-10-14

### Sécurité et fiabilité
- Le serveur ne plante plus sur une adresse mal formée (une seule requête suffisait à arrêter le dashboard).
- Un site web malveillant ouvert dans le navigateur ne peut plus utiliser le dashboard en douce : l'API refuse les requêtes venues d'autres sites et les faux noms de domaine qui pointent vers votre ordinateur (« DNS rebinding »). Cela empêchait notamment de détourner le jeton F1 TV vers un faux domaine imitant formula1.com.
- Le jeton F1 TV n'est envoyé qu'aux vrais domaines de la F1, et le relais vidéo limite les redirections.
- Actualités : les liens et images des flux sont limités aux adresses web ; un flux piégé ne peut plus glisser de lien qui exécute du code. L'application de bureau n'ouvre que des liens web dans le navigateur.
- Une erreur imprévue est consignée sans arrêter le serveur en pleine séance.
- Traductions FIA : l'enregistrement d'une langue n'est plus perdu quand une autre est ajoutée juste après.

### Interface
- Téléphone : les sept onglets de la barre du bas tiennent sur l'écran (« Stratégie » n'est plus coupé).
- Mode clair : le titre « Replay » de la barre de lecture est plus lisible.

## v1.20.1 — 2026-10-14

### Apparence
- L'apparence est désormais **automatique par défaut** : l'application passe en clair ou en sombre comme votre ordinateur ou votre téléphone, et suit ses changements en direct (mode sombre programmé le soir, par exemple). Réglages → Affichage → Apparence pour la forcer en sombre ou en clair ; un choix déjà fait dans les réglages est conservé.
- Application de bureau : la fenêtre s'ouvre directement dans la bonne couleur, sans flash noir en mode clair.

## v1.20.0 — 2026-10-14

### Apparence
- Un seul design pour toute l'application : **Pitwall**. Les anciens designs (F1 Pro, F1 sobre, Classique, Bleu nuit) sont retirés ; si vous en utilisiez un, l'application passe automatiquement sur Pitwall.
- Nouveau **mode clair** : Réglages → Affichage → **Apparence** — Sombre (par défaut), Clair (idéal en plein jour) ou Automatique (suit le réglage de l'ordinateur ou du téléphone). Le changement est immédiat, carte, graphiques et couleurs des pneus compris.

### Carte
- **Petite carte lisible** : quand la carte est petite (tableau de bord, téléphone), elle s'allège automatiquement. Sur une très petite carte, les pilotes deviennent de simples points, et seuls les pilotes suivis sont nommés. Sur une carte moyenne, les pastilles gardent le trigramme, sans numéros de virage, positions ni écarts. Tous les détails reviennent en agrandissant la carte ou en zoomant.
- Le tracé occupe davantage la place disponible sur une petite carte.
- Mode clair : contour et ombre de la piste plus légers.

### Actualités
- Les titres de la colonne de droite (À la une, dernières vidéos) sont eux aussi traduits en français.

## v1.19.0 — 2026-10-14

### Actualités
- Nouvel espace **Actu** (barre latérale, bouton Actu sur téléphone) : toute l'actualité de la F1 au même endroit — site officiel de la F1, communiqués de la FIA, chaînes officielles des écuries et des pilotes, et une trentaine de médias reconnus en 8 langues (Autosport, The Race, BBC, L'Équipe, Marca, La Gazzetta, Motorsport-Total, auto sport web…).
- Titres et résumés traduits en français sur l'ordinateur (même moteur que les radios), texte d'origine en un clic (VO).
- Les articles d'un même sujet sont regroupés (« repris par N sources », pastille quand le sujet fait l'actualité), avec les pilotes et écuries cités en étiquettes.
- Filtres : important, vos favoris, officiel, écuries, pilotes, médias, vidéos, langue, recherche. Pastille rouge du nombre de nouveautés.
- Alertes (son, message, notification) pour les actualités importantes et celles de vos favoris, réglables. Anti-spoiler : titres masqués et alertes suspendues pendant une séance ou un replay.
- Ajout de vos propres sources (site, flux RSS, chaîne YouTube, compte Bluesky) et activation source par source.
- Colonne de droite : sujets à la une (48 h), pilotes et écuries qui font l'actu (24 h, un clic pour ne voir que leurs sujets) et dernières vidéos.

### Design
- Plus aucun emoji ni symbole de police dans l'application : toutes les icônes (menus, boutons, réglages, alertes, carte, téléphone…), les flèches et les triangles des places gagnées ou perdues sont dessinés pour F1 Dash, dans le même style que la barre latérale.
- Nouvelles cases à cocher : interrupteurs aux couleurs du thème pour les options, cases et boutons radio redessinés.
- Téléphone : boutons du haut resserrés pour tenir sur une ligne.
- Animations légères pour une interface plus moderne : panneaux qui apparaissent en cascade au démarrage, fenêtres et menus qui s'ouvrent en douceur, cartes de l'Actu et de la Saison en cascade, cartes qui se soulèvent au survol, boutons qui s'enfoncent au clic, nouvelles actualités surlignées, pastille qui rebondit, onde autour du point du direct. Désactivables dans Réglages, onglet Affichage (« Animations de l'interface »), et coupées automatiquement si le système demande moins d'animations.

## v1.18.0 — 2026-10-14

### Nouveau design « Pitwall »
- Nouveau thème par défaut, repensé de zéro en gardant l'esprit mur des stands : fond plus profond, panneaux en cartes arrondies, couleurs de chronométrage plus lisibles (violet, vert, jaune), barre latérale avec libellés sous les icônes. L'ancien thème « F1 Pro » reste disponible dans Réglages → Affichage → Thème.
- Nouvelles polices intégrées à l'application (fonctionnent hors ligne) : Saira pour l'interface, Saira Condensed pour les titres et trigrammes, JetBrains Mono pour tous les chiffres (temps, écarts, compte à rebours), qui ne « dansent » plus quand ils changent.
- Classement : pilote suivi surligné en rouge, pastilles de pneus en anneau, mini-secteurs plus fins.
- Barre de replay : bouton lecture/pause plus grand.

### Carte
- Position de chaque pilote affichée sur sa pastille, anneau jaune autour du leader.
- En course, écarts de moins d'une seconde entre deux voitures affichés directement sur la piste (en vert sous 0,7 s).
- Bulle de télémétrie du pilote suivi (vitesse, rapport, régime, accélérateur, frein, écart avec la voiture de devant) à côté de sa voiture ; plus compacte sur une petite carte.
- Bandeau « ordre en piste » en bas de la carte : tout le peloton placé sur le tour, secteurs et drapeaux compris.
- Thème Pitwall : meilleur temps de chaque secteur (avec le pilote) affiché au début du secteur, zones de ligne droite nommées (« LD A1 »…).
- Chaque nouveauté se désactive dans le menu Calques (« Positions », « Écarts de moins d'une seconde », « Télémétrie du pilote suivi », « Ordre sur la piste »).

### Radios
- Transcription et traduction en haute qualité plus fiables : un échec passager (téléchargement, mémoire de la carte graphique) ne fait plus passer définitivement les deux en qualité légère. Seul le modèle concerné passe en qualité légère, et la haute qualité est retentée automatiquement.
- Les radios déjà traduites en qualité légère sont refaites en haute qualité dès qu'elle est disponible.
- La ligne d'état indique la qualité réellement utilisée pour la transcription et pour la traduction, et pourquoi elle est légère le cas échéant.
- Ordinateurs portables à deux cartes graphiques : la plus puissante est utilisée.

## v1.17.1 — 2026-10-10

### Carte
- Les pilotes hors course (abandon, voiture arrêtée en piste, éliminés en qualifications) disparaissent de la carte. Case « Pilotes hors course » du menu Calques pour les réafficher.

## v1.17.0 — 2026-10-10

### Télémétrie
- Animation ultra fluide : compteurs et courbe de vitesse mis à jour à chaque image de l'écran, avec des valeurs interpolées entre les mesures de la F1 (3 à 4 par seconde) au lieu d'avancer par à-coups.
- Les compteurs remplacent les anciennes jauges dans le panneau Duel.
- Choix des pilotes : puces ajustées au trigramme (plus de grand vide après « + Comparer… »), flèche et croix de fermeture bien alignées.

### Barre du haut
- Façon MultiViewer : drapeau du pays, nom court du Grand Prix (« Azerbaijan GP — Race »), temps restant en grand, météo détaillée (vent et direction, piste, air, humidité, pression, pluie) selon la place disponible.
- Menu des documents de la FIA : filtre, résumé en français de chaque document, ouverture du PDF, point rouge quand un nouveau document est publié (en replay, seuls les documents déjà publiés à l'instant affiché).
- Menu des vitesses (intermédiaires, ligne d'arrivée, speed trap ; meilleures ou dernier passage) et menu des meilleurs secteurs avec le tour idéal, triables par colonne.
- Case du délai TV ajustée à la valeur (moins d'espace autour des secondes).

### Classement
- Étiquettes STAND, SORTIE, TOUR… dans leur propre colonne : alignées d'une ligne à l'autre.
- Options pour masquer le nom complet du pilote et la colonne des étiquettes (bouton « Colonnes »).
- Nouvelle colonne « Meilleurs secteurs » (S1 / S2 / S3 de chaque pilote, violet = meilleur de tous).

### Fenêtres et second écran
- Enregistrer l'emplacement des fenêtres (menu « Dispo. » ou Réglages → Affichage) et y revenir en un clic ; dans l'application de bureau, choix au lancement : comme à la fermeture, emplacement enregistré ou sans les fenêtres détachées.
- Disposition libre aussi dans les fenêtres du second écran (bouton de disposition en haut) : panneaux placés n'importe où.
- Le bouton « Analyse » de la barre latérale fonctionne quand le panneau est sur le second écran : il s'y affiche en grand et sa fenêtre passe devant.
- En disposition libre, un panneau ne peut plus passer sous la barre de replay.

### Carte
- Case « Textes des drapeaux jaunes » (menu Calques) pour masquer la liste des zones sous drapeau jaune qui recouvre la carte (les fanions restent sur la piste).

### Fluidité
- Rafraîchissement de l'interface calé sur l'affichage, transitions douces (onglets, panneau agrandi, menus, couleurs du classement et de l'état de la piste).

## v1.16.0 — 2026-10-10

### Mises à jour
- Écran de démarrage « Recherche de mise à jour… » : quand une nouvelle version existe, elle est téléchargée et installée avant l'ouverture, et l'appli redémarre directement dessus. Sans connexion, l'appli s'ouvre normalement.
- Paquet Linux .deb et appli macOS lancée depuis l'image disque : la nouvelle version est signalée au démarrage, avec un bouton pour la télécharger.
- Téléchargement des mises à jour plus fiable : arrêt propre si la connexion est coupée, nettoyage des anciens téléchargements.

### Disposition
- Disposition libre : les panneaux se placent n'importe où et se redimensionnent par leur coin, avec aimantation aux bords et aux autres panneaux (menu « Dispo. » de la barre latérale).

### Classement
- Bouton « Colonnes » sur le classement pour retirer ou ajouter des colonnes : position de départ, tours effectués, écart au pilote suivi, vitesses I1 / I2 / ligne d'arrivée, écurie.
- Correction : masquer la colonne des secteurs fonctionne.

### Carte
- Nouveau dessin : piste avec trait central coloré par secteur, zones « ligne droite » en hachures vertes, numéros de virage reliés à la piste, pilotes en pastilles rondes avec leur trigramme, fond uni.
- Les étiquettes des pilotes ne sautent plus d'un côté à l'autre dans les paquets.
- Bandeau « Drapeau rouge » de la carte décalé pour ne plus être coupé par le cadre rouge.
- Voie des stands sur la carte, reconstituée à partir des passages des voitures dans les stands (calque « Voie des stands »).
- Zones « ligne droite » et points de détection / d'activation du mode dépassement à leur position officielle, lue dans le plan du circuit publié par la FIA pour chaque Grand Prix (avant : estimations).

### Panneaux
- En-têtes : les outils (« Positions estimées », « Suivre », « Calques », « Colonnes ») sont de nouveau à côté du titre, et les boutons de panneau (déplacer, agrandir, envoyer, masquer) sont centrés sur la hauteur de l'en-tête dans tous les panneaux.

### Télémétrie
- Deux compteurs côte à côte (pilote suivi et pilote au choix) : vitesse, accélérateur, frein, régime et rapport, et courbe de vitesse des deux pilotes ; textes bien séparés des cercles.

### Replays
- Nouvelle barre de lecture : séance en cours en vert, début et fin de chaque partie (Q1, Q2, Q3, départ, reprise), drapeaux jaunes / SC / VSC / rouges, partie lue en bleu, vitesses 1x à 30x, bouton pour revenir au direct.

### Barre du haut
- Moins d'espace vide : plus de trou après « SQ1 » en qualifs, case du délai TV ajustée à sa valeur.

## v1.15.0 — 2026-10-10

### Nouveau design « F1 Pro »
- Design « F1 Pro » par défaut : barre latérale, barre d'état, cartes et barre de replay en bas ; les thèmes « F1 sobre », « Noir » et « Bleu nuit » restent disponibles.
- Vrais logos des écuries, en couleur (option pour les logos blancs).
- Heure locale du circuit dans la barre du haut.
- Nouveau logo de l'application (« F1 rouge premium »).

### Pneus
- Nouvel onglet Pneus : jeux neufs et utilisés de chaque pilote sur le week-end, allocation de la FIA.
- Composés choisis par Pirelli pour chaque Grand Prix et préconisations tirées des communiqués de Pirelli.

### Course et qualifications
- Cercle de position : les pilotes placés sur un anneau selon leur écart, avec la sortie des stands estimée.
- Comparaison de n'importe quel tour de deux pilotes (et plus seulement des meilleurs tours).
- Essais et qualifs : les pilotes qui ne sont pas dans un tour lancé peuvent être atténués (classement et carte).
- Secteurs : écarts par rapport à un pilote choisi.
- Records du circuit : poles et meilleurs tours en course des éditions précédentes.
- Direction de course : filtre par type de message (safety car, limites de piste, commissaires, drapeaux…).
- Safety car, VSC et drapeau rouge marqués sur la barre de replay et sur la race trace.

### Saison
- Notes des pilotes : note de la saison et note face au coéquipier, sur 100 et de S à F, avec le détail du calcul.
- Coéquipiers : écart en qualification (médiane, moyenne, manche par manche).
- Fiche pilote : tours en tête, plus belle remontée, répartition des arrivées, points comparés à la saison précédente.
- Profil des circuits : pneus Pirelli et contrainte sur les pneus, arrêts par pilote, circuits les plus proches.

### Connexion F1 TV
- La connexion F1 TV est renouvelée automatiquement : il suffit de se reconnecter environ tous les 30 jours au lieu de 4.
- Rappel discret quand une reconnexion devient nécessaire.

### Corrections
- Barre du haut alignée sur téléphone, boutons des panneaux qui ne débordent plus, légendes moins envahissantes sur les petits écrans, fenêtre des réglages de hauteur fixe, étiquettes des graphiques qui ne se chevauchent plus.
- Ce journal des modifications, consultable dans l'application.

## v1.14.0 — 2026-10-09
- Analyse → Comparaison : meilleurs tours de deux pilotes, secteur par secteur et mini-secteur par mini-secteur.
- Saison : changement d'année fiable, requêtes espacées, saisons terminées gardées sur disque.
- Réseau : nouvel essai automatique quand un serveur refuse temporairement une demande.

## v1.13.0 — 2026-10-09
- Mode mobile pour téléphone et tablette, accès depuis le téléphone par QR code (réseau local).
- Thème « F1 sobre » par défaut, ancien design conservé (« Classique »).
- Dispositions Course et Qualif / essais choisies selon la séance.
- Replay : passer les drapeaux rouges.
- Listes déroulantes intégrées, légendes explicatives (masquables), bouton pour couper le son des alertes.
- Classement plein écran plus lisible, traduction des évolutions techniques.

## v1.12.0 — 2026-10-09
- Application de bureau pour macOS et Linux.
- README allégé, guide complet dans docs/GUIDE.md.

## v1.11.0 — 2026-10-09
- Espace Saison : calendrier, classements, résultats, coéquipiers, statistiques des pilotes, régularité, arrêts, vitesses de pointe, profil des circuits.
- Saison : évolutions techniques et éléments moteur (documents FIA).
- Carte : nouveau design (piste, voitures, traînées, menu Calques).
- Classement : logos des écuries ; onglet Rythme et export PNG.

## v1.10.0 — 2026-10-05
- Thème Noir par défaut (Bleu nuit en option).
- Panneaux réorganisés par thème, panneau Analyse, réglages en onglets.
- Transcription des radios en haute qualité sur carte graphique.

## v1.9.0 — 2026-10-04
- Radios : transcription en texte en direct et traduction.
- Haut de page : tours restants et état de la piste ; points gagnés au championnat.
- Fluidité : carte, classement et télémétrie allégés.

## v1.8.4 — 2026-10-04
- Arrêts : temps d'immobilisation en direct.
- Classement : animations fluides (dépassements qui glissent).

## v1.8.3 — 2026-10-04
- Radios : lecture automatique dans une seule fenêtre, sans doublon.

## v1.8.2 — 2026-10-04
- Carte : zones de ligne droite et ligne de détection estimées, drapeaux jaunes par secteur.
- Couleurs d'équipe contrastées (option).

## v1.8.1 — 2026-10-04
- Les fenêtres détachées sont rouvertes au lancement.

## v1.8.0 — 2026-10-04
- Commentaires F1 TV dans l'application de bureau.
- Carte : secteurs et micro-secteurs, drapeaux jaunes localisés, drapeau rouge, SC et VSC.

## v1.7.0 — 2026-09-26
- Lecteur radio et flux audio, retardés du délai TV.

## v1.6.1 — 2026-09-26
- Commentaires F1 TV : diagnostic de l'abonnement.

## v1.6.0 — 2026-09-26
- Commentaires en direct F1 TV Pro (langue, volume, calage sur le délai TV).
- Barre du haut sur une ligne, bouton de réinitialisation.

## v1.5.0 — 2026-09-26
- Disposition libre des panneaux et fenêtres secondaires multi-panneaux.

## v1.4.0 — 2026-09-26
- Drapeaux bleus masquables, onglet Arrêts refait, classement pleine hauteur, synchronisation entre fenêtres.
- Enquêtes : pilote pénalisé et liens vers les documents de la FIA.

## v1.3.0 — 2026-09-26
- Suivi des enquêtes des commissaires et des limites de piste.

## v1.2.2 — 2026-09-26
- Corrections de la mise à jour automatique.

## v1.2.1 — 2026-09-26
- Mise à jour automatique depuis les versions publiées du projet.

## v1.2.0 — 2026-09-26
- Mise à jour automatique de l'application Windows.

## v1.1.1 — 2026-09-26
- Favoris depuis le classement, connexion F1 TV intégrée, panneaux détachés.

## v1.1.0 — 2026-09-26
- Première version : tableau de bord F1 en direct avec délai réglable et synchronisation TV, application Windows.
