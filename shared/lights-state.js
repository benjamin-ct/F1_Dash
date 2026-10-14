// État des lumières connectées d'après la séance affichée (donc retardée comme la TV) :
// track = TrackStatus.Status, session = SessionStatus.Status, since = ms depuis le dernier
// changement d'état, after = après le vert : 'normal' (lumière normale), 'off' (éteint), 'keep' (rester vert)
export function lightState(track, session, since, after = 'normal') {
  const back = after === 'keep' ? 'green' : after === 'off' ? 'off' : 'normal';
  if (['Finished', 'Finalised', 'Ends'].includes(session)) return since < 30000 ? 'chequered' : back === 'green' ? 'normal' : back;
  if (session !== 'Started' && session !== 'Aborted') return 'normal';
  const t = String(track || '1');
  if (t === '5' || session === 'Aborted') return 'red';
  if (t === '4') return 'sc';
  if (t === '6' || t === '7') return 'vsc';
  if (t === '2' || t === '3') return 'yellow';
  return since < 10000 ? 'green' : back;
}
