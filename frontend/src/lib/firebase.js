import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

import {
  FIREBASE_CONFIG,
  FIREBASE_VAPID_KEY,
  HAS_FIREBASE_CONFIG,
} from "./config";

let firebaseApp = null;

function getFirebaseApp() {
  if (!HAS_FIREBASE_CONFIG) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length
      ? getApps()[0]
      : initializeApp(FIREBASE_CONFIG);
  }

  return firebaseApp;
}

async function isMessagingSupported() {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function getFirebasePushToken() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window) ||
    !HAS_FIREBASE_CONFIG ||
    !FIREBASE_VAPID_KEY
  ) {
    return null;
  }

  if (!(await isMessagingSupported())) {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.ready;
  return getToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}
