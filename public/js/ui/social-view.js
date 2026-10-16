// Mode créateur : générateur de posts pour les réseaux sociaux après la séance (visuels aux
// formats des réseaux et légendes prêtes à copier). Caché par défaut ; activé sur l'ordinateur
// avec Ctrl + Alt + P et le code du propriétaire.
import { store } from '../store.js';
import { $, esc, photoUrl, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { FLAG_ISO } from './header.js';
import { postData, captions, xLength } from '/shared/social.js';
import { FORMATS, slidesFor, drawSlide, SLIDE_NAMES } from '/shared/social-draw.js';
import { bigNews, newsPost, newsCaptions, newsKind } from '/shared/social-news.js';
import { postedEntry } from '/shared/post-history.js';
import { openPublish } from './social-publish-view.js';

const SIG_KEY = 'paddock.postSignature';
const OPT_KEY = 'paddock.postOptions';
let enabled = false;
let fmt = storageGet(OPT_KEY, {}).fmt || 'ig';
let withPhotos = storageGet(OPT_KEY, {}).photos !== false;
let noSpoiler = storageGet(OPT_KEY, {}).noSpoiler !== false;   // texte sans le vainqueur au début
let mode = storageGet(OPT_KEY, {}).mode === 'news' ? 'news' : 'session';
let linkComment = storageGet(OPT_KEY, {}).linkComment !== false;   // news : lien de l'article en premier commentaire   // posts de la séance ou d'une grosse news
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

const folderOf = (d) => (d.news ? `Actu ${d.date} - ${d.title.slice(0, 50)}`
  : `${d.year || ''} ${d.gpEn.replace(/ Grand Prix$/i, '') || 'Grand Prix'} - ${d.label}`.trim());

// ---------- Grosses news de l'Actu ----------
let newsAll = false;   // toutes les actus des 48 dernières heures, pas seulement les grosses
let newsSel = null;
let newsCache = null;
const frCache = new Map();
const edits = new Map();   // id -> { title, summary } corrigés à la main

let histCache = null;
async function postHistory(force = false) {
  if (force || !histCache || Date.now() - histCache.at > 60e3) {
    const r = await fetch('/api/social/history').then((x) => x.json()).catch(() => ({}));
    histCache = { items: r.items || [], at: Date.now() };
  }
  return histCache.items;
}
const NET_NAMES = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', x: 'X', bluesky: 'Bluesky', tiktok: 'TikTok' };

async function newsList() {
  if (!newsCache || Date.now() - newsCache.at > 60e3) {
    const r = await fetch('/api/news').then((x) => x.json());
    newsCache = { items: r.items || [], sources: r.sources || [], at: Date.now() };
  }
  return newsCache;
}

// Textes en français (traduction en ligne de l'appli, gardée en mémoire) ; null si indisponible
async function toFrench(list) {
  const todo = list.filter((x) => x.text && x.from !== 'fr' && !frCache.has(`${x.from}|${x.text}`));
  if (todo.length) {
    const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'fr', items: todo.map((x) => ({ text: x.text, from: x.from })) }) })
      .then((r) => r.json()).catch(() => ({}));
    todo.forEach((x, i) => { if (res.out?.[i]) frCache.set(`${x.from}|${x.text}`, res.out[i]); });
  }
  return list.map((x) => (!x.text || x.from === 'fr' ? x.text : frCache.get(`${x.from}|${x.text}`) ?? null));
}

const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60e3); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; };

async function newsSource(sig) {
  const data = await newsList();
  const list = bigNews(data.items, { all: newsAll }).slice(0, 40);
  const titles = await toFrench(list.map((it) => ({ text: it.title, from: it.lang })));
  const history = await postHistory();
  const posted = list.map((it) => postedEntry(it, history));
  const bar = (sel) => `<div class="row posts-news-bar">
      <select class="posts-news-sel" data-newspick>${list.map((it, i) => `<option value="${esc(it.id)}" ${it === sel ? 'selected' : ''}>${posted[i] ? `✓ ${esc(t('Publiée'))} · ` : ''}${esc(newsKind(it).label)} · ${esc(titles[i] || it.title)} — ${esc(data.sources.find((s) => s.id === it.src)?.name || it.src)}, ${ago(it.t)}</option>`).join('')}</select>
      <label class="toggle small"><input type="checkbox" data-newsall ${newsAll ? 'checked' : ''}> ${t('Toutes les actus')}</label>
      ${sel?.link ? `<a class="btn small" href="${esc(sel.link)}" target="_blank" rel="noopener">${icon('external')} ${t("Lire l'article")}</a>` : ''}</div>`;
  if (!list.length) return { head: `${bar(null)}<p class="muted">${t('Aucune grosse news ces dernières 48 heures : cochez « Toutes les actus » pour en choisir une autre.')}</p>` };
  const it = list.find((x) => x.id === newsSel) || list[0];
  newsSel = it.id;
  const [title, summary] = edits.get(it.id) ? [edits.get(it.id).title, edits.get(it.id).summary]
    : await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const failed = title === null || summary === null;
  const d = newsPost(it, { title: title ?? it.title, summary: summary ?? it.summary, driverList: store.state?.DriverList || {}, sourceName: data.sources.find((s) => s.id === it.src)?.name || it.src });
  const done = posted[list.indexOf(it)];
  const head = `${bar(it)}
    ${done ? `<p class="posts-warn small">${icon('check')} ${esc(t('Déjà publiée le {} sur {}', new Date(done.at).toLocaleString(), Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', ')))}</p>` : ''}
    <div class="posts-news-edit">
      <label class="small muted">${t('Titre')}<input type="text" data-ntitle maxlength="160" value="${esc(d.title)}"></label>
      <label class="small muted">${t('Résumé')}<textarea data-nsum rows="3" maxlength="400">${esc(d.summary)}</textarea></label>
      <label class="toggle small" title="${t("Facebook, Threads et X : le lien de l'article est publié en premier commentaire plutôt que dans le texte (Instagram : pas de lien)")}"><input type="checkbox" data-linkcomment ${linkComment ? 'checked' : ''}> ${t("Lien de l'article en premier commentaire")}</label>
      <p class="small muted">${icon('info')} ${t(failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : "Titre et résumé traduits automatiquement : relisez-les et corrigez-les si besoin. Les photos et le texte de l'article ne sont jamais repris, la source est citée.")}</p>
    </div>`;
  const record = { key: `news:${it.id}`, kind: 'news', title: d.title, srcTitle: it.title, link: it.link || '', summary: String(it.summary || '').slice(0, 300) };
  return { d, caps: newsCaptions(d, sig, { linkInComment: linkComment }), head, record };
}
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

// Pages officielles pour écrire un post, préremplies (gratuit, sans clés d'accès)
const INTENTS = {
  x: { name: 'X', url: 'https://x.com/intent/post?text=' },
  threads: { name: 'Threads', url: 'https://www.threads.com/intent/post?text=' },
  bsky: { name: 'Bluesky', url: 'https://bsky.app/intent/compose?text=' },
};

async function copyImage(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

let renderId = 0;
const renderNewsOnly = (dlg) => render(dlg, true);
async function render(dlg, keepHead = false) {
  const id = ++renderId;
  dlg.dataset.ready = '';
  dlg.publish = null;
  const sig = storageGet(SIG_KEY, '@BenjyPaddock');
  const body = $('.posts-body', dlg);
  let d; let caps; let head = ''; let record = null;
  if (mode === 'news') {
    let r;
    try { r = await newsSource(sig); } catch (err) { r = { head: `<p class="muted">${esc(err.message)}</p>` }; }
    if (id !== renderId) return;
    if (!r.d) { body.innerHTML = r.head; return; }
    ({ d, caps, head, record } = r);
  } else {
    d = postData(store.state);
    caps = captions(d, sig, { spoiler: !noSpoiler });
    record = { key: `session:${folderOf(d)}`, kind: 'session', title: `${d.label} · ${d.gp}` };
    if (!d.final) head = `<p class="posts-warn small">${icon('warning')} ${t('Séance pas terminée : résultats provisoires, au rythme de votre délai TV.')}</p>`;
  }
  const slides = slidesFor(d);
  if (!slides.length) { body.innerHTML = `<p class="muted">${t('Pas encore de classement pour cette séance : lancez un live ou un replay.')}</p>`; return; }
  const main = `<div class="posts-grid">${slides.map((s, i) => `<figure class="posts-item"><canvas data-slide="${s}"></canvas>
      <figcaption><span>${i + 1}. ${esc(t(SLIDE_NAMES[s]))}</span>
        <button class="btn small" data-copy="${i}" title="${t('Copier l\'image, à coller dans le réseau social')}">${icon('doc')} ${t('Copier')}</button>
        <button class="btn small" data-save="${i}">${icon('save')} ${t('Enregistrer')}</button></figcaption></figure>`).join('')}</div>
    <div class="posts-caps">
      ${fmt === 'story' ? '' : `<label class="small muted">${fmt === 'x' ? t('Texte pour X / Threads / Bluesky') : t('Légende Instagram / Facebook')}</label>
      <textarea class="posts-cap" rows="${fmt === 'x' ? 4 : 12}" data-no-i18n>${esc(fmt === 'x' ? caps.x : caps.instagram)}</textarea>
      <div class="row"><button class="btn small" data-cap>${icon('doc')} ${t('Copier le texte')}</button>${fmt === 'x' ? `<span class="small muted" data-count></span><span class="spacer"></span>
        <span class="small muted">${t('Publier gratuitement :')}</span>${Object.entries(INTENTS).map(([k, v]) => `<button class="btn small btn-accent" data-intent="${k}" title="${t("Ouvre la page de {} pour écrire un post, avec ce texte, et copie la première image : collez-la puis publiez. Gratuit, sans clés d'accès.", v.name)}">${icon('external')} ${v.name}</button>`).join('')}` : ''}</div>
      ${fmt === 'x' && caps.comment ? `<div class="row small"><span class="muted">${t('Premier commentaire :')}</span> <span data-no-i18n>${esc(caps.comment)}</span><button class="btn small" data-copycomment>${icon('doc')} ${t('Copier')}</button></div>` : ''}
      ${fmt === 'x' ? `<p class="small muted posts-xhelp" hidden>${icon('info')} ${t("Fenêtre ouverte avec le texte : collez l'image avec Ctrl+V (Cmd+V sur Mac), puis publiez. Pour d'autres images, cliquez sur « Copier » sous chacune et collez-les aussi.")}</p>` : ''}`}
    </div>`;
  // Titre ou résumé d'une news en cours de saisie : seuls les visuels et les textes sont redessinés
  if (keepHead && $('.posts-main', body)) $('.posts-main', body).innerHTML = main;
  else body.innerHTML = `<div class="posts-head">${head}</div><div class="posts-main">${main}</div>`;
  const o = { ...(await assets(d)), signature: sig };
  if (id !== renderId) return;   // format ou réglage changé entre-temps
  // Publication : visuels de n'importe quel format, dessinés à part
  dlg.publish = () => openPublish({ d, caps, folder: folderOf(d), record, onPosted: () => { histCache = null; if (mode === 'news') render(dlg); }, render: async (f) => slides.map((sl) => drawSlide(document.createElement('canvas'), sl, f, d, o)) });
  const canvases = [...body.querySelectorAll('canvas')];
  for (const c of canvases) drawSlide(c, c.dataset.slide, fmt, d, o);
  const count = $('[data-count]', body);
  const area = $('.posts-cap', body);
  const upd = () => { if (count) count.textContent = t('{} / 280 caractères', xLength(area.value)); };
  area?.addEventListener('input', upd); upd();
  body.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.copy !== undefined) { await copyImage(canvases[Number(b.dataset.copy)]); toast(t('Image copiée'), 2000, 'check'); }
      if (b.dataset.save !== undefined) { const r = await saveImages(d, [canvases[Number(b.dataset.save)]]); toast(t('Image enregistrée dans {}', r.dir), 4000, 'check'); }
      if (b.dataset.cap !== undefined) { await navigator.clipboard.writeText(area.value); toast(t('Texte copié'), 2000, 'check'); }
      if (b.dataset.copycomment !== undefined) { await navigator.clipboard.writeText(caps.comment); toast(t('Commentaire copié : publiez-le en réponse à votre post'), 3500, 'check'); }
      // Publication sans accès payant : page officielle du réseau préremplie, première image copiée
      const net = INTENTS[b.dataset.intent];
      if (net) {
        await copyImage(canvases[0]).catch(() => {});
        window.open(net.url + encodeURIComponent(area.value), `paddock-${b.dataset.intent}-compose`, 'width=720,height=780');
        $('.posts-xhelp', body).hidden = false;
        toast(t('Image 1 copiée : collez-la dans {} (Ctrl+V)', net.name), 4000, 'check');
      }
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

// ---------- Statistiques des posts publiés ----------
const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString());
const STAT_LABELS = [['views', 'Vues'], ['reach', 'Portée'], ['likes', "J'aime"], ['comments', 'Comm.'], ['shares', 'Partages'], ['saves', 'Enreg.']];
async function openStats() {
  let dlg = $('#postsStatsDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'postsStatsDlg';
    dlg.className = 'modal posts-pub-dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  }
  dlg.innerHTML = `<div class="sum-head"><b>${icon('chart')} ${t('Statistiques des posts')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
    <div class="posts-pub-body"><p class="muted">${t('Lecture des statistiques…')}</p></div>`;
  if (!dlg.open) dlg.showModal();
  const body = $('.posts-pub-body', dlg);
  try {
    const r = await fetch('/api/social/stats').then((x) => x.json());
    const f = Object.entries(r.followers || {});
    body.innerHTML = `${f.length ? `<div class="posts-stats-fol">${f.map(([n, v]) => `<div><b>${fmtN(v)}</b><span class="small muted">${t('abonnés')} ${NET_NAMES[n] || n}</span></div>`).join('')}</div>` : ''}
      ${(r.posts || []).length ? (r.posts || []).map((p) => `<div class="posts-stats-post">
        <div class="row"><b>${esc(p.title || t('Post'))}</b><span class="spacer"></span><span class="small muted">${esc(new Date(p.at).toLocaleString())}</span></div>
        ${Object.entries(p.nets).map(([n, x]) => { const s = p.stats?.[n]; const vals = s ? STAT_LABELS.filter(([k]) => s[k] != null).map(([k, l]) => `${t(l)} <b>${fmtN(s[k])}</b>`).join(' · ') : t('statistiques indisponibles'); return `<div class="small">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${NET_NAMES[n] || n}</a>` : NET_NAMES[n] || n} : ${vals}</div>`; }).join('')}
      </div>`).join('') : `<p class="muted">${t('Aucun post publié depuis Paddock Live pour le moment.')}</p>`}
      <p class="small muted">${icon('info')} ${t("Statistiques lues chez chaque réseau (X : lecture payante, non utilisée). Pour les vues et la portée, autorisations instagram_manage_insights, read_insights et threads_manage_insights du jeton.")}</p>`;
  } catch (err) { body.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}

function open() {
  let dlg = $('#postsDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'postsDlg';
    dlg.className = 'modal posts-dlg';
    dlg.innerHTML = `<div class="sum-head"><b>${icon('megaphone')} ${t('Posts pour les réseaux sociaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
      <div class="posts-bar">
        <div class="posts-seg" role="tablist">${[['session', 'Séance'], ['news', 'News']].map(([k, v]) => `<button class="posts-fmt" data-mode="${k}">${t(v)}</button>`).join('')}</div>
        <div class="posts-seg" role="tablist">${Object.entries({ ig: 'Instagram / Facebook', story: 'Story / TikTok', x: 'X / Threads / Bluesky' }).map(([k, v]) => `<button class="posts-fmt" data-fmt="${k}">${v}</button>`).join('')}</div>
        <label class="toggle small"><input type="checkbox" data-photos> ${t('Photos des pilotes')}</label>
        <label class="toggle small" title="${t("Début du texte sans le nom du vainqueur : le résultat se découvre en faisant défiler les images")}"><input type="checkbox" data-nospoil> ${t('Texte sans spoiler')}</label>
        <label class="small muted">${t('Signature')} <input type="text" class="posts-sig" maxlength="40" spellcheck="false"></label>
        <span class="spacer"></span>
        <button class="btn" data-open hidden>${icon('external')} ${t('Ouvrir le dossier')}</button>
        <button class="btn" data-stats>${icon('chart')} ${t('Statistiques')}</button>
        <button class="btn" data-all>${icon('save')} ${t('Enregistrer toutes les images')}</button>
        <button class="btn btn-accent" data-publish>${icon('megaphone')} ${t('Publier…')}</button>
      </div>
      <div class="posts-body"></div>`;
    document.body.appendChild(dlg);
    const sync = () => {
      for (const b of dlg.querySelectorAll('[data-fmt]')) b.classList.toggle('active', b.dataset.fmt === fmt);
      $('[data-photos]', dlg).checked = withPhotos;
      for (const b of dlg.querySelectorAll('[data-mode]')) b.classList.toggle('active', b.dataset.mode === mode);
      $('[data-nospoil]', dlg).checked = noSpoiler;
      $('[data-nospoil]', dlg).closest('label').hidden = mode === 'news';
      storageSet(OPT_KEY, { fmt, photos: withPhotos, noSpoiler, mode, linkComment });
    };
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
      const m = e.target.closest('[data-mode]')?.dataset.mode;
      if (m && m !== mode) { mode = m; sync(); render(dlg); }
      const f = e.target.closest('[data-fmt]')?.dataset.fmt;
      if (f && f !== fmt) { fmt = f; sync(); render(dlg); }
      if (e.target.closest('[data-stats]')) openStats();
      if (e.target.closest('[data-all]')) { try { await dlg.onSaveAll?.(); } catch (err) { toast(err.message, 5000, 'warning'); } }
      if (e.target.closest('[data-publish]')) { if (dlg.publish) dlg.publish(); else toast(t('Visuels en préparation, réessayez dans un instant'), 3000); }
      if (e.target.closest('[data-open]')) fetch('/api/posts/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: dlg.dataset.folder }) });
    });
    $('[data-photos]', dlg).addEventListener('change', (e) => { withPhotos = e.target.checked; sync(); render(dlg); });
    $('[data-nospoil]', dlg).addEventListener('change', (e) => { noSpoiler = e.target.checked; sync(); render(dlg); });
    // News : choix de la nouvelle, toutes les actus, titre et résumé corrigés à la main
    let te = null;
    dlg.addEventListener('change', (e) => {
      if (e.target.matches('[data-newspick]')) { newsSel = e.target.value; render(dlg); }
      if (e.target.matches('[data-newsall]')) { newsAll = e.target.checked; render(dlg); }
      if (e.target.matches('[data-linkcomment]')) { linkComment = e.target.checked; sync(); render(dlg); }
    });
    dlg.addEventListener('input', (e) => {
      if (!e.target.matches('[data-ntitle], [data-nsum]') || !newsSel) return;
      edits.set(newsSel, { title: $('[data-ntitle]', dlg).value, summary: $('[data-nsum]', dlg).value });
      clearTimeout(te);
      te = setTimeout(() => renderNewsOnly(dlg), 450);
    });
    const sig = $('.posts-sig', dlg);
    sig.value = storageGet(SIG_KEY, '@BenjyPaddock');
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

// Saisie du code (window.prompt n'existe pas dans l'application de bureau)
function askCode() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal creator-dlg';
    dlg.innerHTML = `<form method="dialog" class="creator-form">
      <label class="small muted" for="creatorCode">${t('Code du mode créateur :')}</label>
      <input id="creatorCode" type="password" autocomplete="off" spellcheck="false" maxlength="40" required>
      <div class="row"><span class="spacer"></span><button class="btn" value="" type="button" data-cancel>${t('Annuler')}</button><button class="btn btn-accent" value="ok">${t('Valider')}</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const input = $('#creatorCode', dlg);
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    $('[data-cancel]', dlg).addEventListener('click', () => done(''));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(''); });
    $('form', dlg).addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    dlg.showModal();
    input.focus();
  });
}

async function unlock() {
  if (enabled) { open(); return; }
  if (document.querySelector('.creator-dlg[open]')) return;
  const code = await askCode();
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
