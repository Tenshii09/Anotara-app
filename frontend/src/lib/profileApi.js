import { apiRequest } from "./apiClient";

export function getProfile(token) {
  return apiRequest("/api/profile", { token });
}

export function updateProfile(token, payload) {
  return apiRequest("/api/profile", {
    token,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateProfilePreferences(token, payload) {
  return apiRequest("/api/profile/preferences", {
    token,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function deleteAccount(token, confirmation) {
  return apiRequest("/api/account", {
    token,
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmation }),
  });
}
