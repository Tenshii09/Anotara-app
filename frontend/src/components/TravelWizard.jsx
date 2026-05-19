import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { API_BASE_URL, TOKEN_STORAGE_KEY } from "../lib/config";
import {
  clearStoredToken,
  loadWizardDraft,
  saveWizardDraft,
  saveTripData,
} from "../lib/storage";
import { tapHaptic, successHaptic, warningHaptic } from "../lib/haptics";
import { PH_DESTINATIONS } from "../data/phDestinations";
import BrandLogo from "./common/BrandLogo";
import Icon from "./common/Icon";
import PacingSlider from "./wizard/PacingSlider";
import TransportPicker from "./wizard/TransportPicker";
import DealbreakersGrid from "./wizard/DealbreakersGrid";
import VotingLobby from "./wizard/VotingLobby";

const STEPS = [
  { id: 1, kicker: "Phase 1 · The Flock", title: "Plan solo or with a flock?" },
  { id: 2, kicker: "Phase 2 · Destination", title: "Where are we flying to?" },
  { id: 3, kicker: "Phase 3 · Temporal Horizon", title: "When are you flying?" },
  { id: 4, kicker: "Phase 4 · Companions", title: "Who is flying with you?" },
  { id: 5, kicker: "Phase 5 · Pacing & Transport", title: "Set the trip's energy" },
  { id: 6, kicker: "Phase 6 · Resource Tier", title: "Pick your travel tier" },
  { id: 7, kicker: "Phase 7 · Vibe Weighting", title: "What's your perfect vibe?" },
  { id: 8, kicker: "Phase 8 · Dealbreakers", title: "Any hard constraints?" },
  { id: 9, kicker: "Phase 9 · Generative Incubation", title: "Ready for take-off" },
];

const COMPANION_OPTIONS = [
  { value: "Solo", label: "Solo", icon: "user" },
  { value: "Couple", label: "Couple", icon: "heart" },
  { value: "Family_Kids", label: "Family / Kids", icon: "users" },
  { value: "Friends", label: "Friends", icon: "users" },
  { value: "Seniors", label: "Seniors", icon: "leaf" },
];

const BUDGET_OPTIONS = [
  { value: "low", label: "Backpacker", helper: "Hostels & street food" },
  { value: "comfort", label: "Comfort", helper: "Standard hotels & varied dining" },
  { value: "high", label: "Luxury", helper: "Premium resorts & private tours" },
];

const VIBE_OPTIONS = [
  { value: "food", label: "Food", icon: "fork" },
  { value: "beach", label: "Beach", icon: "image" },
  { value: "nature", label: "Nature", icon: "leaf" },
  { value: "museums", label: "Heritage", icon: "shield" },
  { value: "nightlife", label: "Nightlife", icon: "vibe" },
];

const LOADING_MESSAGES = [
  "Analyzing 50+ locations across your destination...",
  "Checking real-time weather patterns...",
  "Applying your vibe preferences...",
  "Routing the shortest, scenic flight path...",
  "Finalizing your perfect journey...",
];

const HIGH_TYPHOON_PROVINCES = new Set(
  [
    "albay",
    "aurora",
    "batanes",
    "bicol",
    "camarines",
    "catanduanes",
    "cagayan",
    "eastern samar",
    "isabela",
    "leyte",
    "northern samar",
    "samar",
    "sorsogon",
    "quezon",
    "siquijor",
    "surigao",
  ].map((value) => value.toLowerCase()),
);

function isHighTyphoonWindow(destination, dateString) {
  if (!destination || !dateString) return false;
  const month = Number(String(dateString).split("-")[1] || 0);
  if (month < 6 || month > 11) return false;
  const lowered = String(destination).toLowerCase();
  return [...HIGH_TYPHOON_PROVINCES].some((province) => lowered.includes(province));
}

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
    tripStartDate: draft.tripStartDate || "",
    dealbreakers: Array.isArray(draft.dealbreakers) ? draft.dealbreakers : [],
  };
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) return null;
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export default function TravelWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initial = useMemo(() => getInitialDraft(), []);
  const [step, setStep] = useState(1);

  const [planMode, setPlanMode] = useState(() =>
    searchParams.get("lobby") ? "flock" : "solo",
  );
  const [destination, setDestination] = useState(initial.destination);
  const [numDays, setNumDays] = useState(initial.numDays);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [budget, setBudget] = useState(initial.budget);
  const [pacingStyle, setPacingStyle] = useState(initial.pacingStyle);
  const [companionType, setCompanionType] = useState(initial.companionType);
  const [transportMode, setTransportMode] = useState(initial.transportMode);
  const [accommodation, setAccommodation] = useState(initial.accommodation);
  const [tripStartDate, setTripStartDate] = useState(initial.tripStartDate);
  const [dealbreakers, setDealbreakers] = useState(initial.dealbreakers);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const tokenPayload = useMemo(() => decodeJwtPayload(localStorage.getItem(TOKEN_STORAGE_KEY)), []);
  const currentUserId = tokenPayload?.sub ? Number(tokenPayload.sub) : null;

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
      tripStartDate,
      dealbreakers,
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
    tripStartDate,
    dealbreakers,
  ]);

  useEffect(() => {
    if (!isSubmitting) return undefined;
    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [isSubmitting]);

  const typhoonWarning = useMemo(
    () => isHighTyphoonWindow(destination, tripStartDate),
    [destination, tripStartDate],
  );

  function toggleVibe(value) {
    setPreferences((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      if (current.length >= 3) {
        warningHaptic();
        return current;
      }
      tapHaptic();
      return [...current, value];
    });
  }

  function handleSurpriseMe() {
    const random = PH_DESTINATIONS[Math.floor(Math.random() * PH_DESTINATIONS.length)];
    tapHaptic();
    setDestination(random);
  }

  function applyResolvedLobby(resolved) {
    if (!resolved || typeof resolved !== "object") return;
    if (resolved.destination) setDestination(resolved.destination);
    if (resolved.numDays) setNumDays(Number(resolved.numDays));
    if (resolved.pacing_style) setPacingStyle(resolved.pacing_style);
    if (resolved.transport_mode) setTransportMode(resolved.transport_mode);
    if (resolved.budget) setBudget(resolved.budget);
    if (Array.isArray(resolved.preferences)) setPreferences(resolved.preferences);
    if (Array.isArray(resolved.dealbreakers)) setDealbreakers(resolved.dealbreakers);
    setPlanMode("solo");
    setStep(STEPS.length);
    successHaptic();
  }

  function goNext() {
    if (step === 2 && !destination.trim()) {
      setError("Please choose a destination first.");
      return;
    }
    setError("");
    tapHaptic();
    setStep((current) => Math.min(STEPS.length, current + 1));
  }

  function goBack() {
    tapHaptic();
    setStep((current) => Math.max(1, current - 1));
  }

  async function handleGenerate() {
    setError("");

    if (!destination.trim()) {
      setError("Please choose a destination first.");
      setStep(2);
      return;
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
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
          trip_start_date: tripStartDate || null,
          dealbreakers,
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
        setError(data.error || "Failed to generate itinerary.");
        setIsSubmitting(false);
        return;
      }

      successHaptic();

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
        tripStartDate: tripStartDate || null,
        dealbreakers,
      };

      saveTripData(trip);
      navigate("/itinerary", { state: trip, replace: true });
    } catch {
      setError("Could not reach the generator. Please try again.");
      setIsSubmitting(false);
    }
  }

  const currentStep = STEPS[step - 1];

  return (
    <main className="app-page wizard-page">
      <div className="wizard-topbar">
        <div className="wizard-topbar-inner">
          <button type="button" className="top-action-link" onClick={() => navigate("/dashboard")}>
            <Icon name="close" size={16} /> Exit planner
          </button>
          <BrandLogo size={26} />
          <div className="step-badge">
            STEP {step} OF {STEPS.length}
          </div>
        </div>
      </div>

      <div className="wizard-wrap">
        <div className="wizard-shell">
          <section className="wizard-card glass-card">
            {error ? (
              <div className="error-banner" style={{ marginBottom: 18 }}>
                {error}
              </div>
            ) : null}

            <p className="hero-chip" style={{ marginBottom: 14 }}>
              {currentStep.kicker.toUpperCase()}
            </p>
            <h1 className="wizard-heading serif">{currentStep.title}</h1>

            {step === 1 ? (
              <div>
                <p className="wizard-subcopy" style={{ maxWidth: "56ch" }}>
                  You can either build this plan solo or open a Tara Na! voting lobby and let your
                  friends weigh in on destination, pacing, vibes, and dealbreakers in real time.
                </p>

                <div className="wizard-plan-mode" style={{ marginTop: 22 }}>
                  <button
                    type="button"
                    className={`wizard-plan-mode__card${planMode === "solo" ? " is-active" : ""}`}
                    onClick={() => {
                      tapHaptic();
                      setPlanMode("solo");
                    }}
                  >
                    <Icon name="user" size={28} tone={planMode === "solo" ? "accent" : "default"} />
                    <h3 className="serif">Plan solo</h3>
                    <p className="muted">Just you. Fastest path to a generated itinerary.</p>
                  </button>
                  <button
                    type="button"
                    className={`wizard-plan-mode__card${planMode === "flock" ? " is-active" : ""}`}
                    onClick={() => {
                      tapHaptic();
                      setPlanMode("flock");
                    }}
                  >
                    <Icon name="users" size={28} tone={planMode === "flock" ? "accent" : "default"} />
                    <h3 className="serif">Plan with a flock</h3>
                    <p className="muted">
                      Spin up a voting lobby, share a code with friends, and let majority rule.
                    </p>
                  </button>
                </div>

                {planMode === "flock" ? (
                  <VotingLobby
                    currentUserId={currentUserId}
                    onClose={() => setPlanMode("solo")}
                    onResolved={(resolved) => applyResolvedLobby(resolved)}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 28,
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button className="btn-luxury" type="button" onClick={goNext}>
                      Continue <Icon name="arrowRight" size={16} />
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <p className="wizard-subcopy" style={{ maxWidth: "56ch" }}>
                  Type any province or city — or tap "Surprise me" to let the ML model pick a
                  high-confidence destination from your travel history.
                </p>
                <div style={{ marginTop: 22 }}>
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
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-outline-luxury" type="button" onClick={handleSurpriseMe}>
                    <Icon name="sparkles" size={16} /> Surprise me
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div>
                <p className="wizard-subcopy">
                  Pick a duration and an optional start date. We will quietly cross-check the
                  forecast and warn you about high-typhoon windows.
                </p>
                <div className="bento-grid" style={{ marginTop: 22, maxWidth: 520 }}>
                  {[2, 3, 5, 7, 10].map((day) => (
                    <div key={day} className="bento-item">
                      <input
                        type="radio"
                        id={`days-${day}`}
                        name="numDays"
                        checked={numDays === day}
                        onChange={() => setNumDays(day)}
                      />
                      <label className="bento-label" htmlFor={`days-${day}`}>
                        <span className="serif" style={{ fontSize: "2rem", fontWeight: 700 }}>
                          {day}
                        </span>
                        <span className="muted">Days</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 22, maxWidth: 520 }}>
                  <label className="field-label" htmlFor="tripStartDate">
                    Trip start date (optional)
                  </label>
                  <input
                    id="tripStartDate"
                    className="auth-input"
                    type="date"
                    value={tripStartDate}
                    onChange={(event) => setTripStartDate(event.target.value)}
                  />
                </div>
                {typhoonWarning ? (
                  <article className="smart-suggestion-banner" style={{ marginTop: 18 }}>
                    <div>
                      <h4>
                        <Icon name="alert" size={16} /> Heads up — typhoon corridor
                      </h4>
                      <p>
                        Your dates fall inside the western-Pacific typhoon corridor for{" "}
                        {destination}. Consider shifting a few weeks or padding indoor stops.
                      </p>
                    </div>
                  </article>
                ) : null}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <p className="wizard-subcopy">
                  Who you travel with calibrates the safety matrix — we won't suggest a steep
                  hike for toddlers, or an extreme dive for seniors.
                </p>
                <div className="companion-card-grid">
                  {COMPANION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`companion-card${companionType === option.value ? " is-selected" : ""}`}
                      onClick={() => {
                        tapHaptic();
                        setCompanionType(option.value);
                      }}
                    >
                      <span className="companion-card__icon" aria-hidden="true">
                        <Icon name={option.icon} size={28} tone={companionType === option.value ? "accent" : "default"} />
                      </span>
                      <span className="companion-card__label">{option.label}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div>
                <p className="wizard-subcopy">
                  Calibrate the trip's energy and how the flock will move around. Both decisions
                  influence how strict the time-blocked schedule becomes.
                </p>
                <div style={{ marginTop: 22 }}>
                  <label className="field-label">Pacing energy</label>
                  <PacingSlider value={pacingStyle} onChange={setPacingStyle} />
                </div>
                <div style={{ marginTop: 22 }}>
                  <label className="field-label">Transport mode</label>
                  <TransportPicker value={transportMode} onChange={setTransportMode} />
                </div>
                {transportMode === "Public" ? (
                  <p className="muted" style={{ marginTop: 12, fontSize: "0.88rem" }}>
                    <Icon name="info" size={14} /> Public commute selected — we automatically pad
                    transit buffers and avoid stacking too many stops per day.
                  </p>
                ) : null}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 6 ? (
              <div>
                <p className="wizard-subcopy">
                  Categorical tiers instead of exact peso amounts — less cognitive friction.
                </p>
                <div className="bento-grid" style={{ marginTop: 22 }}>
                  {BUDGET_OPTIONS.map((option) => (
                    <div key={option.value} className="bento-item">
                      <input
                        type="radio"
                        id={`budget-${option.value}`}
                        name="budget"
                        checked={budget === option.value}
                        onChange={() => {
                          tapHaptic();
                          setBudget(option.value);
                        }}
                      />
                      <label className="bento-label" htmlFor={`budget-${option.value}`}>
                        <span style={{ fontWeight: 800, fontSize: "1.15rem" }}>{option.label}</span>
                        <span className="muted" style={{ fontSize: "0.78rem" }}>{option.helper}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 22 }}>
                  <label className="field-label" htmlFor="accommodation">
                    Accommodation anchor (optional)
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
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 7 ? (
              <div>
                <p className="wizard-subcopy">
                  Tap up to 3 vibe bubbles. The order you tap them weights how strongly the
                  backend pushes those categories.
                </p>
                <div className="vibe-bubble-grid">
                  {VIBE_OPTIONS.map((option) => {
                    const rank = preferences.indexOf(option.value);
                    const isSelected = rank !== -1;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`vibe-bubble${isSelected ? " is-selected" : ""}`}
                        data-rank={rank + 1 || undefined}
                        onClick={() => toggleVibe(option.value)}
                        aria-pressed={isSelected}
                      >
                        <span style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                          <Icon name={option.icon} size={28} tone={isSelected ? "accent" : "default"} />
                          <span>{option.label}</span>
                        </span>
                        {isSelected ? <span className="vibe-bubble__order">{rank + 1}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
                  {preferences.length}/3 vibes selected
                </p>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Continue <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 8 ? (
              <div>
                <p className="wizard-subcopy">
                  Any hard constraints? Toggle as many as apply — these become AI dealbreakers.
                </p>
                <div style={{ marginTop: 18 }}>
                  <DealbreakersGrid value={dealbreakers} onChange={setDealbreakers} />
                </div>
                <p className="muted" style={{ marginTop: 14, fontSize: "0.88rem" }}>
                  {dealbreakers.length === 0
                    ? "No dealbreakers — we'll suggest the broadest possible itinerary."
                    : `${dealbreakers.length} constraint${dealbreakers.length === 1 ? "" : "s"} locked in.`}
                </p>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={goNext}>
                    Review & generate <Icon name="arrowRight" size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 9 ? (
              <div>
                <p className="wizard-subcopy">
                  Tap "Generate my journey" and we'll cross-reference Geoapify candidates,
                  weather snapshots, and your trip context to deliver an optimized plan.
                </p>
                <div className="summary-card" style={{ marginTop: 22 }}>
                  <div className="summary-row">
                    <span className="muted">Destination</span>
                    <span style={{ fontWeight: 800 }}>{destination || "—"}</span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Duration</span>
                    <span style={{ fontWeight: 800 }}>{numDays} days</span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Start date</span>
                    <span style={{ fontWeight: 800 }}>{tripStartDate || "Flexible"}</span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Flock</span>
                    <span style={{ fontWeight: 800 }}>
                      {COMPANION_OPTIONS.find((option) => option.value === companionType)?.label || companionType}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Tier</span>
                    <span style={{ fontWeight: 800 }}>
                      {BUDGET_OPTIONS.find((option) => option.value === budget)?.label || budget}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Pacing</span>
                    <span style={{ fontWeight: 800 }}>{pacingStyle}</span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Transport</span>
                    <span style={{ fontWeight: 800 }}>{transportMode}</span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Vibes</span>
                    <span style={{ fontWeight: 800, textAlign: "right" }}>
                      {preferences.length
                        ? preferences
                            .map((value) => VIBE_OPTIONS.find((option) => option.value === value)?.label || value)
                            .join(" · ")
                        : "No vibes — generic mix"}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Dealbreakers</span>
                    <span style={{ fontWeight: 800, textAlign: "right" }}>
                      {dealbreakers.length ? dealbreakers.join(" · ") : "None"}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="muted">Anchor</span>
                    <span style={{ fontWeight: 800, textAlign: "right" }}>{accommodation || "Not set"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 28, gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-outline-luxury" type="button" onClick={goBack} disabled={isSubmitting}>
                    <Icon name="arrowLeft" size={16} /> Back
                  </button>
                  <button className="btn-luxury" type="button" onClick={handleGenerate} disabled={isSubmitting}>
                    <Icon name="plane" size={16} /> Generate my journey
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {isSubmitting ? (
        <div className="tara-loader" role="status" aria-live="polite">
          <div className="tara-loader__stage" aria-hidden="true">
            <span className="tara-loader__horizon" />
            <span className="tara-loader__island tara-loader__island--a" />
            <span className="tara-loader__island tara-loader__island--b" />
            <span className="tara-loader__island tara-loader__island--c" />
            <span className="tara-loader__bird">
              <BrandLogo size={56} showWordmark={false} accent="#ffd6bd" />
            </span>
          </div>
          <h2 className="tara-loader__title">Crafting your journey...</h2>
          <p className="tara-loader__caption">{LOADING_MESSAGES[loadingMessageIndex]}</p>
        </div>
      ) : null}
    </main>
  );
}
