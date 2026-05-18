import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_BASE_URL, TOKEN_STORAGE_KEY } from "../lib/config";
import {
  clearStoredToken,
  loadWizardDraft,
  saveWizardDraft,
  saveTripData,
} from "../lib/storage";
import { PH_DESTINATIONS } from "../data/phDestinations";

// The wizard mirrors the old Jinja dashboard steps, but now it is fully driven
// by React state and the REST API.
const preferenceOptions = [
  { value: "food", label: "Culinary", icon: "🍽️" },
  { value: "beach", label: "Coastal", icon: "🏝️" },
  { value: "nature", label: "Nature", icon: "🌿" },
  { value: "museums", label: "Heritage", icon: "🏛️" },
  { value: "nightlife", label: "Nightlife", icon: "🌙" },
];

const budgetOptions = [
  { value: "low", label: "Backpacker" },
  { value: "comfort", label: "Comfort" },
  { value: "high", label: "Luxury" },
];

const pacingOptions = [
  { value: "Relaxed", label: "Relaxed" },
  { value: "Moderate", label: "Moderate" },
  { value: "Packed", label: "Packed" },
];

const companionOptions = [
  { value: "Solo", label: "Solo" },
  { value: "Couple", label: "Couple" },
  { value: "Family_Kids", label: "Family / Kids" },
  { value: "Friends", label: "Friends" },
  { value: "Seniors", label: "Seniors" },
];

const transportOptions = [
  { value: "Public", label: "Public Transit" },
  { value: "Private_Car", label: "Private Car" },
  { value: "Motorcycle", label: "Motorcycle" },
  { value: "Walking", label: "Walking" },
];

const loadingMessages = [
  "Analyzing the best spots in the Philippines...",
  "Scoring places by distance, rating, and your preferences...",
  "Building the route with your selected travel style...",
];

// Load the last incomplete wizard draft so users can refresh without losing progress.
function getInitialDraft() {
  const draft = loadWizardDraft();
  return {
    destination: draft.destination || "",
    numDays: draft.numDays || 3,
    preferences: draft.preferences || [],
    budget: draft.budget || "comfort",
    pacingStyle: draft.pacingStyle || "Moderate",
    companionType: draft.companionType || "Solo",
    transportMode: draft.transportMode || "Public",
    accommodation: draft.accommodation || "",
  };
}

export default function TravelWizard() {
  const navigate = useNavigate();
  const initial = useMemo(() => getInitialDraft(), []);

  // The wizard uses a small state machine: step 1 through 4, then submission.
  const [step, setStep] = useState(1);
  const [destination, setDestination] = useState(initial.destination);
  const [numDays, setNumDays] = useState(initial.numDays);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [budget, setBudget] = useState(initial.budget);
  const [pacingStyle, setPacingStyle] = useState(initial.pacingStyle);
  const [companionType, setCompanionType] = useState(initial.companionType);
  const [transportMode, setTransportMode] = useState(initial.transportMode);
  const [accommodation, setAccommodation] = useState(initial.accommodation);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);

  // Persist the current form values so the user can safely reload or navigate away.
  useEffect(() => {
    saveWizardDraft({
      destination,
      numDays,
      preferences,
      budget,
      pacingStyle,
      companionType,
      transportMode,
      accommodation,
    });
  }, [
    destination,
    numDays,
    preferences,
    budget,
    pacingStyle,
    companionType,
    transportMode,
    accommodation,
  ]);

  // Rotate the loading message while the backend is generating the itinerary.
  useEffect(() => {
    if (!isSubmitting) return;

    const intervalId = window.setInterval(() => {
      setLoadingMessage((current) => {
        const nextIndex =
          (loadingMessages.indexOf(current) + 1) % loadingMessages.length;
        return loadingMessages[nextIndex];
      });
    }, 1600);

    return () => window.clearInterval(intervalId);
  }, [isSubmitting]);

  const selectedPreferences = preferenceOptions.filter((option) =>
    preferences.includes(option.value),
  );

  // Checkbox-style toggle for interests so users can choose multiple categories.
  const togglePreference = (value) => {
    setPreferences((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const handleGenerate = async () => {
    setError("");

    if (!destination.trim()) {
      setError("Please choose a destination first.");
      setStep(1);
      return;
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      // The backend rejects protected endpoints without a JWT.
      setError("Please log in again before generating an itinerary.");
      navigate("/login");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          destination,
          num_days: numDays,
          preferences,
          budget,
          pacing_style: pacingStyle,
          companion_type: companionType,
          transport_mode: transportMode,
          accommodation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 422) {
          clearStoredToken();
          setError("Your login expired. Please sign in again.");
          navigate("/login");
          return;
        }

        // Surface the API error instead of silently failing.
        setError(data.error || "Failed to generate itinerary.");
        setIsSubmitting(false);
        setStep(4);
        return;
      }

      // Keep the generated trip in localStorage so the itinerary page can recover it.
      const trip = {
        itinerary: data.itinerary,
        destCoords: data.dest_coords,
        itineraryId: data.itinerary_id,
        destination,
        numDays,
        preferences,
        budget,
        pacingStyle,
        companionType,
        transportMode,
        accommodation,
      };

      saveTripData(trip);
      navigate("/itinerary", { state: trip, replace: true });
    } catch {
      // Network problems or backend crashes end up here.
      setError("API connection error. Please try again.");
      setIsSubmitting(false);
      setStep(4);
    }
  };

  // Convert selected preference keys into human-readable labels for the summary card.
  const summaryText = preferences.length
    ? selectedPreferences.map((item) => item.label).join(", ")
    : "No interests selected";

  return (
    <main className="app-page wizard-page">
      <div className="wizard-topbar">
        <div className="wizard-topbar-inner">
          {/* Keep a visible exit path so users can leave the wizard without losing context. */}
          <a className="top-action-link" href="/login">
            ← Exit Planner
          </a>

          <div className="step-badge">
            STEP <span id="currentStep">{step}</span> OF 4
          </div>
        </div>
      </div>

      <div className="wizard-wrap">
        <div className="wizard-shell">
          <section className="wizard-card glass-card">
            {/* API or validation errors are shown at the top so they are easy to notice. */}
            {error && (
              <div className="error-banner" style={{ marginBottom: "18px" }}>
                {error}
              </div>
            )}

            {/* STEP 1 collects the destination and mirrors the old destination screen. */}
            <div
              className={`wizard-step ${step === 1 ? "active" : "completed"}`}
            >
              <p className="hero-chip" style={{ marginBottom: "14px" }}>
                STEP 1 OF 4 · WHERE TO?
              </p>
              <h1 className="wizard-heading serif">
                Where in the Philippines are you headed?
              </h1>
              <p className="wizard-subcopy" style={{ maxWidth: "56ch" }}>
                Type any province or destination and the backend will geocode it
                before building the trip.
              </p>

              <div style={{ marginTop: "22px" }}>
                <label className="field-label" htmlFor="destination">
                  Destination
                </label>
                <input
                  id="destination"
                  className="input-massive"
                  type="text"
                  list="ph-destinations"
                  placeholder="e.g. Palawan, Cebu, Siargao..."
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  autoComplete="off"
                />
                <datalist id="ph-destinations">
                  {PH_DESTINATIONS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div
                style={{
                  marginTop: "28px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  className="btn-luxury"
                  type="button"
                  onClick={() => setStep(2)}
                >
                  Continue →
                </button>
              </div>
            </div>

            {/* STEP 2 controls the trip length, which affects how many places are generated. */}
            <div
              className={`wizard-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}
            >
              <p className="hero-chip" style={{ marginBottom: "14px" }}>
                STEP 2 OF 4
              </p>
              <h2 className="wizard-heading serif">
                How many days do you have?
              </h2>
              <p className="wizard-subcopy">
                The itinerary generator fills each day with a balanced route.
              </p>

              <div
                className="bento-grid"
                style={{ marginTop: "24px", maxWidth: "520px" }}
              >
                {[2, 3, 5, 7].map((dayCount) => (
                  <div key={dayCount} className="bento-item">
                    <input
                      type="radio"
                      id={`days-${dayCount}`}
                      name="numDays"
                      checked={numDays === dayCount}
                      onChange={() => setNumDays(dayCount)}
                    />
                    <label className="bento-label" htmlFor={`days-${dayCount}`}>
                      <span
                        className="serif"
                        style={{ fontSize: "2rem", fontWeight: 700 }}
                      >
                        {dayCount}
                      </span>
                      <span className="muted">Days</span>
                    </label>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "28px",
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn-outline-luxury"
                  type="button"
                  onClick={() => setStep(1)}
                >
                  ↑ Back
                </button>
                <button
                  className="btn-luxury"
                  type="button"
                  onClick={() => setStep(3)}
                >
                  Continue →
                </button>
              </div>
            </div>

            {/* STEP 3 collects interests and travel style, which are passed to the scoring engine. */}
            <div
              className={`wizard-step ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}
            >
              <p className="hero-chip" style={{ marginBottom: "14px" }}>
                STEP 3 OF 4
              </p>
              <h2 className="wizard-heading serif">Curate your experience.</h2>
              <p className="wizard-subcopy">
                What makes your perfect Philippine trip?
              </p>

              <div style={{ marginTop: "22px" }}>
                <p className="field-label" style={{ marginBottom: "12px" }}>
                  What interests you?
                </p>
                <div className="bento-grid">
                  {preferenceOptions.map((option) => (
                    <div key={option.value} className="bento-item">
                      <input
                        type="checkbox"
                        id={`pref-${option.value}`}
                        checked={preferences.includes(option.value)}
                        onChange={() => togglePreference(option.value)}
                      />
                      <label
                        className="bento-label"
                        htmlFor={`pref-${option.value}`}
                      >
                        <span style={{ fontSize: "1.45rem" }}>
                          {option.icon}
                        </span>
                        <span style={{ fontWeight: 700 }}>{option.label}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "28px" }}>
                <p className="field-label" style={{ marginBottom: "12px" }}>
                  Travel Style
                </p>
                <div
                  className="bento-grid"
                  style={{
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  }}
                >
                  {budgetOptions.map((option) => (
                    <div key={option.value} className="bento-item">
                      <input
                        type="radio"
                        id={`budget-${option.value}`}
                        name="budget"
                        checked={budget === option.value}
                        onChange={() => setBudget(option.value)}
                      />
                      <label
                        className="bento-label"
                        htmlFor={`budget-${option.value}`}
                      >
                        <span style={{ fontWeight: 800 }}>{option.label}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "28px" }}>
                <p className="field-label" style={{ marginBottom: "12px" }}>
                  Trip Context
                </p>
                <div className="bento-grid">
                  <div className="bento-item" style={{ gridColumn: "1 / -1" }}>
                    <label className="field-label" htmlFor="pacingStyle">
                      Pacing Style
                    </label>
                    <select
                      id="pacingStyle"
                      className="auth-input"
                      value={pacingStyle}
                      onChange={(event) => setPacingStyle(event.target.value)}
                    >
                      {pacingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bento-item" style={{ gridColumn: "1 / -1" }}>
                    <label className="field-label" htmlFor="companionType">
                      Companion Type
                    </label>
                    <select
                      id="companionType"
                      className="auth-input"
                      value={companionType}
                      onChange={(event) => setCompanionType(event.target.value)}
                    >
                      {companionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bento-item" style={{ gridColumn: "1 / -1" }}>
                    <label className="field-label" htmlFor="transportMode">
                      Transport Mode
                    </label>
                    <select
                      id="transportMode"
                      className="auth-input"
                      value={transportMode}
                      onChange={(event) => setTransportMode(event.target.value)}
                    >
                      {transportOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bento-item" style={{ gridColumn: "1 / -1" }}>
                    <label className="field-label" htmlFor="accommodation">
                      Accommodation Anchor
                    </label>
                    <input
                      id="accommodation"
                      className="auth-input"
                      type="text"
                      placeholder="Hotel, resort, or exact stay location"
                      value={accommodation}
                      onChange={(event) => setAccommodation(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "28px",
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn-outline-luxury"
                  type="button"
                  onClick={() => setStep(2)}
                >
                  ↑ Back
                </button>
                <button
                  className="btn-luxury"
                  type="button"
                  onClick={() => setStep(4)}
                >
                  Continue →
                </button>
              </div>
            </div>

            {/* STEP 4 summarizes everything before the API call is sent. */}
            <div className={`wizard-step ${step === 4 ? "active" : ""}`}>
              <p className="hero-chip" style={{ marginBottom: "14px" }}>
                FINAL STEP
              </p>
              <h2 className="wizard-heading serif">Ready to explore?</h2>
              <p className="wizard-subcopy">
                We’ll craft a personalised itinerary just for you and send it to
                the REST API.
              </p>

              <div className="summary-card" style={{ marginTop: "28px" }}>
                {/* The summary mirrors the old Flask page so users can confirm the details. */}
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Destination
                  </span>
                  <span style={{ fontWeight: 800 }}>{destination || "—"}</span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Duration
                  </span>
                  <span style={{ fontWeight: 800 }}>{numDays} Days</span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Interests
                  </span>
                  <span style={{ fontWeight: 800, textAlign: "right" }}>
                    {summaryText}
                  </span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Travel Style
                  </span>
                  <span style={{ fontWeight: 800 }}>
                    {budget === "high"
                      ? "Luxury"
                      : budget === "low"
                        ? "Backpacker"
                        : "Comfort"}
                  </span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Pacing
                  </span>
                  <span style={{ fontWeight: 800 }}>{pacingStyle}</span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Companion
                  </span>
                  <span style={{ fontWeight: 800 }}>
                    {companionOptions.find(
                      (item) => item.value === companionType,
                    )?.label || companionType}
                  </span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Transport
                  </span>
                  <span style={{ fontWeight: 800 }}>
                    {transportOptions.find(
                      (item) => item.value === transportMode,
                    )?.label || transportMode}
                  </span>
                </div>
                <div className="summary-row">
                  <span
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    Accommodation
                  </span>
                  <span style={{ fontWeight: 800, textAlign: "right" }}>
                    {accommodation || "Not set"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: "28px",
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn-outline-luxury"
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={isSubmitting}
                >
                  ↑ Back
                </button>
                <button
                  className="btn-luxury"
                  type="button"
                  onClick={handleGenerate}
                  disabled={isSubmitting}
                >
                  Craft My Itinerary →
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* A lightweight loading layer gives feedback while the backend is scoring and routing places. */}
      {isSubmitting && (
        <div className="loading-overlay" aria-live="polite" aria-busy="true">
          <div className="loading-card">
            <div style={{ marginBottom: "18px" }}>
              <div className="skeleton-line" style={{ width: "84%" }} />
              <div className="skeleton-line" style={{ width: "72%" }} />
              <div className="skeleton-line" style={{ width: "90%" }} />
            </div>
            <div style={{ fontSize: "3rem", marginBottom: "10px" }}>📍</div>
            <h2
              className="serif"
              style={{ margin: "0 0 8px", fontSize: "2.4rem" }}
            >
              Crafting your journey...
            </h2>
            <p className="muted" style={{ margin: 0, fontWeight: 600 }}>
              {loadingMessage}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
