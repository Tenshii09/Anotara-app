import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import ItineraryMap from "./ItineraryMap";
import VerticalTimeline from "./itinerary/VerticalTimeline";
import DaySelector from "./itinerary/DaySelector";
import TimeAdjustSheet from "./itinerary/TimeAdjustSheet";
import MemoryLogSheet from "./itinerary/MemoryLogSheet";
import HotelCard from "./itinerary/HotelCard";
import FlockCluster from "./common/FlockCluster";
import InviteCompanionSheet from "./common/InviteCompanionSheet";
import Icon from "./common/Icon";
import {
  API_BASE_URL,
  FIREBASE_VAPID_KEY,
  HAS_FIREBASE_CONFIG,
  getMissingFirebaseConfigKeys,
  TOKEN_STORAGE_KEY,
} from "../lib/config";
import { getFirebasePushToken } from "../lib/firebase";
import {
  clearStoredToken,
  getStoredToken,
  loadTripData,
  saveTripData,
} from "../lib/storage";
import {
  addCollaborator,
  addMemory,
  deleteMemory as deleteMemoryRequest,
  getAllMemories,
  getCollaborators,
  getHotelRecommendation,
  getTripActivity,
  pingTripPresence,
  postTripActivity,
  removeCollaborator,
  searchFriends,
  sendFriendRequest,
} from "../lib/socialApi";
import { buildTimeBlocksForDay, clockToMinutes } from "../lib/timeBlocks";
import { exportItineraryToPdf } from "../lib/pdfExport";
import { successHaptic, tapHaptic, warningHaptic } from "../lib/haptics";

const WEATHER_NOTIFICATION_KEY = "anotara:last-weather-alert";
const PRESENCE_INTERVAL_MS = 25_000;
const ACTIVITY_POLL_MS = 6_000;

function getWeatherNotificationSignature(data) {
  if (!data) return "";
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
  if (!signature || signature === lastSignature) return;

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

function getTripFromLocation(locationState) {
  if (locationState?.itinerary && locationState?.destCoords) return locationState;
  return loadTripData();
}

function getFirstCoordsFromItinerary(itinerary) {
  const days = Object.keys(itinerary || {});
  for (const day of days) {
    const places = itinerary[day] || [];
    for (const place of places) {
      const lat = place.latitude ?? place.lat;
      const lon = place.longitude ?? place.lon ?? place.lng;
      if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) {
        return { lat: Number(lat), lon: Number(lon) };
      }
    }
  }
  return null;
}

function normalizeItineraryPlaces(itinerary) {
  const normalized = {};
  Object.entries(itinerary || {}).forEach(([dayNumber, places]) => {
    normalized[dayNumber] = (places || []).map((place) => {
      const latitude = place.latitude ?? place.lat;
      const longitude = place.longitude ?? place.lon ?? place.lng;
      const placeId = place.id ?? place.place_id;
      return {
        ...place,
        id: placeId,
        place_id: placeId,
        latitude: latitude !== null && latitude !== undefined ? Number(latitude) : null,
        longitude: longitude !== null && longitude !== undefined ? Number(longitude) : null,
        lat: latitude !== null && latitude !== undefined ? Number(latitude) : null,
        lon: longitude !== null && longitude !== undefined ? Number(longitude) : null,
        rating: Number(place.rating || 0),
      };
    });
  });
  return normalized;
}

function normalizeSavedTrip(data) {
  const itinerary = normalizeItineraryPlaces(data.itinerary || {});
  const fallbackCoords = getFirstCoordsFromItinerary(itinerary);
  const rawDestCoords = data.destCoords || data.dest_coords || fallbackCoords;

  return {
    ...data,
    itineraryId: data.itineraryId || data.itinerary_id || data.id,
    itinerary_id: data.itinerary_id || data.itineraryId || data.id,
    numDays: data.numDays || data.num_days || data.days,
    num_days: data.num_days || data.numDays || data.days,
    destCoords: rawDestCoords
      ? { lat: Number(rawDestCoords.lat), lon: Number(rawDestCoords.lon ?? rawDestCoords.lng) }
      : fallbackCoords,
    itinerary,
  };
}

function decodeJwtSubject(token) {
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

export default function ItineraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itineraryId } = useParams();

  const [trip, setTrip] = useState(null);
  const [localItinerary, setLocalItinerary] = useState({});
  const [activeDay, setActiveDay] = useState(1);
  const [isLoadingSavedTrip, setIsLoadingSavedTrip] = useState(Boolean(itineraryId));
  const [loadError, setLoadError] = useState("");
  const [focusedPlaceKey, setFocusedPlaceKey] = useState(null);
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

  const [flock, setFlock] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activityToast, setActivityToast] = useState(null);
  const [activityCursor, setActivityCursor] = useState(0);

  const [memoryByItemId, setMemoryByItemId] = useState({});
  const [memorySheetPlace, setMemorySheetPlace] = useState(null);

  const [hotelByDay, setHotelByDay] = useState({});
  const [hotelRefreshing, setHotelRefreshing] = useState(false);

  const [adjustBlock, setAdjustBlock] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [dayStarts, setDayStarts] = useState({});

  const mapHandleRef = useRef(null);
  const [tokenPayload] = useState(
    () => decodeJwtSubject(localStorage.getItem(TOKEN_STORAGE_KEY)) || {},
  );
  const currentUserId = tokenPayload?.sub ? Number(tokenPayload.sub) : null;

  const missingFirebaseConfig = getMissingFirebaseConfigKeys();

  const sortedDays = useMemo(
    () =>
      Object.keys(localItinerary || {})
        .map(Number)
        .sort((left, right) => left - right),
    [localItinerary],
  );

  const focusPlaceOnMap = useCallback((place, placeKey) => {
    const latitude = Number(place?.latitude ?? place?.lat);
    const longitude = Number(place?.longitude ?? place?.lon ?? place?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    setFocusedPlaceKey(placeKey ?? null);
    mapHandleRef.current?.flyTo({ latitude, longitude, zoom: 15 });
  }, []);

  useEffect(() => {
    async function loadTrip() {
      setLoadError("");
      setFeedbackState({});
      setFeedbackError("");
      setSmartSuggestion(null);
      setSmartSuggestionError("");
      setActiveDay(1);
      setMemoryByItemId({});
      setHotelByDay({});
      setFlock([]);

      if (itineraryId) {
        setIsLoadingSavedTrip(true);
        setTrip(null);
        setLocalItinerary({});

        const token = getStoredToken();
        if (!token) {
          navigate("/login");
          return;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/itineraries/${itineraryId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (!response.ok) {
            if (response.status === 401 || response.status === 422) {
              clearStoredToken();
              navigate("/login");
              return;
            }
            setLoadError(data.error || data.msg || "Could not load saved itinerary.");
            return;
          }
          const normalizedTrip = normalizeSavedTrip(data);
          setTrip(normalizedTrip);
          setLocalItinerary(normalizedTrip.itinerary || {});
          saveTripData(normalizedTrip);
        } catch {
          setLoadError("Connection error while loading saved itinerary.");
        } finally {
          setIsLoadingSavedTrip(false);
        }
        return;
      }

      const generatedTrip = getTripFromLocation(location.state);
      if (!generatedTrip) {
        setTrip(null);
        setLocalItinerary({});
        setIsLoadingSavedTrip(false);
        return;
      }
      const normalizedGeneratedTrip = normalizeSavedTrip(generatedTrip);
      setTrip(normalizedGeneratedTrip);
      setLocalItinerary(normalizedGeneratedTrip.itinerary || {});
      setIsLoadingSavedTrip(false);
    }
    loadTrip();
  }, [itineraryId, location.state, navigate]);

  useEffect(() => {
    async function ensureValidDay() {
      if (sortedDays.length > 0 && activeDay !== null && !sortedDays.includes(activeDay)) {
        setActiveDay(sortedDays[0]);
      }
    }
    ensureValidDay();
  }, [activeDay, sortedDays]);

  useEffect(() => {
    async function clearFocus() {
      setFocusedPlaceKey(null);
    }
    clearFocus();
  }, [activeDay]);

  /* ------------------------------------------------------------------ */
  /* Real-time collaboration: presence heartbeat + activity toasts      */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!trip?.itineraryId) {
      async function resetFlock() {
        setFlock([]);
      }
      resetFlock();
      return undefined;
    }
    const token = getStoredToken();
    if (!token) return undefined;

    let cancelled = false;

    async function fetchFlock() {
      try {
        const response = await getCollaborators(token, trip.itineraryId);
        if (!cancelled) setFlock(Array.isArray(response?.flock) ? response.flock : []);
      } catch (flockError) {
        if (flockError?.status === 401 || flockError?.status === 422) {
          clearStoredToken();
          navigate("/login");
        }
      }
    }

    fetchFlock();
    const presenceTimer = window.setInterval(async () => {
      try {
        const response = await pingTripPresence(token, trip.itineraryId);
        if (!cancelled) setFlock(Array.isArray(response?.flock) ? response.flock : []);
      } catch {
        /* swallow heartbeat failures */
      }
    }, PRESENCE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(presenceTimer);
    };
  }, [trip?.itineraryId, navigate]);

  useEffect(() => {
    if (!trip?.itineraryId) {
      async function resetActivity() {
        setActivityCursor(0);
        setActivityToast(null);
      }
      resetActivity();
      return undefined;
    }
    const token = getStoredToken();
    if (!token) return undefined;

    let cancelled = false;
    let cursor = activityCursor;

    async function poll() {
      try {
        const response = await getTripActivity(token, trip.itineraryId, cursor || undefined);
        if (cancelled) return;
        const activity = Array.isArray(response?.activity) ? response.activity : [];
        if (activity.length > 0) {
          const newest = activity[activity.length - 1];
          cursor = newest.id;
          setActivityCursor(newest.id);
          const incoming = activity.filter((entry) => Number(entry.user_id) !== Number(currentUserId));
          if (incoming.length > 0) {
            const lastIncoming = incoming[incoming.length - 1];
            setActivityToast({
              id: lastIncoming.id,
              username: lastIncoming.username,
              action: lastIncoming.action,
              payload: lastIncoming.payload,
            });
          }
        }
      } catch {
        /* ignore polling errors silently */
      }
    }

    poll();
    const timer = window.setInterval(poll, ACTIVITY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.itineraryId, currentUserId]);

  useEffect(() => {
    if (!activityToast) return undefined;
    const timer = window.setTimeout(() => setActivityToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [activityToast]);

  /* ------------------------------------------------------------------ */
  /* Memory log + hotel + start-time cache                              */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!trip?.itineraryId) return undefined;
    const token = getStoredToken();
    if (!token) return undefined;
    let cancelled = false;

    async function loadMemories() {
      try {
        const response = await getAllMemories(token, trip.itineraryId);
        if (cancelled) return;
        const indexed = {};
        (response?.memories || []).forEach((memory) => {
          const itemKey = memory.item_id;
          if (!itemKey) return;
          indexed[itemKey] = indexed[itemKey] ? [...indexed[itemKey], memory] : [memory];
        });
        setMemoryByItemId(indexed);
      } catch {
        /* memories are best-effort */
      }
    }

    loadMemories();
    return () => {
      cancelled = true;
    };
  }, [trip?.itineraryId]);

  const refreshHotelForDay = useCallback(
    async (dayNumber, options = {}) => {
      if (!trip?.itineraryId) return;
      const token = getStoredToken();
      if (!token) return;
      try {
        setHotelRefreshing(true);
        const response = await getHotelRecommendation(token, trip.itineraryId, dayNumber, {
          refresh: Boolean(options.refresh),
          budget: trip.budget,
        });
        if (response?.hotel) {
          setHotelByDay((current) => ({ ...current, [dayNumber]: response.hotel }));
        }
      } catch {
        /* hotel suggestions are non-critical */
      } finally {
        setHotelRefreshing(false);
      }
    },
    [trip],
  );

  useEffect(() => {
    if (!trip?.itineraryId || !activeDay) return;
    if (hotelByDay[activeDay]) return;
    async function ensureHotel() {
      await refreshHotelForDay(activeDay);
    }
    ensureHotel();
  }, [trip?.itineraryId, activeDay, hotelByDay, refreshHotelForDay]);

  /* ------------------------------------------------------------------ */
  /* Push + Smart Suggestion (unchanged behavior, simplified handlers)  */
  /* ------------------------------------------------------------------ */

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: firebaseToken, platform: "web", user_agent: navigator.userAgent }),
      });
      if (!saveResponse.ok) {
        const data = await saveResponse.json();
        setPushStatus("error");
        setPushError(data.error || "Could not save the push subscription.");
        return;
      }
      setPushStatus("subscribed");
      if (smartSuggestion?.alert) maybeNotifyWeatherAlert(smartSuggestion);
    } catch {
      setPushStatus("error");
      setPushError("Could not enable device push alerts.");
    }
  };

  useEffect(() => {
    if (!trip?.itineraryId) {
      async function resetSuggestion() {
        setSmartSuggestion(null);
      }
      resetSuggestion();
      return undefined;
    }
    const controller = new AbortController();
    const token = getStoredToken();

    async function loadSuggestion() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/smart-suggestion`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401 || response.status === 422) {
            clearStoredToken();
            navigate("/login");
            return;
          }
          setSmartSuggestionError(data.error || "Could not load smart suggestion.");
          return;
        }
        setSmartSuggestion(data);
        setSmartSuggestionError("");
      } catch (suggestionError) {
        if (suggestionError.name !== "AbortError") {
          setSmartSuggestionError("Weather suggestions are temporarily unavailable.");
        }
      }
    }

    loadSuggestion();
    return () => controller.abort();
  }, [trip?.itineraryId, navigate]);

  useEffect(() => {
    if (!smartSuggestion?.alert) return;
    if (pushStatus !== "subscribed") maybeNotifyWeatherAlert(smartSuggestion);
  }, [smartSuggestion, pushStatus]);

  useEffect(() => {
    if (!trip?.itineraryId) return undefined;
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted" ||
      !HAS_FIREBASE_CONFIG ||
      !FIREBASE_VAPID_KEY
    ) {
      return undefined;
    }
    const controller = new AbortController();
    async function sync() {
      try {
        const firebaseToken = await getFirebasePushToken();
        if (!firebaseToken) return;
        const token = getStoredToken();
        const response = await fetch(`${API_BASE_URL}/api/push-tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ token: firebaseToken, platform: "web", user_agent: navigator.userAgent }),
          signal: controller.signal,
        });
        if (response.ok) setPushStatus("subscribed");
      } catch (syncError) {
        if (syncError?.name === "AbortError") return;
        setPushStatus((current) => (current === "subscribed" ? current : "idle"));
      }
    }
    sync();
    return () => controller.abort();
  }, [trip?.itineraryId, notificationPermission]);

  /* ------------------------------------------------------------------ */
  /* Mutation handlers                                                   */
  /* ------------------------------------------------------------------ */

  const updateTripState = (nextItinerary) => {
    setLocalItinerary(nextItinerary);
    saveTripData({ ...trip, itinerary: nextItinerary });
  };

  const persistDayOrder = async (dayNumber, nextPlaces) => {
    if (!trip?.itineraryId) return;
    const token = getStoredToken();
    const response = await fetch(
      `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/items/reorder`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: nextPlaces.map((place, index) => ({
            item_id: place.item_id,
            day_number: dayNumber,
            sequence_order: index + 1,
          })),
        }),
      },
    );
    try {
      await postTripActivity(token, trip.itineraryId, "reordered_day", { day: dayNumber });
    } catch {
      /* activity ping is best-effort */
    }
    return response.json();
  };

  const updateDayPlaces = async (dayNumber, nextPlaces) => {
    const nextItinerary = { ...localItinerary, [dayNumber]: nextPlaces };
    updateTripState(nextItinerary);
    if (trip?.itineraryId) await persistDayOrder(dayNumber, nextPlaces);
  };

  const handlePlaceFeedback = async (placeId, feedback) => {
    if (!trip?.itineraryId || !placeId) return;
    setFeedbackError("");
    const token = getStoredToken();
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary/${trip.itineraryId}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    if (targetIndex < 0 || targetIndex >= places.length) return;
    const nextPlaces = places.slice();
    const [moved] = nextPlaces.splice(index, 1);
    nextPlaces.splice(targetIndex, 0, moved);
    await updateDayPlaces(dayNumber, nextPlaces);
  };

  const handleSwapPlace = async (dayNumber, index) => {
    const place = localItinerary[dayNumber]?.[index];
    if (!place?.item_id || !trip?.itineraryId || swappingItemId === place.item_id) return;
    setFeedbackError("");
    const token = getStoredToken();
    setSwappingItemId(place.item_id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itineraries/${trip.itineraryId}/items/${place.item_id}/swap`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setFeedbackError(data.error || "Could not swap place.");
        return;
      }
      const replacementPlace = normalizeItineraryPlaces({
        1: [
          {
            ...place,
            ...data.item.place,
            item_id: data.item.item_id,
            day_number: data.item.day_number,
            sequence_order: data.item.sequence_order,
            estimated_duration: data.item.estimated_duration,
            recommended_minutes: data.item.estimated_duration,
            is_locked: data.item.is_locked,
            swap_history: data.item.swap_history,
          },
        ],
      })[1][0];
      const nextPlaces = (localItinerary[dayNumber] || []).slice();
      nextPlaces[index] = replacementPlace;
      updateTripState({ ...localItinerary, [dayNumber]: nextPlaces });
      try {
        await postTripActivity(token, trip.itineraryId, "swapped_stop", {
          item_id: replacementPlace.item_id,
          name: replacementPlace.name,
          day: dayNumber,
        });
      } catch {
        /* best-effort */
      }
    } catch {
      setFeedbackError("Network error while swapping place.");
    } finally {
      setSwappingItemId(null);
    }
  };

  const handleToggleLock = async (dayNumber, index) => {
    const place = localItinerary[dayNumber]?.[index];
    if (!place?.item_id || !trip?.itineraryId) return;
    setFeedbackError("");
    const token = getStoredToken();
    const nextLocked = !place.is_locked;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itineraries/items/${place.item_id}/lock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itinerary_id: trip.itineraryId, is_locked: nextLocked }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setFeedbackError(data.error || "Could not update lock state.");
        return;
      }
      const nextPlaces = (localItinerary[dayNumber] || []).map((item) =>
        item.item_id === place.item_id ? { ...item, is_locked: data.is_locked } : item,
      );
      updateTripState({ ...localItinerary, [dayNumber]: nextPlaces });
    } catch {
      setFeedbackError("Network error while updating lock state.");
    }
  };

  function handleAdjustTime(dayNumber, index, block) {
    setAdjustBlock({ ...block, dayNumber, index });
    setAdjustOpen(true);
  }

  function handleSaveAdjustedTime(newStartMinutes) {
    if (!adjustBlock) return;
    const { dayNumber, index } = adjustBlock;
    const places = localItinerary[dayNumber] || [];
    const blocks = buildTimeBlocksForDay(places, {
      pacingStyle: trip?.pacingStyle || trip?.pacing_style,
      transportMode: trip?.transportMode || trip?.transport_mode,
      dayStart: dayStarts[dayNumber],
    });
    const targetBlock = blocks[index];
    if (!targetBlock) return;
    const delta = newStartMinutes - targetBlock.startMinutes;
    const currentDayStart = clockToMinutes(dayStarts[dayNumber]) || blocks[0]?.startMinutes || 8 * 60;
    const adjustedStart = index === 0 ? newStartMinutes : currentDayStart + delta;
    const minutes = Math.max(0, Math.min(23 * 60 + 30, adjustedStart));
    setDayStarts((current) => ({
      ...current,
      [dayNumber]: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`,
    }));
    setAdjustOpen(false);
    setAdjustBlock(null);
    successHaptic();
  }

  async function handleOpenMemoryLog(place) {
    if (!place?.item_id) {
      warningHaptic();
      setFeedbackError("Save this trip first to attach memories.");
      return;
    }
    tapHaptic();
    setMemorySheetPlace(place);
  }

  async function handleAddMemory({ kind, note, imageData, mimeType }) {
    if (!trip?.itineraryId || !memorySheetPlace?.item_id) return;
    const token = getStoredToken();
    const response = await addMemory(token, trip.itineraryId, memorySheetPlace.item_id, {
      kind,
      note,
      imageData,
      mimeType,
    });
    if (response?.memories) {
      setMemoryByItemId((current) => ({
        ...current,
        [memorySheetPlace.item_id]: response.memories,
      }));
    }
    try {
      await postTripActivity(token, trip.itineraryId, "memory_added", {
        item_id: memorySheetPlace.item_id,
        kind,
      });
    } catch {
      /* best-effort */
    }
  }

  async function handleDeleteMemoryEntry(memory) {
    if (!memory?.id) return;
    const token = getStoredToken();
    await deleteMemoryRequest(token, memory.id);
    setMemoryByItemId((current) => {
      const next = { ...current };
      if (next[memory.item_id]) {
        next[memory.item_id] = next[memory.item_id].filter((entry) => entry.id !== memory.id);
        if (next[memory.item_id].length === 0) delete next[memory.item_id];
      }
      return next;
    });
  }

  async function handleSendFriendRequest(user) {
    const token = getStoredToken();
    await sendFriendRequest(token, user.id);
  }

  async function handleAddCollaborator(user) {
    if (!trip?.itineraryId) return;
    const token = getStoredToken();
    const response = await addCollaborator(token, trip.itineraryId, user.id);
    if (response?.flock) setFlock(response.flock);
  }

  async function handleRemoveCollaborator(member) {
    if (!trip?.itineraryId) return;
    const token = getStoredToken();
    const response = await removeCollaborator(token, trip.itineraryId, member.user_id);
    if (response?.flock) setFlock(response.flock);
  }

  function handleExportPdf() {
    if (!trip) return;
    tapHaptic();
    exportItineraryToPdf(trip, {
      hotelsByDay: hotelByDay,
    });
  }

  const isOwner = useMemo(() => {
    const owner = (flock || []).find((member) => member.role === "owner");
    return owner ? Number(owner.user_id) === Number(currentUserId) : true;
  }, [flock, currentUserId]);

  /* ------------------------------------------------------------------ */
  /* Render guards                                                       */
  /* ------------------------------------------------------------------ */

  if (isLoadingSavedTrip) {
    return (
      <main className="app-page itinerary-page">
        <div className="itinerary-shell">
          <div className="itinerary-sidebar glass-card" style={{ maxWidth: "680px", margin: "0 auto" }}>
            <h1 className="serif" style={{ fontSize: "2.6rem", marginTop: 0 }}>
              Loading itinerary...
            </h1>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              Please wait while we open your saved trip.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app-page itinerary-page">
        <div className="itinerary-shell">
          <div className="itinerary-sidebar glass-card" style={{ maxWidth: "680px", margin: "0 auto" }}>
            <h1 className="serif" style={{ fontSize: "2.6rem", marginTop: 0 }}>
              Could not open trip.
            </h1>
            <p className="muted" style={{ lineHeight: 1.7 }}>{loadError}</p>
            <button className="btn-luxury" type="button" onClick={() => navigate("/my-trips")}>
              Back to My Trips
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!trip?.itinerary || !trip?.destCoords) {
    return (
      <main className="app-page itinerary-page">
        <div className="itinerary-shell">
          <div className="itinerary-sidebar glass-card" style={{ maxWidth: "680px", margin: "0 auto" }}>
            <h1 className="serif" style={{ fontSize: "2.6rem", marginTop: 0 }}>
              No itinerary found.
            </h1>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              Generate a trip from the dashboard first, or choose a saved trip from My Trips.
            </p>
            <button className="btn-luxury" type="button" onClick={() => navigate("/my-trips")}>
              Back to My Trips
            </button>
          </div>
        </div>
      </main>
    );
  }

  const activeDayPlaces = localItinerary[activeDay] || [];
  const activeHotel = hotelByDay[activeDay];

  return (
    <main className="app-page itinerary-page">
      <div className="itinerary-topbar">
        <div className="itinerary-topbar-inner">
          <button className="top-action-link" type="button" onClick={() => navigate("/my-trips")}>
            <Icon name="arrowLeft" size={16} /> My Trips
          </button>

          <div className="itinerary-topbar__flock">
            <FlockCluster
              members={flock}
              currentUserId={currentUserId}
              onInvite={() => setInviteOpen(true)}
              inviteLabel="Invite companion"
              hideInvite={!trip?.itineraryId}
            />
          </div>

          <div className="itinerary-topbar__actions">
            <button
              className="top-action-link"
              type="button"
              onClick={handleExportPdf}
              aria-label="Export itinerary as PDF"
            >
              <Icon name="download" size={16} /> Export PDF
            </button>
            <button
              className="top-action-link"
              type="button"
              onClick={() => navigate("/dashboard")}
            >
              Plan new trip
            </button>
          </div>
        </div>
      </div>

      <div className="itinerary-shell">
        <div className="itinerary-layout">
          <aside className="itinerary-sidebar">
            <span className="hero-chip">Your Journey</span>

            <h1 className="itinerary-title serif">{trip.destination}</h1>

            <p className="muted" style={{ marginTop: 0, fontSize: "1.05rem" }}>
              {trip.numDays || trip.num_days} Days ·{" "}
              {trip.budget === "high"
                ? "Luxury Class"
                : trip.budget === "low"
                  ? "Backpacker"
                  : "Comfort"}
            </p>

            <div className="pill-row">
              {(Array.isArray(trip.preferences)
                ? trip.preferences
                : String(trip.preferences || "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
              ).map((item) => (
                <span key={item} className="badge-pill">
                  <Icon name="vibe" size={14} /> {item}
                </span>
              ))}
            </div>

            {trip.itineraryId && (
              <div className="hero-chip" style={{ marginBottom: "18px" }}>
                <Icon name="document" size={14} /> Itinerary ID · {trip.itineraryId}
              </div>
            )}

            <DaySelector
              days={sortedDays}
              activeDay={activeDay}
              onSelectDay={setActiveDay}
              onViewAll={() => setActiveDay(null)}
              showViewAll={sortedDays.length > 1}
            />

            <div className="itinerary-sidebar__alerts">
              {feedbackError ? <div className="error-banner">{feedbackError}</div> : null}
              {smartSuggestionError && !smartSuggestion ? (
                <div className="error-banner">{smartSuggestionError}</div>
              ) : null}

              {smartSuggestion ? (
                <div
                  className="glass-card itinerary-sidebar__suggestion"
                  style={{
                    border: smartSuggestion.alert
                      ? "1px solid rgba(225, 29, 72, 0.32)"
                      : "1px solid rgba(59, 130, 246, 0.18)",
                    background: smartSuggestion.alert
                      ? "linear-gradient(135deg, rgba(225, 29, 72, 0.12), rgba(255, 255, 255, 0.92))"
                      : "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0.92))",
                  }}
                >
                  <p className="hero-chip" style={{ marginBottom: 10 }}>
                    <Icon name="alert" size={14} /> Smart Suggestion
                  </p>
                  <h3 className="serif" style={{ marginTop: 0, marginBottom: 8 }}>
                    {smartSuggestion.headline}
                  </h3>
                  <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                    {smartSuggestion.message}
                  </p>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Rain chance: {smartSuggestion.precipitation_probability || 0}%
                  </p>
                  {smartSuggestion.focus_day ? (
                    <button
                      className="top-action-link"
                      type="button"
                      onClick={() => setActiveDay(Number(smartSuggestion.focus_day))}
                    >
                      View Day {smartSuggestion.focus_day}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {pushStatus !== "subscribed" ? (
                <div className="glass-card itinerary-sidebar__push">
                  <p className="hero-chip">
                    <Icon name="bell" size={14} /> Device Push
                  </p>
                  <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                    Subscribe this device to receive weather alerts even when the app is closed.
                  </p>
                  <button
                    className="top-action-link"
                    type="button"
                    onClick={enableDevicePushAlerts}
                    disabled={pushStatus === "loading" || pushStatus === "unsupported"}
                  >
                    {pushStatus === "blocked"
                      ? "Notifications blocked"
                      : pushStatus === "loading"
                        ? "Enabling..."
                        : "Enable device push alerts"}
                  </button>
                  {pushError ? <p className="muted" style={{ marginBottom: 0, color: "#991b1b" }}>{pushError}</p> : null}
                </div>
              ) : null}
            </div>

            {activeDay === null ? (
              <section className="timeline timeline--overview">
                <p className="dashboard-kicker">Full trip overview</p>
                <h3 className="serif">All {sortedDays.length} days at a glance</h3>
                <p className="muted">
                  Tap a day above to drill into its time-blocked timeline. Map markers also dim
                  the inactive days so the chosen one always pops.
                </p>
              </section>
            ) : (
              <>
                <VerticalTimeline
                  dayNumber={activeDay}
                  places={activeDayPlaces}
                  trip={{ ...trip, dayStart: dayStarts[activeDay] }}
                  focusedPlaceKey={focusedPlaceKey}
                  feedbackState={feedbackState}
                  swappingItemId={swappingItemId}
                  memoriesByItemId={memoryByItemId}
                  onCardActivate={(place, placeKey) => focusPlaceOnMap(place, placeKey)}
                  onMovePlace={handleMovePlace}
                  onSwapPlace={handleSwapPlace}
                  onToggleLock={handleToggleLock}
                  onPlaceFeedback={handlePlaceFeedback}
                  onAdjustTime={handleAdjustTime}
                  onOpenMemoryLog={handleOpenMemoryLog}
                  isCollaborative={Boolean(trip.itineraryId)}
                  isPastTrip={trip.status === "Past"}
                />
                {activeHotel ? (
                  <HotelCard
                    hotel={activeHotel}
                    dayNumber={activeDay}
                    refreshing={hotelRefreshing}
                    onRefresh={() => refreshHotelForDay(activeDay, { refresh: true })}
                  />
                ) : null}
              </>
            )}
          </aside>

          <section className="itinerary-map-panel">
            <ItineraryMap
              key={trip.itineraryId || trip.id || trip.destination}
              ref={mapHandleRef}
              itinerary={localItinerary}
              destCoords={trip.destCoords}
              activeDay={activeDay}
            />
          </section>
        </div>
      </div>

      {activityToast ? (
        <div className="activity-toast" role="status" aria-live="polite">
          <Icon name="message" size={16} tone="accent" />
          <span>
            <strong>{activityToast.username || "A companion"}</strong> {activityToast.action.replace(/_/g, " ")}.
          </span>
        </div>
      ) : null}

      <InviteCompanionSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        flock={flock}
        ownerId={(flock.find((member) => member.role === "owner") || {}).user_id}
        currentUserId={currentUserId}
        searchEndpoint={async (query) => {
          const token = getStoredToken();
          return searchFriends(token, query);
        }}
        onSendFriendRequest={handleSendFriendRequest}
        onAddCollaborator={isOwner ? handleAddCollaborator : null}
        onRemoveCollaborator={isOwner ? handleRemoveCollaborator : null}
        emptyState="Search by username or email — friends are invited instantly, others get a friend request first."
      />

      <TimeAdjustSheet
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustBlock(null);
        }}
        block={adjustBlock}
        onSave={handleSaveAdjustedTime}
      />

      <MemoryLogSheet
        open={Boolean(memorySheetPlace)}
        onClose={() => setMemorySheetPlace(null)}
        place={memorySheetPlace}
        memories={memorySheetPlace ? memoryByItemId[memorySheetPlace.item_id] || [] : []}
        currentUserId={currentUserId}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemoryEntry}
      />
    </main>
  );
}
