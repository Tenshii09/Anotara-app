// Central place for frontend runtime configuration.
// Vite exposes only variables prefixed with VITE_, so these values must live in the frontend env file.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};
export const FIREBASE_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
export const HAS_FIREBASE_CONFIG = Boolean(
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.projectId &&
  FIREBASE_CONFIG.messagingSenderId &&
  FIREBASE_CONFIG.appId,
);

export function getMissingFirebaseConfigKeys() {
  const missingKeys = [];

  if (!FIREBASE_CONFIG.apiKey) missingKeys.push("VITE_FIREBASE_API_KEY");
  if (!FIREBASE_CONFIG.authDomain)
    missingKeys.push("VITE_FIREBASE_AUTH_DOMAIN");
  if (!FIREBASE_CONFIG.projectId) missingKeys.push("VITE_FIREBASE_PROJECT_ID");
  if (!FIREBASE_CONFIG.storageBucket)
    missingKeys.push("VITE_FIREBASE_STORAGE_BUCKET");
  if (!FIREBASE_CONFIG.messagingSenderId)
    missingKeys.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  if (!FIREBASE_CONFIG.appId) missingKeys.push("VITE_FIREBASE_APP_ID");
  if (!FIREBASE_VAPID_KEY) missingKeys.push("VITE_FIREBASE_VAPID_KEY");

  return missingKeys;
}

// Stable keys keep auth, wizard progress, and itinerary snapshots organized in localStorage.
export const TOKEN_STORAGE_KEY = "anotara_token";
export const TRIP_STORAGE_KEY = "anotara_trip";
export const WIZARD_STORAGE_KEY = "anotara_wizard";
