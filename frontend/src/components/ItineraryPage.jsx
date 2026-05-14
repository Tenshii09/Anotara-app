import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ItineraryMap from "./ItineraryMap";
import { API_BASE_URL } from "../lib/config";
import { getStoredToken, loadTripData } from "../lib/storage";

// If React router state is missing, fall back to localStorage so refreshes still work.
function getTripFromLocation(locationState) {
  if (locationState?.itinerary && locationState?.destCoords) {
    return locationState;
  }

  return loadTripData();
}

export default function ItineraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const trip = getTripFromLocation(location.state);
  const [feedbackState, setFeedbackState] = useState({});
  const [feedbackError, setFeedbackError] = useState("");

  // Without itinerary data there is nothing to render, so redirect users back to the wizard path.
  if (!trip?.itinerary || !trip?.destCoords) {
    return (
      <main className="app-page itinerary-page">
        <div className="itinerary-shell">
          <div
            className="itinerary-sidebar glass-card"
            style={{ maxWidth: "680px", margin: "0 auto" }}
          >
            <h1 className="serif" style={{ fontSize: "2.6rem", marginTop: 0 }}>
              No itinerary found.
            </h1>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              Generate a trip from the dashboard first, then the React itinerary
              page will render the map and day-by-day stops.
            </p>
            <button
              className="btn-luxury"
              type="button"
              onClick={() => navigate("/dashboard")}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const sortedDays = Object.keys(trip.itinerary)
    .map(Number)
    .sort((left, right) => left - right);

  const handlePlaceFeedback = async (placeId, feedback) => {
    if (!trip.itineraryId || !placeId) {
      return;
    }

    setFeedbackError("");
    const token = getStoredToken();

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary/${trip.itineraryId}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ place_id: placeId, feedback }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        setFeedbackError(data.error || "Could not save feedback.");
        return;
      }

      setFeedbackState((current) => ({
        ...current,
        [placeId]: feedback === "like" ? "liked" : "disliked",
      }));
    } catch (error) {
      setFeedbackError("Network error while saving feedback.");
    }
  };

  return (
    <main className="app-page itinerary-page">
      {/* This header reproduces the old results page actions: edit the wizard or start fresh. */}
      <div className="itinerary-topbar">
        <div className="itinerary-topbar-inner">
          <button
            className="top-action-link"
            type="button"
            onClick={() => navigate("/dashboard")}
          >
            ← Edit Details
          </button>
          <button
            className="top-action-link"
            type="button"
            onClick={() => navigate("/dashboard")}
            style={{ marginLeft: "auto" }}
          >
            Plan New Trip
          </button>
        </div>
      </div>

      <div className="itinerary-shell">
        <div className="itinerary-layout">
          {/* Left panel shows the trip summary and the day-by-day stop list. */}
          <aside className="itinerary-sidebar">
            <span className="hero-chip">Your Journey</span>
            <h1 className="itinerary-title serif">{trip.destination}</h1>
            <p className="muted" style={{ marginTop: 0, fontSize: "1.05rem" }}>
              {trip.numDays} Days ·{" "}
              {trip.budget === "high"
                ? "Luxury Class"
                : trip.budget === "low"
                  ? "Backpacker"
                  : "Comfort"}
            </p>

            <div className="pill-row">
              {(trip.preferences || []).map((item) => (
                <span key={item} className="badge-pill">
                  {item}
                </span>
              ))}
            </div>

            {trip.itineraryId && (
              <div className="hero-chip" style={{ marginBottom: "18px" }}>
                Itinerary ID · {trip.itineraryId}
              </div>
            )}

            {feedbackError && (
              <div className="error-banner" style={{ marginBottom: "18px" }}>
                {feedbackError}
              </div>
            )}

            {sortedDays.map((dayNumber) => {
              const places = trip.itinerary[dayNumber] || [];

              return (
                <section key={dayNumber} className="itinerary-day">
                  {/* Each day is rendered separately so the route output stays easy to scan. */}
                  <h3 className="serif">Day {dayNumber}</h3>
                  {places.map((place, index) => (
                    <article
                      key={`${dayNumber}-${index}`}
                      className="place-card"
                    >
                      <div className="place-name">
                        {index + 1}. {place.name}
                      </div>
                      <div className="place-meta">
                        {place.category} · ⭐{" "}
                        {Number(place.rating || 0).toFixed(1)}
                      </div>
                      {(place.recommended_minutes ||
                        place.why ||
                        place.distance_km) && (
                        <div
                          className="place-meta"
                          style={{ marginTop: "8px", lineHeight: 1.5 }}
                        >
                          {place.recommended_minutes && (
                            <div>
                              Suggested stay: {place.recommended_minutes} min
                            </div>
                          )}
                          {place.distance_km !== null &&
                            place.distance_km !== undefined && (
                              <div>
                                Approx. distance: {place.distance_km} km
                              </div>
                            )}
                          {place.why && <div>{place.why}</div>}
                        </div>
                      )}

                      {trip.itineraryId && place.id && (
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            marginTop: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            className="top-action-link"
                            type="button"
                            onClick={() =>
                              handlePlaceFeedback(place.id, "like")
                            }
                            disabled={feedbackState[place.id] === "liked"}
                          >
                            {feedbackState[place.id] === "liked"
                              ? "Saved as best pick"
                              : "Best pick"}
                          </button>
                          <button
                            className="top-action-link"
                            type="button"
                            onClick={() =>
                              handlePlaceFeedback(place.id, "dislike")
                            }
                            disabled={feedbackState[place.id] === "disliked"}
                          >
                            {feedbackState[place.id] === "disliked"
                              ? "Marked not ideal"
                              : "Not ideal"}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              );
            })}
          </aside>

          {/* Right panel is the Mapbox scene with terrain, buildings, markers, and route lines. */}
          <section className="itinerary-map-panel">
            <ItineraryMap
              itinerary={trip.itinerary}
              destCoords={trip.destCoords}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
