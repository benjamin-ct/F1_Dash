// Sources de l'Actu (flux officiels, écuries, pilotes, médias du monde entier), partagées par le
// serveur de l'appli et la page web du créateur.
const yt = (id, name, cat, lang = 'en') => ({ id: `yt-${id}`, name, kind: 'youtube', channel: id, cat, lang });
const rss = (id, name, url, cat, lang, extra = {}) => ({ id, name, kind: 'rss', url, cat, lang, ...extra });

// Sources par défaut. cat : 'official' (F1, FIA) | 'team' | 'driver' | 'media'.
// Chaînes YouTube : uniquement les chaînes officielles vérifiées (abonnés, nom).
export const DEFAULT_SOURCES = [
  rss('f1', 'Formula 1', 'https://www.formula1.com/en/latest/all.xml', 'official', 'en'),
  rss('fia-press', 'FIA — communiqués', 'https://www.fia.com/rss/press-release', 'official', 'en', { filter: 'f1' }),
  rss('fia-news', 'FIA — actualités', 'https://www.fia.com/rss/news', 'official', 'en', { filter: 'f1' }),
  yt('UCB_qr75-ydFVKSF9Dmo6izg', 'Formula 1 (YouTube)', 'official'),

  yt('UC7_VGkwCoKfqh1eZEkzey3A', 'Mercedes-AMG F1', 'team'),
  yt('UCQIyqMWCdx1GBvbw_Yi6lEA', 'Oracle Red Bull Racing', 'team'),
  yt('UC8dxVgZl9u5HeCOXnosCtuQ', 'McLaren', 'team'),
  yt('UC8pLH6_Dz4QwKYE-dtcaxeg', 'Aston Martin F1', 'team'),
  yt('UCU56G7ZKkB7xkua6EhMz5dg', 'Racing Bulls', 'team'),
  yt('UCaGImPpcZdJ_8Iu20lCbHHw', 'Haas F1 Team', 'team'),
  yt('UCl1yq_ZQvqEb_D93OVuIFGw', 'Sauber / Audi', 'team'),

  yt('UCwFIQ7wtJzYGFb2nZcVoNww', 'Lando Norris', 'driver'),
  yt('UCHl4MB8UalGLUydbWdBzG1Q', 'Lewis Hamilton', 'driver'),
  yt('UCIzIX1qgW7P3eF6JCk_afCA', 'Charles Leclerc', 'driver'),
  yt('UC1l8_AtyskpHP-weVx47POg', 'Carlos Sainz', 'driver'),

  rss('autosport', 'Autosport', 'https://www.autosport.com/rss/f1/news/', 'media', 'en'),
  rss('motorsport', 'Motorsport.com', 'https://www.motorsport.com/rss/f1/news/', 'media', 'en'),
  rss('the-race', 'The Race', 'https://www.the-race.com/category/formula-1/feed/', 'media', 'en'),
  rss('racefans', 'RaceFans', 'https://www.racefans.net/feed/', 'media', 'en'),
  rss('bbc', 'BBC Sport', 'https://feeds.bbci.co.uk/sport/formula1/rss.xml', 'media', 'en'),
  rss('sky', 'Sky Sports F1', 'https://www.skysports.com/rss/12433', 'media', 'en'),
  rss('guardian', 'The Guardian', 'https://www.theguardian.com/sport/formulaone/rss', 'media', 'en'),
  rss('racer', 'RACER', 'https://www.racer.com/category/f1/feed/', 'media', 'en'),
  rss('espn', 'ESPN', 'https://www.espn.com/espn/rss/f1/news', 'media', 'en'),

  rss('lequipe', "L'Équipe", 'https://dwh.lequipe.fr/api/edito/rss?path=/Formule-1/', 'media', 'fr'),
  rss('motorsport-fr', 'Motorsport.com France', 'https://fr.motorsport.com/rss/f1/news/', 'media', 'fr'),

  rss('marca', 'Marca', 'https://e00-marca.uecdn.es/rss/motor/formula1.xml', 'media', 'es'),
  rss('as', 'AS', 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/motor/subsection/formula_1/', 'media', 'es'),
  rss('motorsport-es', 'Motorsport.com España', 'https://es.motorsport.com/rss/f1/news/', 'media', 'es'),

  rss('gazzetta', 'La Gazzetta dello Sport', 'https://www.gazzetta.it/dynamic-feed/rss/section/Formula-1.xml', 'media', 'it'),
  rss('formulapassion', 'FormulaPassion', 'https://www.formulapassion.it/feed', 'media', 'it'),
  rss('motorsport-it', 'Motorsport.com Italia', 'https://it.motorsport.com/rss/f1/news/', 'media', 'it'),

  rss('motorsport-total', 'Motorsport-Total', 'https://www.motorsport-total.com/rss/rss_formel-1.xml', 'media', 'de'),
  rss('motorsport-magazin', 'Motorsport-Magazin', 'https://www.motorsport-magazin.com/rss/formel1.xml', 'media', 'de'),

  rss('motorsport-nl', 'Motorsport.com Nederland', 'https://nl.motorsport.com/rss/f1/news/', 'media', 'nl'),
  rss('motorsport-br', 'Motorsport.com Brasil', 'https://br.motorsport.com/rss/f1/news/', 'media', 'pt'),
  rss('as-web', 'auto sport web', 'https://www.as-web.jp/f1/feed', 'media', 'ja'),
  rss('motorsport-jp', 'Motorsport.com 日本版', 'https://jp.motorsport.com/rss/f1/news/', 'media', 'ja'),
];

// Adresse du flux d'une source
export function feedUrl(s) {
  if (s.kind === 'youtube') return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(s.channel)}`;
  if (s.kind === 'bsky') return `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(s.handle)}&limit=30&filter=posts_no_replies`;
  return s.url;
}
