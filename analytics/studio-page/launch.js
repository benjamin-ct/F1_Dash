// Studio : kit de lancement des comptes (Benjy Paddock, Paddock Live) sur tous les réseaux, au même
// endroit. Pour chaque réseau : visuels ou vidéo, texte prêt (modifiable), publication directe
// quand le compte est relié au Studio (Instagram, Facebook, Threads, Bluesky), vidéo envoyée en
// brouillon TikTok ou en privé sur YouTube, sinon Partager / Copier le texte ; chaque réseau se
// coche « Fait » (gardé sur le téléphone).
import { openImageViewer } from '/shared/image-viewer.js';
import { $, $$, esc, api, icon, toast, store, session, IOS } from './ui.js';
import { sendPost, enterPage, goBack } from './editor.js';

const FILE = { ig: 'instagram', x: 'x', story: 'story' };
const files = (acc, kind, n) => Array.from({ length: n }, (_, i) => `/kit/${acc}/${FILE[kind]}-${i + 1}.jpg`);

// Textes du kit (textes-legendes-et-bios.md)
const ACCOUNTS = {
  benjy: {
    name: 'Benjy Paddock',
    match: /benjy/i,
    ig: 3, x: 3, story: 3,
    text: {
      instagram: `Bienvenue au paddock !

Nouveau compte, une seule idée : vivre chaque Grand Prix autrement.

Ici, juste après chaque course :
- le vainqueur, le podium et le classement complet
- les faits marquants : remontées, stratégies, safety cars, abandons
- les qualifs, les sprints et la course au titre

Rendez-vous au prochain Grand Prix. Abonne-toi et active les notifications pour avoir le récap dès le drapeau à damier.

Et toi, qui sera champion cette saison ? Dis-le en commentaire.

Récaps faits avec @paddockliveapp

#BenjyPaddock #F1 #Formula1 #Formule1 #F12026 #GrandPrix #Motorsport #F1Fans`,
      threads: `Bienvenue au paddock !

Nouveau compte : après chaque Grand Prix, le vainqueur, le podium, le classement complet, les faits marquants et la course au titre.

Rendez-vous au prochain GP. Et toi, qui sera champion cette saison ?

#F1 #BenjyPaddock`,
      x: `Nouveau compte ! Ici, juste après chaque Grand Prix : le vainqueur, le podium, le classement et les faits marquants de la course.

Rendez-vous au prochain GP, abonne-toi pour ne rien rater.

#BenjyPaddock #F1 #Formula1`,
      bluesky: `Bienvenue au paddock !

Nouveau compte : juste après chaque Grand Prix, le vainqueur, le podium, le classement complet et les faits marquants de la course.

Rendez-vous au prochain GP. Abonne-toi pour ne rien rater.

#F1 #Formula1 #BenjyPaddock`,
      tiktok: 'Bienvenue au paddock ! Le récap de chaque Grand Prix juste après la course. Abonne-toi pour le prochain GP #F1 #Formula1 #F1TikTok #BenjyPaddock #GrandPrix',
      youtube: `Bienvenue au paddock ! Le récap de chaque Grand Prix #Shorts

Le vainqueur, le podium, le classement et les faits marquants de chaque Grand Prix, juste après la course. Abonne-toi pour le prochain GP.

#F1 #Formula1 #BenjyPaddock #GrandPrix #Shorts`,
    },
  },
  paddocklive: {
    name: 'Paddock Live',
    match: /paddocklive/i,
    ig: 4, x: 4, story: 4,
    text: {
      instagram: `Voici Paddock Live.

Le mur des stands à la maison : toute la course en direct, calée sur ta TV, sans aucun spoiler.

- Chronos, écarts et secteurs en direct
- Carte GPS de toutes les voitures
- Radios d'équipe retranscrites et traduites
- Synchro avec ta diffusion : zéro spoiler
- Pneus, arrêts et simulateur de stratégie
- Replays, statistiques et classements de la saison

Sur ordinateur, téléphone et tablette.

Abonne-toi pour suivre les nouveautés et le lancement. Et pour les récaps de chaque course : @BenjyPaddock

#PaddockLive #F1 #Formula1 #Formule1 #F12026 #F1Fans #GrandPrix #Motorsport`,
      threads: `Voici Paddock Live : le mur des stands à la maison.

Chronos, carte GPS, radios d'équipe traduites, pneus et stratégie en direct, calés sur ta TV pour ne jamais te spoiler la course.

Abonne-toi pour suivre les nouveautés et le lancement. Les récaps de chaque course : @BenjyPaddock

#F1 #PaddockLive`,
      x: `Voici Paddock Live : toute la course en direct, calée sur ta TV. Chronos, carte GPS, radios traduites, stratégie... et zéro spoiler.

Abonne-toi pour suivre le lancement. Les récaps de chaque course : @BenjyPaddock

#PaddockLive #F1 #Formula1`,
      bluesky: `Voici Paddock Live : le mur des stands à la maison.

Chronos, carte GPS, radios d'équipe traduites, pneus et stratégie en direct, calés sur ta TV. Zéro spoiler.

Abonne-toi pour suivre le lancement. Les récaps de chaque course : @benjy.paddocklive.app

#F1 #PaddockLive`,
      tiktok: 'Le mur des stands à la maison : chronos, carte GPS, radios et stratégie en direct, calés sur ta TV. Zéro spoiler. Abonne-toi pour le lancement #F1 #Formula1 #F1TikTok #PaddockLive',
      youtube: `Paddock Live : la F1 en direct, calée sur ta TV #Shorts

Chronos, carte GPS, radios d'équipe traduites et stratégie en direct, calés sur ta diffusion TV. Zéro spoiler. Abonne-toi pour le lancement.

#F1 #Formula1 #PaddockLive #Shorts`,
    },
  },
};

// Réseaux du kit : api = publication directe par le Studio (compte relié) ; draft = vidéo envoyée
// par le serveur (brouillon TikTok, Short YouTube en privé) ; media = visuels utilisés
const NETS = [
  { id: 'instagram', name: 'Instagram', media: 'ig', text: 'instagram', api: 'instagram', hint: 'Carrousel' },
  { id: 'facebook', name: 'Facebook', media: 'ig', text: 'instagram', api: 'facebook', hint: 'Carrousel' },
  { id: 'threads', name: 'Threads', media: 'ig', text: 'threads', api: 'threads', hint: 'Carrousel' },
  { id: 'bluesky', name: 'Bluesky', media: 'x', text: 'bluesky', api: 'bluesky', hint: '4 images au plus', max: 300 },
  { id: 'x', name: 'X', media: 'x', text: 'x', hint: 'Images à joindre au post', max: 280, intent: 'https://x.com/intent/post?text=' },
  { id: 'tiktok', name: 'TikTok', media: 'video', text: 'tiktok', draft: 'tiktok', hint: 'Vidéo verticale : envoyée en brouillon, son et texte à ajouter dans TikTok' },
  { id: 'reels', name: 'Reels Instagram', media: 'reel', text: 'reels', draft: 'instagram-reel', who: 'instagram', hint: 'Même vidéo, en Reel (montré aussi dans le fil)' },
  { id: 'youtube', name: 'YouTube Shorts', media: 'video', text: 'youtube', draft: 'youtube', hint: '1re ligne = titre (100 caractères au plus). Envoyé en privé : verrouillé tant que l\'audit de l\'API YouTube n\'est pas passé' },
  { id: 'story', name: 'Stories Instagram et Facebook', media: 'story', hint: 'Une story par image, dans l\'ordre', stories: [['instagram-story', 'instagram', 'Instagram'], ['facebook-story', 'facebook', 'Facebook']] },
];

const done = () => store.get('launch')?.v || {};
const setDone = (acc, id, on) => {
  const d = done();
  d[`${acc}.${id}`] = on;
  store.set('launch', d);
};
// Vidéo : plein cadre (TikTok, Shorts) ; Reel : même vidéo un peu réduite, dans la partie visible sur iPhone
const mediaOf = (acc, kind) => (kind === 'video' || kind === 'reel' ? [`/kit/${acc}/${kind}.mp4`] : files(acc, kind, ACCOUNTS[acc][kind]));

// Fichiers du kit (gardés pendant la visite)
const blobs = new Map();
async function fileOf(url) {
  if (!blobs.has(url)) blobs.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`Fichier du kit introuvable (${r.status})`); return r.blob(); }));
  try { return await blobs.get(url); } catch (err) { blobs.delete(url); throw err; }
}
const fileName = (url) => url.split('/').slice(-2).join('-');

async function share(urls, text) {
  const list = await Promise.all(urls.map(async (u) => new File([await fileOf(u)], fileName(u), { type: u.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' })));
  if (navigator.canShare?.({ files: list })) {
    if (text) { try { await navigator.clipboard.writeText(text); } catch { /* presse-papiers refusé */ } }
    try { await navigator.share({ files: list }); } catch { /* partage annulé */ }
    if (text) toast('Texte copié : collez-le dans le post');
    return;
  }
  for (const [i, f] of list.entries()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    setTimeout(() => { a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, i * 250);
  }
  if (text) { try { await navigator.clipboard.writeText(text); toast('Fichiers enregistrés, texte copié'); } catch { toast('Fichiers enregistrés'); } }
}

let acc = 'benjy';
export function launchKit(back) {
  const root = $('#app');
  root.className = 'shell editing kit';
  root.innerHTML = `<header class="appbar"><button class="iconbtn" id="back" aria-label="Retour">${icon('back')}</button>
      <div class="titles"><b>Kit de lancement</b><small>Tous les réseaux au même endroit</small></div></header>
    <main class="page"><div id="kit"></div></main>`;
  enterPage(back);
  $('#back').onclick = goBack;
  render();
}

function render() {
  const a = ACCOUNTS[acc];
  const d = done();
  const n = NETS.filter((x) => d[`${acc}.${x.id}`]).length;
  $('#kit').innerHTML = `<div class="seg wide" id="acc">${Object.entries(ACCOUNTS).map(([k, v]) => `<button data-acc="${k}" class="${k === acc ? 'on' : ''}">${esc(v.name)}</button>`).join('')}</div>
    <p class="status kit-progress"><b>${n} / ${NETS.length}</b> réseaux faits pour ${esc(a.name)}</p>
    ${NETS.map((x) => block(x, a, !!d[`${acc}.${x.id}`])).join('')}`;
  $$('[data-acc]').forEach((b) => { b.onclick = () => { if (acc !== b.dataset.acc) { acc = b.dataset.acc; render(); scrollTo(0, 0); } }; });
  for (const x of NETS) bind(x);
}

function block(x, a, isDone) {
  const media = mediaOf(acc, x.media);
  // Reel : texte TikTok sans le hashtag propre à TikTok
  const text = x.text === 'reels' ? a.text.tiktok.replace(/\s*#F1TikTok\b/g, '') : x.text ? a.text[x.text] : '';
  // Publication directe seulement sur le compte du kit choisi (le Studio est relié à un seul compte
  // par réseau : pas de post de Paddock Live sur le compte de Benjy Paddock, ni l'inverse)
  const linked = x.api || x.draft ? session.me?.[x.api || x.who || x.draft] : null;
  const mine = (name) => (name && a.match.test(String(name).replace(/[\s._-]/g, '')) ? name : null);
  const account = mine(linked);
  const stories = (x.stories || []).filter(([, net]) => mine(session.me?.[net]));
  const thumbs = x.media === 'video' || x.media === 'reel'
    ? `<video src="${media[0]}" playsinline controls preload="metadata"></video>`
    : `<div class="kit-media ${x.media}">${media.map((u, i) => `<img src="${u}" alt="" loading="lazy" data-i="${i}">`).join('')}</div>`;
  return `<section class="panel kit-net${isDone ? ' done' : ''}" data-net="${x.id}">
      <div class="kit-head"><span class="grow"><b>${esc(x.name)}</b><small>${esc(x.hint)}</small></span>
        <label class="kit-done"><input type="checkbox" data-done ${isDone ? 'checked' : ''}><span>${isDone ? `${icon('check')} Fait` : 'À faire'}</span></label></div>
      ${thumbs}
      ${x.text ? `<textarea rows="${x.media === 'ig' ? 6 : 4}" data-text>${esc(text)}</textarea><small class="kit-count" data-count></small>` : ''}
      <div class="row kit-actions">
        ${account && x.api ? `<button class="btn primary small" data-publish>${icon('send')}Publier sur ${esc(account)}</button>` : ''}
        ${stories.map(([id, net, label]) => `<button class="btn primary small" data-story="${id}">${icon('send')}Story ${label} (${esc(session.me[net])})</button>`).join('')}
        ${account && x.draft ? `<button class="btn primary small" data-draft>${icon('send')}${{ tiktok: 'Brouillon', youtube: 'Envoyer en privé', 'instagram-reel': 'Publier le Reel' }[x.draft]} sur ${esc(account)}</button>` : ''}
        ${x.intent ? `<button class="btn small" data-intent>${icon('link')}Ouvrir ${esc(x.name)}</button>` : ''}
        <button class="btn small" data-share>${icon('share')}${IOS ? 'Partager' : 'Enregistrer'}</button>
        ${x.text ? `<button class="btn small" data-copy>${icon('copy')}Copier le texte</button>` : ''}
      </div>
      <p class="st" data-st></p>
    </section>`;
}

function bind(x) {
  const box = $(`[data-net="${x.id}"]`);
  const area = $('[data-text]', box);
  const media = mediaOf(acc, x.media);
  const count = () => {
    const c = $('[data-count]', box);
    if (!c || !area) return;
    const len = x.id === 'x' ? area.value.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length : area.value.length;
    c.textContent = x.max ? `${len} / ${x.max}` : `${len} caractères`;
    c.classList.toggle('err', !!x.max && len > x.max);
  };
  area?.addEventListener('input', count);
  count();
  $$('img[data-i]', box).forEach((img) => { img.onclick = () => openImageViewer(media.map((src, i) => ({ src, label: `${x.name} · ${i + 1}` })), Number(img.dataset.i)); });
  $('[data-done]', box).onchange = (e) => { setDone(acc, x.id, e.target.checked); render(); };
  const markDone = () => { setDone(acc, x.id, true); };
  if ($('[data-copy]', box)) $('[data-copy]', box).onclick = async () => { try { await navigator.clipboard.writeText(area.value); toast('Texte copié', 'ok'); } catch { toast('Copie refusée par le navigateur', 'bad'); } };
  $('[data-share]', box).onclick = async (e) => {
    const b = e.currentTarget;
    b.classList.add('busy');
    try { await share(media, area?.value || ''); } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); }
  };
  if ($('[data-intent]', box)) $('[data-intent]', box).onclick = () => { open(x.intent + encodeURIComponent(area.value), '_blank', 'noopener'); };
  $$('[data-story]', box).forEach((btn) => {
    btn.onclick = async () => {
      const st = $('[data-st]', box);
      const where = btn.textContent.trim();
      if (!confirm(`Publier maintenant ${media.length} stories (${where}) ?\n\nElles seront publiques pendant 24 heures.`)) return;
      btn.disabled = true;
      st.className = 'st';
      st.textContent = 'Envoi des stories…';
      try {
        const r = await sendPost(btn.dataset.story, '', await Promise.all(media.map(fileOf)));
        st.className = 'st ok';
        st.innerHTML = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(where)} : publiée ${icon('check')}</a>` : `${esc(where)} : publiée ${icon('check')}`;
        toast('Stories publiées', 'ok');
      } catch (err) {
        st.className = 'st err';
        st.textContent = err.message;
        btn.disabled = false;
      }
    };
  });
  if ($('[data-draft]', box)) {
    $('[data-draft]', box).onclick = async (e) => {
      const b = e.currentTarget;
      const st = $('[data-st]', box);
      const who = session.me?.[x.who || x.draft];
      if (!confirm({
        tiktok: `Envoyer la vidéo en brouillon sur TikTok (${who}) ?\n\nRien n'est publié : ouvrez ensuite la notification dans TikTok (Boîte de réception → Notifications système) pour ajouter le son, coller le texte et publier.`,
        youtube: `Envoyer la vidéo en privé sur YouTube (${who}) ?\n\nTant que votre projet Google n'a pas passé l'audit de l'API YouTube, YouTube la verrouille en privé (impossible de la rendre publique).`,
        'instagram-reel': `Publier maintenant le Reel sur Instagram (${who}) ?\n\nLe Reel sera public. La préparation de la vidéo par Instagram prend une à deux minutes.`,
      }[x.draft])) return;
      b.disabled = true;
      st.className = 'st';
      st.textContent = x.draft === 'instagram-reel' ? 'Publication du Reel (1 à 2 minutes)…' : 'Envoi de la vidéo…';
      try {
        const r = await api('video', { method: 'POST', body: JSON.stringify({ network: x.draft, src: media[0], text: area?.value || '' }) });
        if (x.draft === 'tiktok') { try { await navigator.clipboard.writeText(area.value); } catch { /* presse-papiers refusé */ } }
        st.className = 'st ok';
        st.innerHTML = `${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Envoyé ${icon('check')}</a>` : `Envoyé ${icon('check')}`} ${esc(r.note || '')}${x.draft === 'tiktok' ? ' (texte copié)' : ''}`;
        // TikTok encore en train de traiter la vidéo : nouvelle lecture de l'état à la demande
        if (r.pending && r.id) {
          const again = document.createElement('button');
          again.className = 'btn small';
          again.textContent = 'Vérifier l\'état';
          again.onclick = async () => {
            again.disabled = true;
            try {
              const s = await api('video', { method: 'POST', body: JSON.stringify({ network: 'tiktok-status', id: r.id }) });
              st.className = 'st ok';
              st.textContent = s.note;
              if (s.pending) st.append(' ', again);
            } catch (err) { st.className = 'st err'; st.textContent = err.message; }
            again.disabled = false;
          };
          st.append(' ', again);
        }
        toast({ tiktok: 'Brouillon envoyé dans TikTok', youtube: 'Short envoyé en privé', 'instagram-reel': 'Reel publié' }[x.draft], 'ok');
        if (x.draft === 'instagram-reel') { setDone(acc, x.id, true); setTimeout(render, 1500); }
      } catch (err) {
        st.className = 'st err';
        st.textContent = err.message;
      } finally { b.disabled = false; }
    };
  }
  if ($('[data-publish]', box)) {
    $('[data-publish]', box).onclick = async (e) => {
      const b = e.currentTarget;
      const st = $('[data-st]', box);
      if (!confirm(`Publier maintenant sur ${x.name} (${session.me?.[x.api]}) ?\n\nLe post sera public.`)) return;
      b.disabled = true;
      st.className = 'st';
      st.textContent = 'Envoi…';
      try {
        const imgs = await Promise.all(media.slice(0, x.id === 'bluesky' ? 4 : 10).map(fileOf));
        const r = await sendPost(x.api, area.value, imgs);
        st.className = 'st ok';
        st.innerHTML = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Publié ${icon('check')}</a>` : `Publié ${icon('check')}`;
        markDone();
        toast(`Publié sur ${x.name}`, 'ok');
        setTimeout(render, 1500);
      } catch (err) {
        st.className = 'st err';
        st.textContent = err.message;
        b.disabled = false;
      }
    };
  }
}
