// Espace Saison → Pronostics : pole et podium de chaque Grand Prix, entre amis (ordinateur et
// téléphones de l'accès réseau), avec le classement de la saison.
import { $, esc, api, storageGet, storageSet } from '../util.js';
import { icon, arrows } from '../icons.js';
import { toast } from './delay.js';
import { POINTS } from '/shared/predict.js';

let view = null;
let viewYear = null;
let loading = false;

const me = () => storageGet('f1dash.player', '');
const fmt = (t) => (t ? new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

async function load(year, force = false) {
  if (loading || (!force && view && viewYear === year)) return;
  loading = true;
  try {
    view = await api(`/api/predictions?year=${year}&me=${encodeURIComponent(me())}`);
    viewYear = year;
  } catch (err) {
    view = { error: err.message };
  } finally {
    loading = false;
  }
  fill();
}

function driverSelect(name, value, drivers, disabled) {
  return `<select name="${name}" ${disabled ? 'disabled' : ''}><option value="">—</option>${drivers.map((d) => `<option value="${esc(d.code)}" ${d.code === value ? 'selected' : ''}>${esc(d.code)} · ${esc(d.name)}</option>`).join('')}</select>`;
}

function pickCell(code, pts) {
  if (!code) return '<td class="muted">—</td>';
  if (code === '?') return `<td class="muted" title="Révélé à la fermeture des pronostics">${icon('lock')}</td>`;
  return `<td class="${pts >= POINTS.exact ? 'pd-hit' : pts ? 'pd-near' : ''}">${esc(code)}${pts ? ` <small>+${pts}</small>` : ''}</td>`;
}

function picksTable(r) {
  if (!r.picks.length) return '<p class="muted small">Aucun pronostic pour ce Grand Prix.</p>';
  return `<table class="sz-table pd-table"><tr><th>Joueur</th><th>Pole</th><th>1er</th><th>2e</th><th>3e</th><th>Points</th></tr>
    ${r.picks.map((p) => `<tr class="${p.mine ? 'pd-me' : ''}"><td>${esc(p.name)}</td>${pickCell(p.pole, p.points?.pole)}${pickCell(p.p1, p.points?.podium[0])}${pickCell(p.p2, p.points?.podium[1])}${pickCell(p.p3, p.points?.podium[2])}
      <td><b>${p.points ? p.points.total : '—'}</b>${p.points?.perfect ? ` <small class="pd-hit">podium exact +${p.points.perfect}</small>` : ''}</td></tr>`).join('')}</table>`;
}

function fill() {
  const root = $('#pdRoot');
  if (!root) return;
  if (!view) { root.innerHTML = '<div class="note">Chargement des pronostics…</div>'; return; }
  if (view.error) { root.innerHTML = `<div class="note">Pronostics indisponibles (${esc(view.error)}).</div>`; return; }
  const now = Date.now();
  const next = view.races.find((r) => !r.result && r.locks.podium && r.locks.podium > now);
  const mine = next?.picks.find((p) => p.mine) || {};
  const poleOpen = next && (!next.locks.pole || now < next.locks.pole);
  const others = next ? next.picks.filter((p) => !p.mine).length : 0;
  const form = next ? `<section class="sz-box pd-next">
      <h3>${icon('target')} ${esc(next.name)} <span class="muted small">manche ${next.round}</span></h3>
      <form id="pdForm" data-round="${next.round}">
        <label class="small pd-name">Votre prénom ou pseudo <input name="name" value="${esc(me())}" maxlength="24" placeholder="ex. Benjamin" required></label>
        <div class="pd-picks">
          <label class="small">Pole position ${driverSelect('pole', mine.pole, view.drivers, !poleOpen)}</label>
          <label class="small">1er ${driverSelect('p1', mine.p1, view.drivers)}</label>
          <label class="small">2e ${driverSelect('p2', mine.p2, view.drivers)}</label>
          <label class="small">3e ${driverSelect('p3', mine.p3, view.drivers)}</label>
        </div>
        <div class="pd-actions"><button class="btn" type="submit">${icon('check')} Enregistrer mon pronostic</button>
          <span class="muted small">Pole : ${poleOpen ? `jusqu'au ${fmt(next.locks.pole)}` : 'fermé (qualifications commencées)'} · Podium : jusqu'au ${fmt(next.locks.podium)}</span></div>
      </form>
      <p class="muted small">${others ? `${others} autre${others > 1 ? 's' : ''} joueur${others > 1 ? 's ont' : ' a'} déjà pronostiqué (choix révélés à la fermeture).` : arrows('Aucun autre joueur pour l\'instant : partagez le dashboard sur vos téléphones (Réglages → Application → accès réseau).')}</p>
    </section>` : '<section class="sz-box"><p class="muted">Plus de Grand Prix à pronostiquer cette saison.</p></section>';

  const done = view.races.filter((r) => r.result && r.picks.length).reverse();
  const board = view.board.length ? `<table class="sz-table pd-board"><tr><th>#</th><th>Joueur</th><th>Points</th>${done.slice(0, 6).reverse().map((r) => `<th title="${esc(r.name)}">R${r.round}</th>`).join('')}</tr>
    ${view.board.map((p, i) => `<tr class="${p.name.toLowerCase() === me().toLowerCase() ? 'pd-me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td><b>${p.total}</b></td>${done.slice(0, 6).reverse().map((r) => `<td class="muted">${p.rounds[r.round] ?? '—'}</td>`).join('')}</tr>`).join('')}</table>`
    : '<p class="muted small">Le classement apparaîtra après le premier Grand Prix pronostiqué.</p>';
  const history = done.map((r, i) => `<details class="sz-box pd-round" ${i === 0 ? 'open' : ''}><summary><b>R${r.round} · ${esc(r.name.replace(' Grand Prix', ''))}</b>
      <span class="muted small">pole ${esc(r.result.pole || '—')} · podium ${esc(r.result.podium.join(', ') || '—')}</span></summary>${picksTable(r)}</details>`).join('');
  const locked = view.races.filter((r) => !r.result && r.picks.length && r !== next);
  root.innerHTML = `${form}
    <section class="sz-box"><h3>${icon('trophy')} Classement des pronostics ${view.year}</h3>${board}
      <p class="muted small">Points : pole exacte ${POINTS.pole} · pilote à la bonne place du podium ${POINTS.exact} · sur le podium mais à une autre place ${POINTS.podium} · podium exact dans l'ordre +${POINTS.perfect}.</p></section>
    ${locked.map((r) => `<section class="sz-box pd-round"><h3>R${r.round} · ${esc(r.name.replace(' Grand Prix', ''))} <span class="muted small">en attente des résultats</span></h3>${picksTable(r)}</section>`).join('')}
    ${history}`;
}

export function renderPredict(year) {
  setTimeout(() => (view && viewYear === year ? fill() : load(year)), 0);
  return '<div id="pdRoot"><div class="note">Chargement des pronostics…</div></div>';
}

export function initPredict() {
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('#pdForm');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    storageSet('f1dash.player', v.name.trim());
    try {
      await api('/api/predictions', { method: 'POST', body: { year: viewYear, round: Number(f.dataset.round), name: v.name, pole: v.pole || null, p1: v.p1 || null, p2: v.p2 || null, p3: v.p3 || null } });
      toast('Pronostic enregistré', 3000, 'check');
      load(viewYear, true);
    } catch (err) {
      toast(err.message, 5000);
    }
  });
}
