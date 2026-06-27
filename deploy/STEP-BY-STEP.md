# Aurora — exact free deploy walkthrough

## First: what gets deployed where (the map)

You have parts in your code. Each goes to ONE host:

| What (folder) | Goes to | You get back |
|---|---|---|
| nothing (just create a DB) | **Neon** | a `DATABASE_URL` string |
| `server/` (backend) | **Render** | `https://aurora-api.onrender.com` |
| repo root (player app) | **Cloudflare Pages** #1 | `https://aurora-player.pages.dev` |
| `admin/` (admin app) | **Cloudflare Pages** #2 | `https://aurora-admin.pages.dev` |
| `wrath-of-olympus` (games) | **Cloudflare Pages** #3 | `https://aurora-games.pages.dev` |

So: **1 database + 4 deploys** (1 backend, 3 static apps). All free.

---

## Step 0 — code on GitHub (required)
Render and Cloudflare can only deploy code that's on GitHub. You need 2 repos there:
- `igaming` (this project — backend + player + admin)
- `wrath-of-olympus` (the games)

👉 I can commit + push both for you. Just say "push to GitHub" and give me the repo
URLs (or "create new").

---

## Step 1 — Neon (the database)
1. Go to **neon.tech** → sign up (GitHub login is fine).
2. Click **Create Project**. Any name. Region near you. Postgres 16.
3. On the project page you'll see **Connection string** — copy it. Looks like:
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`
4. Save it somewhere — this is your **DATABASE_URL**. That's all for Neon.

---

## Step 2 — Render (the backend)
1. Go to **render.com** → sign up with GitHub.
2. Top right **New +** → **Blueprint**.
3. Pick the **igaming** repo → Render finds `render.yaml` automatically → **Apply**.
4. It will ask for the "sync: false" env values. Paste:
   - **DATABASE_URL** = the Neon string from Step 1
   - **JWT_ACCESS_SECRET** = `ea6830241ea3038bd6d171d9ee5bba7fa8b0cd7f988d894e5663a496005f4f3b831b6af7714ec1b4eef40bd53de378bf`
   - **JWT_REFRESH_SECRET** = `1a1edcd5e30da64d6a2b6aa5467046e0aa5f721b340eabc38d96f5288b1defbbf1b87fca3a847a66998285b0db25ef49`
   - **CORS_ORIGINS** = `https://aurora-player.pages.dev,https://aurora-admin.pages.dev`
   - **OLYMPUS_URL** = `https://aurora-games.pages.dev`
5. **Create / Deploy**. Wait for "Live".
6. Copy your service URL at the top — e.g. `https://aurora-api.onrender.com`.
   **If it's different, remember it** — you'll need it in Steps 4 & 5.
   Test: open `https://aurora-api.onrender.com/api/health` → should say `{"status":"ok"}`.

---

## Step 3 — Cloudflare Pages: GAMES
1. Go to **dash.cloudflare.com** → sign up → left menu **Workers & Pages**.
2. **Create** → **Pages** tab → **Connect to Git** → pick **wrath-of-olympus**.
3. Settings:
   - Project name: **aurora-games**
   - Framework preset: **None**
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**
4. **Save and Deploy**. When done, your URL is **https://aurora-games.pages.dev**.

---

## Step 4 — Cloudflare Pages: PLAYER
1. **Workers & Pages → Create → Pages → Connect to Git** → pick **igaming**.
2. Settings:
   - Project name: **aurora-player**
   - Framework preset: **None**
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**
   - (leave Root directory blank — it's the repo root)
3. Expand **Environment variables** → Add:
   - Name: **VITE_API_URL**   Value: **https://aurora-api.onrender.com/api**
     (use YOUR Render URL from Step 2 if different, keep the `/api`)
4. **Save and Deploy** → URL is **https://aurora-player.pages.dev**.

---

## Step 5 — Cloudflare Pages: ADMIN
Same repo as the player, but a different folder.
1. **Create → Pages → Connect to Git** → pick **igaming** again.
2. Settings:
   - Project name: **aurora-admin**
   - Framework preset: **None**
   - **Root directory (advanced): `admin`**   ← the only difference
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**
3. Environment variables → Add:
   - Name: **VITE_API_URL**   Value: **https://aurora-api.onrender.com/api**
4. **Save and Deploy** → URL is **https://aurora-admin.pages.dev**.

---

## Step 6 — seed the live database (one time)
1. Render → your **aurora-api** service → **Shell** tab (left menu).
2. Type:
   ```
   npm run seed:prod
   ```
3. It prints: admin created, dev1–dev5 created ($10,000 each), 23 games seeded.

---

## You're live
- Player: **https://aurora-player.pages.dev**
- Admin: **https://aurora-admin.pages.dev**

| Login | Username | Password |
|---|---|---|
| Admin | `admin@aurora.dev` | `admin12345` |
| Players | `dev1` … `dev5` | `dev12345` |

Each dev player starts with **$10,000**. Change the admin password after first login.

> Naming matters: if `aurora-player` / `aurora-admin` / `aurora-games` names are taken,
> you'll get different URLs — then update Render's `CORS_ORIGINS` and `OLYMPUS_URL`
> (and the Pages `VITE_API_URL`) to your real URLs, redeploy, and re-run `npm run seed:prod`.
