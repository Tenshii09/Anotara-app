import { useEffect, useRef } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAPBOX_TOKEN } from "../lib/config";

// These colors keep the map consistent with the trip categories shown in the sidebar.
const CATEGORY_COLORS = {
  food: "#F59E0B",
  beach: "#06B6D4",
  nature: "#10B981",
  museums: "#8B5CF6",
  nightlife: "#1F2937",
  sightseeing: "#3B82F6",
};

const DAY_COLORS = [
  "#4F46E5",
  "#E11D48",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#475569",
];

// The itinerary object is keyed by day number, so this helper sorts the day keys before drawing.
function getSortedDays(itinerary) {
  return Object.keys(itinerary || {})
    .map(Number)
    .sort((left, right) => left - right);
}

// Geoapify and seed data both store coordinates as latitude/longitude fields.
// Mapbox expects [longitude, latitude], so this helper normalizes the order.
function getValidCoordinate(place) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [longitude, latitude];
  }

  return null;
}

// Build the custom numbered marker DOM node so the map matches the old numbered stop layout.
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

export default function ItineraryMap({ itinerary, destCoords }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    // Do nothing until the component has data and a real DOM container.
    if (!mapContainerRef.current || !itinerary || !destCoords) return;

    // The Mapbox token comes from the Vite environment, not from the Flask backend.
    if (!MAPBOX_TOKEN) {
      console.error("VITE_MAPBOX_TOKEN is not set.");
      return;
    }

    // Recreate the map cleanly if the itinerary changes so old layers and markers do not linger.
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Start with a tilted 3D globe-like view to preserve the old premium map look.
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
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    // Sort the itinerary once so route drawing and sidebar ordering stay in sync.
    const sortedDays = getSortedDays(itinerary);

    map.on("load", () => {
      // Terrain makes the scene feel more like the original 3D map presentation.
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });

      // The terrain exaggeration makes hills and elevation more visible.
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });

      // Add a sky layer only once so the atmosphere looks clean instead of flat.
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

      // 3D buildings are the visual detail that makes the map look closer to the old version.
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

      const bounds = new mapboxgl.LngLatBounds();
      const allCoordinates = [];
      let sequenceNumber = 1;

      sortedDays.forEach((dayNumber) => {
        const dayPlaces = itinerary[dayNumber] || [];
        const coordinates = dayPlaces.map(getValidCoordinate).filter(Boolean);

        // Extend bounds with every valid stop so the entire trip fits on screen.
        coordinates.forEach((coordinate) => {
          bounds.extend(coordinate);
          allCoordinates.push(coordinate);
        });

        // Draw a route line per day so long trips remain visually grouped.
        if (coordinates.length > 1) {
          const sourceId = `route-day-${dayNumber}`;
          const layerId = `route-layer-${dayNumber}`;

          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates,
              },
            },
          });

          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length],
              "line-width": 4,
              "line-opacity": 0.88,
            },
          });
        }

        // Add one marker for each place and attach a popup with the place details.
        dayPlaces.forEach((place, index) => {
          const coordinate = getValidCoordinate(place);
          if (!coordinate) return;

          const markerElement = createMarkerElement(
            place,
            dayNumber,
            sequenceNumber + index,
          );
          const popup = new mapboxgl.Popup({
            offset: 18,
            closeButton: false,
            maxWidth: "260px",
          }).setHTML(`
            <div style="font-family: Inter, sans-serif; min-width: 190px;">
              <strong style="display:block; margin-bottom:6px; font-size:0.95rem;">${sequenceNumber + index}. ${place.name}</strong>
              <div style="font-size:0.78rem; color:#6b7280; line-height:1.5;">
                Day ${dayNumber} · ${place.category || "sightseeing"}<br />
                ⭐ ${Number(place.rating || 0).toFixed(1)}
                ${place.recommended_minutes ? `<br />Stay ${place.recommended_minutes} min` : ""}
                ${place.why ? `<br />${place.why}` : ""}
              </div>
            </div>
          `);

          new mapboxgl.Marker({ element: markerElement })
            .setLngLat(coordinate)
            .setPopup(popup)
            .addTo(map);
        });

        sequenceNumber += dayPlaces.length;
      });

      // Mark the first and last stop so the trip reads like a complete route.
      if (allCoordinates.length > 0) {
        const startMarker = createTagElement("START", "#111827");
        const endMarker = createTagElement("END", "#E11D48");

        new mapboxgl.Marker({ element: startMarker })
          .setLngLat(allCoordinates[0])
          .addTo(map);

        new mapboxgl.Marker({ element: endMarker })
          .setLngLat(allCoordinates[allCoordinates.length - 1])
          .addTo(map);
      }

      // Fit the entire route into view after all markers are placed.
      if (allCoordinates.length > 1) {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
          duration: 0,
        });
      }
    });

    return () => {
      // Clean up the map instance when the component unmounts or the itinerary changes.
      map.remove();
      mapRef.current = null;
    };
  }, [itinerary, destCoords]);

  return <div ref={mapContainerRef} className="itinerary-map" />;
}
