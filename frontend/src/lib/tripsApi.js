import { apiRequest } from "./apiClient";

export function getSavedItineraries(token) {
  return apiRequest("/api/itineraries", { token });
}

export function getSmartSuggestion(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}/smart-suggestion`, { token });
}

export function getDashboardSummary(token) {
  return apiRequest("/api/dashboard/summary", { token });
}

export function getDiscoverFeed(token, { tag = "all", query = "", limit = 18 } = {}) {
  const params = new URLSearchParams({
    tag,
    q: query,
    limit: String(limit),
  });
  return apiRequest(`/api/discover/feed?${params.toString()}`, { token });
}

export function updateTripStartDate(token, itineraryId, tripStartDate) {
  return apiRequest(`/api/itineraries/${itineraryId}/start-date`, {
    token,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trip_start_date: tripStartDate || null,
    }),
  });
}

export function deleteItinerary(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}`, {
    token,
    method: "DELETE",
  });
}

export function duplicateItinerary(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}/duplicate`, {
    token,
    method: "POST",
  });
}
