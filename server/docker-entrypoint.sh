#!/bin/sh
set -e

echo "→ applying database schema (prisma db push)…"
npx prisma db push --skip-generate

echo "→ starting Aurora API on :${PORT:-4000}"
exec node dist/main
