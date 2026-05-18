"""Trip planning, geocoding, and recommendation helpers.

This module contains the logic that chooses places, scores them, orders them,
and falls back to seeded destinations when API data is missing.
"""
# This file is intentionally not named "recommendation.py" to avoid confusion with
import math
import os

import joblib
import pandas as pd
import requests
from flask import current_app

from webapp.constants import CATEGORY_MAP, PH_BOUNDS

ML_MODEL_PATH = 'anotara_ml_model.pkl'
ML_COLUMNS_PATH = 'anotara_model_columns.pkl'

if os.path.exists(ML_MODEL_PATH) and os.path.exists(ML_COLUMNS_PATH):
    ml_model = joblib.load(ML_MODEL_PATH)
    ml_columns = joblib.load(ML_COLUMNS_PATH)
    print('✅ Machine Learning Model Loaded Successfully!')
else:
    ml_model = None
    ml_columns = None
    print('⚠️ ML Model not found. Falling back to rule-based scoring.')


def geocode_mapbox(destination):
    """Convert a place name to coordinates using Mapbox, then Geoapify fallback."""
    token = current_app.config.get('MAPBOX_TOKEN', '')
    if not token:
        print('⚠️  Mapbox token not set — falling back to Geoapify geocoding.')
        return geocode_geoapify(destination)

    url = (
        'https://api.mapbox.com/geocoding/v5/mapbox.places/'
        f"{requests.utils.quote(destination)}.json"
    )
    params = {
        'access_token': token,
        'country': 'PH',
        'limit': 1,
        'types': 'place,locality,region,poi',
    }

    try:
        resp = requests.get(url, params=params, timeout=8)
        data = resp.json()

        features = data.get('features', [])
        if not features:
            print(f"⚠️  Mapbox found no results for '{destination}' in PH.")
            return geocode_geoapify(destination)

        lon, lat = features[0]['geometry']['coordinates']
        print(f"✅ Mapbox geocoded '{destination}' → Lat: {lat}, Lon: {lon}")
        return {'lat': lat, 'lon': lon}
    except Exception as e:
        print(f'❌ Mapbox geocoding error: {e}')
        return geocode_geoapify(destination)


def geocode_geoapify(destination):
    """Geoapify geocoding fallback when Mapbox is unavailable."""
    api_key = current_app.config.get('GEOAPIFY_KEY', '')
    url = 'https://api.geoapify.com/v1/geocode/search'

    params = {
        'text': f'{destination}, Philippines',
        'filter': 'countrycode:ph',
        'limit': 1,
        'apiKey': api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=8)
        data = resp.json()

        features = data.get('features', [])
        if not features:
            print(f"❌ Geoapify also found nothing for '{destination}'.")
            return None

        coords = features[0]['geometry']['coordinates']
        lon, lat = coords[0], coords[1]
        print(f"✅ Geoapify geocoded '{destination}' → Lat: {lat}, Lon: {lon}")
        return {'lat': lat, 'lon': lon}
    except Exception as e:
        print(f'❌ Geoapify geocoding error: {e}')
        return None


def is_in_philippines(lat, lon):
    """Return True when a coordinate lies inside the Philippines bounding box."""
    return (
        PH_BOUNDS['min_lat'] <= lat <= PH_BOUNDS['max_lat'] and
        PH_BOUNDS['min_lon'] <= lon <= PH_BOUNDS['max_lon']
    )


def fetch_places(destination, preferences, dest_coords=None, trip_context=None):
    """Fetch nearby places from Geoapify and normalize the response shape."""
    api_key = current_app.config.get('GEOAPIFY_KEY', '')

    if preferences:
        categories = ','.join(dict.fromkeys(CATEGORY_MAP.get(p, 'tourism.attraction') for p in preferences))
    else:
        categories = 'tourism.attraction,catering.restaurant,natural,beach'

    if dest_coords:
        lat, lon = dest_coords['lat'], dest_coords['lon']
    else:
        result = geocode_geoapify(destination)
        if not result:
            return get_ph_seed_places(destination, preferences, dest_coords)
        lat, lon = result['lat'], result['lon']

    url = 'https://api.geoapify.com/v2/places'
    params = {
        'categories': categories,
        'filter': f'circle:{lon},{lat},30000',
        # Pull enough candidates for ranking, but keep the response focused.
        'limit': 50,
        'apiKey': api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        features = data.get('features', [])

        if resp.status_code != 200:
            print(f'❌ Geoapify Places error: {data}')
            return get_ph_seed_places(destination, preferences, dest_coords)

        print(f'✅ Fetched {len(features)} places near {destination}.')
    except Exception as e:
        print(f'❌ Places fetch error: {e}')
        return get_ph_seed_places(destination, preferences, dest_coords)

    places = []
    for feat in features:
        props = feat.get('properties', {})
        geom = feat.get('geometry', {})
        coords = geom.get('coordinates', [lon, lat])

        name = str(props.get('name', '')).strip()
        if not name:
            continue

        raw_cat = (props.get('categories') or ['tourism'])[0]
        category = simplify_category(raw_cat)
        environment_type, physical_intensity = classify_place_profile(category, raw_cat, props)

        places.append({
            'name': name,
            'category': category,
            'latitude': coords[1],
            'longitude': coords[0],
            'rating': round(float(props.get('datasource', {}).get('raw', {}).get('stars', 3.5) or 3.5), 1),
            'city': destination,
            'tags': raw_cat,
            'environment_type': environment_type,
            'physical_intensity': physical_intensity,
        })

    if trip_context:
        places = filter_places_by_context(places, trip_context)

    return places if places else get_ph_seed_places(destination, preferences, dest_coords)


def simplify_category(raw):
    """Map Geoapify category prefixes to the app's simpler internal labels."""
    mapping = {
        'catering': 'food',
        'beach': 'beach',
        'natural': 'nature',
        'leisure': 'nature',
        'tourism': 'sightseeing',
        'education': 'museums',
        'entertainment': 'nightlife',
    }
    return mapping.get(raw.split('.')[0], 'sightseeing')


def classify_place_profile(category, raw_category, props):
    """Classify a place so we can filter for families, seniors, and indoor pivots."""
    text = f"{category} {raw_category} {props.get('name', '')} {props.get('formatted', '')}".lower()

    if any(keyword in text for keyword in ['beach', 'surf', 'hike', 'trail', 'mountain', 'peak', 'sport']):
        return 'Outdoor', 'High'
    if any(keyword in text for keyword in ['park', 'nature', 'garden', 'walk', 'promenade']):
        return 'Outdoor', 'Medium'
    if any(keyword in text for keyword in ['museum', 'cafe', 'coffee', 'restaurant', 'bar', 'theatre', 'cinema', 'gallery']):
        return 'Indoor', 'Low'
    if category == 'nightlife':
        return 'Indoor', 'Low'
    return 'Mixed', 'Medium'


def filter_places_by_context(places, trip_context):
    """Apply hard filters before ML ranking so risky places never reach the shortlist."""
    companion_type = (trip_context.get('companion_type') or '').lower()
    pacing_style = (trip_context.get('pacing_style') or 'moderate').lower()

    filtered = []
    for place in places:
        if companion_type in ['family_kids', 'seniors'] and place.get('physical_intensity') == 'High':
            continue
        filtered.append(place)

    if pacing_style == 'relaxed':
        filtered = [place for place in filtered if place.get('physical_intensity') != 'High' or place.get('category') in ['beach', 'nature']]

    return filtered


def get_ph_seed_places(destination, preferences, dest_coords=None):
    """Provide realistic fallback places when the live API does not return data."""
    if dest_coords:
        base_lat = dest_coords['lat']
        base_lon = dest_coords['lon']
    else:
        result = geocode_geoapify(destination)
        if result:
            base_lat = result['lat']
            base_lon = result['lon']
        else:
            base_lat = 12.8797
            base_lon = 121.7740

    seed = [
        {'name': f'{destination} Heritage District', 'category': 'sightseeing', 'rating': 4.6, 'latitude': base_lat + 0.010, 'longitude': base_lon + 0.005, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Rizal Park', 'category': 'sightseeing', 'rating': 4.4, 'latitude': base_lat + 0.018, 'longitude': base_lon - 0.006, 'city': destination, 'tags': 'tourism'},
        {'name': f'Fort {destination}', 'category': 'sightseeing', 'rating': 4.5, 'latitude': base_lat - 0.008, 'longitude': base_lon + 0.012, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Plaza Mayor', 'category': 'sightseeing', 'rating': 4.3, 'latitude': base_lat + 0.022, 'longitude': base_lon - 0.014, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} White Sand Beach', 'category': 'beach', 'rating': 4.8, 'latitude': base_lat - 0.015, 'longitude': base_lon + 0.020, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Island Hopping Tour', 'category': 'beach', 'rating': 4.9, 'latitude': base_lat - 0.022, 'longitude': base_lon + 0.028, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Lagoon', 'category': 'beach', 'rating': 4.7, 'latitude': base_lat - 0.030, 'longitude': base_lon + 0.018, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Dive Site', 'category': 'beach', 'rating': 4.6, 'latitude': base_lat - 0.025, 'longitude': base_lon + 0.025, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Chocolate Hills', 'category': 'nature', 'rating': 4.8, 'latitude': base_lat + 0.025, 'longitude': base_lon + 0.015, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Falls', 'category': 'nature', 'rating': 4.7, 'latitude': base_lat - 0.010, 'longitude': base_lon - 0.018, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Eco Trail', 'category': 'nature', 'rating': 4.4, 'latitude': base_lat - 0.016, 'longitude': base_lon + 0.016, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Volcano View', 'category': 'nature', 'rating': 4.6, 'latitude': base_lat + 0.030, 'longitude': base_lon - 0.010, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Lechon House', 'category': 'food', 'rating': 4.7, 'latitude': base_lat + 0.003, 'longitude': base_lon + 0.009, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Seafood Grill', 'category': 'food', 'rating': 4.5, 'latitude': base_lat - 0.013, 'longitude': base_lon + 0.007, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Carinderia Row', 'category': 'food', 'rating': 4.2, 'latitude': base_lat + 0.006, 'longitude': base_lon - 0.011, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Fine Dining', 'category': 'food', 'rating': 4.8, 'latitude': base_lat + 0.009, 'longitude': base_lon + 0.001, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} National Museum', 'category': 'museums', 'rating': 4.5, 'latitude': base_lat + 0.005, 'longitude': base_lon - 0.008, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Cultural Center', 'category': 'museums', 'rating': 4.3, 'latitude': base_lat + 0.014, 'longitude': base_lon - 0.010, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Heritage Museum', 'category': 'museums', 'rating': 4.2, 'latitude': base_lat + 0.016, 'longitude': base_lon - 0.004, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Art Gallery', 'category': 'museums', 'rating': 4.1, 'latitude': base_lat + 0.006, 'longitude': base_lon + 0.003, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Night Market', 'category': 'nightlife', 'rating': 4.5, 'latitude': base_lat + 0.008, 'longitude': base_lon - 0.003, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Rooftop Bar', 'category': 'nightlife', 'rating': 4.4, 'latitude': base_lat - 0.004, 'longitude': base_lon - 0.011, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Jazz & Chill Lounge', 'category': 'nightlife', 'rating': 4.6, 'latitude': base_lat - 0.008, 'longitude': base_lon - 0.007, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Skybar', 'category': 'nightlife', 'rating': 4.7, 'latitude': base_lat + 0.007, 'longitude': base_lon - 0.013, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Old Church', 'category': 'sightseeing', 'rating': 4.4, 'latitude': base_lat - 0.005, 'longitude': base_lon - 0.019, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Baywalk Promenade', 'category': 'sightseeing', 'rating': 4.3, 'latitude': base_lat + 0.012, 'longitude': base_lon + 0.022, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Sunset Viewpoint', 'category': 'nature', 'rating': 4.8, 'latitude': base_lat - 0.020, 'longitude': base_lon + 0.018, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Luxury Spa & Resort', 'category': 'sightseeing', 'rating': 4.9, 'latitude': base_lat + 0.004, 'longitude': base_lon - 0.002, 'city': destination, 'tags': 'leisure'},
    ]
    return seed


def haversine(lat1, lon1, lat2, lon2):
    """Compute great-circle distance in kilometers between two points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2 +
        math.cos(math.radians(lat1)) *
        math.cos(math.radians(lat2)) *
        math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def score_place_ml(place, preferences, budget, num_days):
    """Score a place using the trained model when available."""
    if ml_model is None or ml_columns is None:
        return score_place(place, preferences, budget)

    row = {
        'user_budget': budget,
        'user_days': num_days,
        'pref_food': 1 if 'food' in preferences else 0,
        'pref_beach': 1 if 'beach' in preferences else 0,
        'pref_nature': 1 if 'nature' in preferences else 0,
        'pref_museums': 1 if 'museums' in preferences else 0,
        'pref_nightlife': 1 if 'nightlife' in preferences else 0,
        'place_province': place.get('city', ''),
        'place_category': place.get('category', ''),
        'place_rating': float(place.get('rating') or 3.5),
    }

    df = pd.DataFrame([row])
    df_encoded = pd.get_dummies(df, columns=['user_budget', 'place_province', 'place_category'])
    df_aligned = df_encoded.reindex(columns=ml_columns, fill_value=0)
    match_probability = ml_model.predict_proba(df_aligned)[0][1]
    return match_probability * 10.0


def score_place(place, preferences, budget):
    """Fallback scoring logic used when the trained model is unavailable."""
    score = 0.0
    category = place.get('category', '').lower()
    tags = (place.get('tags') or '').lower()

    for pref in preferences:
        if pref.lower() in category or pref.lower() in tags:
            score += 3.0

    rating = float(place.get('rating') or 3.5)
    score += (rating / 5.0) * 2.0

    if budget == 'high':
        if rating >= 4.5:
            score += 2.0
        if category in ['food', 'nightlife']:
            score += 1.5
        if any(k in tags for k in ['luxury', 'boutique', 'resort']):
            score += 2.0
    elif budget == 'low':
        if category in ['nature', 'beach']:
            score += 2.5
        if any(k in tags for k in ['market', 'street_food']):
            score += 2.0
        if 'fine_dining' in tags or 'resort' in tags:
            score -= 3.0

    return score


def get_places_per_day(num_days, budget, pacing_style='Moderate'):
    """Return a smaller, experience-focused number of stops per day."""
    pacing_style = (pacing_style or 'Moderate').lower()
    if pacing_style == 'relaxed':
        return 2
    if pacing_style == 'packed':
        return 4 if budget == 'high' else 3
    if budget == 'high':
        return 3
    return 2


def get_preference_match_count(place, preferences):
    """Count how many user preferences a place matches."""
    category = place.get('category', '').lower()
    tags = (place.get('tags') or '').lower()
    return sum(1 for pref in preferences if pref.lower() in category or pref.lower() in tags)


def enrich_place(place, preferences, budget, num_days, dest_coords=None, trip_context=None):
    """Attach UI-friendly planning metadata to each place."""
    preference_matches = get_preference_match_count(place, preferences)
    rating = float(place.get('rating') or 3.5)

    place['score'] = score_place_ml(place, preferences, budget, num_days)
    place['preference_matches'] = preference_matches
    place['recommended_minutes'] = estimate_stay_minutes(place, preferences, budget)
    place['why'] = build_place_reason(place, preferences, budget, preference_matches)

    pacing_style = (trip_context or {}).get('pacing_style', 'Moderate')
    if pacing_style == 'Relaxed':
        place['score'] += 0.4 if place['recommended_minutes'] <= 120 else -0.3
    elif pacing_style == 'Packed':
        place['score'] += 0.4 if place['recommended_minutes'] <= 90 else 0.1

    anchor_coords = (trip_context or {}).get('accommodation_coords') or dest_coords
    if anchor_coords and 'latitude' in place and 'longitude' in place:
        place['distance_km'] = round(
            haversine(anchor_coords['lat'], anchor_coords['lon'], place['latitude'], place['longitude']),
            1,
        )
        place['score'] -= min(place['distance_km'] / 12.0, 2.0)
    else:
        place['distance_km'] = None

    # Keep the original rating rounded for the UI while preserving the ML score separately.
    place['rating'] = round(rating, 1)
    return place


def estimate_stay_minutes(place, preferences, budget):
    """Estimate how long the user should spend at a stop."""
    category = place.get('category', '').lower()
    rating = float(place.get('rating') or 3.5)
    minutes = 60

    if category in ['beach', 'nature']:
        minutes = 180
    elif category in ['museums', 'sightseeing']:
        minutes = 120
    elif category == 'food':
        minutes = 75
    elif category == 'nightlife':
        minutes = 150

    if budget == 'high':
        minutes += 30
    elif budget == 'low':
        minutes -= 15

    if rating >= 4.6:
        minutes += 15

    if get_preference_match_count(place, preferences) > 0:
        minutes += 15

    return max(45, min(minutes, 240))


def build_place_reason(place, preferences, budget, preference_matches):
    """Explain why the recommendation is strong for the current traveler."""
    parts = []

    if preference_matches:
        parts.append(f"Matches {preference_matches} preference(s)")

    if place.get('rating', 0) >= 4.5:
        parts.append('Highly rated')

    if budget == 'high':
        parts.append('Luxury-friendly')
    elif budget == 'low':
        parts.append('Budget-aware')

    if not parts:
        parts.append('Balanced fallback pick')

    return ', '.join(parts)


def rank_candidates(candidates, preferences, budget, num_days, dest_coords=None, trip_context=None):
    """Rank candidates using ML score first, then quality and route simplicity."""
    ranked = []
    for candidate in candidates:
        ranked.append(enrich_place(candidate, preferences, budget, num_days, dest_coords, trip_context))

    return sorted(
        ranked,
        key=lambda place: (
            place['score'],
            place['preference_matches'],
            -(place['distance_km'] if place['distance_km'] is not None else 9999),
            place['rating'],
        ),
        reverse=True,
    )


def get_quality_cutoff(ranked_places):
    """Return a score cutoff that keeps only the strongest recommendations."""
    if not ranked_places:
        return 0.0

    top_score = ranked_places[0]['score']
    scores = [place['score'] for place in ranked_places]
    average_score = sum(scores) / len(scores)

    # Keep the selection focused on places that are close to the top score and above average.
    return max(average_score + 0.75, top_score - 0.9)


def choose_best_itinerary_places(places, preferences, budget, num_days, dest_coords=None, trip_context=None):
    """Pick only the strongest places for the final itinerary output."""
    pacing_style = (trip_context or {}).get('pacing_style', 'Moderate')
    places_per_day = get_places_per_day(num_days, budget, pacing_style)
    total_needed = num_days * places_per_day

    ranked = rank_candidates(places, preferences, budget, num_days, dest_coords, trip_context)
    quality_cutoff = get_quality_cutoff(ranked)
    high_confidence = [
        place for place in ranked
        if place['score'] >= quality_cutoff or place['preference_matches'] > 0 or place['rating'] >= 4.5
    ]

    if len(high_confidence) < total_needed:
        high_confidence = ranked[:total_needed]

    chosen = []
    used_categories = set()

    for place in high_confidence:
        if len(chosen) >= total_needed:
            break

        # Prefer diversity across categories so the day does not feel repetitive.
        if len(chosen) < 2 or place['category'] not in used_categories:
            chosen.append(place)
            used_categories.add(place['category'])

    # If category diversity is too strict, fill the remaining slots with the next-best options.
    if len(chosen) < total_needed:
        for place in ranked:
            if len(chosen) >= total_needed:
                break
            if place not in chosen:
                chosen.append(place)

    return chosen[:total_needed], places_per_day


def assign_places_to_days(places, num_days, places_per_day):
    """Order the final selection by route and spread it across the requested days."""
    if not places:
        return {}

    ordered = []
    remaining = places[:]
    current = remaining.pop(0)
    ordered.append(current)

    while remaining:
        nearest = min(
            remaining,
            key=lambda place: haversine(
                current['latitude'], current['longitude'],
                place['latitude'], place['longitude'],
            ),
        )
        remaining.remove(nearest)
        ordered.append(nearest)
        current = nearest

    itinerary = {day: [] for day in range(1, num_days + 1)}
    for index, place in enumerate(ordered):
        day = (index // places_per_day) + 1
        if day <= num_days:
            itinerary[day].append(place)

    return itinerary


def build_itinerary(places, preferences, num_days, budget, destination, dest_coords=None, trip_context=None):
    """Rank places, keep only the strongest matches, then distribute them across days."""
    pacing_style = (trip_context or {}).get('pacing_style', 'Moderate')
    places_per_day = get_places_per_day(num_days, budget, pacing_style)
    total_needed = num_days * places_per_day

    seen = set()
    normalized = []
    for place in places:
        name = str(place.get('name', '')).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        normalized.append(place)

    if len(normalized) < total_needed:
        seeds = get_ph_seed_places(destination, preferences, dest_coords)
        for seed in seeds:
            if seed['name'] not in seen:
                seen.add(seed['name'])
                normalized.append(seed)

    if len(normalized) < total_needed:
        pad = 1
        b_lat = dest_coords['lat'] if dest_coords else 12.8797
        b_lon = dest_coords['lon'] if dest_coords else 121.7740

        while len(normalized) < total_needed:
            category = 'nightlife' if budget == 'high' else 'sightseeing'
            off = pad * 0.0015
            normalized.append({
                'name': f'Hidden Gem Experience {pad}',
                'category': category,
                'rating': 4.8 if budget == 'high' else 4.0,
                'latitude': b_lat + off,
                'longitude': b_lon + off,
                'city': destination,
                'tags': 'leisure',
            })
            pad += 1

    chosen, places_per_day = choose_best_itinerary_places(
        normalized,
        preferences,
        budget,
        num_days,
        dest_coords,
        trip_context,
    )

    if not chosen:
        return {}

    itinerary = assign_places_to_days(chosen, num_days, places_per_day)

    # Preserve the score/rationale metadata on the final selected stops.
    for day_places in itinerary.values():
        for place in day_places:
            place['score'] = score_place_ml(place, preferences, budget, num_days)
            place['recommended_minutes'] = estimate_stay_minutes(place, preferences, budget)
            place['why'] = build_place_reason(
                place,
                preferences,
                budget,
                get_preference_match_count(place, preferences),
            )

    return itinerary