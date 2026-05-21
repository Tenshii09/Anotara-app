import { API_BASE_URL } from "./config";
import { emitSessionExpired, getValidAccessToken } from "./authSession";

function normalizeErrorMessage(status, payload) {
  const payloadMessage =
    payload?.error || payload?.message || payload?.msg || payload?.detail;

  if (payloadMessage) {
    return String(payloadMessage);
  }

  if (status === 0) {
    return "You appear to be offline. Please reconnect and try again.";
  }
  if (status === 401 || status === 422) {
    return "Your session expired. Please log in again.";
  }
  if (status >= 500) {
    return "Server error. Please try again in a moment.";
  }

  return "Something went wrong while contacting the server.";
}

export async function apiRequest(path, options = {}) {
  const {
    token = "",
    headers = {},
    skipAuthRefresh = false,
    ...restOptions
  } = options;
  const baseUrl = String(API_BASE_URL || "").replace(/\/+$/, "");
  const requestPath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${path || ""}`;

  async function resolveToken(forceRefresh = false) {
    if (skipAuthRefresh) return token;
    try {
      return await getValidAccessToken({ forceRefresh });
    } catch {
      return token;
    }
  }

  async function sendRequest(authToken) {
    return fetch(`${baseUrl}${requestPath}`, {
      ...restOptions,
      credentials: restOptions.credentials || "include",
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
    });
  }

  try {
    let response = await sendRequest(await resolveToken(false));

    if (
      !skipAuthRefresh &&
      (response.status === 401 || response.status === 422)
    ) {
      try {
        response = await sendRequest(await resolveToken(true));
      } catch {
        emitSessionExpired("Your session expired. Please log in again.");
      }
    }

    const hasJsonBody = response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json");
    const payload = hasJsonBody ? await response.json() : null;

    if (!response.ok) {
      const requestError = new Error(
        normalizeErrorMessage(response.status, payload),
      );
      requestError.status = response.status;
      requestError.payload = payload;
      if (
        !skipAuthRefresh &&
        (response.status === 401 || response.status === 422)
      ) {
        emitSessionExpired(requestError.message);
      }
      throw requestError;
    }

    return payload;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    const networkError = new Error(
      typeof navigator !== "undefined" && !navigator.onLine
        ? "You appear to be offline. Please reconnect and try again."
        : "Could not reach the server. Please try again.",
    );
    networkError.status = 0;
    throw networkError;
  }
}
