import { getFirebasePushToken } from "./firebase";
import { apiRequest } from "./apiClient";
import { getStoredToken } from "./storage";

export const TEST_PUSH_NOTIFICATION_PAYLOAD = {
  title: "Ano-Tara! System Alert",
  body: "Test successful! Your push notifications are working perfectly.",
  icon: "/pwa-icon.svg",
  badge: "/pwa-maskable.svg",
  url: "/profile",
  tag: "anotara-test-push",
};

function assertNotificationSupport() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not available in this browser.");
  }
}

export async function requestNotificationPermission() {
  assertNotificationSupport();

  if (window.Notification.permission === "granted") {
    return "granted";
  }

  if (window.Notification.permission === "denied") {
    return "denied";
  }

  return window.Notification.requestPermission();
}

export async function triggerTestPushNotification() {
  const permission = await requestNotificationPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      message:
        permission === "denied"
          ? "Notifications are blocked. Enable them in your browser settings, then try again."
          : "Notification permission was not granted.",
    };
  }

  const registration = await navigator.serviceWorker.ready;
  let remotePushReady = false;

  try {
    const firebaseToken = await getFirebasePushToken();
    const accessToken = getStoredToken();

    if (firebaseToken && accessToken) {
      await apiRequest("/api/push-tokens", {
        method: "POST",
        token: accessToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: firebaseToken,
          platform: "web",
          user_agent: navigator.userAgent,
        }),
      });
      remotePushReady = true;
    }
  } catch {
    // Local demos should still prove the service worker notification path even
    // when FCM token creation is unavailable on the current network/device.
  }

  if (registration.active) {
    registration.active.postMessage({
      type: "ANOTARA_TEST_PUSH",
      payload: TEST_PUSH_NOTIFICATION_PAYLOAD,
    });
  } else {
    await registration.showNotification(TEST_PUSH_NOTIFICATION_PAYLOAD.title, {
      body: TEST_PUSH_NOTIFICATION_PAYLOAD.body,
      icon: TEST_PUSH_NOTIFICATION_PAYLOAD.icon,
      badge: TEST_PUSH_NOTIFICATION_PAYLOAD.badge,
      tag: TEST_PUSH_NOTIFICATION_PAYLOAD.tag,
      data: { url: TEST_PUSH_NOTIFICATION_PAYLOAD.url },
    });
  }

  return {
    ok: true,
    permission,
    remotePushReady,
    message: remotePushReady
      ? "Test push notification sent. This device is registered for remote pushes."
      : "Test push notification sent locally, but this device was not registered for remote pushes.",
  };
}
