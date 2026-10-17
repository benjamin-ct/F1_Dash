// Noms des Grands Prix et des séances pour l'affichage en français (les données de la F1 et de Jolpica
// sont en anglais) : « Australian Grand Prix » -> « Australie » ou « GP d'Australie », « Race » -> « Course ».
// En anglais (en = true), les noms d'origine sont gardés.

// Nom du pays ou de la ville, et préposition du nom complet (« Grand Prix d'Australie »)
const GP = {
  Australian: ['Australie', "d'"], Chinese: ['Chine', 'de '], Japanese: ['Japon', 'du '], Bahrain: ['Bahreïn', 'de '],
  'Saudi Arabian': ['Arabie saoudite', "d'"], Miami: ['Miami', 'de '], 'Emilia Romagna': ['Émilie-Romagne', "d'"],
  Monaco: ['Monaco', 'de '], Spanish: ['Espagne', "d'"], Barcelona: ['Barcelone', 'de '], 'Barcelona-Catalunya': ['Barcelone', 'de '],
  Madrid: ['Madrid', 'de '], Canadian: ['Canada', 'du '], Austrian: ['Autriche', "d'"], British: ['Grande-Bretagne', 'de '],
  Belgian: ['Belgique', 'de '], Hungarian: ['Hongrie', 'de '], Dutch: ['Pays-Bas', 'des '], Italian: ['Italie', "d'"],
  Azerbaijan: ['Azerbaïdjan', "d'"], Singapore: ['Singapour', 'de '], 'United States': ['États-Unis', 'des '],
  'Mexico City': ['Mexico', 'de '], Mexican: ['Mexique', 'du '], 'São Paulo': ['São Paulo', 'de '], 'Sao Paulo': ['São Paulo', 'de '],
  Brazilian: ['Brésil', 'du '], 'Las Vegas': ['Las Vegas', 'de '], Qatar: ['Qatar', 'du '], 'Abu Dhabi': ['Abou Dabi', "d'"],
  Portuguese: ['Portugal', 'du '], French: ['France', 'de '], German: ['Allemagne', "d'"], Turkish: ['Turquie', 'de '],
  Russian: ['Russie', 'de '], Styrian: ['Styrie', 'de '], Tuscan: ['Toscane', 'de '], Eifel: ['Eifel', "de l'"],
  Sakhir: ['Sakhir', 'de '], '70th Anniversary': ['70e anniversaire', 'du '], Malaysian: ['Malaisie', 'de '],
  Korean: ['Corée', 'de '], Indian: ['Inde', "d'"], European: ['Europe', "d'"],
};
const baseOf = (name) => String(name || '').replace(/ Grand Prix$/i, '').replace(/^(Formula 1 )?Grand Prix (of|de) /i, '').trim();

// Grand Prix couru dans un autre pays (« Bahrain Grand Prix in Malaysia », 2026, à Sepang)
const ABROAD = /^(.+?) Grand Prix in (.+)$/i;
const IN_COUNTRY = { Malaysia: ['Malaisie', 'en '] };

// « Australie » (en : « Australian ») ; « Bahreïn (Malaisie) »
export function gpShort(name, en = false) {
  const base = baseOf(name);
  const abroad = ABROAD.exec(base);
  if (abroad) return en ? `${abroad[1]} (${abroad[2]})` : `${GP[abroad[1]]?.[0] || abroad[1]} (${IN_COUNTRY[abroad[2]]?.[0] || abroad[2]})`;
  return en ? base : GP[base]?.[0] || base;
}

// « Grand Prix d'Australie » (prefix 'GP' : « GP d'Australie ») ; en : nom d'origine (« Australian GP »)
export function gpFull(name, en = false, prefix = 'Grand Prix') {
  const base = baseOf(name);
  // « Grand Prix de Bahreïn en Malaisie » ; autre nom hors du commun : gardé tel quel
  const abroad = ABROAD.exec(base);
  if (abroad && !en && GP[abroad[1]]) {
    const [where, inside] = IN_COUNTRY[abroad[2]] || [abroad[2], 'à '];
    return `${prefix} ${GP[abroad[1]][1]}${GP[abroad[1]][0]} ${inside}${where}`;
  }
  if (!base || /grand prix/i.test(base)) return String(name || '');
  if (en) return prefix === 'GP' ? `${base} GP` : `${base} Grand Prix`;
  const [fr, de] = GP[base] || [base, /^[AEIOUÉÂ]/i.test(base) ? "d'" : 'de '];
  return `${prefix} ${de}${fr}`;
}

// Nom d'une séance (« Race », « Practice 1 », « Sprint Qualifying »…)
const SESSIONS = {
  Race: 'Course', Qualifying: 'Qualifications', Sprint: 'Sprint', 'Sprint Qualifying': 'Qualifications sprint',
  'Sprint Shootout': 'Qualifications sprint', 'Practice 1': 'Essais libres 1', 'Practice 2': 'Essais libres 2', 'Practice 3': 'Essais libres 3',
  'Day 1': 'Jour 1', 'Day 2': 'Jour 2', 'Day 3': 'Jour 3',
};
export function sessionLabel(name, en = false) {
  return en ? String(name || '') : SESSIONS[name] || String(name || '');
}
