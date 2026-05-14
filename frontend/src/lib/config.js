// Central place for frontend runtime configuration.
// Vite exposes only variables prefixed with VITE_, so these values must live in the frontend env file.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Stable keys keep auth, wizard progress, and itinerary snapshots organized in localStorage.
export const TOKEN_STORAGE_KEY = "anotara_token";
export const TRIP_STORAGE_KEY = "anotara_trip";
export const WIZARD_STORAGE_KEY = "anotara_wizard";
