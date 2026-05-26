import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

const NOTIFICATION_ICON = "/ano-tara-notification-icon.png";
const NOTIFICATION_BADGE = "/ano-tara-notification-icon.png";

precacheAndRoute(self.__WB_MANIFEST || []);

function parseJsonPayload(data) {
  if (!data) return {};

  try {
    return data.json();
  } catch (jsonError) {
    try {
      return JSON.parse(data.text());
    } catch (textError) {
      console.error("Could not parse push payload.", { jsonError, textError });
      return {};
    }
  }
}

function buildNotificationPayload(payload = {}) {
  const nestedPayload = payload.message || payload;
  const webpushNotification = nestedPayload.webpush?.notification || {};
  const data = nestedPayload.data || {};
  const notification = nestedPayload.notification || {};
  const fcmOptions = nestedPayload.fcmOptions || nestedPayload.fcm_options || {};

  return {
    title:
      data.title ||
      webpushNotification.title ||
      notification.title ||
      "Ano-Tara! weather alert",
    body:
      data.body ||
      webpushNotification.body ||
      notification.body ||
      "Weather changed for one of your active itineraries.",
    icon: data.icon || webpushNotification.icon || NOTIFICATION_ICON,
    badge: data.badge || webpushNotification.badge || NOTIFICATION_BADGE,
    tag: data.tag || webpushNotification.tag || "anotara-push",
    url: data.url || fcmOptions.link || "/itinerary",
    itinerary_id: data.itinerary_id || "",
    focus_day: data.focus_day || "",
    notification_signature: data.notification_signature || "",
  };
}

function showAnoTaraNotification(payload = {}) {
  const title = payload.title || "Ano-Tara! System Alert";

  return self.registration.showNotification(title, {
    body:
      payload.body ||
      "Test successful! Your push notifications are working perfectly.",
    icon: payload.icon || NOTIFICATION_ICON,
    badge: payload.badge || NOTIFICATION_BADGE,
    tag: payload.tag || "anotara-push",
    data: {
      url: payload.url || "/profile",
      itinerary_id: payload.itinerary_id || "",
      focus_day: payload.focus_day || "",
      notification_signature: payload.notification_signature || "",
    },
  });
}

self.addEventListener("push", (event) => {
  const rawPayload = parseJsonPayload(event.data);
  const notificationPayload = buildNotificationPayload(rawPayload);

  event.waitUntil(showAnoTaraNotification(notificationPayload));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ANOTARA_TEST_PUSH") return;

  event.waitUntil(showAnoTaraNotification(event.data.payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/itinerary";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }

        return undefined;
      }),
  );
});

registerRoute(
  /^https:\/\/api\.geoapify\.com\/.*$/i,
  new NetworkFirst({
    cacheName: "geoapify-api",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  }),
  "GET",
);

