# Deploy Aurora free — click-through guide (everything is pre-wired)

5 free accounts, ~20 min, $0. I've already prepped the repo:
`render.yaml`, SPA `_redirects` for all 3 apps, the `SameSite=none` cookie toggle,
and a `seed:prod` that creates **admin + 5 dev accounts + 23 games**.

| Piece | Free host | URL (suggested name) |
|---|---|---|
| Postgres | **Neon** | (connection string) |
| Backend | **Render** (free Web Service) | `aurora-api.onrender.com` |
| Games | **Cloudflare Pages** | `aurora-games.pages.dev` |
| Player | **Cloudflare Pages** | `aurora-player.pages.dev` |
| Admin | **Cloudflare Pages** | `aurora-admin.pages.dev` |

> Use those exact project/service names if free, so the URLs below match. If a
> name is taken you'll get a different URL — just substitute your real one.

## Pre-filled values

**JWT secrets** (generated for you — paste into Render):
```
JWT_ACCESS_SECRET=ea6830241ea3038bd6d171d9ee5bba7fa8b0cd7f988d894e5663a496005f4f3b831b6af7714ec1b4eef40bd53de378bf
JWT_REFRESH_SECRET=1a1edcd5e30da64d6a2b6aa5467046e0aa5f721b340eabc38d96f5288b1defbbf1b87fca3a847a66998285b0db25ef49
```

## Step 0 — push both repos to GitHub
Render + Cloudflare deploy from GitHub. You need two repos:
- this one (`igaming`)
- the game cabinet (`wrath-of-olympus`)
(I can do the commits/push for you — just ask.)

## Step 1 — Neon (database)
neon.tech → New Project → copy the **connection string** (`postgresql://…`). That's
`DATABASE_URL`. Done.

## Step 2 — Render (backend)
render.com → **New → Blueprint** → pick the `igaming` repo (it reads `render.yaml`).
Set these env vars (the rest are auto):
```
DATABASE_URL        = <Neon string>
JWT_ACCESS_SECRET   = <above>
JWT_REFRESH_SECRET  = <above>
CORS_ORIGINS        = https://aurora-player.pages.dev,https://aurora-admin.pages.dev
OLYMPUS_URL         = https://aurora-games.pages.dev
```
Deploy. Your API is `https://aurora-api.onrender.com` (note your real URL).

## Step 3 — Cloudflare Pages (games)
pages: **Create → connect `wrath-of-olympus`** → Framework: none ·
Build: `npm run build` · Output: `dist`. Name it `aurora-games`. Deploy.

## Step 4 — Cloudflare Pages (player)
Create → connect `igaming` → Build: `npm run build` · Output: `dist` ·
**Env var:** `VITE_API_URL = https://aurora-api.onrender.com/api`. Name `aurora-player`. Deploy.

## Step 5 — Cloudflare Pages (admin)
Create → connect `igaming` again → **Root directory: `admin`** ·
Build: `npm run build` · Output: `dist` ·
**Env var:** `VITE_API_URL = https://aurora-api.onrender.com/api`. Name `aurora-admin`. Deploy.

## Step 6 — seed the live DB (once)
In **Render → your service → Shell**:
```
npm run seed:prod
```
Creates admin + 5 dev accounts ($10,000 each) + 23 games. (`render.yaml` already
pushes the schema on boot; this adds the data.)

## Done — log in
- **Platform** → https://aurora-player.pages.dev
- **Admin** → https://aurora-admin.pages.dev

| Login | User | Pass |
|---|---|---|
| Admin | `admin@aurora.dev` | `admin12345` |
| Player | `dev1` … `dev5` | `dev12345` |

All five dev players start with **$10,000**. Change the admin password.

### If something's off
- Login fails across domains → Render env `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`
  (already in `render.yaml`), and `CORS_ORIGINS` lists the exact Pages URLs (no trailing `/`).
- First request slow → Render free sleeps after ~15 min idle (~30s cold start). Normal.
- Games don't load → `OLYMPUS_URL` must equal the games Pages URL; re-run `npm run seed:prod` after fixing.
