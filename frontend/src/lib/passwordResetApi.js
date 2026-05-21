import { apiRequest } from "./apiClient";

export function requestPasswordReset(email) {
  return apiRequest("/api/password-reset/request", {
    method: "POST",
    skipAuthRefresh: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

export function validatePasswordResetToken(token) {
  return apiRequest(`/api/password-reset/validate/${encodeURIComponent(token)}`, {
    method: "GET",
    skipAuthRefresh: true,
  });
}

export function confirmPasswordReset(token, password) {
  return apiRequest("/api/password-reset/confirm", {
    method: "POST",
    skipAuthRefresh: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, password }),
  });
}
