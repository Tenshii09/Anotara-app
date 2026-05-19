import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PH_DESTINATIONS } from "../data/phDestinations";
import { PROFILE_STORAGE_KEY } from "../lib/config";
import {
  getDashboardSummary,
  getSmartSuggestion,
  getSavedItineraries,
  updateTripStartDate,
} from "../lib/tripsApi";
import {
  clearStoredToken,
  getStoredToken,
  loadDiscoverRecentSearches,
  saveDiscoverSearch,
  clearDiscoverRecentSearches,
  saveWizardDraft,
} from "../lib/storage";
import { tapHaptic } from "../lib/haptics";
import BrandLogo from "./common/BrandLogo";
import Avatar from "./common/Avatar";
import Icon from "./common/Icon";
import PageSkeleton from "./common/PageSkeleton";
import SearchOverlay from "./common/SearchOverlay";

const moodFilters = [
  { id: "all", label: "All vibes", icon: "sparkles", preferences: [] },
  { id: "nature", label: "Nature", icon: "leaf", preferences: ["nature"] },
  { id: "food", label: "Food trip", icon: "fork", preferences: ["food"] },
  { id: "beach", label: "Beach vibe", icon: "image", preferences: ["beach"] },
  { id: "culture", label: "Culture", icon: "shield", preferences: ["museums"] },
  { id: "night", label: "Night out", icon: "vibe", preferences: ["nightlife"] },
];

const moodDestinationPools = {
  all: PH_DESTINATIONS,
  nature: [
    "Palawan",
    "Benguet",
    "Bukidnon",
    "Siquijor",
    "Aurora",
    "Cagayan",
    "Sorsogon",
    "Davao Oriental",
  ],
  food: [
    "Cebu",
    "Pampanga",
    "Iloilo",
    "Bacolod",
    "Quezon",
    "Davao del Sur",
    "Laguna",
    "Pangasinan",
  ],
  beach: [
    "Palawan",
    "Cebu",
    "Aklan",
    "Bohol",
    "Surigao del Norte",
    "Batangas",
    "Zambales",
    "Siquijor",
  ],
  culture: [
    "Ilocos Sur",
    "Bohol",
    "Cebu",
    "Negros Occidental",
    "Manila",
    "Rizal",
    "Pampanga",
    "Laguna",
  ],
  night: [
    "Cebu",
    "Metro Manila",
    "Davao del Sur",
    "Pampanga",
    "Iloilo",
    "Laguna",
    "Batangas",
    "Cavite",
  ],
};

function normalizeTripPreferences(preferences) {
  if (Array.isArray(preferences)) {
    return preferences.map((value) => String(value).trim()).filter(Boolean);
  }

  return String(preferences || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatCountdownLabel(daysUntilStart) {
  if (daysUntilStart === 0) return "Starts today";
  if (daysUntilStart === 1) return "Starts in 1 day";
  return `Starts in ${daysUntilStart} days`;
}

function getTripTimeline(trip) {
  const numDays = Number(trip.days || trip.num_days || 1);
  const startDateValue = trip.trip_start_date;
  if (!startDateValue) return null;

  const tripStartDate = new Date(`${startDateValue}T00:00:00`);
  if (Number.isNaN(tripStartDate.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;

  const elapsedDays = Math.floor((today.getTime() - tripStartDate.getTime()) / msPerDay);
  const daysUntilStart = Math.ceil((tripStartDate.getTime() - today.getTime()) / msPerDay);

  if (daysUntilStart > 0) {
    return {
      state: "upcoming",
      progress: 0,
      countdown: daysUntilStart,
      label: formatCountdownLabel(daysUntilStart),
    };
  }

  if (elapsedDays >= numDays) {
    return {
      state: "completed",
      progress: 100,
      countdown: null,
      label: "Trip completed",
    };
  }

  const progress = Math.max(8, Math.min(100, Math.round(((elapsedDays + 1) / numDays) * 100)));
  return {
    state: "active",
    progress,
    countdown: 0,
    label: `Day ${elapsedDays + 1} of ${numDays}`,
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Magandang Umaga";
  if (hour < 18) return "Magandang Hapon";
  return "Magandang Gabi";
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return null;
  }
  try {
    const payload = token.split(".")[1];
    const normalizedBase64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = normalizedBase64.padEnd(
      normalizedBase64.length + ((4 - (normalizedBase64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(paddedBase64));
  } catch {
    return null;
  }
}

function getDisplayName() {
  if (typeof window === "undefined") return "Traveler";
  try {
    const rawProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (rawProfile) {
      const profile = JSON.parse(rawProfile);
      if (profile?.name) return String(profile.name);
    }
  } catch {
    /* ignore */
  }
  const token = getStoredToken();
  const payload = decodeJwtPayload(token);
  // Avoid surfacing the bare subject id from the JWT as a name — fall back to a friendly default.
  return payload?.name || payload?.username || "Traveler";
}

// Derive a coarse Explorer Level from total saved trips so the gamification
// ring on the header avatar has something meaningful to grow against.
function deriveExplorerLevel(totalTrips) {
  if (totalTrips >= 20) return { level: 6, label: "Elite Wanderer", progress: 100 };
  if (totalTrips >= 12) return { level: 5, label: "Master Voyager", progress: 90 };
  if (totalTrips >= 8) return { level: 4, label: "Seasoned Flier", progress: 75 };
  if (totalTrips >= 5) return { level: 3, label: "Wayfinder", progress: 60 };
  if (totalTrips >= 2) return { level: 2, label: "Trailblazer", progress: 40 };
  if (totalTrips >= 1) return { level: 1, label: "Fresh Flier", progress: 22 };
  return { level: 1, label: "Novice Flier", progress: 8 };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMoodId, setSelectedMoodId] = useState("all");
  const [savedTrips, setSavedTrips] = useState([]);
  const [smartSuggestion, setSmartSuggestion] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  // Lazy initializer keeps the localStorage access out of an effect, so the
  // greeting renders correctly on first paint without triggering a cascading
  // re-render that the React Compiler-flavored lint rule disallows.
  const [displayName] = useState(() => getDisplayName());
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => loadDiscoverRecentSearches());
  const [revealedReason, setRevealedReason] = useState(null);

  useEffect(() => {
    async function loadDashboardData() {
      const token = getStoredToken();
      if (!token) {
        navigate("/login");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const trips = await getSavedItineraries(token);
        const normalizedTrips = Array.isArray(trips) ? trips : [];
        setSavedTrips(normalizedTrips);

        try {
          const summary = await getDashboardSummary(token);
          setDashboardSummary(summary || null);
        } catch {
          setDashboardSummary(null);
        }

        if (normalizedTrips[0]?.id) {
          try {
            const suggestion = await getSmartSuggestion(token, normalizedTrips[0].id);
            setSmartSuggestion(suggestion);
          } catch {
            setSmartSuggestion(null);
          }
        }
      } catch (requestError) {
        if (requestError.status === 401 || requestError.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }
        setError(requestError.message || "Could not load your dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [navigate]);

  const selectedMood = useMemo(
    () => moodFilters.find((item) => item.id === selectedMoodId) || moodFilters[0],
    [selectedMoodId],
  );

  const normalizedTrips = useMemo(
    () =>
      savedTrips.map((trip) => ({
        ...trip,
        preferenceList: normalizeTripPreferences(trip.preferences),
      })),
    [savedTrips],
  );

  const activeTrip = useMemo(() => {
    // Prefer an actually-active trip; fall back to the soonest upcoming, then the latest saved.
    const withTimelines = normalizedTrips
      .map((trip) => ({ trip, timeline: getTripTimeline(trip) }))
      .filter((row) => row.timeline);
    const active = withTimelines.find((row) => row.timeline.state === "active");
    if (active) return active.trip;
    const upcoming = withTimelines
      .filter((row) => row.timeline.state === "upcoming")
      .sort((left, right) => left.timeline.countdown - right.timeline.countdown)[0];
    if (upcoming) return upcoming.trip;
    return normalizedTrips[0] || null;
  }, [normalizedTrips]);

  const activeTripTimeline = useMemo(
    () => (activeTrip ? getTripTimeline(activeTrip) : null),
    [activeTrip],
  );

  const travelStats = useMemo(() => {
    if (dashboardSummary) {
      const fallbackUpcomingTrips = normalizedTrips
        .map((trip) => getTripTimeline(trip))
        .filter((timeline) => timeline?.state === "upcoming");
      const nextCountdown =
        fallbackUpcomingTrips.length > 0
          ? Math.min(...fallbackUpcomingTrips.map((timeline) => timeline.countdown))
          : null;
      return {
        totalTrips: Number(dashboardSummary.total_trips || 0),
        totalDays: Number(dashboardSummary.total_days || 0),
        uniqueDestinations: Number(dashboardSummary.unique_destinations || 0),
        nextCountdown,
      };
    }

    const totalTrips = normalizedTrips.length;
    const totalDays = normalizedTrips.reduce(
      (accumulator, trip) => accumulator + Number(trip.days || 0),
      0,
    );
    const uniqueDestinations = new Set(
      normalizedTrips.map((trip) => String(trip.destination || "").toLowerCase()),
    ).size;

    const upcomingTrips = normalizedTrips
      .map((trip) => getTripTimeline(trip))
      .filter((timeline) => timeline?.state === "upcoming");
    const nextCountdown =
      upcomingTrips.length > 0
        ? Math.min(...upcomingTrips.map((timeline) => timeline.countdown))
        : null;

    return { totalTrips, totalDays, uniqueDestinations, nextCountdown };
  }, [dashboardSummary, normalizedTrips]);

  const explorerRank = useMemo(
    () => deriveExplorerLevel(travelStats.totalTrips),
    [travelStats.totalTrips],
  );

  const latestDiscoveries = useMemo(() => {
    const pool = moodDestinationPools[selectedMoodId] || PH_DESTINATIONS;
    return pool.slice(0, 10).map((destination, index) => ({
      destination,
      label: index % 2 === 0 ? "Hidden Gem" : "Fresh Pick",
    }));
  }, [selectedMoodId]);

  const trendingDestinations = useMemo(() => {
    const frequencyMap = new Map();
    normalizedTrips.forEach((trip) => {
      const destination = String(trip.destination || "").trim();
      if (!destination) return;
      const currentCount = frequencyMap.get(destination) || 0;
      frequencyMap.set(destination, currentCount + 1);
    });

    const trendingFromTrips = [...frequencyMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([destination, count]) => ({
        destination,
        score: `Added to ${count}${count >= 4 ? "+" : ""} of your itineraries`,
      }));

    if (trendingFromTrips.length >= 5) return trendingFromTrips;

    const fallbackPool = moodDestinationPools[selectedMoodId] || PH_DESTINATIONS;
    const fallbackItems = fallbackPool
      .filter(
        (destination) => !trendingFromTrips.some((item) => item.destination === destination),
      )
      .slice(0, 5 - trendingFromTrips.length)
      .map((destination, index) => ({
        destination,
        score: `Added to ${200 + index * 70}+ itineraries this week`,
      }));

    return [...trendingFromTrips, ...fallbackItems];
  }, [normalizedTrips, selectedMoodId]);

  const personalizedRecommendations = useMemo(() => {
    const recommendations = [];

    if (smartSuggestion?.headline) {
      recommendations.push({
        id: "smart",
        title: smartSuggestion.headline,
        text: smartSuggestion.message || "Weather-aware update available for your next route.",
        reason: "Recommended by your Live Monitor",
      });
    }

    if (selectedMoodId === "nature") {
      recommendations.push({
        id: "nature",
        title: "Pack light layers",
        text: "Mountain and eco routes shift quickly between warm and cool weather.",
        reason: "Recommended for your Nature vibe",
      });
    }
    if (selectedMoodId === "food") {
      recommendations.push({
        id: "food",
        title: "Reserve peak-hour spots early",
        text: "Popular food hubs fill up fast around lunch and sunset windows.",
        reason: "Recommended for your Food Trip mood",
      });
    }
    if (selectedMoodId === "beach") {
      recommendations.push({
        id: "beach",
        title: "Plan around the tide tables",
        text: "Early mornings give better visibility and calmer island hops.",
        reason: "Recommended for your Beach vibe",
      });
    }
    if (selectedMoodId === "culture") {
      recommendations.push({
        id: "culture",
        title: "Pair heritage sites with local food",
        text: "Each church or museum sits within walking distance of a known eatery.",
        reason: "Recommended for your Culture mood",
      });
    }
    if (selectedMoodId === "night") {
      recommendations.push({
        id: "night",
        title: "Book transport home in advance",
        text: "Late-night ride-hailing can spike — secure rides early or stay nearby.",
        reason: "Recommended for your Nightlife pick",
      });
    }

    if (recommendations.length < 3) {
      recommendations.push(
        {
          id: "rec-shortcut",
          title: "Use Trip Generator shortcut",
          text: "Search from this page and jump straight into a prefilled wizard.",
          reason: "Based on quick-planning behavior",
        },
        {
          id: "rec-backup",
          title: "Keep one backup itinerary",
          text: "Duplicate your top plan so rainy-day pivots take seconds.",
          reason: "Based on your saved-trip history",
        },
      );
    }

    return recommendations.slice(0, 4);
  }, [selectedMoodId, smartSuggestion]);

  const heroState = useMemo(() => {
    if (!activeTrip) {
      return {
        variant: "empty",
        title: "Start your next Philippine adventure",
        subtitle:
          "No active or upcoming trips yet. Tap the glowing Tara Na! button to launch your first plan.",
        ctaLabel: "Generate My First Trip",
        ctaAction: () => navigate("/generate"),
      };
    }

    if (activeTripTimeline?.state === "active") {
      return {
        variant: "active",
        title: `${activeTripTimeline.label} in ${activeTrip.destination}`,
        subtitle: "You're in active travel mode. Open today's map and keep momentum.",
        ctaLabel: "Open Today's Map",
        ctaAction: () => navigate(`/itinerary/${activeTrip.id}`),
      };
    }

    if (activeTripTimeline?.state === "upcoming") {
      const weatherText =
        smartSuggestion?.message || `${activeTripTimeline.countdown} days until your trip kicks off.`;
      return {
        variant: "upcoming",
        title: `${activeTripTimeline.countdown} days until ${activeTrip.destination}`,
        subtitle: weatherText,
        ctaLabel: "Review Itinerary",
        ctaAction: () => navigate(`/itinerary/${activeTrip.id}`),
      };
    }

    return {
      variant: "completed",
      title: `Plan your comeback to ${activeTrip.destination}`,
      subtitle: "Your latest trip is complete. Generate a new route with your current vibe.",
      ctaLabel: "Create New Trip",
      ctaAction: () => navigate("/generate"),
    };
  }, [activeTrip, activeTripTimeline, navigate, smartSuggestion?.message]);

  // The Live Monitor is invisible until a disruption is detected.  We treat a
  // weather alert payload from the smart-suggestion endpoint as the trigger.
  const showLiveMonitor = Boolean(smartSuggestion?.alert);

  const searchPool = useMemo(() => {
    const pool = moodDestinationPools[selectedMoodId] || PH_DESTINATIONS;
    return [...new Set([...pool, ...PH_DESTINATIONS])];
  }, [selectedMoodId]);

  function handleSearchSubmit(rawDestination) {
    const destination = String(rawDestination || "").trim();
    if (!destination) return;

    tapHaptic();
    saveDiscoverSearch(destination);
    setRecentSearches(loadDiscoverRecentSearches());
    saveWizardDraft({
      destination,
      numDays: 3,
      preferences: selectedMood.preferences,
      budget: "comfort",
      pacingStyle: "Moderate",
      companionType: "Solo",
      transportMode: "Public",
      accommodation: "",
    });
    setSearchOpen(false);
    navigate("/generate");
  }

  async function handleTripDateChange(tripId, nextDate) {
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }

    const normalizedDate = String(nextDate || "").trim() || null;
    const previousTrips = savedTrips;
    setSavedTrips((currentTrips) =>
      currentTrips.map((trip) =>
        trip.id === tripId ? { ...trip, trip_start_date: normalizedDate } : trip,
      ),
    );

    try {
      await updateTripStartDate(token, tripId, normalizedDate);
    } catch (requestError) {
      setSavedTrips(previousTrips);
      if (requestError.status === 401 || requestError.status === 422) {
        clearStoredToken();
        navigate("/login");
        return;
      }
      setError(requestError.message || "Could not update trip start date.");
    }
  }

  function gradientForDestination(destination) {
    const seed = String(destination || "")
      .split("")
      .reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
    const hueA = seed % 360;
    const hueB = (seed + 78) % 360;
    return {
      backgroundImage: `linear-gradient(135deg, hsl(${hueA}, 72%, 52%) 0%, hsl(${hueB}, 78%, 60%) 100%)`,
    };
  }

  function statusForCard(trip) {
    const timeline = getTripTimeline(trip);
    if (timeline?.state === "active") return { key: "active", label: "Active now" };
    if (timeline?.state === "upcoming") return { key: "upcoming", label: timeline.label };
    if (timeline?.state === "completed") return { key: "draft", label: "Completed" };
    return { key: "draft", label: "Draft" };
  }

  if (loading) {
    return (
      <PageSkeleton
        variant="dashboard"
        title="Loading your dashboard"
        subtitle="Pulling your latest trips, trends, and recommendations."
      />
    );
  }

  return (
    <main className="app-page">
      <section className="dashboard-shell">
        {/* Sticky Branded Welcome Component & Global Header */}
        <header className="dashboard-header-sticky glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <BrandLogo size={32} />
            <div style={{ minWidth: 0 }}>
              <p className="dashboard-header-greeting">
                {getGreeting()},
              </p>
              <p className="dashboard-header-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName}
              </p>
            </div>
          </div>
          <div className="dashboard-header-utility">
            <button
              type="button"
              className="dashboard-bell-button"
              aria-label="Open notifications"
              onClick={() => {
                tapHaptic();
                navigate("/my-trips");
              }}
            >
              <Icon name="bell" size={20} tone="accent" />
              {(smartSuggestion?.alert || (typeof navigator !== "undefined" && !navigator.onLine)) && (
                <span className="dashboard-bell-dot" />
              )}
            </button>
            <Avatar
              name={displayName}
              level={explorerRank.level}
              progress={explorerRank.progress}
              ariaLabel={`${displayName}, Explorer level ${explorerRank.level} — ${explorerRank.label}`}
              onClick={() => {
                tapHaptic();
                navigate("/profile");
              }}
            />
          </div>
        </header>

        {/* Discovery & Intent Zone: full-screen search trigger + mood pills */}
        <section className="dashboard-hero glass-card">
          <button
            type="button"
            className="dashboard-search-trigger"
            onClick={() => {
              tapHaptic();
              setSearchOpen(true);
            }}
            aria-label="Open destination search"
          >
            <span className="dashboard-search-trigger__icon">
              <Icon name="search" size={14} />
            </span>
            <span>Where do you want to fly next?</span>
          </button>

          <div className="dashboard-moods" role="tablist" aria-label="Mood filters">
            {moodFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={selectedMoodId === filter.id}
                className={`badge-pill dashboard-mood-pill${selectedMoodId === filter.id ? " is-active" : ""}`}
                onClick={() => {
                  tapHaptic();
                  setSelectedMoodId(filter.id);
                }}
              >
                <Icon name={filter.icon} size={14} tone={selectedMoodId === filter.id ? "accent" : "default"} />
                {filter.label}
              </button>
            ))}
          </div>

          {/* Dynamic Hero Section — branches into 3 lifecycle states. */}
          {heroState.variant === "empty" ? (
            <article className="dashboard-hero-empty">
              <p className="dashboard-kicker" style={{ color: "var(--accent)" }}>Empty Sky · Ready for take-off</p>
              <h2 className="serif" style={{ margin: 0, fontSize: "1.7rem" }}>{heroState.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{heroState.subtitle}</p>
              <button className="btn-luxury" type="button" onClick={heroState.ctaAction} style={{ justifySelf: "center" }}>
                {heroState.ctaLabel}
              </button>
              <span className="hero-bounce-chevron" aria-hidden="true">
                <Icon name="arrowDown" size={20} />
              </span>
              <p className="muted" style={{ margin: 0, fontSize: "0.78rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Tap the glowing Tara Na! button below
              </p>
            </article>
          ) : (
            <article className="dashboard-hero-text" style={{ display: "grid", gap: 8 }}>
              <p className="dashboard-kicker">
                {heroState.variant === "active"
                  ? "Active trip"
                  : heroState.variant === "upcoming"
                    ? "Upcoming"
                    : "Recently completed"}
              </p>
              <h2 className="serif" style={{ margin: 0 }}>{heroState.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{heroState.subtitle}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn-luxury" type="button" onClick={heroState.ctaAction}>
                  {heroState.ctaLabel}
                </button>
                {heroState.variant === "completed" ? (
                  <button className="btn-outline-luxury" type="button" onClick={() => navigate(`/itinerary/${activeTrip.id}`)}>
                    Open trip
                  </button>
                ) : null}
              </div>
            </article>
          )}
        </section>

        {error ? <article className="error-banner">{error}</article> : null}

        {/* Live Monitor Widget — hidden by default, visible only on disruption. */}
        {showLiveMonitor ? (
          <article className="smart-suggestion-banner" role="alert">
            <div>
              <h4>{smartSuggestion?.headline || "Smart Suggestion"}</h4>
              <p>{smartSuggestion?.message || "Weather-aware update available for your next route."}</p>
            </div>
            <button
              type="button"
              className="btn-luxury"
              onClick={() =>
                activeTrip?.id ? navigate(`/itinerary/${activeTrip.id}`) : navigate("/generate")
              }
            >
              Apply Smart Fix
            </button>
          </article>
        ) : null}

        {/* Active Trip Progress */}
        {activeTrip && activeTripTimeline ? (
          <article className="glass-card dashboard-progress">
            <p className="dashboard-kicker">Active Trip Progress</p>
            <h3 className="serif" style={{ marginTop: 0 }}>{activeTrip.destination}</h3>
            <p className="muted">{activeTripTimeline.label}</p>
            <div className="dashboard-progress-bar">
              <span style={{ width: `${activeTripTimeline.progress || 0}%` }} />
            </div>
          </article>
        ) : null}

        {/* Quick Glance Trip Carousel */}
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3 className="serif">Quick Glance Trips</h3>
            <button className="top-action-link" type="button" onClick={() => navigate("/my-trips")}>
              Open My Trips
            </button>
          </div>
          <div className="dashboard-carousel">
            {normalizedTrips.length === 0 ? (
              <article className="glass-card quickglance-card">
                <span className="quickglance-card__status quickglance-card__status--draft">No trips yet</span>
                <h4 className="serif" style={{ margin: 0 }}>Plan your first journey</h4>
                <p className="muted" style={{ margin: 0 }}>
                  Pick a vibe above or tap Tara Na! to launch the wizard.
                </p>
                <button className="btn-luxury" type="button" onClick={() => navigate("/generate")}>
                  Generate Trip
                </button>
              </article>
            ) : null}
            {normalizedTrips.map((trip) => {
              const status = statusForCard(trip);
              const timeline = getTripTimeline(trip);
              return (
                <article key={trip.id} className="glass-card quickglance-card">
                  <span className={`quickglance-card__status quickglance-card__status--${status.key}`}>
                    {status.label}
                  </span>
                  <h4 className="serif" style={{ margin: 0 }}>{trip.destination}</h4>
                  <p className="muted" style={{ margin: 0, textTransform: "capitalize" }}>
                    {trip.days} days · {trip.budget}
                  </p>
                  {timeline?.state === "active" ? (
                    <div className="quickglance-card__progress">
                      <span style={{ width: `${timeline.progress}%` }} />
                    </div>
                  ) : null}
                  <label className="field-label" htmlFor={`trip-date-${trip.id}`}>
                    Trip Start Date
                  </label>
                  <input
                    id={`trip-date-${trip.id}`}
                    className="auth-input"
                    type="date"
                    value={trip.trip_start_date || ""}
                    onChange={(event) => handleTripDateChange(trip.id, event.target.value)}
                  />
                  <button
                    className="btn-outline-luxury"
                    type="button"
                    onClick={() => navigate(`/itinerary/${trip.id}`)}
                  >
                    Resume planning
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* Latest Discoveries Carousel */}
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3 className="serif">Latest Discoveries</h3>
            <button className="top-action-link" type="button" onClick={() => navigate("/discover")}>
              Explore more
            </button>
          </div>
          <div className="dashboard-carousel">
            {latestDiscoveries.map((item) => (
              <button
                key={item.destination}
                type="button"
                className="discovery-image-card"
                style={gradientForDestination(item.destination)}
                onClick={() => handleSearchSubmit(item.destination)}
                aria-label={`Plan a trip to ${item.destination}`}
              >
                <div className="discovery-image-card__inner">
                  <span className="discovery-image-card__label">{item.label}</span>
                  <h4 className="discovery-image-card__title">{item.destination}</h4>
                  <p className="discovery-image-card__meta">Tap to plan a journey</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Trending Destinations / Social Proof */}
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3 className="serif">Trending Destinations</h3>
          </div>
          <div className="dashboard-trending-list">
            {trendingDestinations.map((item) => (
              <article key={item.destination} className="glass-card dashboard-trending-item">
                <h4 className="serif" style={{ margin: "0 0 4px" }}>{item.destination}</h4>
                <p className="muted" style={{ margin: 0, fontWeight: 600 }}>{item.score}</p>
                <button
                  className="top-action-link"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => handleSearchSubmit(item.destination)}
                >
                  Build a journey →
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* Travel Stats Gamification */}
        <section className="glass-card dashboard-stats">
          <p className="dashboard-kicker">Travel Stats · Explorer {explorerRank.label}</p>
          <div className="dashboard-stat-grid">
            <div>
              <span className="dashboard-stat-value">{travelStats.totalTrips}</span>
              <span className="muted">Saved trips</span>
            </div>
            <div>
              <span className="dashboard-stat-value">{travelStats.totalDays}</span>
              <span className="muted">Planned days</span>
            </div>
            <div>
              <span className="dashboard-stat-value">
                {travelStats.uniqueDestinations}/82
              </span>
              <span className="muted">Provinces explored</span>
            </div>
            <div>
              <span className="dashboard-stat-value">
                {travelStats.nextCountdown ?? "—"}
              </span>
              <span className="muted">Days to next trip</span>
            </div>
          </div>
        </section>

        {/* For You — ML Feed with reveal-on-tap "Why this?" */}
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3 className="serif">For You</h3>
          </div>
          <div className="dashboard-reco-list">
            {personalizedRecommendations.map((item) => {
              const isOpen = revealedReason === item.id;
              return (
                <article key={item.id} className="glass-card foryou-card">
                  <h4 className="serif" style={{ margin: 0 }}>{item.title}</h4>
                  <p className="muted" style={{ margin: 0 }}>{item.text}</p>
                  <button
                    type="button"
                    className="foryou-card__reason"
                    aria-expanded={isOpen}
                    onClick={() => setRevealedReason((current) => (current === item.id ? null : item.id))}
                  >
                    <Icon name="info" size={14} /> Why this?
                  </button>
                  {isOpen ? (
                    <p className="foryou-card__reveal" role="status">{item.reason}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSubmit={handleSearchSubmit}
        destinations={searchPool}
        recentSearches={recentSearches}
        onClearRecents={() => {
          clearDiscoverRecentSearches();
          setRecentSearches([]);
        }}
      />
    </main>
  );
}
