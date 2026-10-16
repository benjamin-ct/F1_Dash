// Publications programmées (mode créateur) : le post est préparé (visuels et textes de chaque
// réseau) puis publié à l'heure choisie, tant que l'appli est ouverte. Gardées sur disque (dossier
// des données) : une publication manquée pendant que l'appli était fermée part à sa réouverture.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_JOBS = 40;
const MAX_LATE = 24 * 3600e3;   // au-delà d'un jour de retard : abandonnée (actualité dépassée)

export function createScheduler({ dir, publish, record = null, now = Date.now, every = 30e3, timers = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (id) => path.join(dir, `${id}.json`);
  const read = (id) => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } };
  const write = (job) => fs.writeFileSync(file(job.id), JSON.stringify(job));
  const ids = () => fs.readdirSync(dir).filter((f) => /^[a-f0-9]{16}\.json$/.test(f)).map((f) => f.slice(0, 16));
  let running = false;

  // Liste sans les visuels (lourds)
  const summary = (j) => ({ id: j.id, at: j.at, title: j.title || '', nets: j.posts.map((p) => p.body.network), status: j.status, results: j.results || {} });
  function list() {
    return ids().map(read).filter(Boolean).map(summary).sort((a, b) => a.at - b.at);
  }

  function add({ at, posts, title = '', record: rec = null }) {
    const t = Number(at);
    if (!Number.isFinite(t) || t < now() - 60e3 || t > now() + 60 * 24 * 3600e3) throw new Error('Date de publication invalide (dans les 60 prochains jours)');
    if (!Array.isArray(posts) || !posts.length || posts.some((p) => !p?.body?.network)) throw new Error('Aucun réseau choisi');
    if (ids().length >= MAX_JOBS) throw new Error(`${MAX_JOBS} publications programmées au plus`);
    const job = { id: crypto.randomBytes(8).toString('hex'), at: t, title: String(title).slice(0, 200), posts, record: rec, status: 'pending', results: {} };
    write(job);
    return summary(job);
  }

  function cancel(id) {
    if (!/^[a-f0-9]{16}$/.test(String(id))) throw new Error('Publication inconnue');
    const j = read(id);
    if (!j) throw new Error('Publication inconnue');
    if (j.status === 'running') throw new Error('Publication en cours');
    fs.rmSync(file(id), { force: true });
    return true;
  }

  // Publications arrivées à l'heure : un réseau après l'autre, résultat de chacun gardé
  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const id of ids()) {
        const j = read(id);
        if (!j || j.status !== 'pending' || j.at > now()) continue;
        if (now() - j.at > MAX_LATE) { j.status = 'expired'; write(j); continue; }
        j.status = 'running'; write(j);
        for (const p of j.posts) {
          const net = p.body.network;
          try {
            const r = await publish(net, p.body);
            j.results[net] = { ok: true, url: r?.url || null, ...(r?.visible === false ? { hidden: true } : {}) };
            if (record && j.record) await record({ ...j.record, at: now(), nets: { [net]: { id: r?.id ?? null, url: r?.url || null } } }).catch(() => {});
          } catch (err) { j.results[net] = { ok: false, error: err.message }; }
        }
        j.status = Object.values(j.results).every((r) => r.ok) ? 'done' : 'error';
        // Visuels retirés une fois publiés (place sur le disque)
        j.posts = j.posts.map((p) => ({ body: { network: p.body.network } }));
        write(j);
      }
      // Ménage : terminées depuis plus de 7 jours
      for (const id of ids()) { const j = read(id); if (j && j.status !== 'pending' && now() - j.at > 7 * 24 * 3600e3) fs.rmSync(file(id), { force: true }); }
    } finally { running = false; }
  }
  // Publication restée « en cours » (appli fermée pendant l'envoi) : marquée en erreur, jamais renvoyée en double
  for (const id of ids()) { const j = read(id); if (j?.status === 'running') { j.status = 'error'; j.results.interrupted = { ok: false, error: 'Appli fermée pendant la publication : vérifiez sur les réseaux' }; write(j); } }
  const timer = timers ? setInterval(() => { tick().catch(() => {}); }, every) : null;
  timer?.unref?.();
  return { list, add, cancel, tick, stop: () => clearInterval(timer) };
}
