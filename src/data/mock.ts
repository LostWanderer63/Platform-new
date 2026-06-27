/* ===========================================================================
   MOCK / DUMMY DATA — fully commented out.
   The app now reads real data from the backend:
     • games        -> GET /api/games/catalog        (useCatalog)
     • recent wins  -> GET /api/games/recent-wins     (WinsTicker, TabbedActivity, Profile, GamePage, Landing)
     • public stats -> GET /api/stats                 (LiveStats)
     • profile/stats-> GET /api/auth/me, /api/users/me/stats, /api/games/bets
     • transactions -> GET /api/transactions          (Wallet history)
   Only the `Game` TYPE is still exported (shared shape for catalog rows).
   =========================================================================== */

export interface Game {
  id: string;
  name: string;
  category: "Originals" | "Slots" | "Live" | "Crash" | "Table";
  provider: string;
  players: number;
  hot?: boolean;
  live?: boolean;
  hue: number; // drives gradient
  kw: string; // image search keywords (per-game, used by cover generator)
  img?: string; // optional override: licensed/external cover URL
  url: string; // game client launch URL (loaded via iframe/webview)
  status?: string; // ACTIVE | PAUSED | MAINTENANCE (from the catalog)
}

// ---- mock game catalog (REMOVED — games come from the DB now) ----
// export const ORIGINALS: Game[] = [...];
// export const SLOTS: Game[] = [...];
// export const LIVE: Game[] = [...];
// export const PROVIDERS = [...];

// ---- mock winners feed (REMOVED — use GET /api/games/recent-wins) ----
// export interface Winner { user; game; amount; multiplier }
// export const WINNERS: Winner[] = [
//   { user: "Nova_77", game: "Crash", amount: "$4,120", multiplier: "12.4x" },
//   ...
// ];

// ---- mock transactions (REMOVED — use GET /api/transactions) ----
// export interface Tx { id; type; method; amount; positive; status; date }
// export const TRANSACTIONS: Tx[] = [
//   { id: "tx1", type: "Deposit", method: "Visa •••• 4242", amount: "+$1,000.00", ... },
//   ...
// ];

// ---- mock player (REMOVED — use /api/auth/me + /api/users/me/stats + wallet balance) ----
// export const PLAYER = {
//   name: "Pruthvi", level: 42, xp: 6820, balance: "$8,412.50", wagered: "$248,910", ...
// };
