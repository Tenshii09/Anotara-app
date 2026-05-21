import {
  deleteFirebasePushToken,
  getBrowserPushSubscription,
  getFirebasePushToken,
  getFirebaseRegistrationFailureReason,
  getLastPushRegistrationError,
} from "./firebase";
import { apiRequest } from "./apiClient";
import {
  PUSH_SUBSCRIPTION_STORAGE_KEY,
  PUSH_TOKEN_STORAGE_KEY,
} from "./config";
import { getStoredToken } from "./storage";

export const TEST_PUSH_NOTIFICATION_PAYLOAD = {
  title: "Ano-Tara! System Alert",
  body: "Test successful! Your push notifications are working perfectly.",
  icon: "/ano-tara-notification-icon.png",
  badge: "/ano-tara-notification-icon.png",
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

  console.log("[Push Debug] Requesting notification permission.", {
    currentPermission: window.Notification.permission,
  });

  if (window.Notification.permission === "granted") {
    console.log("[Push Debug] Notification permission already granted.");
    return "granted";
  }

  if (window.Notification.permission === "denied") {
    console.warn("[Push Debug] Notification permission is already denied.");
    return "denied";
  }

  const permission = await window.Notification.requestPermission();
  console.log("[Push Debug] Notification permission request result:", permission);
  return permission;
}

export async function registerDeviceForRemotePush(accessToken = getStoredToken()) {
  if (!accessToken) {
    return {
      ok: false,
      reason: "You must be logged in before this device can receive remote push notifications.",
    };
  }

  const firebaseToken = await getFirebasePushToken();
  if (!firebaseToken) {
    return {
      ok: false,
      reason:
        getLastPushRegistrationError() || getFirebaseRegistrationFailureReason(),
    };
  }

  let subscription = null;
  try {
    subscription = await getBrowserPushSubscription();
  } catch (subscriptionError) {
    console.warn(
      "[Push Debug] Push subscription metadata was unavailable, saving Firebase token anyway:",
      subscriptionError,
    );
  }

  const pushTokenPayload = {
    token: firebaseToken,
    platform: "web",
    user_agent: navigator.userAgent,
    subscription,
    topics: ["all_users"],
  };

  console.log("[Push Debug] Sending push token payload to backend:", {
    ...pushTokenPayload,
    token: `${firebaseToken.slice(0, 18)}...${firebaseToken.slice(-8)}`,
  });

  try {
    await apiRequest("/api/push-tokens", {
      method: "POST",
      token: accessToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pushTokenPayload),
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, firebaseToken);
      if (subscription) {
        window.localStorage.setItem(
          PUSH_SUBSCRIPTION_STORAGE_KEY,
          JSON.stringify(subscription),
        );
      } else {
        window.localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error("[Push Debug] Backend push token save failed:", error);
    return {
      ok: false,
      reason:
        error?.message ||
        "The server rejected this device's push token. Check the Flask terminal logs.",
    };
  }

  return { ok: true, token: firebaseToken, subscription };
}

async function showLocalTestNotification(registration) {
  if (registration.active) {
    registration.active.postMessage({
      type: "ANOTARA_TEST_PUSH",
      payload: TEST_PUSH_NOTIFICATION_PAYLOAD,
    });
    return;
  }

  await registration.showNotification(TEST_PUSH_NOTIFICATION_PAYLOAD.title, {
    body: TEST_PUSH_NOTIFICATION_PAYLOAD.body,
    icon: TEST_PUSH_NOTIFICATION_PAYLOAD.icon,
    badge: TEST_PUSH_NOTIFICATION_PAYLOAD.badge,
    tag: TEST_PUSH_NOTIFICATION_PAYLOAD.tag,
    data: { url: TEST_PUSH_NOTIFICATION_PAYLOAD.url },
  });
}

export async function hardResetPush() {
  const steps = [];
  const accessToken = getStoredToken();
  let savedToken = "";

  if (typeof window !== "undefined") {
    savedToken = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || "";
  }

  const deletedFirebaseToken = await deleteFirebasePushToken();
  steps.push(
    deletedFirebaseToken
      ? "Deleted Firebase cached FCM token."
      : "Firebase cached FCM token was not present or could not be deleted.",
  );

  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      try {
        const subscription = await registration.pushManager?.getSubscription();
        if (subscription) {
          const unsubscribed = await subscription.unsubscribe();
          steps.push(
            unsubscribed
              ? "PushManager subscription unsubscribed."
              : "PushManager unsubscribe returned false.",
          );
        }
      } catch (error) {
        steps.push(`PushManager unsubscribe failed: ${error.message}`);
      }

      const unregistered = await registration.unregister();
      steps.push(
        unregistered
          ? `Service worker unregistered (${registration.scope}).`
          : `Service worker unregister returned false (${registration.scope}).`,
      );
    }
  } else {
    steps.push("Service workers are not available in this browser.");
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
    steps.push("Cleared saved FCM token data from localStorage.");
  }

  if (accessToken && savedToken) {
    try {
      await apiRequest("/api/push-tokens", {
        method: "DELETE",
        token: accessToken,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: savedToken }),
      });
      steps.push("Removed saved FCM token from the backend.");
    } catch (error) {
      steps.push(
        `Backend token cleanup skipped: ${error.message || "request failed"}`,
      );
    }
  }

  return {
    ok: true,
    message:
      "Hard reset complete. Restart Vite, refresh this page, then run Test Push Notification again.",
    steps,
  };
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
  const accessToken = getStoredToken();
  const remoteRegistration = await registerDeviceForRemotePush(accessToken);

  if (!remoteRegistration.ok) {
    await showLocalTestNotification(registration);
    return {
      ok: true,
      permission,
      remotePushReady: false,
      usedLocalFallback: true,
      message: `Local test notification shown, but remote registration failed: ${remoteRegistration.reason}`,
    };
  }

  try {
    console.log("[Push Debug] Requesting real remote push from backend...");
    const sendResult = await apiRequest("/api/push-tokens/test", {
      method: "POST",
      token: accessToken,
      headers: { "Content-Type": "application/json" },
    });
    const sentCount = Number(sendResult?.delivery?.sent || 0);

    console.log("[Push Debug] Backend remote push result:", sendResult);

    return {
      ok: true,
      permission,
      remotePushReady: true,
      usedLocalFallback: false,
      message:
        sentCount > 0
          ? `Real push notification sent through Firebase to ${sentCount} device${sentCount === 1 ? "" : "s"}. Check your system notification tray.`
          : "Device registered, but Firebase reported zero delivered notifications.",
      delivery: sendResult?.delivery,
    };
  } catch (error) {
    console.error("[Push Debug] Backend remote push send failed:", error);
    await showLocalTestNotification(registration);

    return {
      ok: true,
      permission,
      remotePushReady: false,
      usedLocalFallback: true,
      message:
        error?.message ||
        "Device is registered, but the server could not send a real Firebase push. Check Flask terminal logs for PUSH API ERROR.",
    };
  }
}
