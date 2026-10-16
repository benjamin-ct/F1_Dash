// Mode créateur : publication des posts sur les réseaux (X, Instagram, Facebook, Threads) et
// envoi de la vidéo en brouillon sur TikTok ; configuration des comptes.
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { makeVideo } from './social-video.js';

const NETS = [
  { id: 'instagram', name: 'Instagram', what: 'Carrousel des visuels (format Instagram)' },
  { id: 'facebook', name: 'Facebook', what: 'Post sur la page avec les visuels' },
  { id: 'threads', name: 'Threads', what: 'Carrousel des visuels' },
  { id: 'x', name: 'X', what: '4 visuels au format X' },
  { id: 'tiktok', name: 'TikTok', what: 'Vidéo en brouillon : vous ajoutez le son et publiez dans l\'appli TikTok' },
];

const api = async (path, body) => {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j;
};
const b64 = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
const png = async (canvas) => b64(await new Promise((r) => canvas.toBlob(r, 'image/png')));

let video = null;   // { blob, mime, url }
const KEYS_NOTE = "Les clés restent sur cet ordinateur (fichier de configuration de l'application) et ne sont jamais incluses dans une sauvegarde des réglages.";
const MUSIC_NOTE = "Pour une musique de votre choix, vérifiez que vous avez le droit de l'utiliser. Dans TikTok, vous pouvez aussi ajouter un son de la bibliothèque avant de publier.";
const PUBLIC_NOTE = "Les posts seront publics (TikTok : brouillon à finir dans l'appli).";

// ---------- Comptes ----------
const HELP = {
  x: ["Gratuit et sans clés : dans la fenêtre Posts, format X, boutons « Publier gratuitement » (X, Threads, Bluesky : texte prérempli, image à coller). Les clés ci-dessous ne servent qu'à publier automatiquement.",
    'developer.x.com : créez un projet et une app (accès payant à l\'usage, environ 0,015 $ par post).',
    'Dans l\'app, « User authentication settings » : autorisations « Read and write ».',
    '« Keys and tokens » : copiez API Key et API Key Secret, puis générez Access Token et Access Token Secret (après le passage en lecture-écriture).'],
  meta: ['Passez votre compte Instagram en compte professionnel (créateur) et reliez-le à votre page Facebook.',
    'developers.facebook.com : créez une app (type Business) ; identifiant et clé secrète dans Paramètres → Général.',
    'Outils → Explorateur de l\'API Graph : choisissez l\'app, ajoutez pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish et business_management, puis « Generate Access Token » et collez-le ici.'],
  threads: ['Dans l\'app Meta, ajoutez le cas d\'usage « Accéder à l\'API Threads » (threads_basic, threads_content_publish).',
    'Ajoutez votre compte Threads comme testeur, puis acceptez l\'invitation dans Threads (Paramètres → Compte → Autorisations du site web).',
    'Copiez la clé secrète Threads de l\'app et générez un jeton avec « User Token Generator ». Il est prolongé automatiquement.'],
  tiktok: ['developers.tiktok.com → Manage apps : créez une app avec Login Kit (plateforme Desktop) et Content Posting API.',
    'Login Kit : ajoutez l\'adresse de redirection {}.',
    'Autorisations user.info.basic et video.upload ; ajoutez votre compte TikTok comme utilisateur de test (sandbox).',
    'Collez client key et client secret, enregistrez, puis « Se connecter à TikTok ».'],
};
const FIELDS = {
  x: [['apiKey', 'API Key'], ['apiSecret', 'API Key Secret'], ['accessToken', 'Access Token'], ['accessSecret', 'Access Token Secret']],
  meta: [['appId', 'Identifiant de l\'app'], ['appSecret', 'Clé secrète de l\'app'], ['userToken', 'Jeton d\'accès (Explorateur de l\'API Graph)']],
  threads: [['appSecret', 'Clé secrète Threads'], ['token', 'Jeton Threads']],
  tiktok: [['clientKey', 'Client key'], ['clientSecret', 'Client secret']],
};
const TITLES = { x: 'X', meta: 'Instagram + Facebook', threads: 'Threads', tiktok: 'TikTok' };

async function accountsDialog(onChange) {
  let dlg = $('#socialAccDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'socialAccDlg';
    dlg.className = 'modal posts-acc-dlg';
    document.body.appendChild(dlg);
  }
  const info = await api('/api/social/accounts');
  const studio = await api('/api/social/studio').catch(() => ({ enabled: false }));
  const status = (k) => {
    const a = k === 'meta' ? [info.facebook, info.instagram] : [info[k]];
    const on = a.filter((x) => x?.connected);
    return on.length ? `<span class="posts-ok">${icon('check')} ${esc(on.map((x) => x.name).filter(Boolean).join(' · ') || t('Connecté'))}</span>` : `<span class="muted">${t('Non connecté')}</span>`;
  };
  const redirect = `http://127.0.0.1:${location.port || 80}/tiktok-callback/`;
  dlg.innerHTML = `<div class="sum-head"><b>${icon('lock')} ${t('Comptes des réseaux sociaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
    <div class="posts-acc-body">
      <p class="small muted">${t(KEYS_NOTE)}</p>
      ${Object.keys(FIELDS).map((k) => `<details class="posts-acc" data-net="${k}"><summary><b>${TITLES[k]}</b> ${status(k)}</summary>
        <ol class="small">${HELP[k].map((h) => `<li>${esc(t(h, redirect))}</li>`).join('')}</ol>
        ${FIELDS[k].map(([f, l]) => `<label class="small">${esc(t(l))}<input type="password" data-f="${f}" autocomplete="off" spellcheck="false"></label>`).join('')}
        <div class="row"><button class="btn small btn-accent" data-save>${t('Enregistrer et vérifier')}</button>
          ${k === 'tiktok' ? `<button class="btn small" data-tiktok ${info.tiktok.configured ? '' : 'disabled'}>${t('Se connecter à TikTok')}</button>` : ''}
          <button class="btn small" data-remove>${t('Déconnecter')}</button></div></details>`).join('')}
      <details class="posts-acc" data-studio ${studio.enabled ? '' : 'open'}><summary><b>${t('Page web (téléphone)')}</b> ${studio.enabled ? `<span class="posts-ok">${icon('check')} ${t('Activée')}</span>` : `<span class="muted">${t('Désactivée')}</span>`}</summary>
        <p class="small">${t("Préparez et publiez les posts depuis votre téléphone, même ordinateur éteint : grosses news et séances, publication sur Instagram, Facebook et Threads après confirmation, partage vers les autres applis. Les comptes ci-dessus et la connexion F1 TV sont envoyés chiffrés au serveur Paddock Live.")}</p>
        ${studio.enabled ? `<p class="small">${t('Adresse :')} <a href="${esc(studio.url)}" target="_blank" rel="noopener">${esc(studio.url)}</a> — ${t('entrez avec le code du mode créateur.')}</p>
          ${studio.error ? `<p class="small posts-warn">${icon('warning')} ${esc(studio.error)}</p>` : ''}
          ${studio.f1tv ? '' : `<p class="small muted">${icon('info')} ${t('Posts des séances : connectez F1 TV (Réglages → Compte F1 TV), les archives de la F1 sont réservées aux abonnés.')}</p>`}
          <div class="row"><button class="btn small" data-studio-copy>${icon('doc')} ${t("Copier l'adresse")}</button><button class="btn small" data-studio-sync>${t('Renvoyer les comptes')}</button><button class="btn small" data-studio-off>${t('Désactiver')}</button></div>`
        : `<label class="small">${t('Code du mode créateur')}<input type="password" data-studio-code autocomplete="off" spellcheck="false"></label>
          <div class="row"><button class="btn small btn-accent" data-studio-on>${t('Activer la page web')}</button></div>`}
      </details>
    </div>`;
  dlg.onclick = async (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); onChange?.(); return; }
    const sbtn = e.target.closest('[data-studio] button');
    if (sbtn) {
      try {
        sbtn.disabled = true;
        if (sbtn.dataset.studioOn !== undefined) {
          await api('/api/social/studio', { code: $('[data-studio-code]', dlg).value });
          toast(t('Page web activée'), 3000, 'check');
        } else if (sbtn.dataset.studioSync !== undefined) {
          const r = await api('/api/social/studio', { sync: true });
          if (r.error) throw new Error(r.error);
          toast(t('Comptes envoyés'), 2500, 'check');
        } else if (sbtn.dataset.studioOff !== undefined) {
          if (!window.confirm(t('Désactiver la page web ? Les comptes envoyés au serveur sont effacés.'))) return;
          await api('/api/social/studio', { off: true });
        } else if (sbtn.dataset.studioCopy !== undefined) {
          await navigator.clipboard.writeText(studio.url);
          toast(t('Adresse copiée'), 2000, 'check');
          return;
        }
        accountsDialog(onChange);
      } catch (err) { toast(err.message, 5000, 'warning'); } finally { sbtn.disabled = false; }
      return;
    }
    const box = e.target.closest('[data-net]');
    const btn = e.target.closest('button');
    if (!box || !btn) return;
    const k = box.dataset.net;
    const network = k === 'meta' ? 'facebook' : k;
    try {
      btn.disabled = true;
      if (btn.dataset.save !== undefined) {
        const body = { network };
        for (const i of box.querySelectorAll('[data-f]')) body[i.dataset.f] = i.value;
        await api('/api/social/accounts', body);
        toast(t('Compte enregistré'), 2500, 'check');
      } else if (btn.dataset.remove !== undefined) {
        await api('/api/social/accounts', { network, remove: true });
      } else if (btn.dataset.tiktok !== undefined) {
        const { url } = await api('/api/social/tiktok/login', {});
        window.open(url, '_blank');
        toast(t('Connectez-vous dans le navigateur, puis revenez ici et rouvrez cette fenêtre'), 6000, 'external');
      }
      accountsDialog(onChange);
    } catch (err) { toast(err.message, 6000, 'warning'); btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}

// ---------- Publication ----------
export async function openPublish({ d, caps, render, folder }) {
  let dlg = $('#publishDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'publishDlg';
    dlg.className = 'modal posts-pub-dlg';
    document.body.appendChild(dlg);
  }
  let info = {};
  try { info = await api('/api/social/accounts'); } catch (err) { toast(err.message, 5000, 'warning'); return; }
  const draw = () => {
    dlg.innerHTML = `<div class="sum-head"><b>${icon('megaphone')} ${t('Publier sur mes réseaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
      <div class="posts-pub-body">
        ${d.final ? '' : `<p class="posts-warn small">${icon('warning')} ${t('Séance pas terminée : résultats provisoires, au rythme de votre délai TV.')}</p>`}
        <div class="posts-nets">${NETS.map((n) => `<label class="posts-net ${info[n.id]?.connected ? '' : 'off'}">
          <input type="checkbox" data-net="${n.id}" ${info[n.id]?.connected ? 'checked' : 'disabled'}>
          <span><b>${n.name}</b> <span class="small muted">${esc(info[n.id]?.connected ? info[n.id].name || t('Connecté') : t('Non connecté'))}</span><br><span class="small muted">${esc(t(n.what))}</span></span>
          <span class="posts-st small" data-st="${n.id}"></span></label>`).join('')}</div>
        <button class="btn small" data-acc>${icon('lock')} ${t('Comptes…')}</button>
        <label class="small muted">${t(caps.facebook ? 'Texte Instagram' : 'Texte Instagram / Facebook')}<textarea rows="6" data-txt="instagram">${esc(caps.instagram)}</textarea></label>
        ${caps.facebook ? `<label class="small muted">${t("Texte Facebook (avec le lien de l'article)")}<textarea rows="6" data-txt="facebook">${esc(caps.facebook)}</textarea></label>` : ''}
        <label class="small muted">${t('Texte Threads (500 caractères max.)')}<textarea rows="3" data-txt="threads" maxlength="500">${esc(caps.threads)}</textarea></label>
        <label class="small muted">${t('Texte X (280 caractères max.)')}<textarea rows="3" data-txt="x">${esc(caps.x)}</textarea></label>
        <fieldset class="posts-video"><legend class="small">${t('Vidéo TikTok')}</legend>
          <div class="row small">
            <label class="toggle"><input type="radio" name="pmusic" value="gen" checked> ${t('Musique générée (libre de droits)')}</label>
            <label class="toggle"><input type="radio" name="pmusic" value="file"> ${t('Mon fichier audio')}</label>
            <label class="toggle"><input type="radio" name="pmusic" value="none"> ${t('Sans musique')}</label>
            <input type="file" accept="audio/*" data-audio hidden>
          </div>
          <div class="row"><button class="btn small" data-mkvideo>${icon('video')} ${t('Préparer la vidéo')}</button>
            <button class="btn small" data-savevideo ${video ? '' : 'disabled'}>${icon('save')} ${t('Enregistrer la vidéo')}</button><span class="small muted" data-vst></span></div>
          <video class="posts-vid" controls playsinline ${video ? `src="${video.url}"` : 'hidden'}></video>
          <p class="small muted">${t(MUSIC_NOTE)}</p>
        </fieldset>
        <div class="row"><span class="spacer"></span><button class="btn btn-accent" data-go>${icon('megaphone')} ${t('Publier maintenant')}</button></div>
      </div>`;
  };
  draw();
  const vst = () => $('[data-vst]', dlg);
  const buildVideo = async () => {
    const music = dlg.querySelector('[name="pmusic"]:checked')?.value || 'gen';
    const file = $('[data-audio]', dlg).files?.[0] || null;
    if (music === 'file' && !file) { $('[data-audio]', dlg).click(); throw new Error(t('Choisissez d\'abord un fichier audio')); }
    const slides = await render('story');
    const v = await makeVideo(slides, { music, file, onProgress: (p) => { if (vst()) vst().textContent = t('Enregistrement de la vidéo… {} %', Math.round(p * 100)); } });
    if (video?.url) URL.revokeObjectURL(video.url);
    video = { ...v, url: URL.createObjectURL(v.blob) };
    const el = $('.posts-vid', dlg);
    el.src = video.url; el.hidden = false;
    $('[data-savevideo]', dlg).disabled = false;
    vst().textContent = t('Vidéo prête ({} Mo)', (v.blob.size / 1e6).toFixed(1).replace('.', ','));
  };
  dlg.onchange = (e) => { if (e.target.name === 'pmusic' && e.target.value === 'file') $('[data-audio]', dlg).click(); };
  dlg.onclick = async (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
    if (e.target.closest('[data-acc]')) { accountsDialog(async () => { info = await api('/api/social/accounts').catch(() => info); draw(); }); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    try {
      if (btn.dataset.mkvideo !== undefined) { btn.disabled = true; await buildVideo(); btn.disabled = false; }
      if (btn.dataset.savevideo !== undefined && video) {
        const r = await api('/api/posts/save', { folder, name: 'tiktok-video', data: await b64(video.blob) });
        toast(t('Vidéo enregistrée dans {}', r.dir), 4000, 'check');
      }
      if (btn.dataset.go !== undefined) {
        const nets = [...dlg.querySelectorAll('[data-net]:checked')].map((i) => i.dataset.net);
        if (!nets.length) { toast(t('Cochez au moins un réseau'), 3000, 'warning'); return; }
        if (!window.confirm(`${t('Publier maintenant sur : {} ?', nets.map((n) => NETS.find((x) => x.id === n).name).join(', '))}\n\n${t(PUBLIC_NOTE)}`)) return;
        btn.disabled = true;
        const txt = (k) => $(`[data-txt="${k}"]`, dlg).value;
        let ig = null; let xs = null;
        for (const n of nets) {
          const st = $(`[data-st="${n}"]`, dlg);
          st.className = 'posts-st small'; st.textContent = t('Envoi…');
          // Temps écoulé : Instagram et Threads préparent chaque image avant de publier (jusqu'à quelques minutes)
          const t0 = Date.now();
          const tick = setInterval(() => { st.textContent = t('Envoi… {} s', Math.round((Date.now() - t0) / 1000)); }, 1000);
          try {
            let body;
            if (n === 'tiktok') {
              if (!video) await buildVideo();
              body = { network: n, video: await b64(video.blob), mime: video.mime };
            } else if (n === 'x') {
              xs ||= await Promise.all((await render('x')).slice(0, 4).map(png));
              body = { network: n, text: txt('x'), images: xs };
            } else {
              ig ||= await Promise.all((await render('ig')).map(png));
              body = { network: n, text: txt(n === 'threads' ? 'threads' : n === 'facebook' && caps.facebook ? 'facebook' : 'instagram'), images: ig };
            }
            const r = await api('/api/social/publish', body);
            st.className = 'posts-st small ok';
            st.innerHTML = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${icon('check')} ${t('Publié')}</a>` : `${icon('check')} ${esc(t(r.note || 'Envoyé'))}`;
          } catch (err) {
            st.className = 'posts-st small err';
            st.textContent = err.message;
          } finally {
            clearInterval(tick);
          }
        }
        btn.disabled = false;
      }
    } catch (err) { toast(err.message, 6000, 'warning'); btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}
