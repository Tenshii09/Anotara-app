// Central place for frontend runtime configuration.
// Vite exposes only variables prefixed with VITE_:
//   dev:  frontend/.env.local or frontend/.env
//   prod: frontend/.env.production (picked up by `npm run build`)
const PLACEHOLDER_ENV_VALUE = "PASTE_YOUR_KEY_HERE";

function readEnv(name) {
  const value = import.meta.env[name];
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function isPlaceholderEnvValue(value) {
  return (
    !value ||
    value === PLACEHOLDER_ENV_VALUE ||
    value === "PASTE_YOUR_VAPID_KEY_HERE" ||
    value.startsWith("PASTE_YOUR_")
  );
}

export const API_BASE_URL = readEnv("VITE_API_BASE_URL") || "http://127.0.0.1:5000";
export const MAPBOX_TOKEN = readEnv("VITE_MAPBOX_TOKEN");
export const FIREBASE_CONFIG = {
  apiKey: readEnv("VITE_FIREBASE_API_KEY"),
  authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnv("VITE_FIREBASE_APP_ID"),
  measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID"),
};
export const FIREBASE_VAPID_KEY = readEnv("VITE_FIREBASE_VAPID_KEY");
export const HAS_FIREBASE_CONFIG = Boolean(
  !isPlaceholderEnvValue(FIREBASE_CONFIG.apiKey) &&
  !isPlaceholderEnvValue(FIREBASE_CONFIG.authDomain) &&
  !isPlaceholderEnvValue(FIREBASE_CONFIG.projectId) &&
  !isPlaceholderEnvValue(FIREBASE_CONFIG.storageBucket) &&
  !isPlaceholderEnvValue(FIREBASE_CONFIG.messagingSenderId) &&
  !isPlaceholderEnvValue(FIREBASE_CONFIG.appId) &&
  !isPlaceholderEnvValue(FIREBASE_VAPID_KEY),
);

export function getMissingFirebaseConfigKeys() {
  const envChecks = [
    ["VITE_FIREBASE_API_KEY", FIREBASE_CONFIG.apiKey],
    ["VITE_FIREBASE_AUTH_DOMAIN", FIREBASE_CONFIG.authDomain],
    ["VITE_FIREBASE_PROJECT_ID", FIREBASE_CONFIG.projectId],
    ["VITE_FIREBASE_STORAGE_BUCKET", FIREBASE_CONFIG.storageBucket],
    ["VITE_FIREBASE_MESSAGING_SENDER_ID", FIREBASE_CONFIG.messagingSenderId],
    ["VITE_FIREBASE_APP_ID", FIREBASE_CONFIG.appId],
    ["VITE_FIREBASE_VAPID_KEY", FIREBASE_VAPID_KEY],
  ];

  return envChecks
    .filter(([, value]) => isPlaceholderEnvValue(value))
    .map(([name]) => name);
}

// Stable keys keep auth, wizard progress, and itinerary snapshots organized in localStorage.
export const TOKEN_STORAGE_KEY = "anotara_token";
export const TRIP_STORAGE_KEY = "anotara_trip";
export const WIZARD_STORAGE_KEY = "anotara_wizard";
export const PROFILE_STORAGE_KEY = "anotara_user_profile";
export const DISCOVER_RECENT_SEARCHES_KEY = "anotara_discover_recent_searches";
export const NOTIFICATION_READ_STATE_KEY = "anotara_notification_read_state";
export const NOTIFICATION_DELETED_STATE_KEY = "anotara_notification_deleted_state";
export const PUSH_TOKEN_STORAGE_KEY = "anotara_fcm_token";
export const PUSH_SUBSCRIPTION_STORAGE_KEY = "anotara_push_subscription";
