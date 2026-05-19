import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PH_DESTINATIONS } from "../data/phDestinations";
import { getDiscoverFeed } from "../lib/tripsApi";
import {
  clearDiscoverRecentSearches,
  clearStoredToken,
  getStoredToken,
  loadDiscoverRecentSearches,
  saveDiscoverSearch,
  saveWizardDraft,
} from "../lib/storage";
import { tapHaptic, successHaptic } from "../lib/haptics";
import BottomSheet from "./common/BottomSheet";
import PageSkeleton from "./common/PageSkeleton";
import SearchOverlay from "./common/SearchOverlay";

// Filter chips deliberately stack: tapping a region + a vibe + a weather chip
// composes a multi-variable query for the Flask discover feed.
const REGION_FILTERS = [
  { id: "all", label: "All regions" },
  { id: "luzon", label: "Luzon" },
  { id: "visayas", label: "Visayas" },
  { id: "mindanao", label: "Mindanao" },
];

const VIBE_FILTERS = [
  { id: "all", label: "All vibes" },
  { id: "nature", label: "⛰️ Nature" },
  { id: "food", label: "🍜 Food" },
  { id: "beach", label: "🌊 Beach" },
  { id: "culture", label: "🏛️ Culture" },
  { id: "nightlife", label: "🌙 Nightlife" },
];

const WEATHER_FILTERS = [
  { id: "any", label: "Any weather" },
  { id: "sunny", label: "☀️ Sunny" },
  { id: "rainy", label: "🌧️ Rainy-day proof" },
];

// Lightweight grouping for the Philippine archipelago.  Used both as a filter
// hint and to render the stylised spatial map without pulling in a real
// geospatial library on this screen.
const REGION_MAP = {
  luzon: [
    "Metro Manila",
    "Batangas",
    "Cavite",
    "Bulacan",
    "Pampanga",
    "Laguna",
    "Quezon",
    "Aurora",
    "Cagayan",
    "Ilocos Sur",
    "Benguet",
    "Batanes",
  ],
  visayas: ["Cebu", "Bohol", "Iloilo", "Negros Occidental", "Aklan", "Antique", "Siquijor", "Samar"],
  mindanao: [
    "Davao del Sur",
    "Davao Oriental",
    "Bukidnon",
    "Surigao del Norte",
    "Surigao del Sur",
    "Zamboanga",
    "Cotabato",
    "Lanao",
  ],
};

function regionFor(destination) {
  const lower = String(destination || "").toLowerCase();
  if (REGION_MAP.luzon.some((item) => lower.includes(item.toLowerCase()))) return "luzon";
  if (REGION_MAP.visayas.some((item) => lower.includes(item.toLowerCase()))) return "visayas";
  if (REGION_MAP.mindanao.some((item) => lower.includes(item.toLowerCase()))) return "mindanao";
  return "luzon"; // pragmatic default — most provinces sit on Luzon
}

function gradientForDestination(destination) {
  const seed = String(destination || "")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed + 70) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hueA}, 80%, 56%) 0%, hsl(${hueB}, 78%, 50%) 100%)`,
  };
}

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [trending, setTrending] = useState([]);
  const [regionId, setRegionId] = useState("all");
  const [vibeId, setVibeId] = useState("all");
  const [weatherId, setWeatherId] = useState("any");
  const [view, setView] = useState("thematic");
  const [searchOpen, setSearchOpen] = useState(false);
  const [anchorPlace, setAnchorPlace] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => loadDiscoverRecentSearches());

  useEffect(() => {
    async function loadDiscoverData() {
      const token = getStoredToken();
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        setError("");
        setLoading(true);
        const data = await getDiscoverFeed(token, { tag: vibeId, query: "", limit: 24 });
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        setTrending(Array.isArray(data?.trending) ? data.trending : []);
      } catch (requestError) {
        if (requestError.status === 401 || requestError.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }
        setError(requestError.message || "Could not load discover feed.");
      } finally {
        setLoading(false);
      }
    }
    loadDiscoverData();
  }, [navigate, vibeId]);

  const trendingRows = useMemo(() => {
    const filteredApi = suggestions.map((item) => ({
      key: `api-${item.id || item.name}`,
      destination: item.city || item.name,
      label: item.category || "Discovery",
      city: item.city,
    }));

    let pool = PH_DESTINATIONS;
    if (regionId !== "all") {
      pool = REGION_MAP[regionId] || PH_DESTINATIONS;
    }

    const fallback = pool.slice(0, 16).map((destination, index) => ({
      key: `pool-${destination}-${index}`,
      destination,
      label: index % 2 === 0 ? "Hidden gem" : "Trending now",
    }));

    return [
      { title: "Trending with your flock", items: trending.length ? trending.map((row, index) => ({
        key: `trend-${row.destination}-${index}`,
        destination: row.destination,
        label: row.score || "Trending",
      })) : fallback.slice(0, 8) },
      { title: "Curated by vibe", items: filteredApi.slice(0, 10).length ? filteredApi.slice(0, 10) : fallback.slice(0, 10) },
      { title: "Off the beaten path", items: fallback.slice(6, 16) },
    ];
  }, [suggestions, trending, regionId]);

  function openAnchor(item) {
    tapHaptic();
    setAnchorPlace(item);
  }

  function startBuildJourney(destination) {
    successHaptic();
    const cleaned = String(destination || "").trim();
    if (!cleaned) return;
    saveDiscoverSearch(cleaned);
    setRecentSearches(loadDiscoverRecentSearches());
    saveWizardDraft({
      destination: cleaned,
      numDays: 3,
      preferences: vibeId === "all" ? [] : [vibeId === "nightlife" ? "nightlife" : vibeId],
      budget: "comfort",
      pacingStyle: "Moderate",
      companionType: "Solo",
      transportMode: "Public",
      accommodation: "",
    });
    setAnchorPlace(null);
    setSearchOpen(false);
    navigate("/generate");
  }

  function handleSearchSubmit(rawValue) {
    const cleaned = String(rawValue || "").trim();
    if (!cleaned) return;
    setSearchOpen(false);
    startBuildJourney(cleaned);
  }

  // Stylised spatial-view pin map.  Each filtered destination becomes a "smart
  // pin" whose size and color reflect its relevance to the current vibe filter.
  const spatialPins = useMemo(() => {
    let pool;
    if (regionId === "all") {
      pool = PH_DESTINATIONS;
    } else {
      pool = REGION_MAP[regionId] || PH_DESTINATIONS;
    }
    return pool.slice(0, 24).map((destination, index) => {
      const seed = String(destination)
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const top = ((seed * 7) % 70) + 8;
      const left = ((seed * 13) % 80) + 8;
      const relevance = ((seed + index) % 4) + 1;
      return { destination, top, left, relevance };
    });
  }, [regionId]);

  if (loading) {
    return (
      <PageSkeleton
        variant="discover"
        title="Loading Discover"
        subtitle="Finding destinations you might love."
      />
    );
  }

  return (
    <main className="app-page">
      <section className="dashboard-shell">
        <header className="dashboard-topbar glass-card">
          <div>
            <p className="dashboard-kicker">Discover</p>
            <h1 className="serif dashboard-title">Find your next stop</h1>
            <p className="muted dashboard-subtitle">
              Stack filters, switch between map and feed, then anchor any place to plan instantly.
            </p>
          </div>
          <span className="discover-toggle">
            <button
              type="button"
              className={`discover-toggle__btn${view === "spatial" ? " is-active" : ""}`}
              onClick={() => {
                tapHaptic();
                setView("spatial");
              }}
              aria-pressed={view === "spatial"}
            >
              🗺️ Map
            </button>
            <button
              type="button"
              className={`discover-toggle__btn${view === "thematic" ? " is-active" : ""}`}
              onClick={() => {
                tapHaptic();
                setView("thematic");
              }}
              aria-pressed={view === "thematic"}
            >
              ✨ Feed
            </button>
          </span>
        </header>

        {error ? <article className="error-banner">{error}</article> : null}

        <article className="glass-card" style={{ padding: 14 }}>
          <button
            type="button"
            className="dashboard-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Open destination search"
          >
            <span className="dashboard-search-trigger__icon">🔍</span>
            <span>Search any Philippine destination</span>
          </button>

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <div className="dashboard-moods" role="tablist" aria-label="Region filter">
              {REGION_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`badge-pill dashboard-mood-pill${regionId === option.id ? " is-active" : ""}`}
                  onClick={() => setRegionId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="dashboard-moods" role="tablist" aria-label="Vibe filter">
              {VIBE_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`badge-pill dashboard-mood-pill${vibeId === option.id ? " is-active" : ""}`}
                  onClick={() => setVibeId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="dashboard-moods" role="tablist" aria-label="Weather filter">
              {WEATHER_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`badge-pill dashboard-mood-pill${weatherId === option.id ? " is-active" : ""}`}
                  onClick={() => setWeatherId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </article>

        {view === "spatial" ? (
          <section className="glass-card" style={{ padding: 18 }}>
            <p className="dashboard-kicker">Spatial view · Algorithmic Smart Pins</p>
            <div
              style={{
                position: "relative",
                height: 360,
                marginTop: 10,
                borderRadius: 22,
                overflow: "hidden",
                background:
                  "radial-gradient(circle at 25% 30%, rgba(196, 223, 251, 0.7), transparent 55%), radial-gradient(circle at 75% 70%, rgba(217, 200, 255, 0.7), transparent 55%), linear-gradient(135deg, #f7f3ea, #e9efff)",
                border: "1px solid var(--glass-border)",
              }}
            >
              {spatialPins.map((pin) => (
                <button
                  key={pin.destination}
                  type="button"
                  onClick={() =>
                    openAnchor({
                      destination: pin.destination,
                      label: `Relevance ${pin.relevance}/4`,
                      region: regionFor(pin.destination),
                    })
                  }
                  style={{
                    position: "absolute",
                    top: `${pin.top}%`,
                    left: `${pin.left}%`,
                    width: 18 + pin.relevance * 6,
                    height: 18 + pin.relevance * 6,
                    borderRadius: "50%",
                    border: "2px solid #fff",
                    background:
                      pin.relevance >= 3
                        ? "linear-gradient(135deg, #4a3a8a 0%, #c44f8a 60%, #ff8a72 100%)"
                        : "linear-gradient(135deg, #4a3a8a, #c44f8a)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 10,
                    cursor: "pointer",
                    boxShadow: "0 10px 24px -10px rgba(20, 20, 50, 0.4)",
                    transform: "translate(-50%, -50%)",
                    animation: pin.relevance >= 4 ? "pulseDot 1.6s ease-in-out infinite" : undefined,
                  }}
                  aria-label={`${pin.destination}, relevance ${pin.relevance} of 4`}
                  title={pin.destination}
                >
                  {pin.relevance}
                </button>
              ))}
            </div>
            <p className="muted" style={{ margin: "12px 0 0" }}>
              Pins scale with how strongly the ML reranker predicts you'll like each spot. Tap any pin to anchor it.
            </p>
          </section>
        ) : null}

        {view === "thematic" ? (
          <>
            {trendingRows.map((row, rowIndex) => (
              <section key={`${row.title}-${rowIndex}`} className="dashboard-section">
                <div className="dashboard-section-head">
                  <h3 className="serif">{row.title}</h3>
                </div>
                <div className="dashboard-carousel">
                  {row.items.map((item) => (
                    <button
                      key={item.key || item.destination}
                      type="button"
                      className="discovery-image-card"
                      style={gradientForDestination(item.destination)}
                      onClick={() => openAnchor(item)}
                      aria-label={`Anchor ${item.destination}`}
                    >
                      <div className="discovery-image-card__inner">
                        <span className="discovery-image-card__label">{item.label || "Spotlight"}</span>
                        <h4 className="discovery-image-card__title">{item.destination}</h4>
                        <p className="discovery-image-card__meta">Tap to anchor & plan</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : null}
      </section>

      <BottomSheet
        open={Boolean(anchorPlace)}
        onClose={() => setAnchorPlace(null)}
        title={anchorPlace ? anchorPlace.destination : ""}
        footer={
          <button
            type="button"
            className="btn-luxury anchor-fly__action"
            onClick={() => anchorPlace && startBuildJourney(anchorPlace.destination)}
          >
            ✈️ Build a journey around this
          </button>
        }
      >
        {anchorPlace ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                ...gradientForDestination(anchorPlace.destination),
                color: "#fff",
                borderRadius: 18,
                padding: "26px 18px",
                textAlign: "center",
              }}
            >
              <p className="dashboard-kicker" style={{ color: "rgba(255,255,255,0.8)" }}>
                {anchorPlace.label || "Discovery"}
              </p>
              <h3 className="serif" style={{ margin: 0, fontSize: "1.9rem" }}>
                {anchorPlace.destination}
              </h3>
              <p style={{ margin: "6px 0 0", opacity: 0.92 }}>
                Region · {regionFor(anchorPlace.destination).toUpperCase()}
              </p>
            </div>
            <div className="trip-card__tags">
              <span className="trip-card__chip">🌤️ Live weather</span>
              <span className="trip-card__chip">⭐ Community rated</span>
              <span className="trip-card__chip">🛟 Logistics ready</span>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              Anchoring saves your context, prefills your wizard, and lets the ML reranker shape
              a plan around this exact destination — no extra typing needed.
            </p>
          </div>
        ) : null}
      </BottomSheet>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSubmit={handleSearchSubmit}
        destinations={PH_DESTINATIONS}
        recentSearches={recentSearches}
        onClearRecents={() => {
          clearDiscoverRecentSearches();
          setRecentSearches([]);
        }}
      />
    </main>
  );
}
