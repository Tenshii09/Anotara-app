/**
 * map.js — Anotara Philippines Travel Planner
 *
 * Uses Mapbox GL JS for the base map (satellite-streets style)
 * Uses Leaflet + Leaflet Routing Machine for road-snapped route lines
 * Both run on the same #map div via a bridge approach:
 *   - Mapbox renders the beautiful map tiles
 *   - Leaflet draws the route polyline + numbered markers on top
 */

// ── Color Schemes ────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
    food       : '#F59E0B',  // amber
    beach      : '#06B6D4',  // cyan
    nature     : '#10B981',  // emerald
    museums    : '#8B5CF6',  // violet
    nightlife  : '#1F2937',  // dark
    sightseeing: '#3B82F6',  // blue
};

const DAY_COLORS = [
    '#4F46E5',  // Day 1 — indigo
    '#E11D48',  // Day 2 — rose
    '#059669',  // Day 3 — emerald
    '#D97706',  // Day 4 — amber
    '#7C3AED',  // Day 5 — violet
    '#0891B2',  // Day 6 — cyan
    '#475569',  // Day 7 — slate
];

const DURATION_MAP = {
    food       : '1.5 hrs',
    beach      : '4.0 hrs',
    nature     : '3.0 hrs',
    museums    : '2.5 hrs',
    nightlife  : '3.0 hrs',
    sightseeing: '2.0 hrs'
};

// Module-level references
let mapboxMap  = null;  // Mapbox GL instance
let leafletMap = null;  // Leaflet instance (overlaid for routing)
window.mapboxMarkers = []; // Tracks marker elements to fade them out
window.dayRouteLayers = []; // Tracks route line IDs to hide them
let activeDayFilter = null; // Tracks which day is currently selected


// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * initMap(itineraryData, destCoords, mapboxToken)
 *
 * @param {Object}      itineraryData  - {"1": [places...], "2": [...]}
 * @param {Object|null} destCoords     - {lat, lon} from Mapbox geocoding
 * @param {string}      mapboxToken    - Mapbox public access token
 */
function initMap(itineraryData, destCoords, mapboxToken) {

    // ── Step 1: Flatten places ───────────────────────────────────────────────
    const allPlaces   = [];
    const routeCoords = [];

    const days = Object.keys(itineraryData).map(Number).sort((a, b) => a - b);

    days.forEach(dayNumber => {
        (itineraryData[dayNumber] || []).forEach(place => {
            if (place.latitude && place.longitude) {
                allPlaces.push({ ...place, day: dayNumber });
                routeCoords.push([place.latitude, place.longitude]);
            }
        });
    });

    // ── Step 2: Determine center ─────────────────────────────────────────────
    // destCoords from Mapbox geocoding is always the most accurate center
    let centerLat, centerLon;

    if (destCoords && destCoords.lat && destCoords.lon) {
        centerLat = destCoords.lat;
        centerLon = destCoords.lon;
    } else if (allPlaces.length > 0) {
        centerLat = allPlaces[0].latitude;
        centerLon = allPlaces[0].longitude;
    } else {
        // Geographic center of the Philippines
        centerLat = 12.8797;
        centerLon = 121.7740;
    }

    // ── Step 3: Initialize Mapbox GL (beautiful satellite-streets tiles) ─────
    if (mapboxToken && mapboxToken !== 'YOUR_MAPBOX_TOKEN_HERE') {
        mapboxgl.accessToken = mapboxToken;

        mapboxMap = new mapboxgl.Map({
            container : 'map',
            style     : 'mapbox://styles/mapbox/streets-v12',
            center    : [centerLon, centerLat],
            zoom      : 12,
            attributionControl: true
        });

        // Add zoom + compass controls
        mapboxMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Add Mapbox markers + popups
        mapboxMap.on('load', () => {
    // 1. ADD THIS: 3D Terrain
    mapboxMap.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
    });
    mapboxMap.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

    // 2. ADD THIS: 3D Buildings
    mapboxMap.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.6
        }
    });
            addMapboxMarkers(allPlaces, mapboxMap);
            days.forEach(dayNumber => {
            const dayPlaces = itineraryData[dayNumber] || [];
            // Only draw a route if the day has more than 1 place
            if (dayPlaces.length > 1) {
                addMapboxDayRoute(dayPlaces, dayNumber, mapboxMap);
            }
        });

            // Auto-fit bounds to all markers
            if (allPlaces.length > 1) {
                const bounds = allPlaces.reduce((b, p) => {
                    return b.extend([p.longitude, p.latitude]);
                }, new mapboxgl.LngLatBounds(
                    [allPlaces[0].longitude, allPlaces[0].latitude],
                    [allPlaces[0].longitude, allPlaces[0].latitude]
                ));
                mapboxMap.fitBounds(bounds, { padding: 60, maxZoom: 14 });
            }
        });

    } else {
        // ── Fallback: Leaflet + OpenStreetMap if no Mapbox token ────────────
        console.warn('⚠️ No Mapbox token — using OpenStreetMap fallback.');
        initLeafletFallback(allPlaces, routeCoords, centerLat, centerLon, itineraryData);
    }
}


// ── Mapbox: Add Numbered Markers ─────────────────────────────────────────────

/**
 * Adds custom numbered HTML markers to the Mapbox map.
 * Each marker matches the stop number in the side panel.
 */
function addMapboxMarkers(allPlaces, map) {
    let sequenceNumber = 1;

    allPlaces.forEach(place => {
        const fillColor   = CATEGORY_COLORS[place.category] || CATEGORY_COLORS['sightseeing'];
        const borderColor = DAY_COLORS[(place.day - 1) % DAY_COLORS.length];
        const estTime     = DURATION_MAP[place.category] || '2.0 hrs';
        const stars       = buildStarHTML(parseFloat(place.rating || 0));

        // Custom HTML element for the marker
        const el = document.createElement('div');
        el.style.cssText = `
            width            : 36px;
            height           : 36px;
            border-radius    : 50%;
            background-color : ${fillColor};
            border           : 3px solid ${borderColor};
            color            : white;
            font-weight      : 800;
            font-size        : 13px;
            display          : flex;
            align-items      : center;
            justify-content  : center;
            box-shadow       : 0 4px 12px rgba(0,0,0,0.3);
            cursor           : pointer;
            font-family      : 'Inter', sans-serif;
            transition       : transform 0.2s;
        `;
        el.textContent = sequenceNumber;
        
        // Tracking the marker for the day filter
        window.mapboxMarkers.push({
            day: place.day,
            element: el,
            lon: place.longitude,
            lat: place.latitude
        });

        // Hover scale effect
        el.addEventListener('mouseenter', () => el.style.transform = 'scale(1.2)');
        el.addEventListener('mouseleave', () => el.style.transform = 'scale(1.0)');

        // Popup content (Keep your existing popup HTML!)
        const popupHTML = `
            <div style="font-family:'Inter',sans-serif; min-width:180px; padding:4px;">
                <strong style="font-size:0.9rem; display:block; margin-bottom:4px;">
                    ${sequenceNumber}. ${place.name}
                </strong>
                <span style="font-size:0.75rem; color:#6B7280;">
                    📅 Day ${place.day} &nbsp;|&nbsp;
                    🏷️ ${capitalize(place.category)}
                </span><br>
                <span style="color:#F59E0B; font-size:0.85rem;">${stars}</span>
                <span style="font-size:0.75rem; color:#9CA3AF;"> ${place.rating}</span>
                <div style="margin-top:6px; padding-top:6px;
                            border-top:1px dashed #E5E7EB;
                            font-size:0.8rem; color:#4F46E5; font-weight:600;">
                    ⏱️ Est. Stay: ${estTime}
                </div>
            </div>
        `;

        const popup = new mapboxgl.Popup({
            offset    : 20,
            closeButton: false,
            maxWidth  : '240px'
        }).setHTML(popupHTML);

        // Add marker to map
        new mapboxgl.Marker({ element: el })
            .setLngLat([place.longitude, place.latitude])
            .setPopup(popup)
            .addTo(map);

        // Open popup on hover
        el.addEventListener('mouseenter', () => popup.addTo(map));

        sequenceNumber++;
    });

    // ── START marker ──
    if (allPlaces.length > 0) {
        const startEl = createTagElement('START', '#111827');
        new mapboxgl.Marker({ element: startEl })
            .setLngLat([allPlaces[0].longitude, allPlaces[0].latitude])
            .addTo(map);
    }

    // ── END marker ──
    if (allPlaces.length > 1) {
        const last  = allPlaces[allPlaces.length - 1];
        const endEl = createTagElement('END', '#E11D48');
        new mapboxgl.Marker({ element: endEl })
            .setLngLat([last.longitude, last.latitude])
            .addTo(map);
    }
}


/**
 * Creates a START / END pill tag element for Mapbox markers.
 */
function createTagElement(label, bgColor) {
    const el = document.createElement('div');
    el.style.cssText = `
        background    : ${bgColor};
        color         : white;
        padding       : 4px 12px;
        border-radius : 100px;
        font-size     : 0.7rem;
        font-weight   : 800;
        border        : 2px solid white;
        box-shadow    : 0 2px 8px rgba(0,0,0,0.3);
        white-space   : nowrap;
        transform     : translateY(-38px);
        font-family   : 'Inter', sans-serif;
        letter-spacing: 0.05em;
    `;
    el.textContent = label;
    return el;
}


// ── Mapbox: Draw Route Line ───────────────────────────────────────────────────

/**
 * Draws a road-snapped route using the Mapbox Directions API.
 * Falls back to a straight dashed polyline if the API call fails.
 */
// REPLACE your addMapboxRoute function with this:
function addMapboxDayRoute(places, dayNumber, map) {
    const coords = places.map(p => [p.longitude, p.latitude]);
    if (coords.length < 2) return;

    // Mapbox expects lon,lat
    const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
    const token = mapboxgl.accessToken;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${token}`;

    fetch(url)
        .then(r => r.json())
        .then(data => {
            const geometry = data.routes?.[0]?.geometry;
            if (!geometry) return;

            const sourceId = `route-source-day-${dayNumber}`;
            const layerId = `route-line-day-${dayNumber}`;
            
            // Match the line color to your existing marker border colors!
            const routeColor = DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];

            map.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'Feature', geometry }
            });

            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': routeColor,
                    'line-width': 5,
                    'line-opacity': 0.85
                }
            });

            // Track the layer so we can toggle it later
            window.dayRouteLayers.push({ day: dayNumber, id: layerId });
        })
        .catch(err => console.error("Route fetch failed:", err));
}


/**
 * Draws a straight dashed line between all stops as a fallback.
 */
function drawFallbackLine(routeCoords, map) {
    const coordinates = routeCoords.map(c => [c[1], c[0]]);  // [lon, lat]

    map.addSource('route-fallback', {
        type: 'geojson',
        data: {
            type    : 'Feature',
            geometry: { type: 'LineString', coordinates }
        }
    });

    map.addLayer({
        id    : 'route-fallback-line',
        type  : 'line',
        source: 'route-fallback',
        paint : {
            'line-color'    : '#4F46E5',
            'line-width'    : 3,
            'line-opacity'  : 0.6,
            'line-dasharray': [2, 2]
        }
    });
}


// ── Leaflet Fallback (no Mapbox token) ───────────────────────────────────────

/**
 * Full Leaflet implementation used when Mapbox token is not configured.
 * Includes OpenStreetMap tiles + OSRM road routing.
 */
function initLeafletFallback(allPlaces, routeCoords, centerLat, centerLon, itineraryData) {

    leafletMap = L.map('map', {
        center          : [centerLat, centerLon],
        zoom            : 13,
        scrollWheelZoom : true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom    : 19
    }).addTo(leafletMap);

    // Road-snapped route via OSRM
    if (routeCoords.length > 1) {
        const waypoints = routeCoords.map(c => L.latLng(c[0], c[1]));

        L.Routing.control({
            waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: '[https://router.project-osrm.org/route/v1](https://router.project-osrm.org/route/v1)'
            }),
            lineOptions   : { styles: [{ color: '#4F46E5', opacity: 0.85, weight: 5 }] },
            show          : false,
            addWaypoints  : false,
            createMarker  : () => null,
            fitSelectedRoutes: false
        }).addTo(leafletMap);
    }

    // Numbered markers
    let seq = 1;
    const bounds = [];

    allPlaces.forEach(place => {
        const fill   = CATEGORY_COLORS[place.category] || '#3B82F6';
        const border = DAY_COLORS[(place.day - 1) % DAY_COLORS.length];
        const est    = DURATION_MAP[place.category] || '2.0 hrs';

        const icon = L.divIcon({
            className : 'numbered-marker',
            html      : `<div style="
                background:${fill}; border:3px solid ${border};
                color:white; font-weight:800; font-size:13px;
                border-radius:50%; width:32px; height:32px;
                display:flex; align-items:center; justify-content:center;
                box-shadow:0 4px 10px rgba(0,0,0,0.3);">${seq}</div>`,
            iconSize  : [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker([place.latitude, place.longitude], { icon })
            .addTo(leafletMap);

        marker.bindPopup(`
            <div style="min-width:170px; font-family:'Inter',sans-serif;">
                <strong>${seq}. ${place.name}</strong><br>
                <span style="font-size:0.78rem; color:#6B7280;">
                    📅 Day ${place.day} | 🏷️ ${capitalize(place.category)}
                </span><br>
                <span style="color:#F59E0B;">${buildStarHTML(parseFloat(place.rating || 0))}</span>
                <hr style="margin:6px 0; border-top:1px dashed #E5E7EB;">
                <span style="font-size:0.8rem; color:#4F46E5; font-weight:700;">
                    ⏱️ Est. Stay: ${est}
                </span>
            </div>
        `);

        marker.on('mouseover', function () { this.openPopup(); });
        bounds.push([place.latitude, place.longitude]);
        seq++;
    });

    if (bounds.length > 0) {
        leafletMap.fitBounds(bounds, { padding: [50, 50] });
    }

    addLeafletLegend(itineraryData, leafletMap);
}


// ── focusPlace — Called when clicking a side panel card ──────────────────────

/**
 * Smoothly flies the map to a specific place when its card is clicked.
 * Works with both Mapbox and Leaflet.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} name
 */
function focusPlace(lat, lon, name) {
    if (mapboxMap) {
        // Mapbox flyTo
// REPLACE the existing mapboxMap.flyTo inside focusPlace with this:
    mapboxMap.flyTo({
    center: [lon, lat],
    zoom: 16.5,
    pitch: 60, 
    bearing: Math.floor(Math.random() * 60) - 30, 
    duration: 2500, 
    essential: true
    });
    } else if (leafletMap) {
        // Leaflet flyTo
        leafletMap.flyTo([lat, lon], 16, { animate: true, duration: 1.5 });

        // Open popup after animation
        setTimeout(() => {
            leafletMap.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    const pos = layer.getLatLng();
                    if (Math.abs(pos.lat - lat) < 0.00001 &&
                        Math.abs(pos.lng - lon) < 0.00001) {
                        layer.openPopup();
                    }
                }
            });
        }, 1600);
    }
}


// ── Leaflet Legend ───────────────────────────────────────────────────────────

function addLeafletLegend(itineraryData, map) {
    const legend = L.control({ position: 'bottomleft' });

    legend.onAdd = function () {
        const div  = L.DomUtil.create('div');
        div.style.cssText = `
            background    : rgba(255,255,255,0.92);
            padding       : 12px 16px;
            border-radius : 16px;
            font-family   : 'Inter', sans-serif;
            font-size     : 0.78rem;
            line-height   : 2;
            box-shadow    : 0 4px 16px rgba(0,0,0,0.12);
        `;

        const days = Object.keys(itineraryData).map(Number).sort((a, b) => a - b);
        let html   = '<strong>🗓️ Days</strong><br>';

        days.forEach(day => {
            const color = DAY_COLORS[(day - 1) % DAY_COLORS.length];
            html += `
                <span style="
                    display:inline-block; width:10px; height:10px;
                    background:${color}; border-radius:50%;
                    margin-right:6px; vertical-align:middle;
                "></span>Day ${day}<br>`;
        });

        div.innerHTML = html;
        return div;
    };

    legend.addTo(map);
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function buildStarHTML(rating) {
    let stars     = '';
    const full    = Math.floor(rating);
    const hasHalf = (rating - full) >= 0.5;
    for (let i = 0; i < full; i++)                       stars += '★';
    if (hasHalf)                                          stars += '½';
    for (let i = full + (hasHalf ? 1 : 0); i < 5; i++)  stars += '☆';
    return stars;
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ADD THIS at the bottom of map.js:
function filterMapByDay(dayNumber) {
    // Toggle off if clicking the already active day
    if (activeDayFilter === dayNumber) {
        activeDayFilter = null; 
    } else {
        activeDayFilter = dayNumber;
    }

    const bounds = new mapboxgl.LngLatBounds();
    let hasActiveBounds = false;

    // 1. Toggle Route Lines
    window.dayRouteLayers.forEach(layer => {
        if (activeDayFilter === null || layer.day === activeDayFilter) {
            mapboxMap.setLayoutProperty(layer.id, 'visibility', 'visible');
        } else {
            mapboxMap.setLayoutProperty(layer.id, 'visibility', 'none');
        }
    });

    // 2. Toggle Markers (Fade and Minimize)
    window.mapboxMarkers.forEach(m => {
        if (activeDayFilter === null || m.day === activeDayFilter) {
            // Restore active/all markers
            m.element.style.opacity = '1';
            m.element.style.transform = 'scale(1)';
            m.element.style.pointerEvents = 'auto';
            m.element.style.filter = 'grayscale(0%)';
            bounds.extend([m.lon, m.lat]);
            hasActiveBounds = true;
        } else {
            // Minimize and fade inactive markers
            m.element.style.opacity = '0.35';
            m.element.style.transform = 'scale(0.65)';
            m.element.style.pointerEvents = 'none'; // Prevent clicking hidden markers
            m.element.style.filter = 'grayscale(100%)';
        }
    });

    // 3. Update UI Headers
    document.querySelectorAll('.day-filter-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.querySelector('.day-badge').style.transform = 'scale(1)';
        btn.querySelector('span').textContent = 'Show Map';
        btn.querySelector('span').style.color = 'var(--text-muted)';
    });

    // 4. Highlight Active Header & Fly Map
    if (activeDayFilter !== null) {
        const activeBtn = document.getElementById(`day-header-${activeDayFilter}`);
        if (activeBtn) {
            activeBtn.style.background = 'rgba(0,0,0,0.04)';
            activeBtn.querySelector('.day-badge').style.transform = 'scale(1.1)';
            activeBtn.querySelector('span').textContent = 'Viewing 👀';
            activeBtn.querySelector('span').style.color = 'var(--accent)';
        }
        
        if (hasActiveBounds) {
            mapboxMap.fitBounds(bounds, { padding: 80, duration: 1500, maxZoom: 15 });
        }
    } else if (hasActiveBounds) {
        // If reset to 'All', zoom out to show the whole trip
        mapboxMap.fitBounds(bounds, { padding: 60, duration: 1500 });
    }
}
