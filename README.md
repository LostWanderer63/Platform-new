# Aurora — Premium iGaming Platform

A next-generation casino & sportsbook UI — built like a AAA game launcher.
Immersive dark theme, glassmorphism, ambient lighting, fully responsive (mobile → desktop).

> Design concept / front-end prototype. Production-quality UI, mock data, no real money.

---

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build    # outputs static site to /dist
npm run preview  # serve the production build locally
```

Deploy: `/dist` is a static bundle — drop it on Vercel, Netlify, Cloudflare Pages, or any static host.

---

## Demo flow (for a walkthrough)

1. **Landing** (`/`) — marketing hero, featured games, trust stats.
2. **Sign up / Log in** — any input works (mock auth). Lands on the dashboard.
3. **Home** — promo hero, categories, continue-playing, live wins, jackpots, providers.
4. **Casino** — live search + category filters, full game grid, empty state.
5. **Game** — loads the game via **iframe/webview** (provider integration pattern); bet controls, live bets, provably-fair panel.
6. **Sports** — live odds, interactive bet slip with live payout calc.
7. **Wallet** — balance, deposit (card / bank / e-wallet), withdraw, transaction history.
8. **Profile / Admin** — player stats & achievements; operations dashboard with KPIs & charts.

**Access model:** browsing is open (explore mode); **playing and account pages require login**.

---

## Highlights

- **Design system** — token-driven (CSS variables → Tailwind), one accent theme locked (Aurora), 2 alternates available.
- **Component kit** — buttons, inputs, cards, tabs, badges, avatars, progress, skeletons, toasts — all states + a11y.
- **Real game covers** — a PNG per game in `public/games/` (generated; replace with licensed art anytime).
- **Game integration** — each game has a launch `url` loaded in an iframe; swap for real provider URLs in `src/data/mock.ts`.
- **Every action responds** — global toast feedback, working navigation, no dead buttons.
- **Accessible** — WCAG-minded contrast, focus rings, keyboard support, `prefers-reduced-motion`.

---

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router · lucide-react

## Structure

```
src/
  components/   ui/ · game/ · layout/ · common/
  pages/        Landing, Login, Register, Home, Casino, GamePage,
                Sports, Wallet, Profile, Admin, NotFound
  data/         mock.ts        (games, winners, transactions, player)
  lib/          auth.tsx · toast.tsx · cn.ts
public/
  games/        per-game PNG covers
  demo-game.html  iframe game-host demo
scripts/
  gen-covers.mjs  regenerate game cover PNGs  (npm run gen:covers)
```

## Customizing game art

- Drop a licensed `<id>.png` into `public/games/` (overrides the generated cover), **or**
- Set `img: "https://…"` on a game in `src/data/mock.ts`.
- Image-generation prompts (for an AI image MCP) live in `prompts/stitch-game-covers.md`.
