-- Base D1 des statistiques d'utilisation (une ligne par jour, fonction, appareil, version et système)
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  device TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, device, version, os)
);
CREATE INDEX IF NOT EXISTS counts_event ON counts (event, day);

-- Traductions partagées entre tous les utilisateurs (clé = empreinte de « langue source|langue cible|texte »)
CREATE TABLE IF NOT EXISTS translations (
  k TEXT PRIMARY KEY,
  out TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Nombre de traductions faites par l'IA chaque jour (plafond contre les abus)
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
