const API = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api`;

const TOKEN_KEY = "eros_token";
const REFRESH_HEADER = "X-Refresh-Token";

let token = localStorage.getItem(TOKEN_KEY) || "";
let onSessionEnd = () => {};

export const getToken = () => token;

export const setToken = (next) => {
  token = next || "";
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

/** Called when the server rejects our token, so the app can drop back to the login screen. */
export const onUnauthorized = (fn) => { onSessionEnd = fn; };

export const apiFetch = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });

  // The backend slides the session forward by handing back a newer token; swapping it in is
  // what keeps an active user from being logged out at the 2-hour mark.
  const refreshed = res.headers.get(REFRESH_HEADER);
  if (refreshed) setToken(refreshed);

  if (res.status === 401) {
    const { detail } = await res.json().catch(() => ({}));
    setToken("");
    // "Invalid token" and friends are for us, not the user — only pass through the one
    // message that actually tells them something they can act on.
    const actionable = detail && detail.startsWith("Password changed");
    onSessionEnd(actionable ? detail : "Your session has ended. Please sign in again.");
    throw new Error(detail || "Not authenticated");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
};

export const login = async (username, password) => {
  // Deliberately not apiFetch: a failed login is a normal 401, not an expired session.
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "Could not sign in");
  setToken(body.token);
  return body.user;
};

export const fetchMe = () => apiFetch("/auth/me");

export const changePassword = async (current_password, new_password) => {
  const body = await apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
  if (body?.token) setToken(body.token);
  return body;
};

export const logout = () => setToken("");

export const createOrResetClientLogin = (clientId, username) =>
  apiFetch(`/clients/${clientId}/credentials`, {
    method: "POST",
    body: JSON.stringify(username ? { username } : {}),
  });
