const rawApiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
export const API_BASE = rawApiUrl.endsWith("/api") ? rawApiUrl : `${rawApiUrl.replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { _retry?: boolean } = {}): Promise<T> {
  const token = localStorage.getItem("at");
  const headers: HeadersInit = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const res = await fetch(API_BASE + path, {
    credentials: "include",
    headers,
    ...init,
  });
  if (res.status === 401 && !init._retry && path !== "/auth/refresh" && path !== "/auth/me") {
    const rt = localStorage.getItem("rt");
    const r = await fetch(API_BASE + "/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (r.ok) {
      const data = await r.json();
      if (data.token) {
        localStorage.setItem("at", data.token);
        if (data.refreshToken) localStorage.setItem("rt", data.refreshToken);
        return request<T>(path, { ...init, _retry: true });
      }
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(msg || res.statusText, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p, { method: "GET" }),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
