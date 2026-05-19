import { API_BASE_URL } from "./config";
import {
  clearStoredToken,
  clearUserProfile,
  getStoredToken,
  saveStoredToken,
  saveUserProfile,
} from "./storage";

const REFRESH_SKEW_MS = 2 * 60 * 1000;
const SESSION_EXPIRED_EVENT = "anotara:session-expired";

let refreshPromise = null;
let refreshTimer = null;

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return null;
  }

  try {
    const payload = token.split(".")[1];
    const normalizedBase64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = normalizedBase64.padEnd(
      normalizedBase64.length + ((4 - (normalizedBase64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(window.atob(paddedBase64));
  } catch {
    return null;
  }
}

export function getTokenExpiresAt(token = getStoredToken()) {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

export function hasStoredSession() {
  const token = getStoredToken();
  const expiresAt = getTokenExpiresAt(token);
  return Boolean(token && expiresAt && expiresAt > Date.now());
}

function clearRefreshTimer() {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function getCookieValue(name) {
  if (typeof document === "undefined") return "";

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

export function persistSession({ token, username, role } = {}) {
  if (!token) return;

  saveStoredToken(token);
  saveUserProfile({
    name: username || "Traveler",
    role: role || "user",
  });
  scheduleSilentRefresh(token);
}

export function clearSession() {
  clearRefreshTimer();
  clearStoredToken();
  clearUserProfile();
}

export function emitSessionExpired(message = "Your session expired. Please log in again.") {
  clearSession();

  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: { message },
    }),
  );
}

export function onSessionExpired(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, callback);
}

export function scheduleSilentRefresh(token = getStoredToken()) {
  if (typeof window === "undefined") return;
  clearRefreshTimer();

  const expiresAt = getTokenExpiresAt(token);
  if (!expiresAt) return;

  const delay = Math.max(expiresAt - Date.now() - REFRESH_SKEW_MS, 10_000);
  refreshTimer = window.setTimeout(() => {
    refreshAccessToken().catch(() => {
      emitSessionExpired("Your session expired. Please log in again.");
    });
  }, delay);
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${API_BASE_URL}/api/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRF-TOKEN": getCookieValue("csrf_refresh_token"),
    },
  })
    .then(async (response) => {
      const hasJsonBody = response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json");
      const payload = hasJsonBody ? await response.json() : null;

      if (!response.ok || !payload?.token) {
        const error = new Error(
          payload?.error || "Your session expired. Please log in again.",
        );
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      persistSession(payload);
      return payload.token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function getValidAccessToken({ forceRefresh = false } = {}) {
  const token = getStoredToken();
  const expiresAt = getTokenExpiresAt(token);

  if (!token || !expiresAt) {
    throw new Error("No active session");
  }

  if (forceRefresh || expiresAt - Date.now() <= REFRESH_SKEW_MS) {
    return refreshAccessToken();
  }

  scheduleSilentRefresh(token);
  return token;
}

export async function logoutSession() {
  clearSession();

  try {
    await fetch(`${API_BASE_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* A failed logout request should not keep local credentials around. */
  }
}
