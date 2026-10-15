// Lumières connectées (expérimental) : les ampoules prennent la couleur des drapeaux, au rythme du
// délai TV (c'est la fenêtre principale qui donne l'état, déjà retardé). Philips Hue (pont local)
// ou Home Assistant. Réglages dans config.json (jamais renvoyés à l'interface : jeton, clé).
import http from 'node:http';
import https from 'node:https';
import { getConfig, saveConfig } from './config.js';

// Couleur de chaque état : [r, g, b], clignotement
export const LIGHT_STATES = {
  green: { rgb: [0, 220, 70], label: 'Drapeau vert' },
  yellow: { rgb: [255, 200, 0], label: 'Drapeau jaune' },
  sc: { rgb: [255, 120, 0], label: 'Voiture de sécurité', blink: true },
  vsc: { rgb: [255, 120, 0], label: 'VSC' },
  red: { rgb: [255, 0, 0], label: 'Drapeau rouge', blink: true },
  chequered: { rgb: [255, 255, 255], label: 'Drapeau à damier', blink: true },
  normal: { rgb: [255, 196, 140], label: 'Lumière normale' },
  off: { rgb: [0, 0, 0], label: 'Éteint' },
};

// RVB -> coordonnées xy et luminosité Hue (gamme large, correction gamma)
export function rgbToXy([r, g, b]) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.072310 + B * 0.986039;
  const sum = X + Y + Z;
  if (!sum) return { xy: [0.3227, 0.329], bri: 0 };
  return { xy: [Number((X / sum).toFixed(4)), Number((Y / sum).toFixed(4))], bri: Math.max(1, Math.round(Math.min(1, Y) * 254)) };
}

// Commande Hue (API locale v1) pour un état
export function hueBody(state) {
  const s = LIGHT_STATES[state];
  if (!s || state === 'off') return { on: false, transitiontime: 2 };
  const { xy } = rgbToXy(s.rgb);
  return { on: true, xy, bri: state === 'normal' ? 200 : 254, transitiontime: 2, alert: s.blink ? 'lselect' : 'none' };
}

// Appel de service Home Assistant pour un état : [service, données]
export function haCall(state, entities) {
  const s = LIGHT_STATES[state];
  if (!s || state === 'off') return ['light/turn_off', { entity_id: entities }];
  return ['light/turn_on', { entity_id: entities, rgb_color: s.rgb, brightness: state === 'normal' ? 200 : 255, ...(s.blink ? { flash: 'long' } : {}) }];
}

// Requête JSON vers un appareil du réseau local (http) ou Home Assistant (http / https)
export function jsonRequest(method, url, body, headers = {}, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body === undefined ? null : JSON.stringify(body);
    const req = lib.request(u, { method, headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers }, timeout }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { txt += c; if (txt.length > 2e6) req.destroy(); });
      res.on('end', () => {
        let json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch { /* réponse non JSON */ }
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`)); else resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Appareil injoignable (délai dépassé)')));
    req.on('error', (err) => reject(new Error(err.code === 'ECONNREFUSED' ? 'Connexion refusée' : err.message)));
    if (data) req.write(data);
    req.end();
  });
}

const conf = () => getConfig().lights || { provider: 'off' };

// Réglages visibles par l'interface (sans clé ni jeton)
export function lightsInfo() {
  const c = conf();
  return {
    provider: c.provider || 'off',
    after: c.after || 'normal',
    hue: { ip: c.hue?.ip || '', paired: !!c.hue?.user, lights: c.hue?.lights || [] },
    ha: { url: c.ha?.url || '', hasToken: !!c.ha?.token, entities: c.ha?.entities || [] },
  };
}

export function saveLights(patch) {
  const c = conf();
  const next = { ...c };
  if (['off', 'sim', 'hue', 'ha'].includes(patch.provider)) next.provider = patch.provider;
  if (['normal', 'off', 'keep'].includes(patch.after)) next.after = patch.after;
  if (patch.hue) {
    next.hue = { ...c.hue };
    if (typeof patch.hue.ip === 'string') next.hue.ip = patch.hue.ip.trim();
    if (Array.isArray(patch.hue.lights)) next.hue.lights = patch.hue.lights.map(String).slice(0, 50);
  }
  if (patch.ha) {
    next.ha = { ...c.ha };
    if (typeof patch.ha.url === 'string') next.ha.url = patch.ha.url.trim().replace(/\/+$/, '');
    if (typeof patch.ha.token === 'string' && patch.ha.token.trim()) next.ha.token = patch.ha.token.trim();
    if (Array.isArray(patch.ha.entities)) next.ha.entities = patch.ha.entities.map(String).filter((e) => /^light\.[\w]+$/.test(e)).slice(0, 50);
  }
  saveConfig({ lights: next });
  return lightsInfo();
}

// Philips Hue : pont trouvé par le service de découverte de Philips
export async function hueDiscover() {
  const list = await jsonRequest('GET', 'https://discovery.meethue.com/');
  return (list || []).map((b) => b.internalipaddress).filter(Boolean);
}

// Association : bouton du pont pressé dans les 30 s précédentes
export async function huePair(ip, base = `http://${ip}`) {
  const r = await jsonRequest('POST', `${base}/api`, { devicetype: 'paddocklive#ordinateur' });
  const ok = Array.isArray(r) ? r.find((x) => x.success)?.success?.username : null;
  if (!ok) {
    const err = Array.isArray(r) ? r.find((x) => x.error)?.error : null;
    throw new Error(err?.type === 101 ? 'Appuyez sur le bouton du pont Hue, puis recommencez dans les 30 secondes' : err?.description || 'Association refusée');
  }
  saveConfig({ lights: { ...conf(), hue: { ...conf().hue, ip, user: ok } } });
  return lightsInfo();
}

const hueBase = (c) => c.hue?.base || `http://${c.hue?.ip}`;
const haHeaders = (c) => ({ Authorization: `Bearer ${c.ha?.token}` });

// Lampes disponibles : [{ id, name }]
export async function lightDevices() {
  const c = conf();
  if (c.provider === 'hue') {
    if (!c.hue?.ip || !c.hue?.user) throw new Error('Pont Hue non associé');
    const r = await jsonRequest('GET', `${hueBase(c)}/api/${c.hue.user}/lights`);
    return Object.entries(r || {}).map(([id, l]) => ({ id, name: l?.name || `Lampe ${id}` }));
  }
  if (c.provider === 'ha') {
    if (!c.ha?.url || !c.ha?.token) throw new Error('Adresse ou jeton Home Assistant manquant');
    const r = await jsonRequest('GET', `${c.ha.url}/api/states`, undefined, haHeaders(c));
    return (r || []).filter((e) => /^light\./.test(e.entity_id)).map((e) => ({ id: e.entity_id, name: e.attributes?.friendly_name || e.entity_id }));
  }
  return [];
}

let last = null;
// Applique un état (vert, jaune, sc, vsc, rouge, damier, normal, off) à toutes les lampes choisies
export async function setLights(state, { force = false } = {}) {
  if (!LIGHT_STATES[state]) throw new Error('État inconnu');
  const c = conf();
  if (!force && state === last) return { ok: true, unchanged: true };
  last = state;
  if (c.provider === 'hue' && c.hue?.user && c.hue?.lights?.length) {
    const body = hueBody(state);
    await Promise.all(c.hue.lights.map((id) => jsonRequest('PUT', `${hueBase(c)}/api/${c.hue.user}/lights/${encodeURIComponent(id)}/state`, body)));
  } else if (c.provider === 'ha' && c.ha?.token && c.ha?.entities?.length) {
    const [service, data] = haCall(state, c.ha.entities);
    await jsonRequest('POST', `${c.ha.url}/api/services/${service}`, data, haHeaders(c));
  }
  return { ok: true, state };
}
