/**
 * Time-block utilities for the Granular Time-Blocked Vertical Timeline.
 *
 * The backend persists itinerary stops with `recommended_minutes` /
 * `estimated_duration` but not concrete start/end times. The timeline UI
 * derives those locally based on:
 *
 *   - A fixed start-of-day anchor (defaults to 08:00).
 *   - The accumulated visit duration of previous stops on the same day.
 *   - A per-segment travel buffer that depends on the trip's transport mode
 *     and the great-circle distance between consecutive coordinates.
 *
 * Everything here is pure, deterministic, and timezone-agnostic so the
 * timeline renders identically on every collaborator's screen.
 */

const DEFAULT_DAY_START_MINUTES = 8 * 60;

const TRANSPORT_PACE_KM_PER_MIN = {
  Walking: 0.08,
  Public: 0.4,
  Public_Commute: 0.4,
  Motorcycle: 0.55,
  Motorbike: 0.55,
  Private_Car: 0.7,
  Van: 0.7,
  Private_Van: 0.7,
};

const TRANSPORT_BASE_BUFFER = {
  Walking: 4,
  Public: 12,
  Public_Commute: 12,
  Motorcycle: 6,
  Motorbike: 6,
  Private_Car: 6,
  Van: 8,
  Private_Van: 8,
};

const PACING_FACTOR = {
  Relaxed: 1.2,
  Moderate: 1.0,
  Packed: 0.82,
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function minutesToClock(totalMinutes) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const hour = Math.floor(safeMinutes / 60) % 24;
  const minute = safeMinutes % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${pad(minute)} ${period}`;
}

export function clockToMinutes(clockString) {
  if (!clockString) return DEFAULT_DAY_START_MINUTES;
  const [hour, minute] = String(clockString)
    .split(":")
    .map((value) => Number(value) || 0);
  return Math.max(0, Math.min(23 * 60 + 59, hour * 60 + minute));
}

function getTravelMinutes(prev, next, options) {
  if (!prev || !next) return 0;
  const lat1 = Number(prev.latitude ?? prev.lat);
  const lon1 = Number(prev.longitude ?? prev.lon);
  const lat2 = Number(next.latitude ?? next.lat);
  const lon2 = Number(next.longitude ?? next.lon);
  const transport = options.transportMode || "Public";
  const baseBuffer = TRANSPORT_BASE_BUFFER[transport] ?? 10;

  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return baseBuffer;
  }

  const distanceKm = haversineKm(lat1, lon1, lat2, lon2);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return baseBuffer;
  }

  const pace = TRANSPORT_PACE_KM_PER_MIN[transport] ?? 0.4;
  const minutes = baseBuffer + distanceKm / pace;
  return Math.max(5, Math.round(minutes));
}

function getStayMinutes(place, options) {
  const base = Number(
    place.recommended_minutes ?? place.estimated_duration ?? place.suggested_minutes ?? 60,
  );
  const factor = PACING_FACTOR[options.pacingStyle] ?? 1.0;
  return Math.max(25, Math.round(base * factor));
}

/**
 * Returns a list of time-block descriptors for a single day.
 *
 * Each block has:
 *   - place        : original place object
 *   - index        : 0-based position in the day
 *   - travelMinutes: minutes spent travelling FROM the previous block (0 for first)
 *   - travelLabel  : e.g. "45 mins transit" or "" for the first stop
 *   - startMinutes : minutes since midnight when this stop starts
 *   - endMinutes   : minutes since midnight when this stop ends
 *   - startLabel   : human-readable start clock
 *   - endLabel     : human-readable end clock
 *   - stayMinutes  : how long the user should stay
 */
export function buildTimeBlocksForDay(places = [], options = {}) {
  const dayStart = clockToMinutes(options.dayStart) || DEFAULT_DAY_START_MINUTES;
  const blocks = [];
  let cursor = dayStart;

  places.forEach((place, index) => {
    const travelMinutes = index === 0 ? 0 : getTravelMinutes(places[index - 1], place, options);
    if (travelMinutes > 0) {
      cursor += travelMinutes;
    }
    const stayMinutes = getStayMinutes(place, options);
    const startMinutes = cursor;
    const endMinutes = cursor + stayMinutes;
    cursor = endMinutes;

    blocks.push({
      place,
      index,
      travelMinutes,
      travelLabel: travelMinutes > 0 ? `${travelMinutes} min transit` : "",
      startMinutes,
      endMinutes,
      stayMinutes,
      startLabel: minutesToClock(startMinutes),
      endLabel: minutesToClock(endMinutes),
    });
  });

  return blocks;
}

/**
 * Returns a flat lookup mapping `item_id` (or composite key) to its block
 * descriptor, useful for sharing block data across components.
 */
export function buildTimeBlockIndex(itinerary, options) {
  const index = {};
  Object.entries(itinerary || {}).forEach(([dayNumber, places]) => {
    const blocks = buildTimeBlocksForDay(places, options);
    blocks.forEach((block) => {
      const key = block.place.item_id
        ? `item-${block.place.item_id}`
        : `day-${dayNumber}-${block.index}`;
      index[key] = { ...block, dayNumber: Number(dayNumber) };
    });
  });
  return index;
}
