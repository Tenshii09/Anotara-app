/**
 * map.js — Premium Leaflet Map Logic with Road Routing
 */

const CATEGORY_COLORS = {
    food       : '#fd7e14',   
    beach      : '#0dcaf0',   
    nature     : '#198754',   
    museums    : '#6f42c1',   
    nightlife  : '#212529',   
    sightseeing: '#0d6efd',   
};

const DAY_COLORS = ['#4F46E5', '#E11D48', '#059669', '#D97706', '#7C3AED', '#0891B2', '#475569'];

const DURATION_MAP = {
    food       : '1.5 hrs',
    beach      : '4.0 hrs',
    nature     : '3.0 hrs',
    museums    : '2.5 hrs',
    nightlife  : '3.0 hrs',
    sightseeing: '2.0 hrs'
};

let map = null;

function initMap(itineraryData) {
    const allPlaces = [];
    const routeCoords = []; 

    const days = Object.keys(itineraryData).map(Number).sort((a, b) => a - b);

    days.forEach(dayNumber => {
        const places = itineraryData[dayNumber];
        places.forEach(place => {
            if (place.latitude && place.longitude) {
                allPlaces.push({ ...place, day: dayNumber });
                routeCoords.push([place.latitude, place.longitude]); 
            }
        });
    });

    const defaultCenter = [14.5995, 120.9842];
    const center = allPlaces.length > 0 ? [allPlaces[0].latitude, allPlaces[0].longitude] : defaultCenter;

    map = L.map('map', { center: center, zoom: 13, zoomControl: true, scrollWheelZoom: true });

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    // Snap-to-Road Route Line
    if (routeCoords.length > 1) {
        // Convert coordinates to Leaflet latLng objects for the router
        const waypoints = routeCoords.map(coord => L.latLng(coord[0], coord[1]));

        L.Routing.control({
            waypoints: waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1'
            }),
            lineOptions: {
                styles: [{ color: '#4F46E5', opacity: 0.9, weight: 5, className: 'animate-route' }]
            },
            show: false,          // Hides the bulky text-directions box
            addWaypoints: false,  // Prevents users from dragging the line to make new points
            routeWhileDragging: false,
            fitSelectedRoutes: false,
            createMarker: function() { 
                return null; // Prevents the router from drawing ugly default pins over your custom numbers
            }
        }).addTo(map);

        // START Tag
        L.marker(routeCoords[0], {
            icon: L.divIcon({
                className: 'custom-route-tag',
                html: `<div style="background:#111827; color:#fff; padding:4px 12px; border-radius:12px; font-size:0.75rem; font-weight:800; transform:translate(-30%, -35px); border:2px solid #fff;">START</div>`,
                iconSize: [0, 0]
            })
        }).addTo(map);

        // END Tag
        L.marker(routeCoords[routeCoords.length - 1], {
            icon: L.divIcon({
                className: 'custom-route-tag',
                html: `<div style="background:#E11D48; color:#fff; padding:4px 12px; border-radius:12px; font-size:0.75rem; font-weight:800; transform:translate(-30%, -35px); border:2px solid #fff;">END</div>`,
                iconSize: [0, 0]
            })
        }).addTo(map);
    }

    const markerBounds = [];
    let sequenceNumber = 1; 

    allPlaces.forEach(place => {
        const lat = place.latitude;
        const lng = place.longitude;
        const day = place.day;

        const fillColor = CATEGORY_COLORS[place.category] || CATEGORY_COLORS['sightseeing'];
        const borderColor = DAY_COLORS[(day - 1) % DAY_COLORS.length];
        const estTime = DURATION_MAP[place.category] || '2.0 hrs';

        const numberIcon = L.divIcon({
            className: 'numbered-marker',
            html: `<div style="background-color: ${fillColor}; border: 3px solid ${borderColor}; color: white; font-family: 'Inter', sans-serif; font-weight: 800; font-size: 14px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${sequenceNumber}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16] 
        });

        const marker = L.marker([lat, lng], { icon: numberIcon }).addTo(map);
        const stars = buildStarHTML(parseFloat(place.rating || 0));

        marker.bindPopup(`
            <div style="min-width: 170px; font-family: 'Inter', sans-serif;">
                <strong style="font-size: 0.95rem;">${sequenceNumber}. ${place.name}</strong><br>
                <span style="font-size:0.8rem; color: #6B7280;">📅 Day ${day} | 🏷️ ${place.category}</span><br>
                <span style="color: #F59E0B;">${stars}</span>
                <hr style="margin: 8px 0; border-top: 1px dashed #E5E7EB;">
                <span style="font-size:0.85rem; color: #4F46E5; font-weight: 700;">⏱️ Est. Stay: ${estTime}</span>
            </div>
        `);

        marker.on('mouseover', function () { this.openPopup(); });
        markerBounds.push([lat, lng]);
        sequenceNumber++; 
    });

    if (markerBounds.length > 0) map.fitBounds(markerBounds, { padding: [50, 50] });
    addLegend(itineraryData);
}

/**
 * Focuses the map on a specific marker when clicking the arrow on the side list
 */
function focusPlace(lat, lng, name) {
    if (!map) return;

    map.flyTo([lat, lng], 16, {
        animate: true,
        duration: 1.5 
    });

    map.eachLayer((layer) => {
        if (layer.options && layer.options.icon) {
            const pos = layer.getLatLng();
            if (pos.lat === lat && pos.lng === lng) {
                setTimeout(() => { layer.openPopup(); }, 1200);
            }
        }
    });
}

function buildStarHTML(rating) {
    let stars = '';
    for (let i = 0; i < Math.floor(rating); i++) stars += '★';
    if (rating % 1 !== 0) stars += '½';
    return stars;
}

function addLegend(itineraryData) {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.style.cssText = "background: rgba(255, 255, 255, 0.9); padding: 15px; border-radius: 15px; font-family: 'Inter';";
        div.innerHTML = "<strong>📅 Days</strong><br>";
        Object.keys(itineraryData).forEach((day, index) => {
            div.innerHTML += `<i style="background:${DAY_COLORS[index % DAY_COLORS.length]}; width:10px; height:10px; border-radius:50%; display:inline-block;"></i> Day ${day}<br>`;
        });
        return div;
    };
    legend.addTo(map);
}