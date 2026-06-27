/* Typed API client for the Aurora backend.
   Cookies carry the session (credentials: "include"); on a 401 we try one
   silent refresh before giving up. */

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { _retry?: boolean } = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });

  // one transparent refresh attempt
  if (res.status === 401 && !init._retry && path !== "/auth/refresh" && path !== "/auth/me") {
    const r = await fetch(API_BASE + "/auth/refresh", { method: "POST", credentials: "include" });
    if (r.ok) return request<T>(path, { ...init, _retry: true });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(msg || res.statusText, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
};

// ---- response types ----
export interface ApiUser {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  kycStatus: string;
  level: number;
  xp: number;
  joined: string;
}
export interface BalanceResp {
  balance: string;
  bonus: string;
  currency: string;
}
export interface BetResp {
  betId: string;
  game: string;
  amount: string;
  win: boolean;
  multiplier: number;
  payout: string;
  outcome: Record<string, unknown>;
  balance: string;
}
export interface TxResp {
  transactionId: string;
  status: string;
  balance: string;
}
