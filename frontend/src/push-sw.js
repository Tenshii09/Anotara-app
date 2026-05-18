import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

import { FIREBASE_CONFIG, HAS_FIREBASE_CONFIG } from "./lib/config";

precacheAndRoute(self.__WB_MANIFEST || []);

function buildNotificationPayload(payload = {}) {
  const data = payload.data || {};
  const notification = payload.notification || {};

  return {
    title: data.title || notification.title || "Anotara weather alert",
    body:
      data.body ||
      notification.body ||
      "Weather changed for one of your active itineraries.",
    url: data.url || "/itinerary",
    itinerary_id: data.itinerary_id || "",
    focus_day: data.focus_day || "",
    notification_signature: data.notification_signature || "",
  };
}

if (HAS_FIREBASE_CONFIG) {
  const firebaseApp = initializeApp(FIREBASE_CONFIG);
  const messaging = getMessaging(firebaseApp);

  onBackgroundMessage(messaging, (payload) => {
    const notificationPayload = buildNotificationPayload(payload);

    self.registration.showNotification(notificationPayload.title, {
      body: notificationPayload.body,
      icon: "/pwa-icon.svg",
      badge: "/pwa-maskable.svg",
      data: {
        url: notificationPayload.url,
        itinerary_id: notificationPayload.itinerary_id,
        focus_day: notificationPayload.focus_day,
        notification_signature: notificationPayload.notification_signature,
      },
    });
  });
}

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

registerRoute(
  /^https?:\/\/[^/]+\/api\/.*$/i,
  new NetworkFirst({
    cacheName: "anotara-api",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 60 * 30,
      }),
    ],
  }),
  "GET",
);
