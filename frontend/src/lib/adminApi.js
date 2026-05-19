import { apiRequest } from "./apiClient";

export function getAdminOverview(token) {
  return apiRequest("/api/admin/overview", { token });
}

export function getAdminUsers(token, query = "") {
  const params = new URLSearchParams({ q: query, limit: "50" });
  return apiRequest(`/api/admin/users?${params.toString()}`, { token });
}

export function updateAdminUserRole(token, userId, role) {
  return apiRequest(`/api/admin/users/${userId}/role`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function updateAdminUserStatus(token, userId, accountStatus, reason = "") {
  return apiRequest(`/api/admin/users/${userId}/status`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_status: accountStatus, reason }),
  });
}

export function getAdminPlaces(token, query = "") {
  const params = new URLSearchParams({ q: query, limit: "80" });
  return apiRequest(`/api/admin/places?${params.toString()}`, { token });
}

export function createAdminPlace(token, place) {
  return apiRequest("/api/admin/places", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(place),
  });
}

export function updateAdminPlace(token, placeId, patch) {
  return apiRequest(`/api/admin/places/${placeId}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function getAdminAnalytics(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  const query = params.toString();
  return apiRequest(`/api/admin/analytics${query ? `?${query}` : ""}`, { token });
}

export function getAdminMlStatus(token) {
  return apiRequest("/api/admin/ml/status", { token });
}

export function requestAdminRetraining(token) {
  return apiRequest("/api/admin/ml/retrain", {
    token,
    method: "POST",
  });
}

export function getAdminItineraries(token, query = "", status = "") {
  const params = new URLSearchParams({ q: query, status, limit: "60" });
  return apiRequest(`/api/admin/itineraries?${params.toString()}`, { token });
}

export function getAdminItineraryDetail(token, itineraryId) {
  return apiRequest(`/api/admin/itineraries/${itineraryId}`, { token });
}

export function getAdminNotifications(token) {
  return apiRequest("/api/admin/notifications", { token });
}

export function sendAdminNotification(token, payload) {
  return apiRequest("/api/admin/notifications/send", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getAdminSettings(token) {
  return apiRequest("/api/admin/settings", { token });
}

export function updateAdminSetting(token, settingKey, settingValue) {
  return apiRequest(`/api/admin/settings/${settingKey}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setting_value: settingValue }),
  });
}

export function getAdminAuditLog(token, filters = {}) {
  const params = new URLSearchParams({ limit: "30" });
  if (filters.action) params.set("action", filters.action);
  if (filters.targetType) params.set("target_type", filters.targetType);
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  return apiRequest(`/api/admin/audit-log?${params.toString()}`, { token });
}
