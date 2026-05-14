import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ItineraryMap from "./ItineraryMap";
import { API_BASE_URL } from "../lib/config";
import { getStoredToken, loadTripData, saveTripData } from "../lib/storage";

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
  const sortedDays = useMemo(
    () =>
      Object.keys(trip.itinerary || {})
        .map(Number)
        .sort((left, right) => left - right),
    [trip.itinerary],
  );
  const [activeDay, setActiveDay] = useState(sortedDays[0] || 1);
  const [localItinerary, setLocalItinerary] = useState(trip.itinerary);
  const [feedbackState, setFeedbackState] = useState({});
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    setLocalItinerary(trip.itinerary);
  }, [trip.itinerary]);

  useEffect(() => {
    if (!sortedDays.includes(activeDay) && sortedDays.length > 0) {
      setActiveDay(sortedDays[0]);
    }
  }, [activeDay, sortedDays]);

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

  const updateTripState = (nextItinerary) => {
    setLocalItinerary(nextItinerary);
    saveTripData({ ...trip, itinerary: nextItinerary });
  };

  const persistDayOrder = async (dayNumber, nextPlaces) => {
    if (!trip.itineraryId) {
      return;
    }

    const token = getStoredToken();
    const response = await fetch(
      `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/items/reorder`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: nextPlaces.map((place, index) => ({
            item_id: place.item_id,
            day_number: dayNumber,
            sequence_order: index + 1,
          })),
        }),
      },
    );

    return response.json();
  };

  const updateDayPlaces = async (dayNumber, nextPlaces) => {
    const nextItinerary = {
      ...localItinerary,
      [dayNumber]: nextPlaces,
    };
    updateTripState(nextItinerary);

    if (trip.itineraryId) {
      await persistDayOrder(dayNumber, nextPlaces);
    }
  };

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

  const handleMovePlace = async (dayNumber, index, direction) => {
    const places = localItinerary[dayNumber] || [];
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= places.length) {
      return;
    }

    const nextPlaces = places.slice();
    const [movedPlace] = nextPlaces.splice(index, 1);
    nextPlaces.splice(targetIndex, 0, movedPlace);
    await updateDayPlaces(dayNumber, nextPlaces);
  };

  const handleSwapPlace = async (dayNumber, index) => {
    const place = localItinerary[dayNumber]?.[index];
    if (!place?.item_id || !trip.itineraryId) {
      return;
    }

    setFeedbackError("");
    const token = getStoredToken();

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/items/${place.item_id}/swap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        setFeedbackError(data.error || "Could not swap place.");
        return;
      }

      const nextPlaces = (localItinerary[dayNumber] || []).slice();
      nextPlaces[index] = {
        ...place,
        ...data.item.place,
        item_id: data.item.item_id,
        day_number: data.item.day_number,
        sequence_order: data.item.sequence_order,
        estimated_duration: data.item.estimated_duration,
        is_locked: data.item.is_locked,
        swap_history: data.item.swap_history,
      };
      updateTripState({
        ...localItinerary,
        [dayNumber]: nextPlaces,
      });
    } catch (error) {
      setFeedbackError("Network error while swapping place.");
    }
  };

  const handleToggleLock = async (dayNumber, index) => {
    const place = localItinerary[dayNumber]?.[index];
    if (!place?.item_id || !trip.itineraryId) {
      return;
    }

    setFeedbackError("");
    const token = getStoredToken();
    const nextLocked = !place.is_locked;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itineraries/items/${place.item_id}/lock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            itinerary_id: trip.itineraryId,
            is_locked: nextLocked,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        setFeedbackError(data.error || "Could not update lock state.");
        return;
      }

      const nextPlaces = (localItinerary[dayNumber] || []).map((item) =>
        item.item_id === place.item_id
          ? { ...item, is_locked: data.is_locked }
          : item,
      );
      updateTripState({
        ...localItinerary,
        [dayNumber]: nextPlaces,
      });
    } catch (error) {
      setFeedbackError("Network error while updating lock state.");
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

            <div
              style={{
                display: "flex",
                gap: "10px",
                overflowX: "auto",
                paddingBottom: "8px",
                marginBottom: "18px",
              }}
            >
              {sortedDays.map((dayNumber) => (
                <button
                  key={dayNumber}
                  className="top-action-link"
                  type="button"
                  onClick={() => setActiveDay(dayNumber)}
                  style={{
                    whiteSpace: "nowrap",
                    opacity: activeDay === dayNumber ? 1 : 0.6,
                  }}
                >
                  Day {dayNumber}
                </button>
              ))}
            </div>

            {sortedDays.map((dayNumber) => {
              if (dayNumber !== activeDay) {
                return null;
              }

              const places = localItinerary[dayNumber] || [];

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
                        {place.is_locked && (
                          <span
                            style={{ marginLeft: "10px", fontSize: "0.78rem" }}
                          >
                            Locked
                          </span>
                        )}
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

                      {(trip.itineraryId && place.id) || place.item_id ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            marginTop: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          {index > 0 && (
                            <button
                              className="top-action-link"
                              type="button"
                              onClick={() =>
                                handleMovePlace(dayNumber, index, -1)
                              }
                            >
                              Move Up
                            </button>
                          )}
                          {index < places.length - 1 && (
                            <button
                              className="top-action-link"
                              type="button"
                              onClick={() =>
                                handleMovePlace(dayNumber, index, 1)
                              }
                            >
                              Move Down
                            </button>
                          )}
                          <button
                            className="top-action-link"
                            type="button"
                            onClick={() => handleSwapPlace(dayNumber, index)}
                          >
                            Swap
                          </button>
                          <button
                            className="top-action-link"
                            type="button"
                            onClick={() => handleToggleLock(dayNumber, index)}
                          >
                            {place.is_locked ? "Unlock" : "Lock"}
                          </button>
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
                      ) : null}
                    </article>
                  ))}
                </section>
              );
            })}
          </aside>

          {/* Right panel is the Mapbox scene with terrain, buildings, markers, and route lines. */}
          <section className="itinerary-map-panel">
            <ItineraryMap
              itinerary={localItinerary}
              destCoords={trip.destCoords}
              activeDay={activeDay}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
