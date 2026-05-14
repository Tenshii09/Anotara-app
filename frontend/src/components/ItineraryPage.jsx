import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ItineraryMap from "./ItineraryMap";
import {
  API_BASE_URL,
  FIREBASE_VAPID_KEY,
  HAS_FIREBASE_CONFIG,
  getMissingFirebaseConfigKeys,
} from "../lib/config";
import { getFirebasePushToken } from "../lib/firebase";
import {
  clearStoredToken,
  getStoredToken,
  loadTripData,
  saveTripData,
} from "../lib/storage";

const WEATHER_NOTIFICATION_KEY = "anotara:last-weather-alert";

function getWeatherNotificationSignature(data) {
  if (!data) {
    return "";
  }

  return [
    data.headline || "",
    data.message || "",
    data.focus_day ?? "",
    data.precipitation_probability ?? "",
    data.weather_code ?? "",
  ].join("|");
}

function maybeNotifyWeatherAlert(data) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !data?.alert ||
    window.Notification.permission !== "granted"
  ) {
    return;
  }

  const signature = getWeatherNotificationSignature(data);
  const lastSignature = window.localStorage.getItem(WEATHER_NOTIFICATION_KEY);
  if (!signature || signature === lastSignature) {
    return;
  }

  const notification = new window.Notification("Anotara weather alert", {
    body: data.message,
    tag: signature,
    renotify: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  window.localStorage.setItem(WEATHER_NOTIFICATION_KEY, signature);
}

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
  const [swappingItemId, setSwappingItemId] = useState(null);
  const [smartSuggestion, setSmartSuggestion] = useState(null);
  const [smartSuggestionError, setSmartSuggestionError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported",
  );
  const [pushStatus, setPushStatus] = useState("idle");
  const [pushError, setPushError] = useState("");
  const missingFirebaseConfig = getMissingFirebaseConfigKeys();

  const enableDevicePushAlerts = async () => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !HAS_FIREBASE_CONFIG ||
      !FIREBASE_VAPID_KEY
    ) {
      setPushStatus("unsupported");
      setPushError(
        missingFirebaseConfig.length
          ? `Missing Firebase env vars: ${missingFirebaseConfig.join(", ")}`
          : "Firebase Cloud Messaging is not configured.",
      );
      return;
    }

    setPushError("");
    setPushStatus("loading");

    const permission =
      window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      setPushStatus(permission === "denied" ? "blocked" : "idle");
      return;
    }

    try {
      const firebaseToken = await getFirebasePushToken();

      if (!firebaseToken) {
        setPushStatus("error");
        setPushError("Could not create a Firebase push token.");
        return;
      }

      const token = getStoredToken();

      const saveResponse = await fetch(`${API_BASE_URL}/api/push-tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token: firebaseToken,
          platform: "web",
          user_agent: navigator.userAgent,
        }),
      });

      if (!saveResponse.ok) {
        const data = await saveResponse.json();
        setPushStatus("error");
        setPushError(data.error || "Could not save the push subscription.");
        return;
      }

      setPushStatus("subscribed");
      if (smartSuggestion?.alert) {
        maybeNotifyWeatherAlert(smartSuggestion);
      }
    } catch {
      setPushStatus("error");
      setPushError("Could not enable device push alerts.");
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // React's hooks lint rule dislikes synchronous state syncing, but this page
    // needs to mirror the latest trip payload whenever the router state changes.
    setLocalItinerary(trip.itinerary);
  }, [trip.itinerary]);

  useEffect(() => {
    if (!sortedDays.includes(activeDay) && sortedDays.length > 0) {
      setActiveDay(sortedDays[0]);
    }
  }, [activeDay, sortedDays]);

  useEffect(() => {
    if (!trip.itineraryId) {
      setSmartSuggestion(null);
      return;
    }

    const controller = new AbortController();
    const token = getStoredToken();

    const loadSuggestion = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/smart-suggestion`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );

        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401 || response.status === 422) {
            clearStoredToken();
            navigate("/login");
            return;
          }

          setSmartSuggestionError(
            data.error || "Could not load smart suggestion.",
          );
          return;
        }

        setSmartSuggestion(data);
        setSmartSuggestionError("");
      } catch (_error) {
        if (_error.name !== "AbortError") {
          setSmartSuggestionError(
            "Weather suggestions are temporarily unavailable.",
          );
        }
      }
    };

    loadSuggestion();

    return () => controller.abort();
  }, [trip.itineraryId, navigate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!smartSuggestion?.alert) {
      return;
    }

    if (pushStatus !== "subscribed") {
      maybeNotifyWeatherAlert(smartSuggestion);
    }
  }, [smartSuggestion, pushStatus]);

  useEffect(() => {
    if (!trip.itineraryId) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted" ||
      pushStatus === "subscribed"
    ) {
      return;
    }

    const token = getStoredToken();
    const controller = new AbortController();

    const loadAlertHistory = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/weather-alerts`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 422) {
            clearStoredToken();
            navigate("/login");
            return;
          }

          return;
        }

        const data = await response.json();
        const latestAlert = data.alerts?.[0];
        if (latestAlert?.is_active) {
          const signature = getWeatherNotificationSignature(
            latestAlert.payload || latestAlert,
          );
          const lastSignature = window.localStorage.getItem(
            WEATHER_NOTIFICATION_KEY,
          );
          if (signature && signature !== lastSignature) {
            new window.Notification("Anotara weather alert", {
              body: latestAlert.message,
              tag: signature,
              renotify: false,
            });
            window.localStorage.setItem(WEATHER_NOTIFICATION_KEY, signature);
          }
        }
      } catch (_error) {
        if (_error.name !== "AbortError") {
          // Ignore background notification refresh failures; the in-page banner still renders.
        }
      }
    };

    loadAlertHistory();

    return () => controller.abort();
  }, [trip.itineraryId, notificationPermission, pushStatus, navigate]);

  useEffect(() => {
    if (!trip.itineraryId) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted" ||
      !HAS_FIREBASE_CONFIG ||
      !FIREBASE_VAPID_KEY
    ) {
      return;
    }

    const controller = new AbortController();

    const syncExistingSubscription = async () => {
      try {
        const firebaseToken = await getFirebasePushToken();
        if (!firebaseToken) {
          return;
        }

        const token = getStoredToken();

        const response = await fetch(`${API_BASE_URL}/api/push-tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            token: firebaseToken,
            platform: "web",
            user_agent: navigator.userAgent,
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          setPushStatus("subscribed");
        }
      } catch (_error) {
        if (_error.name !== "AbortError") {
          setPushStatus((current) =>
            current === "subscribed" ? current : "idle",
          );
        }
      }
    };

    syncExistingSubscription();

    return () => controller.abort();
  }, [trip.itineraryId, notificationPermission, navigate]);

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
    } catch {
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
    if (
      !place?.item_id ||
      !trip.itineraryId ||
      swappingItemId === place.item_id
    ) {
      return;
    }

    setFeedbackError("");
    const token = getStoredToken();
    setSwappingItemId(place.item_id);

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
        setFeedbackError(
          data.error ||
            "Could not swap place. Try another stop or unlock it first.",
        );
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
    } catch {
      setFeedbackError("Network error while swapping place.");
    } finally {
      setSwappingItemId(null);
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
    } catch {
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

            <div
              className="glass-card"
              style={{
                marginBottom: "18px",
                padding: "16px",
                border: "1px solid rgba(59, 130, 246, 0.16)",
                background:
                  "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0.92))",
              }}
            >
              <div className="hero-chip" style={{ marginBottom: "10px" }}>
                Device Push
              </div>
              <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                Subscribe this device to receive weather alerts even when the
                app is closed.
              </p>
              {pushStatus === "subscribed" ? (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Push alerts are enabled on this device.
                </p>
              ) : (
                <button
                  className="top-action-link"
                  type="button"
                  onClick={enableDevicePushAlerts}
                  disabled={
                    pushStatus === "loading" || pushStatus === "unsupported"
                  }
                >
                  {pushStatus === "blocked"
                    ? "Notifications blocked"
                    : pushStatus === "loading"
                      ? "Enabling..."
                      : "Enable device push alerts"}
                </button>
              )}
              {pushError && (
                <p
                  className="muted"
                  style={{ marginBottom: 0, color: "#991b1b" }}
                >
                  {pushError}
                </p>
              )}
              {pushStatus === "unsupported" &&
                missingFirebaseConfig.length > 0 && (
                  <p
                    className="muted"
                    style={{ marginBottom: 0, marginTop: 8 }}
                  >
                    Add the Firebase env vars in the frontend `.env` file, then
                    reload the page.
                  </p>
                )}
            </div>

            {smartSuggestion?.alert && pushStatus !== "subscribed" && (
              <div
                className="glass-card"
                style={{
                  marginBottom: "18px",
                  padding: "16px",
                  border: "1px solid rgba(225, 29, 72, 0.24)",
                  background:
                    "linear-gradient(135deg, rgba(225, 29, 72, 0.08), rgba(255, 255, 255, 0.92))",
                }}
              >
                <div className="hero-chip" style={{ marginBottom: "10px" }}>
                  In-App Alert
                </div>
                <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                  This fallback alert appears only when device push alerts are
                  not enabled yet.
                </p>
              </div>
            )}

            {feedbackError && (
              <div className="error-banner" style={{ marginBottom: "18px" }}>
                {feedbackError}
              </div>
            )}

            {smartSuggestionError && !smartSuggestion && (
              <div className="error-banner" style={{ marginBottom: "18px" }}>
                {smartSuggestionError}
              </div>
            )}

            {smartSuggestion && (
              <div
                className="glass-card"
                style={{
                  marginBottom: "18px",
                  padding: "18px",
                  border: smartSuggestion.alert
                    ? "1px solid rgba(225, 29, 72, 0.32)"
                    : "1px solid rgba(59, 130, 246, 0.18)",
                  background: smartSuggestion.alert
                    ? "linear-gradient(135deg, rgba(225, 29, 72, 0.12), rgba(255, 255, 255, 0.92))"
                    : "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0.92))",
                }}
              >
                <div className="hero-chip" style={{ marginBottom: "10px" }}>
                  Smart Suggestion
                </div>
                <h3
                  className="serif"
                  style={{ marginTop: 0, marginBottom: "8px" }}
                >
                  {smartSuggestion.headline}
                </h3>
                <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                  {smartSuggestion.message}
                </p>
                <p className="muted" style={{ marginTop: 0 }}>
                  Rain chance: {smartSuggestion.precipitation_probability || 0}%
                </p>
                {smartSuggestion.focus_day && (
                  <button
                    className="top-action-link"
                    type="button"
                    onClick={() =>
                      setActiveDay(Number(smartSuggestion.focus_day))
                    }
                    style={{ marginBottom: "12px" }}
                  >
                    View Day {smartSuggestion.focus_day}
                  </button>
                )}
                {smartSuggestion.indoor_alternatives?.length > 0 && (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {smartSuggestion.indoor_alternatives.map((place) => (
                      <div
                        key={place.id}
                        className="place-card"
                        style={{ margin: 0 }}
                      >
                        <div className="place-name">{place.name}</div>
                        <div className="place-meta">
                          {place.category} · ⭐{" "}
                          {Number(place.rating || 0).toFixed(1)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                            disabled={swappingItemId === place.item_id}
                          >
                            {swappingItemId === place.item_id
                              ? "Swapping..."
                              : "Swap"}
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
