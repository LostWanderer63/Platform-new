# Deploying Aurora to the cloud

Four services + a database, behind one root domain on subdomains:

| Subdomain | App |
|---|---|
| `aurora.example.com` | Player |
| `admin.aurora.example.com` | Admin / back-office |
| `games.aurora.example.com` | Olympus game cabinet (iframed by player) |
| `api.aurora.example.com` | Backend API |

Caddy serves the 3 static apps + reverse-proxies the API, and issues TLS
automatically (Let's Encrypt). Postgres + API run as containers.

## Option A — one VPS with Docker (this folder)

**1. Get a server** (DigitalOcean / Hetzner / Lightsail / any Ubuntu box) with a
public IP. Install Docker + Docker Compose.

**2. DNS:** point these A records at the server IP:
`aurora.example.com`, `admin.aurora.example.com`, `games.aurora.example.com`,
`api.aurora.example.com` (or a wildcard `*.aurora.example.com`).

**3. Configure + deploy** (on the server, repo checked out with the game repo
as a sibling — `igaming/` and `SlotGames/wrath-of-olympus/`):
```bash
cd igaming/deploy
cp .env.example .env
nano .env                       # set DOMAIN, ACME_EMAIL, DB_PASSWORD, JWT secrets
./deploy.sh
```
`deploy.sh` builds the three frontends (with `VITE_API_URL=https://api.$DOMAIN/api`),
brings up Postgres + API + Caddy, pushes the DB schema, and seeds the admin user +
23 games. TLS is automatic once DNS resolves.

**Done.** Visit `https://$DOMAIN`. Admin: `admin@aurora.dev` / `admin12345` —
**change this password immediately.**

### Day-2
```bash
docker compose logs -f backend      # logs
docker compose restart backend      # restart api
./deploy.sh                         # redeploy after code changes
docker compose down                 # stop everything (DB volume kept)
```

## Option B — managed platform (no server to run)
- **Postgres:** Railway / Render / Supabase / Neon → copy `DATABASE_URL`.
- **Backend:** deploy `/server` as a Node web service (build `npm run build`,
  start `node dist/main`). Set env: `DATABASE_URL`, `CORS_ORIGINS`,
  `COOKIE_DOMAIN=.your.com`, `COOKIE_SECURE=true`, `JWT_*`, `OLYMPUS_URL`.
  Run `prisma db push` + the two seeds once.
- **Player / Admin / Game:** deploy each `dist/` to Vercel / Netlify / Cloudflare
  Pages as separate static sites. Build the player & admin with
  `VITE_API_URL=https://api.your.com/api`.

## Going to real money (before launch)
- Payments are simulated (`FakePaymentProvider`) — integrate a real PSP + KYC/AML.
- Get a gambling **license** for your jurisdiction.
- Switch `prisma db push` → real migrations (`prisma migrate deploy`).
- Rotate JWT secrets, enable DB backups, put the API behind a WAF/rate-limit.
- Game outcomes are client-reported (balance is ledger-owned); make outcomes
  server-authoritative with per-game visual sync for an audit.
