export const NOTIFICATION_EVENTS = [
  {
    id: "invite-cebu-adventure",
    type: "invite",
    icon: "users",
    title: "Maria invited you to Cebu Adventure",
    message:
      "Join the shared planning board and vote on food stops, island hops, and pacing before the trip locks in.",
    timestamp: "Today, 9:15 AM",
    source: "Trip invite",
    tone: "social",
    actionLabel: "Review invite",
    actionPath: "/my-trips",
  },
  {
    id: "export-palawan-pdf",
    type: "success",
    icon: "check",
    title: "Itinerary successfully exported",
    message:
      "Your Palawan Island Loop PDF is ready for offline sharing with companions.",
    timestamp: "Today, 8:42 AM",
    source: "Export",
    tone: "success",
    actionLabel: "Open trips",
    actionPath: "/my-trips",
  },
  {
    id: "weather-cebu-update",
    type: "alert",
    icon: "cloud",
    title: "System alert: Weather update",
    message:
      "Light afternoon rain is expected near Cebu City. Consider moving outdoor stops earlier in the day.",
    timestamp: "Yesterday, 6:30 PM",
    source: "Weather monitor",
    tone: "warning",
    actionLabel: "View itinerary",
    actionPath: "/itinerary",
  },
  {
    id: "offline-pack-ready",
    type: "system",
    icon: "download",
    title: "Offline travel pack refreshed",
    message:
      "Saved trip details and core app screens are prepared for unstable connectivity.",
    timestamp: "Mon, 4:10 PM",
    source: "PWA sync",
    tone: "system",
    actionLabel: "Go to dashboard",
    actionPath: "/dashboard",
  },
];

function formatNotificationTimestamp(value) {
  if (!value) return "Just now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - eventDay) / 86400000);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function normalizeNotificationEvents(events = []) {
  return events.map((event) => ({
    id: event.id,
    type: event.type || "system",
    icon: event.icon || "sparkles",
    title: event.title || "Ano-Tara update",
    message: event.message || event.body || "",
    timestamp: formatNotificationTimestamp(event.timestamp || event.created_at),
    source: event.source || "System",
    tone: event.tone || "system",
    actionLabel: event.actionLabel || event.action_label || "Open dashboard",
    actionPath: event.actionPath || event.action_path || "/dashboard",
  }));
}

export function getUnreadNotifications(readState = {}, events = NOTIFICATION_EVENTS) {
  return events.filter((event) => !readState[event.id]);
}

export function getVisibleNotifications(deletedState = {}, events = NOTIFICATION_EVENTS) {
  return events.filter((event) => !deletedState[event.id]);
}
