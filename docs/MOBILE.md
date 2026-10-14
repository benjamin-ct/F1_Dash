# Application mobile autonome — notes d'étude

> Projet **mis de côté** (octobre 2026, après la v1.18.0). Rien n'est développé : ce document garde
> les vérifications faites et les choix restant à trancher pour reprendre plus tard.

## Objectif

Une vraie application pour **iPhone et Android**, **autonome** : elle se connecte elle-même au
chronométrage F1 (direct, replay, F1 TV, Saison, documents FIA), sans PC allumé.

## Constat de départ

- Le front (`public/`) est déjà une application web avec un mode mobile et installable (PWA).
- Toute la logique « serveur » (`server/`, `shared/`, ~3 500 lignes) est du Node.js pur, avec
  seulement 4 dépendances : `ws`, `unpdf`, `https-proxy-agent`, `qrcode-generator`.
- API Node utilisées : `fs`, `path`, `http`/`https`, `zlib`, `crypto`, `readline`, `os`, `url`.

## Vérifications faites (14/10/2026)

| Test | Résultat |
| --- | --- |
| `npm test` sous **Node 18.20.4** (version de `nodejs-mobile`) | 68/68 réussis |
| Serveur sous Node 18.20.4 : connexion au direct F1 | OK (session reconnue) |
| Serveur en `--jitless` (mode imposé par iOS, sans compilation à la volée) | Tests 68/68, sans perte de vitesse notable |
| Replay de Bakou 2026 en `--jitless` | Chargé en ~2 s, ~250 Mo de mémoire |
| `nodejs-mobile` v18.20.4 Android (`libnode.so` arm64) | ~60 Mo, segments alignés sur **4 Ko** |

Points d'attention relevés :

- **`nodejs-mobile`** n'a plus de version depuis octobre 2024 (bloqué sur Node 18, plus maintenu).
- **Pages mémoire 16 Ko (Android 15 et suivants)** : le `libnode.so` fourni est aligné sur 4 Ko.
  Il ne se chargerait pas sur les téléphones qui utilisent des pages de 16 Ko. Il faudrait
  recompiler le moteur. Le problème n'existe pas sur iPhone.
- Le flux en direct (SignalR) a besoin d'envoyer des en-têtes `Cookie` et `Authorization` à
  l'ouverture du WebSocket. Un navigateur ou une WebView ne le permet pas : il faut du code natif
  ou Node.

## Les deux voies possibles

### Voie 1 — Embarquer le serveur actuel (Capacitor + `nodejs-mobile`)

- L'appli lance `server/index.js` dans un Node embarqué, et la WebView affiche
  `http://127.0.0.1:<port>`.
- Le dossier de données (`DATA_DIR`, enregistrements) pointe vers le stockage de l'appli.
- **Avantages** : 100 % du code serveur réutilisé, toutes les fonctions, même code que le bureau.
  Environ 1 à 2 versions de travail.
- **Risques** : moteur figé sur Node 18, incompatibilité Android 16 Ko (voir plus haut),
  appli lourde (~60 Mo par architecture).

### Voie 2 — Logique serveur dans l'appli, sans Node

- Le code de `server/` est adapté pour tourner dans la WebView. Les appels `/api/*` et le hub
  temps réel deviennent des appels internes.
- Équivalents à prévoir :
  - `fs` → stockage de l'appli ;
  - `zlib` → `DecompressionStream('deflate-raw')` ;
  - `crypto` → WebCrypto.
- Petits modules natifs (iOS et Android) pour :
  - les requêtes HTTP sans restriction CORS ;
  - le WebSocket du direct avec en-têtes ;
  - la connexion F1 TV (lecture du cookie `login-session`, comme `desktop/main.cjs`) ;
  - le relais vidéo du commentaire F1 TV (la partie la plus délicate).
- **Avantages** : pas de moteur abandonné, compatible avec tous les téléphones, plus léger, durable.
- **Inconvénients** : environ 3 à 5 versions de travail. Le serveur de l'appli de bureau devra
  garder les deux variantes à jour.

## Commun aux deux voies

- **Android** : `.apk` construit par GitHub Actions, installable directement (gratuit). Prévoir une
  clé de signature fixe, en secret GitHub, pour que les mises à jour s'installent par-dessus.
- **iPhone** : compte développeur Apple (99 $/an) pour TestFlight. Sans compte : fichier `.ipa` à
  installer avec Sideloadly ou AltStore, à réinstaller tous les 7 jours. La construction se fait
  sur un runner macOS de GitHub Actions.
- **Limites sur téléphone** :
  - iOS coupe la connexion en arrière-plan, donc l'enregistrement ne se fait qu'appli ouverte ;
  - traduction des radios en qualité légère seulement (modèle haute qualité ~3 Go) ;
  - pas de fenêtres multiples ni de 2e écran.
- **Sans objet sur mobile** : mises à jour Electron (`desktop/updater.cjs`), accès réseau local et
  QR code (`server/lan.js`).

## Décisions à prendre avant de reprendre

1. Voie 1 ou voie 2.
2. iPhone : compte Apple payant (TestFlight) ou réinstallation tous les 7 jours.

## Alternative plus légère, déjà possible

L'appli de bureau sert déjà le mode mobile sur le réseau local (QR code). Pour y accéder de partout
sans développement, on peut relier le PC et le téléphone avec **Tailscale** (réseau privé gratuit).
Il faut alors que le PC reste allumé.
