import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAPBOX_TOKEN } from "../lib/config";

// Marker fill colors keyed by trip category so the dot color matches the sidebar.
const CATEGORY_COLORS = {
  food: "#F59E0B",
  beach: "#06B6D4",
  nature: "#10B981",
  museums: "#8B5CF6",
  nightlife: "#1F2937",
  sightseeing: "#3B82F6",
};

// Per-day line colors so multi-day overviews stay readable.
const DAY_COLORS = [
  "#4F46E5",
  "#E11D48",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#475569",
];

// Mapbox Directions API caps a single request at 25 waypoints on the driving profile.
const MAX_DIRECTIONS_WAYPOINTS = 25;

// Itinerary days arrive as an object keyed by day number. Sort once so route
// drawing and the sidebar always agree on the order of the trip.
function getSortedDays(itinerary) {
  return Object.keys(itinerary || {})
    .map(Number)
    .sort((left, right) => left - right);
}

// Geoapify and seed data both store coordinates as latitude/longitude.
// Mapbox expects [longitude, latitude], so this helper normalizes the order
// and rejects anything non-numeric.
function getValidCoordinate(place) {
  const latitude = Number(place?.latitude ?? place?.lat);
  const longitude = Number(place?.longitude ?? place?.lon ?? place?.lng);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [longitude, latitude];
  }

  return null;
}

// Wrap a list of [lng, lat] pairs in the GeoJSON LineString feature shape
// the route source expects.
function toRouteFeature(coordinates) {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

// Hit the Mapbox Directions API (driving profile) and return the road-snapped
// geometry that connects every waypoint. Throws on a non-OK response so the
// caller can fall back to a straight-line route.
async function fetchDrivingRoute(coordinates, token, signal) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const waypoints = coordinates.slice(0, MAX_DIRECTIONS_WAYPOINTS);
  const coordinateString = waypoints
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(";");

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinateString}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Mapbox Directions request failed with status ${response.status}`,
    );
  }

  const payload = await response.json();
  const geometry = payload?.routes?.[0]?.geometry;
  if (!geometry || geometry.type !== "LineString") {
    throw new Error("Mapbox Directions response did not include a route geometry.");
  }

  return geometry;
}

// Build the numbered marker DOM node so the map matches the numbered cards
// in the sidebar.
function createMarkerElement(place, dayNumber, sequenceNumber) {
  const element = document.createElement("div");
  element.className = "map-marker";
  element.style.background =
    CATEGORY_COLORS[place.category] || CATEGORY_COLORS.sightseeing;
  element.textContent = String(sequenceNumber);
  element.title = `${place.name} · Day ${dayNumber}`;
  return element;
}

// START and END tags give users an immediate sense of the route direction.
function createTagElement(text, color) {
  const element = document.createElement("div");
  element.className = "map-tag";
  element.style.background = color;
  element.textContent = text;
  return element;
}

// Build the per-stop popup HTML in one place so it stays consistent across days.
function buildPopupHTML(place, dayNumber, sequenceNumber) {
  const rating = Number(place.rating || 0).toFixed(1);
  const stayLine = place.recommended_minutes
    ? `<br />Stay ${place.recommended_minutes} min`
    : "";
  const whyLine = place.why ? `<br />${place.why}` : "";

  return `
    <div style="font-family: Inter, sans-serif; min-width: 190px;">
      <strong style="display:block; margin-bottom:6px; font-size:0.95rem;">
        ${sequenceNumber}. ${place.name}
      </strong>
      <div style="font-size:0.78rem; color:#6b7280; line-height:1.5;">
        Day ${dayNumber} · ${place.category || "sightseeing"}<br />
        ⭐ ${rating}${stayLine}${whyLine}
      </div>
    </div>
  `;
}

function ItineraryMap(
  { itinerary, destCoords, activeDay = null },
  ref,
) {
  const mapContainerRef = useRef(null);

  // The live Mapbox instance. We keep it in a ref so other effects (and the
  // imperative handle the parent uses for fly-to) can reach it without
  // triggering re-renders.
  const mapRef = useRef(null);

  // Markers + route layers that belong to the *currently rendered* day or
  // overview. We track them so we can wipe them before each redraw whenever
  // the user switches days.
  const markersRef = useRef([]);
  const routeLayersRef = useRef([]);

  // We only want the very first draw to snap to bounds instantly. After that,
  // bound changes (day switches) should animate, which feels much nicer.
  const isFirstDrawRef = useRef(true);

  // Mapbox load is async, so the draw effect needs to know when it can safely
  // touch sources/layers. A state value (rather than a ref) ensures the draw
  // effect re-runs the moment the map is ready.
  const [isMapReady, setIsMapReady] = useState(false);

  // Expose a `flyTo` method so the itinerary cards can pan the camera to a
  // specific stop without the parent having to know about Mapbox internals.
  useImperativeHandle(
    ref,
    () => ({
      flyTo(target, options = {}) {
        const map = mapRef.current;
        if (!map || !target) return;

        let longitude;
        let latitude;

        if (Array.isArray(target)) {
          [longitude, latitude] = target;
        } else {
          longitude = Number(
            target.longitude ?? target.lng ?? target.lon,
          );
          latitude = Number(target.latitude ?? target.lat);
        }

        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          return;
        }

        map.flyTo({
          center: [longitude, latitude],
          zoom: options.zoom ?? 15,
          pitch: options.pitch ?? 60,
          speed: options.speed ?? 1.2,
          essential: true,
        });
      },
    }),
    [],
  );

  // Effect 1 — create the map a single time per destination. We deliberately
  // do NOT depend on `activeDay` or `itinerary` here, so switching days does
  // not tear down the map (which would otherwise reset camera and freeze the
  // fly-to animation).
  useEffect(() => {
    if (!mapContainerRef.current || !destCoords) return undefined;

    if (!MAPBOX_TOKEN) {
      console.error("VITE_MAPBOX_TOKEN is not set.");
      return undefined;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [destCoords.lon, destCoords.lat],
      zoom: 10,
      pitch: 55,
      bearing: -15,
      antialias: true,
      projection: "globe",
    });

    mapRef.current = map;
    isFirstDrawRef.current = true;

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("load", () => {
      // Guard against the map being torn down between `new Map()` and `load`.
      if (mapRef.current !== map) return;

      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });
      }

      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 0.0],
            "sky-atmosphere-sun-intensity": 12,
          },
        });
      }

      if (!map.getLayer("3d-buildings")) {
        map.addLayer({
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#9ca3af",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.65,
          },
        });
      }

      setIsMapReady(true);
    });

    return () => {
      // The map is being destroyed, so any markers that still reference it
      // are about to become orphans. Clear the refs without calling
      // `marker.remove()` because the parent container is going away too.
      markersRef.current = [];
      routeLayersRef.current = [];

      setIsMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [destCoords]);

  // Effect 2 — draw (and redraw) markers + route geometry whenever the
  // itinerary changes or the user switches days. The map itself is preserved
  // across runs, so this is just a layer/marker swap.
  useEffect(() => {
    if (!isMapReady) return undefined;

    const map = mapRef.current;
    if (!map || !itinerary) return undefined;

    // ---- Cleanup: remove markers and route layers from the previous day ----
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    routeLayersRef.current.forEach(({ sourceId, layerId }) => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Map style is being torn down; nothing to clean up.
      }
    });
    routeLayersRef.current = [];

    // One AbortController per draw run so the Directions API call from the
    // previous day cannot overwrite the current day's route line if the user
    // switches tabs while the network is still in flight.
    const directionsAbortController = new AbortController();

    const sortedDays = getSortedDays(itinerary);
    const hasActiveDay = activeDay !== null && activeDay !== undefined;
    const activeDayNumber = hasActiveDay ? Number(activeDay) : null;

    // Progressive Disclosure (Feature 4): render ALL days so the user always
    // sees the full multi-day route, but dim inactive days to 30% opacity so
    // the chosen day visually dominates.
    const bounds = new mapboxgl.LngLatBounds();
    const focusedBounds = new mapboxgl.LngLatBounds();
    const allCoordinates = [];
    let focusedCoordinateCount = 0;
    let sequenceNumber = 1;

    sortedDays.forEach((dayNumber) => {
      const dayPlaces = itinerary[dayNumber] || [];
      const coordinates = dayPlaces.map(getValidCoordinate).filter(Boolean);
      const isFocused = !hasActiveDay || dayNumber === activeDayNumber;

      coordinates.forEach((coordinate) => {
        bounds.extend(coordinate);
        allCoordinates.push(coordinate);
        if (isFocused) {
          focusedBounds.extend(coordinate);
          focusedCoordinateCount += 1;
        }
      });

      // Draw the connecting line for this day. We always seed the source with
      // straight-line geometry so something is visible while the Directions
      // API call is still in flight.
      if (coordinates.length > 1) {
        const sourceId = `route-day-${dayNumber}`;
        const layerId = `route-layer-${dayNumber}`;

        map.addSource(sourceId, {
          type: "geojson",
          data: toRouteFeature(coordinates),
        });

        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length],
            "line-width": isFocused ? 5 : 3,
            "line-opacity": isFocused ? 0.95 : 0.3,
            "line-blur": isFocused ? 0 : 0.6,
          },
        });

        routeLayersRef.current.push({ sourceId, layerId });

        fetchDrivingRoute(
          coordinates,
          MAPBOX_TOKEN,
          directionsAbortController.signal,
        )
          .then((routeGeometry) => {
            if (!routeGeometry) return;

            const liveMap = mapRef.current;
            if (!liveMap || liveMap !== map) return;

            const source = liveMap.getSource(sourceId);
            if (!source) return;

            source.setData({
              type: "Feature",
              geometry: routeGeometry,
            });
          })
          .catch((error) => {
            if (error?.name === "AbortError") return;
            console.warn(
              `Falling back to straight-line route for day ${dayNumber}:`,
              error,
            );
          });
      }

      dayPlaces.forEach((place, index) => {
        const coordinate = getValidCoordinate(place);
        if (!coordinate) return;

        const stopNumber = sequenceNumber + index;
        const markerElement = createMarkerElement(place, dayNumber, stopNumber);
        if (!isFocused) {
          markerElement.classList.add("map-marker--dimmed");
          markerElement.style.opacity = "0.34";
          markerElement.style.filter = "grayscale(40%) saturate(0.85)";
        } else {
          markerElement.classList.add("map-marker--focused");
        }

        const popup = new mapboxgl.Popup({
          offset: 18,
          closeButton: false,
          maxWidth: "260px",
        }).setHTML(buildPopupHTML(place, dayNumber, stopNumber));

        markerElement.addEventListener("click", (event) => {
          event.stopPropagation();
          map.flyTo({
            center: coordinate,
            zoom: 15,
            pitch: 60,
            essential: true,
          });
        });

        const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat(coordinate)
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });

      sequenceNumber += dayPlaces.length;
    });

    if (allCoordinates.length > 0) {
      const startMarker = new mapboxgl.Marker({
        element: createTagElement("START", "#111827"),
        anchor: "top",
        offset: [0, 22],
      })
        .setLngLat(allCoordinates[0])
        .addTo(map);
      markersRef.current.push(startMarker);

      const endMarker = new mapboxgl.Marker({
        element: createTagElement("END", "#E11D48"),
        anchor: "top",
        offset: [0, 22],
      })
        .setLngLat(allCoordinates[allCoordinates.length - 1])
        .addTo(map);
      markersRef.current.push(endMarker);
    }

    // When a specific day is focused we frame just that day; otherwise we
    // frame the whole trip. This is the heart of the progressive-disclosure
    // animation — switching days smoothly pans + zooms the camera.
    const targetBounds = focusedCoordinateCount > 0 ? focusedBounds : bounds;
    const totalCoords =
      focusedCoordinateCount > 0 ? focusedCoordinateCount : allCoordinates.length;

    if (totalCoords > 1) {
      map.fitBounds(targetBounds, {
        padding: 80,
        maxZoom: 14,
        duration: isFirstDrawRef.current ? 0 : 900,
        essential: true,
      });
    } else if (totalCoords === 1) {
      const center =
        focusedCoordinateCount > 0 ? focusedBounds.getCenter() : new mapboxgl.LngLat(allCoordinates[0][0], allCoordinates[0][1]);
      map.flyTo({
        center,
        zoom: 14,
        duration: isFirstDrawRef.current ? 0 : 900,
        essential: true,
      });
    }

    isFirstDrawRef.current = false;

    return () => {
      directionsAbortController.abort();
    };
  }, [itinerary, activeDay, isMapReady]);

  return <div ref={mapContainerRef} className="itinerary-map" />;
}

export default forwardRef(ItineraryMap);
