import { useEffect, useMemo, useRef, useState } from "react";

// Tiny inner panel — separated so the parent can remount it on every open via
// a key prop.  This lets us keep the "reset value on open" behavior without
// calling setState inside an effect (which the React Compiler lint rule
// disallows).
function SearchOverlayPanel({
  onClose,
  onSubmit,
  destinations,
  recentSearches,
  onClearRecents,
  initialValue,
  placeholder,
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(handle);
      document.body.style.overflow = "";
    };
  }, []);

  const filteredDestinations = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return destinations.slice(0, 14);
    return destinations.filter((item) => item.toLowerCase().includes(query)).slice(0, 14);
  }, [value, destinations]);

  function submit(rawValue) {
    const cleaned = String(rawValue ?? value).trim();
    if (!cleaned) return;
    onSubmit?.(cleaned);
  }

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search destinations">
      <header className="search-overlay__header">
        <button type="button" className="search-overlay__close" onClick={onClose} aria-label="Close search">
          ←
        </button>
        <form
          className="search-overlay__form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            type="search"
            className="search-overlay__input"
            placeholder={placeholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Search destinations"
            enterKeyHint="search"
          />
        </form>
      </header>

      <div className="search-overlay__body">
        {recentSearches.length > 0 ? (
          <section className="search-overlay__section">
            <div className="search-overlay__section-head">
              <h3 className="serif">Recent searches</h3>
              {onClearRecents ? (
                <button type="button" className="search-overlay__link" onClick={onClearRecents}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="search-overlay__pills">
              {recentSearches.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="badge-pill search-overlay__pill"
                  onClick={() => submit(item)}
                >
                  🕒 {item}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="search-overlay__section">
          <div className="search-overlay__section-head">
            <h3 className="serif">Trending vibes</h3>
          </div>
          <div className="search-overlay__pills">
            {TRENDING_TAGS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="badge-pill search-overlay__pill"
                onClick={() => submit(tag.label.replace(/^[^a-zA-Z]+/, ""))}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </section>

        <section className="search-overlay__section">
          <div className="search-overlay__section-head">
            <h3 className="serif">Quick regions</h3>
          </div>
          <div className="search-overlay__pills">
            {QUICK_REGIONS.map((region) => (
              <button
                key={region.id}
                type="button"
                className="badge-pill search-overlay__pill"
                onClick={() => submit(region.label)}
              >
                {region.label}
              </button>
            ))}
          </div>
        </section>

        <section className="search-overlay__section">
          <div className="search-overlay__section-head">
            <h3 className="serif">
              {value.trim() ? `Matches for "${value.trim()}"` : "Popular destinations"}
            </h3>
          </div>
          <div className="search-overlay__suggestions">
            {filteredDestinations.length === 0 ? (
              <p className="muted">No destinations match. Try a different keyword.</p>
            ) : null}
            {filteredDestinations.map((destination) => (
              <button
                key={destination}
                type="button"
                className="search-overlay__suggestion"
                onClick={() => submit(destination)}
              >
                <span aria-hidden="true">📍</span>
                <span>{destination}</span>
                <span aria-hidden="true" className="search-overlay__chevron">›</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const QUICK_REGIONS = [
  { id: "luzon", label: "Luzon" },
  { id: "visayas", label: "Visayas" },
  { id: "mindanao", label: "Mindanao" },
  { id: "ncr", label: "Metro Manila" },
];

const TRENDING_TAGS = [
  { id: "beach", label: "🌊 Beach" },
  { id: "nature", label: "⛰️ Nature" },
  { id: "food", label: "🍜 Food trip" },
  { id: "culture", label: "🏛️ Culture" },
  { id: "nightlife", label: "🌙 Nightlife" },
];

/**
 * Full-screen Omni-Search overlay.  Triggered when the user taps the dashboard
 * search input — preempts the keyboard with a rich, browseable list of recent
 * searches, trending vibe tags, quick-access regions, and live suggestions
 * pulled from the destination pool.  The user can pick by tapping or type to
 * filter.  Selecting routes the consumer into a wizard prefill.
 */
export default function SearchOverlay({
  open,
  onClose,
  onSubmit,
  destinations = [],
  recentSearches = [],
  onClearRecents,
  initialValue = "",
  placeholder = "Where do you want to fly next?",
}) {
  if (!open) {
    return null;
  }

  return (
    <SearchOverlayPanel
      onClose={onClose}
      onSubmit={onSubmit}
      destinations={destinations}
      recentSearches={recentSearches}
      onClearRecents={onClearRecents}
      initialValue={initialValue}
      placeholder={placeholder}
    />
  );
}
