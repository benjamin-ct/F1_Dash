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
