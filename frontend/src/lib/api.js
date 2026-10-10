const BASE = import.meta.env.VITE_API_URL || "";

let csrfToken = null;
let onUnauthorized = () => {};

export const setCsrf = (t) => { csrfToken = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || "Something went wrong.");
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { code: "network", message: "Can't reach the server. Check your connection." } });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b = {}) => request("POST", p, b),
  patch: (p, b) => request("PATCH", p, b),
  delete: (p) => request("DELETE", p),
};
