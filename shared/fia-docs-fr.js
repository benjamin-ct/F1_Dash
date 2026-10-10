// Résumé en français du titre d'un document officiel de la FIA (liste « Documents » de la barre
// du haut). Les titres suivent toujours le même modèle (« Doc 70 - Infringement - Car 55 -
// Failing to follow Race Directors Instructions - Practice Start ») : chaque partie est traduite
// à partir d'expressions connues ; une partie inconnue est laissée telle quelle.

const SESSIONS = [
  [/^Sprint Qualifying$|^Sprint Shootout$/i, 'des qualifications sprint'],
  [/^Qualifying$/i, 'des qualifications'],
  [/^Sprint$/i, 'du sprint'],
  [/^Race$/i, 'de la course'],
  [/^(?:Free Practice|FP)\s*(\d)$/i, (m) => `des essais libres ${m[1]}`],
];
const session = (s) => {
  for (const [re, fr] of SESSIONS) { const m = re.exec(s.trim()); if (m) return typeof fr === 'function' ? fr(m) : fr; }
  return s;
};
const alleged = (a, yes, no) => (a ? yes : no);

// [expression, traduction] : appliquées à chaque partie du titre (la première qui correspond)
const PARTS = [
  [/^Decision$/i, 'Décision des commissaires'],
  [/^(?:Infringement|Offence)$/i, 'Infraction'],
  [/^Summons$/i, 'Convocation'],
  [/^Cars?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)$/i, (m) => `Voiture${/\D/.test(m[1].trim()) ? 's' : ''} ${m[1].replace(/\s*and\s*/gi, ' et ')}`],
  [/^Championship Points$/i, 'Points du championnat'],
  [/^(Provisional|Final)\s+(.+?)\s+Classification$/i, (m) => `Classement ${/final/i.test(m[1]) ? 'final' : 'provisoire'} ${session(m[2])}`],
  [/^(.+?)\s+Classification$/i, (m) => `Classement ${session(m[1])}`],
  [/^(Provisional|Final)\s+Starting Grid$/i, (m) => `Grille de départ ${/final/i.test(m[1]) ? 'définitive' : 'provisoire'}`],
  [/^(.+?)\s+Deleted Lap Times$/i, (m) => `Temps au tour supprimés ${session(m[1])}`],
  [/^Double Yellow(?: Flags?)?$/i, 'double drapeau jaune'],
  [/^(.+?)\s+Scrutineering$/i, (m) => (/^self$/i.test(m[1]) ? 'Auto-contrôle technique' : `Contrôles techniques (${m[1].replace(/\band\b/gi, 'et').replace(/\bFP(\d)/gi, 'EL$1').replace(/Qualifying/i, 'qualifications').replace(/Race/i, 'course')})`)],
  [/^Race Director'?s?\s+(?:Competition\s+)?Notes(?:\s+V(\d+))?$/i, (m) => `Notes du directeur de course${m[1] ? ` (version ${m[1]})` : ''}`],
  [/^(?:Competition|Event)\s+Notes$/i, 'Notes de l\'épreuve'],
  [/^New PU Elements for this Competition$/i, 'Nouveaux éléments moteur pour ce Grand Prix'],
  [/^PU Elements used per Driver.*$/i, 'Éléments moteur utilisés par chaque pilote'],
  [/^PU elements?$/i, 'Éléments moteur'],
  [/^Power Unit Information$/i, 'Informations sur les moteurs'],
  [/^Pre-Race Procedure$/i, 'Procédure d\'avant-course'],
  [/^Post-Race Procedure$/i, 'Procédure d\'après-course'],
  [/^Post-Qualifying Procedure$/i, 'Procédure d\'après-qualifications'],
  [/^Parts and Parameters.*Parc Ferm[eé]$/i, 'Pièces et réglages changés sous parc fermé'],
  [/^Covers-on Time$/i, 'Heure de mise sous bâches'],
  [/^Curfew(?:,\s*amended)?$/i, (m) => `Couvre-feu${/amended/i.test(m[0]) ? ' (modifié)' : ''}`],
  [/^Entry List$/i, 'Liste des engagés'],
  [/^Car Presentation Submissions$/i, 'Présentation des voitures'],
  [/^Car Display Procedure$/i, 'Procédure d\'exposition des voitures'],
  [/^Competition Visa(?:\s+V(\d+))?$/i, (m) => `Visa de l'épreuve${m[1] ? ` (version ${m[1]})` : ''}`],
  [/^Circuit Map.*$/i, 'Plan du circuit, voie des stands et sorties de secours'],
  [/^Pirelli Preview$/i, 'Présentation Pirelli'],
  [/^Turn\s+(\d+)\s+Incident$/i, (m) => `Incident au virage ${m[1]}`],
  [/^Collision with Car\s+(\d+)(?:\s+in\s+turn\s+(\d+))?$/i, (m) => `Accrochage avec la voiture ${m[1]}${m[2] ? ` au virage ${m[2]}` : ''}`],
  [/^(Alleged\s+)?(?:Failure to follow|Failing to follow)\s+Race\s+Director'?s?\s+Instructions$/i, (m) => alleged(m[1], 'Non-respect présumé des instructions du directeur de course', 'Non-respect des instructions du directeur de course')],
  [/^Practice Start$/i, 'essai de départ'],
  [/^(Alleged\s+)?Overtaking under (?:double\s+)?yellow flags?$/i, (m) => alleged(m[1], 'Dépassement présumé sous drapeau jaune', 'Dépassement sous drapeau jaune')],
  [/^(Alleged\s+)?(?:failure|failing) to slow for (?:double\s+)?yellow flags?$/i, (m) => alleged(m[1], 'Ralentissement insuffisant présumé sous drapeau jaune', 'Ralentissement insuffisant sous drapeau jaune')],
  [/^Alleged yellow flag infringement$/i, 'Infraction présumée au drapeau jaune'],
  [/^Alleged impeding (of|by) car\s+(\d+)$/i, (m) => `Gêne présumée ${/of/i.test(m[1]) ? 'de' : 'par'} la voiture ${m[2]}`],
  [/^Impeding car\s+(\d+)$/i, (m) => `A gêné la voiture ${m[1]}`],
  [/^Leaving the track(?:\s+in\s+turn\s+(\d+))?$/i, (m) => `Sortie de piste${m[1] ? ` au virage ${m[1]}` : ''}`],
  [/^Post-Race Checks on Car Number\s+(\d+),?\s*(.*)$/i, (m) => `Contrôles d'après-course sur la voiture ${m[1]}${m[2] ? ` (${m[2]})` : ''}`],
  [/^SC(\d)(\s+Times)?$/i, (m) => (m[2] ? `temps SC${m[1]}` : `SC${m[1]}`)],
];

function part(s) {
  const t = s.trim();
  for (const [re, fr] of PARTS) {
    const m = re.exec(t);
    if (m) return typeof fr === 'function' ? fr(m) : fr;
  }
  return t;
}

// "Doc 70 - Infringement - Car 55 - …" -> { num: 70, text: "Infraction · Voiture 55 · …", translated }
export function docSummaryFr(title) {
  const t = String(title || '');
  const m = /^Doc\s+(\d+)\s*[-–]\s*(.*)$/i.exec(t);
  const rest = m ? m[2] : t;
  // « Competition Notes - Circuit Map, … » : la 2e partie dit de quoi il s'agit
  const parts = rest.split(/\s+[-–]\s+/).filter(Boolean);
  if (parts.length > 1 && /^(?:Competition|Event) Notes$/i.test(parts[0].trim())) parts.shift();
  const fr = parts.map(part);
  return { num: m ? Number(m[1]) : null, text: fr.join(' · '), translated: fr.some((x, i) => x !== parts[i].trim()) };
}
