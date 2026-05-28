import { getApps, initializeApp } from "firebase/app";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";

import {
  FIREBASE_CONFIG,
  FIREBASE_VAPID_KEY,
  HAS_FIREBASE_CONFIG,
  getMissingFirebaseConfigKeys,
} from "./config";

let firebaseApp = null;
let pushWorkerRegistrationPromise = null;
let latestPushSubscription = null;
let lastPushRegistrationError = "";

function setLastPushRegistrationError(message) {
  lastPushRegistrationError = message;
  if (message) {
    console.error("[Push Debug] Registration error:", message);
  }
}

export function getLastPushRegistrationError() {
  return lastPushRegistrationError;
}

export function getFirebaseRegistrationFailureReason() {
  if (!HAS_FIREBASE_CONFIG || !FIREBASE_VAPID_KEY) {
    const missingKeys = getMissingFirebaseConfigKeys();
    return missingKeys.length
      ? `Missing or placeholder Firebase env vars in client/.env.local: ${missingKeys.join(", ")}`
      : "Firebase Cloud Messaging is not configured in client/.env.local.";
  }

  if (lastPushRegistrationError) {
    return lastPushRegistrationError;
  }

  return "Could not create a Firebase push token for this browser.";
}

function getFirebaseApp() {
  if (!HAS_FIREBASE_CONFIG) {
    return null;
  }

  console.log("[Firebase Debug] API Key exists:", !!import.meta.env.VITE_FIREBASE_API_KEY);
  console.log(
    "[Firebase Debug] Firebase project loaded:",
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "(missing)",
  );

  if (!firebaseApp) {
    try {
      firebaseApp = getApps().length
        ? getApps()[0]
        : initializeApp(FIREBASE_CONFIG);
    } catch (error) {
      console.error("[Firebase Debug] Raw Firebase initializeApp error:", error);
      console.error("[Firebase Debug] error.code:", error?.code);
      console.error("[Firebase Debug] error.message:", error?.message);
      setLastPushRegistrationError(error?.message || "Firebase app initialization failed.");
      return null;
    }
  }

  return firebaseApp;
}

async function isMessagingSupported() {
  try {
    const supported = await isSupported();
    console.log("[Push Debug] Firebase messaging supported:", supported);
    return supported;
  } catch (error) {
    console.error("[Push Debug] Firebase messaging support check failed:", error);
    setLastPushRegistrationError(
      error?.message || "Firebase messaging is not supported in this browser.",
    );
    return false;
  }
}

async function getPushWorkerRegistration() {
  if (!pushWorkerRegistrationPromise) {
    pushWorkerRegistrationPromise = (async () => {
      console.log(
        "[Push Debug] Waiting for the PWA service worker from virtual:pwa-register...",
      );

      const readyRegistration = await navigator.serviceWorker.ready;
      console.log("[Push Debug] Using ready service worker registration:", {
        scope: readyRegistration.scope,
        scriptURL: readyRegistration.active?.scriptURL || "no-active-worker",
        active: Boolean(readyRegistration.active),
      });

      return readyRegistration;
    })().catch((error) => {
      pushWorkerRegistrationPromise = null;
      setLastPushRegistrationError(
        error?.message || "The push service worker is not ready yet.",
      );
      throw error;
    });
  }

  return pushWorkerRegistrationPromise;
}

export async function getFirebasePushToken() {
  setLastPushRegistrationError("");

  console.log("[Push Debug] getFirebasePushToken() started", {
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasNotification: typeof window !== "undefined" && "Notification" in window,
    notificationPermission:
      typeof window !== "undefined" && "Notification" in window
        ? window.Notification.permission
        : "unavailable",
    hasFirebaseConfig: HAS_FIREBASE_CONFIG,
    hasVapidKey: Boolean(FIREBASE_VAPID_KEY),
    firebaseProjectId: FIREBASE_CONFIG.projectId,
    firebaseMessagingSenderId: FIREBASE_CONFIG.messagingSenderId,
  });

  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window) ||
    !HAS_FIREBASE_CONFIG ||
    !FIREBASE_VAPID_KEY
  ) {
    setLastPushRegistrationError(getFirebaseRegistrationFailureReason());
    return null;
  }

  if (window.Notification.permission !== "granted") {
    setLastPushRegistrationError(
      "Notification permission must be granted before Firebase can issue a push token.",
    );
    return null;
  }

  if (!(await isMessagingSupported())) {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) {
    setLastPushRegistrationError("Firebase app could not be initialized.");
    return null;
  }

  try {
    const messaging = getMessaging(app);
    const registration = await getPushWorkerRegistration();
    console.log("[Push Debug] Requesting Firebase token with service worker:", {
      scope: registration.scope,
      hasActiveWorker: Boolean(registration.active),
      scriptURL: registration.active?.scriptURL || "",
    });

    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    console.log("[Push Debug] Firebase token generated:", {
      hasToken: Boolean(token),
      tokenLength: token?.length || 0,
      tokenPreview: token ? `${token.slice(0, 18)}...${token.slice(-8)}` : "",
    });

    if (!token) {
      setLastPushRegistrationError(
        "Firebase returned an empty token. Confirm the VAPID key matches your Firebase web app.",
      );
      return null;
    }

    try {
      const subscription = await registration.pushManager.getSubscription();
      latestPushSubscription = subscription?.toJSON?.() || subscription || null;
      console.log(
        "[Push Debug] Browser Push Subscription object:",
        latestPushSubscription,
      );
    } catch (subscriptionError) {
      console.error(
        "[Push Debug] Could not read browser Push Subscription object:",
        subscriptionError,
      );
    }

    return token;
  } catch (error) {
    console.error("[Firebase Debug] Raw Firebase getToken error:", error);
    console.error("[Firebase Debug] error.code:", error?.code);
    console.error("[Firebase Debug] error.message:", error?.message);
    setLastPushRegistrationError(
      error?.message || "Firebase could not create a push token for this device.",
    );
    return null;
  }
}

export async function getBrowserPushSubscription() {
  const registration = await getPushWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  latestPushSubscription = subscription?.toJSON?.() || subscription || null;
  console.log(
    "[Push Debug] Explicit browser Push Subscription object:",
    latestPushSubscription,
  );
  return latestPushSubscription;
}

export function getLatestPushSubscription() {
  return latestPushSubscription;
}

export async function deleteFirebasePushToken() {
  if (!HAS_FIREBASE_CONFIG || !FIREBASE_VAPID_KEY) {
    resetFirebasePushState();
    return false;
  }

  if (!(await isMessagingSupported())) {
    resetFirebasePushState();
    return false;
  }

  const app = getFirebaseApp();
  if (!app) {
    resetFirebasePushState();
    return false;
  }

  try {
    const messaging = getMessaging(app);
    const deleted = await deleteToken(messaging);
    console.log("[Push Debug] Firebase cached token deleted:", deleted);
    return deleted;
  } catch (error) {
    console.error("[Push Debug] Firebase deleteToken failed:", error);
    console.error("[Push Debug] error.code:", error?.code);
    console.error("[Push Debug] error.message:", error?.message);
    return false;
  } finally {
    resetFirebasePushState();
  }
}

export function resetFirebasePushState() {
  firebaseApp = null;
  pushWorkerRegistrationPromise = null;
  latestPushSubscription = null;
  lastPushRegistrationError = "";
  console.log("[Push Debug] Firebase push state reset in memory.");
}
