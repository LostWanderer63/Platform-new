#!/usr/bin/env bash
# One-shot deploy: build the 3 frontends, bring up Postgres + API + Caddy, seed.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "✗ create .env from .env.example first"; exit 1; }
set -a; . ./.env; set +a

API_URL="https://api.${DOMAIN}/api"
ROOT=".."                              # repo root (relative to deploy/)
GAME_DIR="${GAME_DIR:-../../SlotGames/wrath-of-olympus}"

mkdir -p sites

echo "▶ building player → sites/player"
( cd "$ROOT" && npm ci && VITE_API_URL="$API_URL" npm run build )
rm -rf sites/player && cp -r "$ROOT/dist" sites/player

echo "▶ building admin → sites/admin"
( cd "$ROOT/admin" && npm ci && VITE_API_URL="$API_URL" npm run build )
rm -rf sites/admin && cp -r "$ROOT/admin/dist" sites/admin

echo "▶ building game cabinet → sites/games"
if [ ! -d "$GAME_DIR" ]; then
  if [ -n "${GAME_REPO:-}" ]; then
    echo "  cabinet not found — cloning $GAME_REPO"
    git clone --depth 1 "$GAME_REPO" "$GAME_DIR"
  else
    echo "✗ game cabinet not found at $GAME_DIR. Put it there, or set GAME_REPO in .env."; exit 1
  fi
fi
( cd "$GAME_DIR" && npm ci && npm run build )
rm -rf sites/games && cp -r "$GAME_DIR/dist" sites/games

echo "▶ starting Postgres + API + Caddy"
docker compose up -d --build

echo "▶ waiting for API health…"
until docker compose exec -T backend wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; do sleep 2; done

echo "▶ seeding admin user + 23 Olympus games"
docker compose exec -T backend npx ts-node prisma/seed.ts || true
docker compose exec -T -e OLYMPUS_URL="https://games.${DOMAIN}" backend node prisma/seed-olympus.mjs

echo
echo "✓ live:"
echo "    player → https://${DOMAIN}"
echo "    admin  → https://admin.${DOMAIN}   (admin@aurora.dev / admin12345 — change it)"
echo "    games  → https://games.${DOMAIN}"
echo "    api    → https://api.${DOMAIN}/api"
