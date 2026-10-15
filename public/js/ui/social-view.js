// Mode créateur : générateur de posts pour les réseaux sociaux après la séance (visuels aux
// formats des réseaux et légendes prêtes à copier). Caché par défaut ; activé sur l'ordinateur
// avec Ctrl + Alt + P et le code du propriétaire.
import { store } from '../store.js';
import { $, esc, photoUrl, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { FLAG_ISO } from './header.js';
import { postData, captions } from '/shared/social.js';
import { FORMATS, slidesFor, drawSlide, SLIDE_NAMES } from '/shared/social-draw.js';

const SIG_KEY = 'paddock.postSignature';
const OPT_KEY = 'paddock.postOptions';
let enabled = false;
let fmt = storageGet(OPT_KEY, {}).fmt || 'ig';
let withPhotos = storageGet(OPT_KEY, {}).photos !== false;
const imgCache = new Map();

function loadImage(src, cors = false) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

// Photo en grand format quand la F1 la propose (« 1col » -> « 4col »), sinon celle de la liste
async function headshot(url) {
  if (!url) return null;
  const big = url.replace(/\.transform\/\dcol\//, '.transform/4col/');
  return (big !== url && await loadImage(photoUrl({ HeadshotUrl: big }))) || loadImage(photoUrl({ HeadshotUrl: url }));
}

async function assets(d) {
  await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '600 30px "Titillium Web"', '400 30px "Titillium Web"', '700 30px "JetBrains Mono"']
    .map((f) => document.fonts?.load(f).catch(() => {})));
  const photos = {};
  if (withPhotos) {
    await Promise.all(d.rows.slice(0, 3).map(async (r) => { photos[r.num] = await headshot(r.headshot); }));
  }
  const iso = FLAG_ISO[String(d.country || '').toUpperCase()];
  const flag = iso ? await loadImage(`https://flagcdn.com/w160/${iso}.png`, true) : null;
  return { photos, flag };
}

const folderOf = (d) => `${d.year || ''} ${d.gpEn.replace(/ Grand Prix$/i, '') || 'Grand Prix'} - ${d.label}`.trim();
const fileOf = (i, slide) => `${FORMATS[fmt].name}-${i + 1}-${slide}`;

async function saveImages(d, canvases) {
  const folder = folderOf(d);
  let dir = '';
  for (const [i, c] of canvases.entries()) {
    const data = c.toDataURL('image/png').split(',')[1];
    const res = await fetch('/api/posts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, name: fileOf(i, c.dataset.slide), data }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    dir = j.dir;
  }
  return { folder, dir };
}

async function copyImage(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

let renderId = 0;
async function render(dlg) {
  const id = ++renderId;
  dlg.dataset.ready = '';
  const d = postData(store.state);
  const slides = slidesFor(d);
  const sig = storageGet(SIG_KEY, 'Paddock Live');
  const caps = captions(d, sig);
  const body = $('.posts-body', dlg);
  if (!slides.length) { body.innerHTML = `<p class="muted">${t('Pas encore de classement pour cette séance : lancez un live ou un replay.')}</p>`; return; }
  body.innerHTML = `${d.final ? '' : `<p class="posts-warn small">${icon('warning')} ${t('Séance pas terminée : résultats provisoires, au rythme de votre délai TV.')}</p>`}
    <div class="posts-grid">${slides.map((s, i) => `<figure class="posts-item"><canvas data-slide="${s}"></canvas>
      <figcaption><span>${i + 1}. ${esc(t(SLIDE_NAMES[s]))}</span>
        <button class="btn small" data-copy="${i}" title="${t('Copier l\'image, à coller dans le réseau social')}">${icon('doc')} ${t('Copier')}</button>
        <button class="btn small" data-save="${i}">${icon('save')} ${t('Enregistrer')}</button></figcaption></figure>`).join('')}</div>
    <div class="posts-caps">
      ${fmt === 'story' ? '' : `<label class="small muted">${fmt === 'x' ? t('Texte pour X / Threads / Bluesky') : t('Légende Instagram / Facebook')}</label>
      <textarea class="posts-cap" rows="${fmt === 'x' ? 4 : 12}" data-no-i18n>${esc(fmt === 'x' ? caps.x : caps.instagram)}</textarea>
      <div class="row"><button class="btn small" data-cap>${icon('doc')} ${t('Copier le texte')}</button>${fmt === 'x' ? `<span class="small muted" data-count></span>` : ''}</div>`}
    </div>`;
  const o = { ...(await assets(d)), signature: sig };
  if (id !== renderId) return;   // format ou réglage changé entre-temps
  const canvases = [...body.querySelectorAll('canvas')];
  for (const c of canvases) drawSlide(c, c.dataset.slide, fmt, d, o);
  const count = $('[data-count]', body);
  const area = $('.posts-cap', body);
  const upd = () => { if (count) count.textContent = t('{} / 280 caractères', area.value.length); };
  area?.addEventListener('input', upd); upd();
  body.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.copy !== undefined) { await copyImage(canvases[Number(b.dataset.copy)]); toast(t('Image copiée'), 2000, 'check'); }
      if (b.dataset.save !== undefined) { const r = await saveImages(d, [canvases[Number(b.dataset.save)]]); toast(t('Image enregistrée dans {}', r.dir), 4000, 'check'); }
      if (b.dataset.cap !== undefined) { await navigator.clipboard.writeText(area.value); toast(t('Texte copié'), 2000, 'check'); }
    } catch (err) { toast(err.message, 5000, 'warning'); }
  };
  dlg.onSaveAll = async () => {
    const r = await saveImages(d, canvases);
    dlg.dataset.folder = r.folder;
    toast(t('{} images enregistrées dans {}', canvases.length, r.dir), 5000, 'check');
    $('[data-open]', dlg).hidden = false;
  };
  dlg.dataset.ready = '1';
}

function open() {
  let dlg = $('#postsDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'postsDlg';
    dlg.className = 'modal posts-dlg';
    dlg.innerHTML = `<div class="sum-head"><b>${icon('megaphone')} ${t('Posts pour les réseaux sociaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
      <div class="posts-bar">
        <div class="posts-seg" role="tablist">${Object.entries({ ig: 'Instagram / Facebook', story: 'Story / TikTok', x: 'X / Threads / Bluesky' }).map(([k, v]) => `<button class="posts-fmt" data-fmt="${k}">${v}</button>`).join('')}</div>
        <label class="toggle small"><input type="checkbox" data-photos> ${t('Photos des pilotes')}</label>
        <label class="small muted">${t('Signature')} <input type="text" class="posts-sig" maxlength="40" spellcheck="false"></label>
        <span class="spacer"></span>
        <button class="btn" data-open hidden>${icon('external')} ${t('Ouvrir le dossier')}</button>
        <button class="btn btn-accent" data-all>${icon('save')} ${t('Enregistrer toutes les images')}</button>
      </div>
      <div class="posts-body"></div>`;
    document.body.appendChild(dlg);
    const sync = () => {
      for (const b of dlg.querySelectorAll('[data-fmt]')) b.classList.toggle('active', b.dataset.fmt === fmt);
      $('[data-photos]', dlg).checked = withPhotos;
      storageSet(OPT_KEY, { fmt, photos: withPhotos });
    };
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
      const f = e.target.closest('[data-fmt]')?.dataset.fmt;
      if (f && f !== fmt) { fmt = f; sync(); render(dlg); }
      if (e.target.closest('[data-all]')) { try { await dlg.onSaveAll?.(); } catch (err) { toast(err.message, 5000, 'warning'); } }
      if (e.target.closest('[data-open]')) fetch('/api/posts/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: dlg.dataset.folder }) });
    });
    $('[data-photos]', dlg).addEventListener('change', (e) => { withPhotos = e.target.checked; sync(); render(dlg); });
    const sig = $('.posts-sig', dlg);
    sig.value = storageGet(SIG_KEY, 'Paddock Live');
    let tm = null;
    sig.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { storageSet(SIG_KEY, sig.value.trim()); render(dlg); }, 500); });
    sync();
  }
  $('[data-open]', dlg).hidden = true;
  dlg.showModal();
  render(dlg);
}

function show(on) {
  enabled = on;
  const btn = $('#postsBtn');
  if (btn) btn.hidden = !on;
  const block = $('#creatorBlock');
  if (block) block.hidden = !on;
}

async function unlock() {
  if (enabled) { open(); return; }
  const code = window.prompt(t('Code du mode créateur :'));
  if (!code) return;
  const res = await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
  if (res?.ok) { show(true); toast(t('Mode créateur activé : bouton « Posts » dans la barre latérale'), 4000, 'check'); } else toast(t(res?.status === 403 ? 'Code incorrect' : 'Activation impossible'), 3000, 'warning');
}

export function initSocial() {
  fetch('/api/creator').then((r) => r.json()).then((j) => show(!!j.enabled)).catch(() => {});
  $('#postsBtn')?.addEventListener('click', open);
  $('#creatorOff')?.addEventListener('click', async () => {
    await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off: true }) }).catch(() => {});
    show(false);
    toast(t('Mode créateur désactivé'), 2500, 'check');
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyP') { e.preventDefault(); unlock(); }
  });
}
