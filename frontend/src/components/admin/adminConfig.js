export const adminSections = [
  {
    id: "dashboard",
    path: "dashboard",
    group: "Overview",
    label: "Command Center",
    title: "System Health & Content Operations",
  },
  {
    id: "analytics",
    path: "analytics",
    group: "Intelligence",
    label: "Analytics",
    title: "Travel Demand Intelligence",
  },
  {
    id: "users",
    path: "users",
    group: "Operations",
    label: "Identity & Security",
    title: "User & Admin Management",
  },
  {
    id: "places",
    path: "places",
    group: "Operations",
    label: "Places Matrix",
    title: "Destination & Content Management",
  },
  {
    id: "trips",
    path: "trips",
    group: "Operations",
    label: "Trips",
    title: "Itinerary Inspection",
  },
  {
    id: "notifications",
    path: "notifications",
    group: "Operations",
    label: "Notifications",
    title: "Notification Monitoring",
  },
  {
    id: "email",
    path: "email",
    group: "Operations",
    label: "Email Ops",
    title: "Queue, delivery, and suppression review",
  },
  {
    id: "weather",
    path: "weather",
    group: "Operations",
    label: "Weather & Safety",
    title: "Alert review and pivot support",
  },
  {
    id: "ml",
    path: "ml",
    group: "Intelligence",
    label: "Random Forest",
    title: "Model Quality & Training Runs",
  },
  {
    id: "audit",
    path: "audit",
    group: "Governance",
    label: "Audit Trail",
    title: "Privileged Action History",
  },
  {
    id: "settings",
    path: "settings",
    group: "Governance",
    label: "Settings",
    title: "Operations Settings",
  },
  {
    id: "backups",
    path: "backups",
    group: "Infrastructure",
    label: "Backups",
    title: "Export, restore, and recovery history",
  },
];

export const placeStatuses = ["published", "review", "archived"];
export const userRoles = ["user", "admin", "super_admin"];
export const tablePageSize = 10;

export const emptyPlaceForm = {
  id: "",
  name: "",
  category: "",
  city: "",
  latitude: "",
  longitude: "",
  rating: "",
  tags: "",
  environment_type: "Mixed",
  physical_intensity: "Medium",
  status: "review",
  source: "admin",
  curation_notes: "",
};

export function getAdminSectionFromPath(pathname) {
  const section = String(pathname || "").split("/")[2] || "dashboard";
  return adminSections.some((item) => item.id === section)
    ? section
    : "dashboard";
}

export function toPlaceForm(place = {}) {
  return {
    ...emptyPlaceForm,
    ...place,
    latitude: place.latitude ?? "",
    longitude: place.longitude ?? "",
    rating: place.rating ?? "",
  };
}

export function cleanPlacePayload(form) {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    city: form.city.trim(),
    latitude: form.latitude === "" ? null : Number(form.latitude),
    longitude: form.longitude === "" ? null : Number(form.longitude),
    rating: form.rating === "" ? 0 : Number(form.rating),
    tags: form.tags.trim(),
    environment_type: form.environment_type.trim(),
    physical_intensity: form.physical_intensity.trim(),
    status: form.status,
    source: form.source.trim() || "admin",
    curation_notes: form.curation_notes.trim(),
  };
}

export function percent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

export function buildModelMetrics(latestModel = {}) {
  return [
    { label: "Accuracy", value: percent(latestModel.accuracy) },
    { label: "Precision", value: percent(latestModel.metrics?.precision) },
    { label: "Recall", value: percent(latestModel.metrics?.recall) },
    { label: "F1 score", value: percent(latestModel.metrics?.f1_score) },
  ];
}
