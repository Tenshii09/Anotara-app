import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteItinerary,
  duplicateItinerary,
  getSavedItineraries,
  updateTripStartDate,
} from "../lib/tripsApi";
import { clearStoredToken, getStoredToken, saveWizardDraft } from "../lib/storage";
import { tapHaptic, successHaptic, warningHaptic } from "../lib/haptics";
import BottomSheet from "./common/BottomSheet";

// Lifecycle tabs match the spec's segmented categorisation engine — keeps
// drafts, upcoming, active, and past trips visually distinct without losing
// any one of them inside the others.
const LIFECYCLE_TABS = [
  { id: "upcoming", label: "Upcoming", emptyArt: "🛫", emptyCopy: "No upcoming flights yet. Schedule one in seconds." },
  { id: "active", label: "Active", emptyArt: "🧭", emptyCopy: "No trips are happening today." },
  { id: "past", label: "Past", emptyArt: "📜", emptyCopy: "Your travel history is a blank canvas." },
  { id: "drafts", label: "Drafts", emptyArt: "✍️", emptyCopy: "Every great journey starts as a draft." },
];

const SORT_OPTIONS = [
  { id: "createdDesc", label: "Newest first" },
  { id: "createdAsc", label: "Oldest first" },
  { id: "travelSoonest", label: "Travel date · soonest" },
  { id: "alpha", label: "Destination A–Z" },
  { id: "budget", label: "Budget · low to high" },
];

const BUDGET_RANK = { low: 1, comfort: 2, high: 3 };

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildLifecycleStatus(trip, today) {
  const startDate = parseDate(trip.trip_start_date);
  if (!startDate) {
    return { state: "drafts", label: "Draft", labelKey: "draft" };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsedDays = Math.floor((todayDate.getTime() - startDate.getTime()) / msPerDay);
  const daysUntilStart = Math.ceil((startDate.getTime() - todayDate.getTime()) / msPerDay);
  const numDays = Number(trip.days || trip.num_days || 1);

  if (daysUntilStart > 0) {
    return {
      state: "upcoming",
      label: daysUntilStart === 1 ? "Starts in 1 day" : `Starts in ${daysUntilStart} days`,
      labelKey: "upcoming",
    };
  }
  if (elapsedDays >= numDays) {
    return { state: "past", label: "Trip completed", labelKey: "draft" };
  }
  return {
    state: "active",
    label: `Day ${elapsedDays + 1} of ${numDays}`,
    labelKey: "active",
  };
}

function formatRange(trip, lifecycle) {
  const startDate = parseDate(trip.trip_start_date);
  if (!startDate) return "Date not set";

  const numDays = Number(trip.days || trip.num_days || 1);
  const endDate = new Date(startDate.getTime() + (numDays - 1) * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });
  const yearFormatter = new Intl.DateTimeFormat("en-PH", { year: "numeric" });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}, ${yearFormatter.format(endDate)}${
    lifecycle.state === "upcoming" ? "" : ""
  }`;
}

function destinationInitials(destination) {
  return String(destination || "T")
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function destinationGradient(destination) {
  const seed = String(destination || "")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed + 64) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hueA}, 78%, 56%) 0%, hsl(${hueB}, 70%, 50%) 100%)`,
  };
}

export default function MyTripsPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const [sortId, setSortId] = useState("createdDesc");
  const [actionTrip, setActionTrip] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyTripId, setBusyTripId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadTrips() {
      const token = getStoredToken();
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        setError("");
        const data = await getSavedItineraries(token);
        setTrips(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (requestError.status === 401 || requestError.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }
        setError(requestError.message || "Failed to load trips.");
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, [navigate]);

  const today = useMemo(() => new Date(), []);

  const enrichedTrips = useMemo(
    () =>
      trips.map((trip) => {
        const lifecycle = buildLifecycleStatus(trip, today);
        return {
          ...trip,
          lifecycle,
          rangeLabel: formatRange(trip, lifecycle),
        };
      }),
    [trips, today],
  );

  const counts = useMemo(() => {
    return enrichedTrips.reduce(
      (accumulator, trip) => {
        accumulator[trip.lifecycle.state] = (accumulator[trip.lifecycle.state] || 0) + 1;
        return accumulator;
      },
      { upcoming: 0, active: 0, past: 0, drafts: 0 },
    );
  }, [enrichedTrips]);

  const filteredTrips = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    const filtered = enrichedTrips.filter((trip) => {
      if (trip.lifecycle.state !== activeTab) return false;
      if (!lowerSearch) return true;
      const haystack = [trip.destination, trip.budget, trip.trip_start_date, trip.created_at]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowerSearch);
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      switch (sortId) {
        case "createdAsc":
          return (left.created_at || "").localeCompare(right.created_at || "");
        case "travelSoonest": {
          const leftDate = left.trip_start_date || "9999";
          const rightDate = right.trip_start_date || "9999";
          return leftDate.localeCompare(rightDate);
        }
        case "alpha":
          return String(left.destination || "").localeCompare(String(right.destination || ""));
        case "budget":
          return (
            (BUDGET_RANK[String(left.budget || "comfort").toLowerCase()] || 2) -
            (BUDGET_RANK[String(right.budget || "comfort").toLowerCase()] || 2)
          );
        case "createdDesc":
        default:
          return (right.created_at || "").localeCompare(left.created_at || "");
      }
    });
    return sorted;
  }, [enrichedTrips, activeTab, sortId, searchTerm]);

  const activeTabMeta = LIFECYCLE_TABS.find((tab) => tab.id === activeTab) || LIFECYCLE_TABS[0];

  async function handleDateChange(tripId, nextDate) {
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }

    const normalizedDate = String(nextDate || "").trim() || null;
    const previousTrips = trips;
    setTrips((current) =>
      current.map((trip) =>
        trip.id === tripId ? { ...trip, trip_start_date: normalizedDate } : trip,
      ),
    );

    try {
      await updateTripStartDate(token, tripId, normalizedDate);
    } catch (requestError) {
      setTrips(previousTrips);
      if (requestError.status === 401 || requestError.status === 422) {
        clearStoredToken();
        navigate("/login");
        return;
      }
      setError(requestError.message || "Could not update trip start date.");
    }
  }

  async function handleDuplicate(trip) {
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      setBusyTripId(trip.id);
      successHaptic();
      const response = await duplicateItinerary(token, trip.id);
      const refreshed = await getSavedItineraries(token);
      setTrips(Array.isArray(refreshed) ? refreshed : []);
      setActionTrip(null);
      if (response?.itinerary_id) {
        setActiveTab("drafts");
      }
    } catch (requestError) {
      setError(requestError.message || "Could not duplicate trip.");
    } finally {
      setBusyTripId(null);
    }
  }

  function handleResume(trip) {
    tapHaptic();
    saveWizardDraft({
      destination: trip.destination || "",
      numDays: trip.days || trip.num_days || 3,
      preferences: Array.isArray(trip.preferences)
        ? trip.preferences
        : String(trip.preferences || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
      budget: trip.budget || "comfort",
      pacingStyle: trip.pacing_style || "Moderate",
      companionType: trip.companion_type || "Solo",
      transportMode: trip.transport_mode || "Public",
      accommodation: "",
      tripStartDate: trip.trip_start_date || "",
    });
    setActionTrip(null);
    navigate("/generate");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      warningHaptic();
      setBusyTripId(pendingDelete.id);
      await deleteItinerary(token, pendingDelete.id);
      setTrips((current) => current.filter((trip) => trip.id !== pendingDelete.id));
      setPendingDelete(null);
      setActionTrip(null);
    } catch (requestError) {
      setError(requestError.message || "Could not delete trip.");
    } finally {
      setBusyTripId(null);
    }
  }

  function handleShare(trip) {
    const url = `${window.location.origin}/itinerary/${trip.id}`;
    if (navigator.share) {
      navigator
        .share({ title: `Trip to ${trip.destination}`, url })
        .catch(() => {
          /* user cancelled */
        });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setActionTrip(null);
  }

  if (loading) {
    return (
      <main className="app-page">
        <section className="dashboard-shell">
          <article className="glass-card dashboard-empty">
            <h1 className="serif dashboard-title">Loading your trip vault...</h1>
          </article>
        </section>
      </main>
    );
  }

  const actionsForTrip = (trip) => {
    const base = [
      { id: "open", label: "Open itinerary", action: () => navigate(`/itinerary/${trip.id}`) },
      { id: "share", label: "Share invite link", action: () => handleShare(trip) },
    ];

    if (trip.lifecycle.state === "drafts" || trip.lifecycle.state === "upcoming") {
      base.unshift({ id: "resume", label: "Resume planning", action: () => handleResume(trip) });
    }
    if (trip.lifecycle.state === "past") {
      base.push({
        id: "duplicate",
        label: "Duplicate for reuse",
        action: () => handleDuplicate(trip),
      });
    }
    base.push({
      id: "delete",
      label: "Delete trip",
      danger: true,
      action: () => setPendingDelete(trip),
    });
    return base;
  };

  return (
    <main className="app-page">
      <section className="dashboard-shell">
        <header className="dashboard-topbar glass-card">
          <div>
            <p className="dashboard-kicker">Trip Vault</p>
            <h1 className="serif dashboard-title">My Journeys</h1>
            <p className="muted dashboard-subtitle">
              Manage every itinerary from draft to recap, all in one command center.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <span
              className="badge-pill"
              title={typeof navigator !== "undefined" && navigator.onLine ? "Synced with cloud" : "Offline mode"}
            >
              {typeof navigator !== "undefined" && navigator.onLine ? "☁️ Synced" : "⛅ Offline cache"}
            </span>
            <button
              className="top-action-link"
              type="button"
              onClick={() => navigate("/dashboard")}
            >
              ← Dashboard
            </button>
          </div>
        </header>

        <article className="glass-card" style={{ padding: 14 }}>
          <input
            type="search"
            className="wizard-input"
            placeholder="Search by destination, budget, or date..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search saved trips"
            style={{ width: "100%" }}
          />
        </article>

        <nav className="trip-segmented" aria-label="Trip lifecycle">
          {LIFECYCLE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`trip-segmented__btn${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => {
                tapHaptic();
                setActiveTab(tab.id);
              }}
            >
              {tab.label}
              <span className="trip-segmented__badge">{counts[tab.id] || 0}</span>
            </button>
          ))}
        </nav>

        {error ? <article className="error-banner">{error}</article> : null}

        <div className="trip-toolbar">
          <p className="muted" style={{ margin: 0 }}>
            Showing {filteredTrips.length} {activeTab} trip{filteredTrips.length === 1 ? "" : "s"}
          </p>
          <label className="trip-toolbar__sort">
            Sort
            <select
              value={sortId}
              onChange={(event) => setSortId(event.target.value)}
              style={{
                border: 0,
                background: "transparent",
                fontWeight: 700,
                color: "var(--text)",
              }}
              aria-label="Sort trips"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredTrips.length === 0 ? (
          <article className="glass-card trip-empty">
            <div className="trip-empty__art">{activeTabMeta.emptyArt}</div>
            <h3 className="serif" style={{ marginTop: 0 }}>{activeTabMeta.emptyCopy}</h3>
            <p className="muted">
              {activeTab === "drafts"
                ? "Drafts auto-save while you use the generator. Start one to see it land here."
                : "Tap Tara Na! below to start something new."}
            </p>
            <button className="btn-luxury" type="button" onClick={() => navigate("/generate")}>
              Launch Tara Na!
            </button>
          </article>
        ) : (
          <section style={{ display: "grid", gap: 12 }}>
            {filteredTrips.map((trip) => (
              <article key={trip.id} className="glass-card trip-card">
                <div className="trip-card__cover" style={destinationGradient(trip.destination)}>
                  {destinationInitials(trip.destination)}
                </div>
                <div className="trip-card__body">
                  <h3 className="trip-card__title">{trip.destination}</h3>
                  <p className="trip-card__meta">{trip.rangeLabel}</p>
                  <p className="trip-card__meta" style={{ textTransform: "capitalize" }}>
                    {trip.days || trip.num_days || "—"} days · {trip.budget || "comfort"}
                  </p>
                  <div className="trip-card__tags">
                    <span className="trip-card__chip">{trip.lifecycle.label}</span>
                    <span className="trip-card__chip" title="Offline availability">📥 Cached</span>
                  </div>
                  {trip.lifecycle.state === "drafts" ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        className="auth-input"
                        type="date"
                        style={{ width: "auto" }}
                        value={trip.trip_start_date || ""}
                        onChange={(event) => handleDateChange(trip.id, event.target.value)}
                        aria-label="Schedule trip start date"
                      />
                      <button
                        className="btn-luxury"
                        type="button"
                        onClick={() => handleResume(trip)}
                      >
                        Resume planning
                      </button>
                    </div>
                  ) : (
                    <button
                      className="top-action-link"
                      type="button"
                      style={{ marginTop: 8 }}
                      onClick={() => navigate(`/itinerary/${trip.id}`)}
                    >
                      View itinerary →
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="trip-card__menu"
                  aria-label="Trip actions"
                  onClick={() => setActionTrip(trip)}
                >
                  ⋮
                </button>
              </article>
            ))}
          </section>
        )}
      </section>

      <BottomSheet
        open={Boolean(actionTrip)}
        onClose={() => setActionTrip(null)}
        title={actionTrip ? `Manage ${actionTrip.destination}` : ""}
        size="sm"
      >
        {actionTrip
          ? actionsForTrip(actionTrip).map((action) => (
              <button
                key={action.id}
                type="button"
                className={action.danger ? "btn-luxury" : "btn-outline-luxury"}
                style={
                  action.danger
                    ? {
                        background:
                          "linear-gradient(135deg, #c44f5a 0%, #ff8a72 100%)",
                        color: "#fff",
                        width: "100%",
                      }
                    : { width: "100%" }
                }
                onClick={action.action}
                disabled={busyTripId === actionTrip.id}
              >
                {busyTripId === actionTrip.id ? "Working..." : action.label}
              </button>
            ))
          : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this trip?"
        size="sm"
        footer={
          <>
            <button className="btn-outline-luxury" type="button" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              className="btn-luxury"
              type="button"
              style={{ background: "linear-gradient(135deg, #c44f5a 0%, #ff8a72 100%)" }}
              onClick={confirmDelete}
              disabled={busyTripId === pendingDelete?.id}
            >
              {busyTripId === pendingDelete?.id ? "Deleting..." : "Delete permanently"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          {pendingDelete
            ? `"${pendingDelete.destination}" and its saved stops will be permanently removed from your account. This cannot be undone.`
            : ""}
        </p>
      </BottomSheet>
    </main>
  );
}
