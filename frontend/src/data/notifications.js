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

export function getUnreadNotifications(readState = {}) {
  return NOTIFICATION_EVENTS.filter((event) => !readState[event.id]);
}
