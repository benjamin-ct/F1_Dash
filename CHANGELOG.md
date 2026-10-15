# Journal des modifications

Toutes les nouveautés de Paddock Live, version par version. Chaque nouvelle version publiée doit avoir
sa section ici : elle est reprise telle quelle sur la page de la version (GitHub) et dans
l'application (Réglages → Application → Nouveautés).

## v1.27.2 — à venir

### Traductions en ligne
- **Les traductions passent maintenant par le serveur Paddock Live** (actualités, radios d'équipe, documents FIA) : plus aucun modèle de traduction à faire tourner sur l'ordinateur ou le téléphone, et chaque texte n'est traduit qu'une fois pour tous les utilisateurs, donc souvent instantanément.
- Seuls les textes à traduire sont envoyés (titres et résumés d'articles, texte des radios), rien d'autre. Désactivable dans Réglages → Application → *Traductions* ; si le serveur ne répond pas, la traduction se fait sur l'ordinateur comme avant.
- Sur le téléphone, les actualités sont traduites directement, sans attendre l'ordinateur.

### Radios d'équipe
- **Radios des caméras embarquées retirées pour le moment** : l'écoute et la transcription en continu étaient trop lourdes pour l'ordinateur.
- **Transcription et traduction des radios beaucoup plus légères par défaut** : elles utilisent désormais les petits modèles (environ 1 Go de mémoire, sans solliciter la carte graphique). La haute qualité, plus précise mais gourmande (10 à 15 Go pendant l'utilisation), reste disponible dans le choix « Qualité » du panneau Radios.
- Quel que soit l'ordinateur : seules les 12 radios les plus récentes sont retranscrites et traduites automatiquement (40 avant), avec une courte pause entre deux, pour que l'appli reste fluide, en particulier au lancement d'un replay.

### Actu
- **« Qui fait l'actu » : les barres ne se réaniment plus sans arrêt.** Chaque titre traduit redessinait toute la page ; seuls les morceaux qui changent sont maintenant mis à jour, et les traductions sont affichées par paquets (au plus une mise à jour toutes les 1,5 s), ce qui allège aussi la page.
- **Traduction des actualités beaucoup plus économe** : seuls les articles visibles à l'écran sont traduits (avant : les 40 premiers titres et 12 résumés d'un coup), et plus rien n'est traduit en arrière-plan page fermée, sauf les actus qui déclenchent une alerte. Les traductions déjà faites restent gardées.

### Corrections
- Bandeau en haut de l'écran et carte : « Voiture de sécurité » et « Voiture de sécurité virtuelle » en français (ils restaient en anglais).

## v1.27.1 — 2026-10-15

### Replays
- **La F1 a fermé l'accès libre à ses archives** (replays, statistiques de la saison, records, jeux de pneus des séances précédentes) : Paddock Live utilise désormais votre **connexion F1 TV** pour y accéder, puis une copie publique des archives si besoin. Sans connexion F1 TV, un message clair l'indique au lieu de « HTTP 401 ».
- Les radios d'équipe des replays (écoute et transcription) passent par le même accès.
- Vos enregistrements des séances suivies en direct restent rejouables sans connexion.

### Mémoire et mises à jour
- **Transcription des radios : beaucoup moins de mémoire.** Les modèles (plusieurs Go en haute qualité) sont libérés quand la transcription est coupée, et après 5 minutes sans radio à traiter ; ils se rechargent tout seuls à la radio suivante.
- La mémoire occupée par la transcription en haute qualité (10 à 15 Go pendant l'utilisation sur Mac) est indiquée dans l'infobulle du choix de qualité ; la qualité légère en utilise environ 1 Go.
- **Mémoire utilisée affichée** dans Réglages → Application (application de bureau), avec le détail : serveur, fenêtres, carte graphique.
- **macOS : mises à jour automatiques réparées** quand macOS lance l'appli depuis une copie temporaire (appli non signée par Apple) : la mise à jour remplace l'appli du dossier Applications.

## v1.27.0 — 2026-10-15

### Statistiques d'utilisation anonymes
- **Au premier lancement, Paddock Live vous demande s'il peut envoyer des statistiques d'utilisation anonymes**, pour savoir quelles fonctions servent le plus ou le moins et améliorer l'appli dans le bon sens. Rien n'est envoyé sans votre accord.
- Choix modifiable à tout moment : Réglages → Application → *Statistiques d'utilisation*.
- Seulement des totaux par jour : fonctions utilisées, version, système, ordinateur ou téléphone, direct ou replay, erreurs rencontrées. Ni connexion F1 TV, ni identifiant, ni contenu ; l'adresse IP n'est pas conservée.

## v1.26.1 — 2026-10-15

### Améliorations
- Petites améliorations internes.

## v1.26.0 — 2026-10-15

### Sauvegarde des réglages
- **Enregistrer ses réglages dans un fichier et les restaurer** (Réglages → Application → *Sauvegarde des réglages*) : affichage, dispositions et fenêtres, colonnes, délais TV mémorisés, carte, analyse, sources d'actualités, lumières connectées. Pratique après une réinstallation ou sur un autre ordinateur.
- La restauration remplace les réglages actuels et recharge toutes les fenêtres ouvertes. Un fichier qui n'est pas une sauvegarde de Paddock Live est refusé avec un message clair.
- Le fichier ne contient ni la connexion F1 TV, ni la clé d'accès du téléphone, ni les clés des lumières connectées.

## v1.25.0 — 2026-10-15

### Nouveau nom : Paddock Live
- **F1 Dash s'appelle désormais Paddock Live**, avec un nouveau logo « F1 PL » (même style rouge). Le nom change partout : fenêtres, raccourcis, appli du téléphone, page GitHub (`github.com/benjamin-ct/paddock-live`), fichiers à télécharger (`Paddock-Live-…`), images exportées des graphiques (`paddock-live-…png`), documentation et captures d'écran.
- **Vos données suivent** : au premier lancement, le dossier de l'ancienne application (réglages, connexion F1 TV, enregistrements, dispositions, position des fenêtres) est repris par Paddock Live.
- **Windows (version installée)** : Paddock Live s'installe à côté de l'ancienne application. Une fois Paddock Live lancé une première fois, désinstallez « F1 Dash » (Paramètres → Applications) et supprimez son raccourci s'il reste. Version portable : supprimez l'ancien fichier `.exe`.
- **Téléphone** : rescannez le QR code (Réglages → Application → « Sur votre téléphone ou tablette »), puis supprimez l'ancienne icône de l'écran d'accueil et rajoutez la nouvelle.
- Calendrier exporté (.ics) : réimporté, il peut doubler les séances déjà ajoutées sous l'ancien nom ; supprimez les anciennes.
- Pour ceux qui lancent le serveur à la main : la variable `F1DASH_DATA_DIR` devient `PADDOCK_DATA_DIR`.

### Corrections
- Capture d'écran « Apparence » de la documentation : le côté sombre montrait le thème clair.
- Fenêtre de connexion F1 TV (appli de bureau) : elle se présente comme un Chrome ordinaire, sans le nom de l'application.

## v1.24.0 — 2026-10-15

### Radios d'équipe façon MultiViewer
- **Nouveau panneau des radios**, sur le modèle des transcriptions de MultiViewer (il remplace les onglets Transcriptions / Audio) :
  - en haut, **une carte par radio** (plus récentes à gauche) : photo du pilote, nom, **tour** et heure, durée, point bleu tant qu'elle n'a pas été écoutée. Un clic la joue : la carte se remplit en cyan de gauche à droite au fil de l'écoute, avec une barre pleine largeur en bas (clic dessus pour avancer) et le temps écoulé (« 0:03 / 0:08 ») ;
  - en dessous, le **fil des radios retranscrites** : photo, texte traduit en grand, anglais d'origine en petit, « pilote · tour · heure ». Un clic rejoue la radio.
- Vitesse de lecture réglable (1× à 2×) ; la lecture automatique des nouvelles radios est toujours là (« Lecture auto »).
- Dans un petit panneau, les réglages des radios tiennent sur une ligne : les cartes restent visibles.
- **Photos des pilotes** (radios, duel) relayées par Paddock Live et gardées en cache : elles s'affichent même quand le site de la F1 refuse les images appelées depuis l'application, sur le téléphone et hors connexion.
- **Toutes les radios, pas seulement celles publiées par la F1 (expérimental, F1 TV Pro)** : la F1 ne publie qu'une sélection des radios (une trentaine par course). Avec la case **Caméras embarquées**, Paddock Live écoute en direct le son de la caméra embarquée du pilote suivi et des pilotes du duel (ou de 3 favoris), y retrouve chaque radio, la retranscrit et la traduit sur cet ordinateur, et l'ajoute au fil (repère « caméra embarquée »), au rythme de votre délai TV : rien n'est dévoilé en avance. Séances en direct ; nécessite les caméras embarquées F1 TV (offre Pro, incluse avec certaines offres Canal+). Si le son embarqué est protégé (DRM), Paddock Live l'indique : il ne peut alors pas être retranscrit.

### Transcriptions et traductions
- **La liste ne se recharge plus sans arrêt** : une traduction terminée ou le chargement d'un modèle ne met à jour que la ligne concernée (le défilement et l'écoute ne sont plus interrompus).
- **Fini les rechargements en boucle** du modèle de traduction : le moteur planté est vraiment arrêté avant d'en relancer un, et après un échec en haute qualité, les nouveaux essais sont de plus en plus espacés.
- Un modèle déjà téléchargé affiche « Chargement du modèle… » au lieu de « Téléchargement (première fois) ».
- Une radio sans parole reconnue n'affiche plus « « - » » mais « pas de parole reconnue ».
- **Traductions plus fiables** : une réponse vide, l'anglais recopié ou une explication à la place de la traduction est détectée et refaite ; en qualité légère, le jargon F1 est corrigé (« Box, box » → « Rentre aux stands », « Copy » → « Reçu », pneus durs / tendres, « lift and coast » → « lever le pied »).

### Onglets déplaçables
- **Glissez un onglet vers un autre panneau** (Analyse, Stratégie, Course, Radios) ou à une autre place dans le sien : par exemple la Race trace à côté de la Stratégie. La disposition des onglets est gardée et suivie par toutes les fenêtres ; Réglages → Affichage → « Remettre les onglets à leur place ».

### Thème clair plus lisible
- Les couleurs d'écurie trop pâles pour le fond blanc (turquoise de Mercedes, bleu ciel, vert clair…) sont assombries automatiquement, en gardant leur teinte : graphiques, classement, actualités…
- Historique des pneus : cases plus marquées et arrêts aux stands encadrés en sombre (le cadre blanc était invisible).
- Actualités : les écuries de « Qui fait l'actu » et des étiquettes prennent leur couleur (elles étaient grises).

## v1.23.1 — 2026-10-14

### Corrections
- **Synchro TV par le son** : si le calcul de reconnaissance ne peut pas démarrer (fichier bloqué, mémoire…), l'écoute ne reste plus figée indéfiniment sur « En écoute ».
- **Pronostics** : un pseudo comme « constructor » ou « __proto__ » est refusé avec un message clair au lieu de faire échouer l'enregistrement.
- Une année invalide demandée à Paddock Live (« 99999 », « 1800 », « 2025.5 ») ouvre la saison en cours au lieu d'afficher une erreur des serveurs de résultats ou de créer une saison vide sur le disque.
- Une requête mal formée envoyée au serveur de Paddock Live est refusée proprement (erreur 400) au lieu de provoquer une erreur interne, y compris pour l'adresse d'une radio en ligne vide ou invalide.
- Sécurité : des données de course ou des traductions contenant des noms réservés du langage JavaScript ne peuvent plus modifier le fonctionnement interne de l'application.

## v1.23.0 — 2026-10-14

### Interface en anglais
- **Paddock Live existe maintenant en anglais** : Réglages → Affichage → **Langue / Language** (Français ou English). Toute l'interface suit : menus, panneaux, légendes, infobulles, graphiques, carte, Saison, Actu, réglages, messages et alertes, mini-classement, téléphone, écran de démarrage de l'application.
- En anglais, les textes rédigés par Paddock Live le sont directement en anglais : résumé de la séance, moments clés du replay, calendrier à ajouter à l'agenda. Les actualités sont traduites en anglais, les radios restent en version originale (anglais) par défaut, et les documents de la FIA et les communiqués de Pirelli s'affichent tels quels.
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
- **Le délai se règle tout seul** : dans la fenêtre Synchro TV, bouton **Écouter la TV**. Le micro de l'ordinateur écoute votre TV et, dès qu'une **radio d'équipe** passe à l'antenne, Paddock Live la reconnaît (même avec les commentateurs qui parlent par-dessus) et en déduit le retard exact de votre diffusion. Plus besoin de guetter le compteur de tours pour cliquer au bon moment.
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
- **Calendrier** : toutes les séances de la saison ou d'un week-end à ajouter à votre agenda (Google, Apple, Outlook), avec une alarme 15 min avant chaque séance, même Paddock Live fermé.
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
- Plus aucun emoji ni symbole de police dans l'application : toutes les icônes (menus, boutons, réglages, alertes, carte, téléphone…), les flèches et les triangles des places gagnées ou perdues sont dessinés pour Paddock Live, dans le même style que la barre latérale.
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
