import {
  DISCOVER_RECENT_SEARCHES_KEY,
  PROFILE_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  TRIP_STORAGE_KEY,
  WIZARD_STORAGE_KEY,
} from "./config";

// These helpers wrap localStorage so the UI components do not repeat JSON parsing logic.
function readJSON(key, fallback = null) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

// Store structured data as JSON strings because localStorage only accepts text.
function writeJSON(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

// The wizard draft preserves in-progress answers if the user refreshes mid-flow.
export function saveWizardDraft(draft) {
  writeJSON(WIZARD_STORAGE_KEY, draft);
}

export function loadWizardDraft() {
  return readJSON(WIZARD_STORAGE_KEY, {});
}

// The generated trip is saved so the itinerary page can recover it after navigation or refresh.
export function saveTripData(trip) {
  writeJSON(TRIP_STORAGE_KEY, trip);
}

export function loadTripData() {
  return readJSON(TRIP_STORAGE_KEY, null);
}

export function clearTripData() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TRIP_STORAGE_KEY);
}

// Clear these when the user starts a brand-new plan or after a reset flow.
export function clearWizardDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(WIZARD_STORAGE_KEY);
}

// Auth requests need the JWT token, so keep a dedicated getter for it.
export function getStoredToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

export function saveStoredToken(token) {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function saveUserProfile(profile) {
  writeJSON(PROFILE_STORAGE_KEY, profile);
}

export function loadUserProfile() {
  return readJSON(PROFILE_STORAGE_KEY, null);
}

export function clearUserProfile() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export function loadDiscoverRecentSearches() {
  const searches = readJSON(DISCOVER_RECENT_SEARCHES_KEY, []);
  return Array.isArray(searches) ? searches : [];
}

export function saveDiscoverSearch(searchTerm) {
  const value = String(searchTerm || "").trim();
  if (!value) {
    return;
  }

  const existing = loadDiscoverRecentSearches();
  const deduped = [value, ...existing.filter((item) => item.toLowerCase() !== value.toLowerCase())];
  writeJSON(DISCOVER_RECENT_SEARCHES_KEY, deduped.slice(0, 8));
}

export function clearDiscoverRecentSearches() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(DISCOVER_RECENT_SEARCHES_KEY);
}
