#!/usr/bin/env bash
# Lance F1 Dash (macOS / Linux) puis ouvre le navigateur.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js n'est pas installé : https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --omit=dev
( sleep 1.5; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) ) >/dev/null 2>&1 &
exec node server/index.js
