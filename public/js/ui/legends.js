// Légendes affichées sous chaque panneau : à quoi correspondent les couleurs, les colonnes et
// les graphiques. Elles changent avec l'onglet actif et se masquent dans ⚙ → Affichage.
import { prefs, setPref } from '../prefs.js';
import { on } from '../store.js';
import { toast } from './delay.js';

const sw = (color, label, shape = 'bar') => `<span class="lg-i"><i class="lg-${shape}" style="--c:${color}"></i>${label}</span>`;
const tag = (cls, text, label) => `<span class="lg-i"><span class="tag ${cls}">${text}</span>${label}</span>`;
const tyre = (color, letter, label) => `<span class="lg-i"><span class="tyre lg-tyre" style="--tc:${color}">${letter}</span>${label}</span>`;
const txt = (s) => `<span class="lg-t">${s}</span>`;

const L = {
  tower: {
    _: [
      txt('Mini-secteurs :'), sw('var(--purple)', 'meilleur de tous'), sw('var(--green)', 'record perso'), sw('var(--yellow)', 'plus lent'), sw('var(--blue)', 'stands'),
      txt('· Temps :'), `<span class="lg-i"><b style="color:var(--purple)">violet</b>&nbsp;meilleur de la séance</span>`, `<span class="lg-i"><b style="color:var(--green)">vert</b>&nbsp;record perso / l'écart se réduit</span>`,
      txt('· ▲▼ places gagnées/perdues depuis la grille'),
      tag('pit', 'STAND', 'aux stands'), tag('out', 'SORTIE', 'sort des stands'), tag('push', 'TOUR', 'tour rapide lancé'), tag('ret', 'ABD', 'abandon'),
      tyre('#ff3b30', 'S', 'tendre'), tyre('#f5c518', 'M', 'médium'), tyre('#f1f1f4', 'H', 'dur'), tyre('#35d07f', 'I', 'intermédiaire'), tyre('#3ea6ff', 'W', 'pluie'),
      txt('(chiffre : tours sur ce train) · Arr. : arrêts · V.max : vitesse au speed trap (km/h) · A / B : choisir les pilotes du duel · ☆ favori (alertes)'),
    ],
  },
  map: {
    _: [
      txt('Pastille = pilote (trigramme, couleur de son écurie) · trait central coloré par secteur (S1 rouge, S2 bleu, S3 orange), ou selon les drapeaux'),
      sw('#3cc86e', 'hachures : zone ligne droite', 'dash'), sw('#ff4fd8', 'détection dépassement'),
      txt('· GPS : positions réelles ; « estimées » : calculées depuis les chronos'),
    ],
  },
  feed: {
    rcm: [txt('Messages officiels de la direction de course (drapeaux, enquêtes, pénalités, limites de piste), au rythme de votre délai TV. Cases à cocher : masquer drapeaux bleus et temps supprimés.')],
    stewards: [txt('Incidents examinés par les commissaires : noté → enquête → décision (pénalité ou aucune action). Le badge orange compte les enquêtes en cours.')],
    tracklimits: [txt('Tours et temps supprimés pour non-respect des limites de piste, par pilote. Les avertissements répétés peuvent entraîner une pénalité.')],
  },
  radio: {
    transcripts: [txt('Radios d\'équipe retranscrites en texte (en grand : la traduction, en petit : l\'anglais d\'origine). Tout est fait sur cet ordinateur ; ▶ réécouter la radio.')],
    radio: [txt('Radios d\'équipe audio, des plus récentes aux plus anciennes · ▶ écouter.')],
  },
  duel: {
    _: [
      sw('var(--blue)', 'pilote A'), sw('var(--orange)', 'pilote B'),
      txt('· Écart en direct : au-dessus de 0, A est devant · « creuse / réduit l\'écart » : tendance sur les derniers tours · tableau : chiffres en vert = meilleur des deux'),
    ],
  },
  analysis: {
    trace: [txt('Race trace : écart de chaque pilote avec la référence choisie, tour par tour. Une courbe qui plonge = perte de temps (arrêt, problème) ; deux courbes qui se croisent = dépassement.')],
    positions: [txt('Position de chaque pilote à la fin de chaque tour. Les sauts correspondent aux arrêts et aux dépassements.')],
    laptimes: [txt('Temps de chaque tour, par pilote (plus bas = plus rapide). Les tours d\'arrêt ou sous drapeau jaune / safety car ressortent nettement plus lents. Clic sur un point : comparer ce tour (onglet Comparaison).')],
    pace: [txt('Rythme sur les tours « propres » : boîte = la moitié des tours du pilote, trait = médiane, moustaches = tour le plus rapide / le plus lent. À droite : les 20 meilleurs tours de la séance.')],
    tyrehist: [txt('Chaque case est un tour, colorée selon le pneu utilisé ; cadre blanc = arrêt au stand ; violet = meilleur tour du pilote. Clic sur un temps : comparer ce tour.')],
    sectors: [txt('Meilleur temps de chaque pilote dans chaque secteur, tour idéal (somme des 3 meilleurs secteurs) et vitesses de pointe. Violet = meilleur de la séance. En haut : pole et meilleur tour en course des éditions précédentes sur ce circuit (archives F1), comparés au meilleur temps de la séance.')],
    compare: [sw('var(--blue)', 'pilote A plus rapide'), sw('var(--orange)', 'pilote B plus rapide'), txt('· tours comparés (meilleurs par défaut, ou au choix ; clic sur un temps dans Temps / Pneus) : secteurs officiels, mini-secteurs mesurés au GPS ; courbe = écart cumulé le long du tour ; pointillés = emplacement de boucle estimé')],
    telemetry: [txt('Compteurs du pilote suivi (clic sur un pilote du classement) et d\'un second pilote au choix (« + Comparer », par défaut le pilote B du duel) : vitesse sur l\'anneau, accélérateur (vert, à gauche) et frein (rouge, à droite), régime et rapport au centre ; courbe de vitesse des 30 dernières secondes. En live, nécessite un compte F1 TV.')],
  },
  extra: {
    pits: [txt('Arrêts aux stands : immobilisation = voiture à l\'arrêt pendant le changement de pneus ; voie des stands = temps total entre l\'entrée et la sortie des stands.')],
    strategy: [txt('Relais de chaque pilote : chaque barre est un train de pneus, colorée selon le type (rouge tendre, jaune médium, blanc dur, vert intermédiaire, bleu pluie), avec le nombre de tours.')],
    tyres: [txt('Pour chaque composé : pastille = jeux neufs jamais montés (allocation moins les jeux neufs déjà utilisés ; certains doivent être rendus à Pirelli en cours de week-end), chiffres = jeux déjà utilisés avec leur nombre de tours ; encadré = jeu monté en ce moment. Q3 = un jeu de tendres en plus.')],
    pitsim: [txt('Simulateur : où ressortirait le pilote s\'il s\'arrêtait maintenant, d\'après le temps perdu dans la voie des stands (réglable) et les écarts actuels. Cercle : un tour complet = un tour de cercle, chaque pastille est placée selon son écart au leader ; arc rouge = temps perdu au stand, cercle pointillé = sortie des stands.')],
    battles: [txt('Bagarres en cours (en course) : pilotes à moins de 1,5 s l\'un de l\'autre ; en surbrillance sous la seconde, avec la tendance de l\'écart sur les derniers tours.')],
    weather: [txt('Station météo du circuit : températures de l\'air et de la piste, humidité, pression, vent (la flèche indique d\'où il vient) et pluie.')],
    champ: [txt('Championnat si la course s\'arrêtait maintenant : points avant la course, points gagnés avec la position du moment et total projeté.')],
  },
};

const PANEL_IDS = ['tower', 'map', 'feed', 'radio', 'duel', 'analysis', 'extra'];

function update(panel, id) {
  let el = panel.querySelector(':scope > .panel-legend');
  if (!prefs.legends) { el?.remove(); return; }
  const tab = panel.querySelector('.panel-head [data-tab].active')?.dataset.tab || '_';
  const items = L[id]?.[tab] || L[id]?._;
  if (!items) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'panel-legend';
    panel.appendChild(el);
  }
  const html = `${items.join('')}<button class="lg-hide" title="Masquer les légendes (réaffichables dans ⚙ Réglages → Affichage)">✕ Masquer</button>`;
  if (el.dataset.k !== `${id}|${tab}`) { el.innerHTML = html; el.dataset.k = `${id}|${tab}`; }
}

function updateAll() {
  for (const id of PANEL_IDS) {
    const panel = document.querySelector(`.panel.p-${id}`);
    if (panel) update(panel, id);
  }
}

export function initLegends() {
  for (const id of PANEL_IDS) {
    const panel = document.querySelector(`.panel.p-${id}`);
    panel?.querySelector('.panel-head')?.addEventListener('click', (e) => { if (e.target.closest('[data-tab]')) setTimeout(() => update(panel, id), 0); });
  }
  on('prefs', (k) => { if (k === 'legends') updateAll(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lg-hide')) return;
    setPref('legends', false);
    toast('Légendes masquées — pour les réafficher : ⚙ Réglages → Affichage → « Légendes sous les panneaux »', 6000);
  });
  updateAll();
}

export function legendsToggle(checkbox) {
  checkbox.checked = prefs.legends;
  checkbox.addEventListener('change', () => setPref('legends', checkbox.checked));
  on('prefs', (k) => { if (k === 'legends') checkbox.checked = prefs.legends; });
}

