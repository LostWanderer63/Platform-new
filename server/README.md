# Aurora API — Backend

Production-grade iGaming backend. **NestJS + Prisma + PostgreSQL**, JWT auth in httpOnly
cookies, a double-entry money ledger (Decimal, ACID), rate limiting, helmet, CORS.

> Money is never a float. Balances live in an append-only `LedgerEntry` table; every
> credit/debit is applied inside a **serializable** transaction.

## Requirements

- Node 20+
- Docker (for local Postgres) — or any Postgres 14+ reachable via `DATABASE_URL`

## Setup

```bash
cd server
cp .env.example .env          # adjust secrets for prod
npm install

# start Postgres (Docker)
docker compose up -d db       # or: docker-compose up -d db

# create schema
npx prisma migrate dev --name init      # first time (creates migration)
# or, quick:  npx prisma db push

npm run db:seed               # optional: admin@aurora.dev / admin12345
npm run start:dev             # http://localhost:4000/api
```

No Docker? Point `DATABASE_URL` at any Postgres and run `prisma migrate deploy`.

## Auth model

- `POST /api/auth/register|login` set **httpOnly** cookies: `at` (access, 15m) + `rt` (refresh, 30d, scoped to `/api/auth`).
- Access token verified by `JwtAuthGuard` (reads `at` cookie or `Authorization: Bearer`).
- `POST /api/auth/refresh` rotates the refresh token (session row in DB, sha256-hashed).
- Passwords hashed with **argon2**.

## Endpoints (Phase 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/health` | — | liveness + db check |
| POST | `/api/auth/register` | — | create account (+ wallet, optional signup bonus) |
| POST | `/api/auth/login` | — | login (email or username) |
| POST | `/api/auth/refresh` | cookie | rotate tokens |
| POST | `/api/auth/logout` | cookie | revoke session |
| GET  | `/api/auth/me` | ✓ | current user profile |
| GET  | `/api/wallet` | ✓ | balance |
| GET  | `/api/wallet/ledger?limit=` | ✓ | ledger history |
| POST | `/api/wallet/deposit` | ✓ | `{ amount, method }` |
| POST | `/api/wallet/withdraw` | ✓ | `{ amount, method }` |
| GET  | `/api/users/me/stats` | ✓ | wagered/won/best multiplier |
| GET  | `/api/users/me/limits` | ✓ | responsible-gaming limits |
| PUT  | `/api/users/me/limits` | ✓ | `{ type, amount }` |
| POST | `/api/users/me/kyc` | ✓ | submit KYC (→ PENDING) |
| POST | `/api/users/me/self-exclude` | ✓ | self-exclude + kill sessions |

## Data model

`User · Wallet · LedgerEntry · Transaction · Bet · GameRound · ProvablyFairSeed ·
Session · RgLimit · AuditLog` — see [prisma/schema.prisma](prisma/schema.prisma). The schema
already covers games/transactions/realtime/admin for upcoming phases.

## Roadmap

- **Phase 1 (done):** auth, users, wallet ledger, RG limits, KYC, health.
- Phase 2: Games — provably-fair engine (server seed + client seed + nonce, HMAC-SHA256), bet → atomic settle, round history.
- Phase 3: Transactions — payment-provider adapters, deposit/withdraw workflows, statements.
- Phase 4: Realtime — WebSocket live wins feed, balance push, crash rounds.
- Phase 5: Admin — users, risk flags, GGR metrics; security hardening.
- Phase 6: wire the React app to this API (typed client, cookie auth, replace localStorage contexts).

## Quick test (after `start:dev`)

```bash
curl -i -c jar -X POST localhost:4000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","username":"player","password":"secret123"}'
curl -b jar localhost:4000/api/auth/me
curl -b jar -X POST localhost:4000/api/wallet/deposit \
  -H 'content-type: application/json' -d '{"amount":"100.00","method":"visa"}'
curl -b jar localhost:4000/api/wallet
```
