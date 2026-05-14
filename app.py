from flask import Flask, request, jsonify
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import mysql.connector
import requests
import math
from config import Config
import pandas as pd
import joblib
import os

app = Flask(__name__)
app.config.from_object(Config)
CORS(app) # Allows React to communicate with Flask
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# Load the trained ML model and its expected columns for encoding
def get_db():
    """Opens and returns a MySQL connection using config variables."""
    return mysql.connector.connect(
        host     = app.config['DB_HOST'],
        user     = app.config['DB_USER'],
        password = app.config['DB_PASSWORD'],
        database = app.config['DB_NAME'],
        port     = app.config.get('DB_PORT', '3306')
    )

# [KEEP ALL YOUR ML LOADING CODE HERE - NO CHANGES]
# [KEEP PH_BOUNDS AND PH_DESTINATIONS HERE - NO CHANGES]
# [KEEP get_db() HELPER HERE - NO CHANGES]


# ─────────────────────────────────────────────
# LOAD MACHINE LEARNING MODEL
# ─────────────────────────────────────────────
ML_MODEL_PATH = 'anotara_ml_model.pkl'
ML_COLUMNS_PATH = 'anotara_model_columns.pkl'

# We define these globally so all routes can see them
if os.path.exists(ML_MODEL_PATH) and os.path.exists(ML_COLUMNS_PATH):
    ml_model = joblib.load(ML_MODEL_PATH)
    ml_columns = joblib.load(ML_COLUMNS_PATH)
    print("✅ Machine Learning Model Loaded Successfully!")
else:
    ml_model = None
    ml_columns = None
    print("⚠️ ML Model not found. Falling back to rule-based scoring.")

# ── Philippines bounding box ──────────────────
PH_BOUNDS = {
    'min_lat':  4.5,
    'max_lat': 21.5,
    'min_lon': 116.0,
    'max_lon': 127.0
}

# The 82 Official Philippine Provinces
PH_DESTINATIONS = [
    'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan', 'Albay', 'Antique', 
    'Apayao', 'Aurora', 'Basilan', 'Bataan', 'Batanes', 'Batangas', 'Benguet', 
    'Biliran', 'Bohol', 'Bukidnon', 'Bulacan', 'Cagayan', 'Camarines Norte',  
    'Camarines Sur', 'Camiguin', 'Capiz', 'Catanduanes', 'Cavite', 'Cebu', 
    'Cotabato', 'Davao de Oro', 'Davao del Norte', 'Davao del Sur', 
    'Davao Occidental', 'Davao Oriental', 'Dinagat Islands', 'Eastern Samar', 
    'Guimaras', 'Ifugao', 'Ilocos Norte', 'Ilocos Sur', 'Iloilo', 'Isabela', 
    'Kalinga', 'La Union', 'Laguna', 'Lanao del Norte', 'Lanao del Sur', 
    'Leyte', 'Maguindanao del Norte', 'Maguindanao del Sur', 'Marinduque', 
    'Masbate', 'Misamis Occidental', 'Misamis Oriental', 'Mountain Province', 
    'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Nueva Ecija', 
    'Nueva Vizcaya', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan', 
    'Pampanga', 'Pangasinan', 'Quezon', 'Quirino', 'Rizal', 'Romblon', 
    'Samar', 'Sarangani', 'Siquijor', 'Sorsogon', 'South Cotabato', 
    'Southern Leyte', 'Sultan Kudarat', 'Sulu', 'Surigao del Norte', 
    'Surigao del Sur', 'Tarlac', 'Tawi-Tawi', 'Zambales', 
    'Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay'
]

# ─────────────────────────────────────────────
# AUTHENTICATION API (Replacement for Session Auth)
# ─────────────────────────────────────────────

# All routes below are protected with @jwt_required() to ensure only logged-in users can access them.
@app.route('/api/itinerary', methods=['POST'])
@jwt_required() # This protects the route with your JWT security
def api_itinerary():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Extract data sent from your React Step 4 summary
    destination = data.get('destination')
    num_days    = int(data.get('num_days', 3))
    preferences = data.get('preferences', [])
    budget      = data.get('budget', 'comfort')

    # Run your existing ML & Routing logic
    dest_coords = geocode_mapbox(destination)
    places      = fetch_places(destination, preferences, dest_coords)
    itinerary   = build_itinerary(places, preferences, num_days, budget, destination, dest_coords)
    
    # Return JSON for React to display on the map
    return jsonify({
        "itinerary": itinerary,
        "dest_coords": dest_coords
    }), 200

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email    = data.get('email', '').strip()
    password = data.get('password', '')

    # Validations [cite: 157]
    if not username or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("INSERT INTO users (username, email, password) VALUES (%s, %s, %s)", (username, email, hashed_pw))
        db.commit()
        return jsonify({"message": "Account created"}), 201
    except mysql.connector.IntegrityError:
        return jsonify({"error": "Username/Email taken"}), 409
    finally:
        db.close()

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')

    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (identifier, identifier))
    user = cursor.fetchone()
    db.close()

    if user and bcrypt.check_password_hash(user['password'], password):
        # Issue JWT Token for "Information Assurance" [cite: 500, 536]
        token = create_access_token(identity=str(user['id']))
        return jsonify({"token": token, "username": user['username']}), 200
    return jsonify({"error": "Invalid credentials"}), 401

# ─────────────────────────────────────────────
# CORE ITINERARY API (Preserving all logic)
# ─────────────────────────────────────────────

@app.route('/api/generate', methods=['POST'])
@jwt_required()
def api_generate():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    destination = data.get('destination', '')
    num_days    = int(data.get('num_days', 3))
    budget      = data.get('budget', 'comfort')
    preferences = data.get('preferences', [])

    # Exact Geocoding & Validation Logic [cite: 5, 8]
    dest_coords = geocode_mapbox(destination)
    if dest_coords and not is_in_philippines(dest_coords['lat'], dest_coords['lon']):
        return jsonify({'error': 'Philippine destinations only 🇵🇭'}), 400

    # Exact ML Scoring & Itinerary Building [cite: 196, 243]
    places = fetch_places(destination, preferences, dest_coords)
    save_places_to_db(places)
    itinerary = build_itinerary(places, preferences, num_days, budget, destination, dest_coords)
    itinerary_id = save_itinerary(current_user_id, destination, itinerary)

    return jsonify({
        "itinerary": itinerary,
        "itinerary_id": itinerary_id,
        "dest_coords": dest_coords
    }), 200

# [KEEP ALL YOUR HELPER FUNCTIONS: geocode_mapbox, fetch_places, 
# score_place_ml, build_itinerary, save_itinerary AT THE BOTTOM]
# =========================================================
# STOP PASTING HERE!
# Make sure your 'GEOCODING — Mapbox (Primary)' section starts immediately below this.
# =========================================================

# ─────────────────────────────────────────────
# GEOCODING — Mapbox (Primary)
# ─────────────────────────────────────────────

def geocode_mapbox(destination):
    """
    Uses Mapbox Geocoding API to convert a place name to lat/lon.
    Restricts results to the Philippines using country=PH.
    Returns {'lat': float, 'lon': float} or None.
    """
    token = app.config.get('MAPBOX_TOKEN', '')
    if not token:
        print("⚠️  Mapbox token not set — falling back to Geoapify geocoding.")
        return geocode_geoapify(destination)

    url = (
        f"https://api.mapbox.com/geocoding/v5/mapbox.places/"
        f"{requests.utils.quote(destination)}.json"
    )
    params = {
        'access_token' : token,
        'country'      : 'PH',       # Philippines only
        'limit'        : 1,
        'types'        : 'place,locality,region,poi'
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
        print(f"❌ Mapbox geocoding error: {e}")
        return geocode_geoapify(destination)


def geocode_geoapify(destination):
    """
    Geoapify geocoding fallback when Mapbox is unavailable.
    Restricts search to the Philippines.
    """
    api_key = app.config.get('GEOAPIFY_KEY', '')
    
    # FIXED: Removed the markdown brackets and extra text
    url = 'https://api.geoapify.com/v1/geocode/search'
    
    params = {
        'text'    : f"{destination}, Philippines",
        'filter'  : 'countrycode:ph',
        'limit'   : 1,
        'apiKey'  : api_key
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
        print(f"❌ Geoapify geocoding error: {e}")
        return None


def is_in_philippines(lat, lon):
    """
    Checks whether a coordinate pair falls within the Philippines bounding box.
    Prevents users from generating itineraries for foreign destinations.
    """
    return (
        PH_BOUNDS['min_lat'] <= lat <= PH_BOUNDS['max_lat'] and
        PH_BOUNDS['min_lon'] <= lon <= PH_BOUNDS['max_lon']
    )


# ─────────────────────────────────────────────
# PLACES FETCHING — Geoapify
# ─────────────────────────────────────────────

# Philippine-relevant category mapping
CATEGORY_MAP = {
    'food'      : 'catering.restaurant,catering.cafe,catering.fast_food',
    'beach'     : 'beach,leisure.park',
    'nature'    : 'natural,leisure.park,tourism.attraction',
    'museums'   : 'tourism.attraction,education.library',
    'nightlife' : 'entertainment.nightclub,catering.bar',
}


def fetch_places(destination, preferences, dest_coords=None):
    """
    Fetches nearby places from Geoapify Places API.
    Uses dest_coords (from Mapbox geocoding) for accuracy.
    Falls back to PH-aware seed data if API fails.
    """
    api_key = app.config.get('GEOAPIFY_KEY', '')

    # Build category string
    if preferences:
        categories = ','.join(
            CATEGORY_MAP.get(p, 'tourism.attraction') for p in preferences
        )
    else:
        categories = 'tourism.attraction,catering.restaurant,natural,beach'

    # Resolve coordinates
    if dest_coords:
        lat, lon = dest_coords['lat'], dest_coords['lon']
    else:
        result = geocode_geoapify(destination)
        if not result:
            return get_ph_seed_places(destination, preferences, dest_coords)
        lat, lon = result['lat'], result['lon']

    # Fetch places from Geoapify
    url    = 'https://api.geoapify.com/v2/places'
    params = {
        'categories' : categories,
        'filter'     : f'circle:{lon},{lat},30000',  # 30km radius
        'limit'      : 150,
        'apiKey'     : api_key
    }

    try:
        resp     = requests.get(url, params=params, timeout=10)
        data     = resp.json()
        features = data.get('features', [])

        if resp.status_code != 200:
            print(f"❌ Geoapify Places error: {data}")
            return get_ph_seed_places(destination, preferences, dest_coords)

        print(f"✅ Fetched {len(features)} places near {destination}.")

    except Exception as e:
        print(f"❌ Places fetch error: {e}")
        return get_ph_seed_places(destination, preferences, dest_coords)

    # Normalize response
    places = []
    for feat in features:
        props  = feat.get('properties', {})
        geom   = feat.get('geometry', {})
        coords = geom.get('coordinates', [lon, lat])

        name = props.get('name', '').strip()
        if not name:
            continue

        raw_cat  = (props.get('categories') or ['tourism'])[0]
        category = simplify_category(raw_cat)

        places.append({
            'name'      : name,
            'category'  : category,
            'latitude'  : coords[1],
            'longitude' : coords[0],
            'rating'    : round(
                float(
                    props.get('datasource', {})
                        .get('raw', {})
                        .get('stars', 3.5) or 3.5
                ), 1
            ),
            'city'  : destination,
            'tags'  : raw_cat
        })

    return places if places else get_ph_seed_places(destination, preferences, dest_coords)


def simplify_category(raw):
    """Maps Geoapify category prefixes to our 6 simple labels."""
    mapping = {
        'catering'      : 'food',
        'beach'         : 'beach',
        'natural'       : 'nature',
        'leisure'       : 'nature',
        'tourism'       : 'sightseeing',
        'education'     : 'museums',
        'entertainment' : 'nightlife',
    }
    return mapping.get(raw.split('.')[0], 'sightseeing')


def get_ph_seed_places(destination, preferences, dest_coords=None):
    """
    Philippines-specific fallback seed data.
    Uses real geocoded coordinates so map pins appear at the correct location.
    Includes iconic PH attractions styled per destination type.
    """
    # Resolve base coordinates from dest_coords or geocoding
    if dest_coords:
        base_lat = dest_coords['lat']
        base_lon = dest_coords['lon']
    else:
        result = geocode_geoapify(destination)
        if result:
            base_lat = result['lat']
            base_lon = result['lon']
        else:
            # Geographic center of the Philippines as last resort
            base_lat = 12.8797
            base_lon = 121.7740

    # 28 seed places with small coordinate offsets to spread pins realistically
    seed = [
        # Sightseeing
        {'name': f'{destination} Heritage District',    'category': 'sightseeing', 'rating': 4.6,
         'latitude': base_lat+0.010, 'longitude': base_lon+0.005, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Rizal Park',           'category': 'sightseeing', 'rating': 4.4,
         'latitude': base_lat+0.018, 'longitude': base_lon-0.006, 'city': destination, 'tags': 'tourism'},
        {'name': f'Fort {destination}',                 'category': 'sightseeing', 'rating': 4.5,
         'latitude': base_lat-0.008, 'longitude': base_lon+0.012, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Plaza Mayor',          'category': 'sightseeing', 'rating': 4.3,
         'latitude': base_lat+0.022, 'longitude': base_lon-0.014, 'city': destination, 'tags': 'tourism'},

        # Beach
        {'name': f'{destination} White Sand Beach',     'category': 'beach', 'rating': 4.8,
         'latitude': base_lat-0.015, 'longitude': base_lon+0.020, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Island Hopping Tour',  'category': 'beach', 'rating': 4.9,
         'latitude': base_lat-0.022, 'longitude': base_lon+0.028, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Lagoon',               'category': 'beach', 'rating': 4.7,
         'latitude': base_lat-0.030, 'longitude': base_lon+0.018, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Dive Site',            'category': 'beach', 'rating': 4.6,
         'latitude': base_lat-0.025, 'longitude': base_lon+0.025, 'city': destination, 'tags': 'beach'},

        # Nature
        {'name': f'{destination} Chocolate Hills',      'category': 'nature', 'rating': 4.8,
         'latitude': base_lat+0.025, 'longitude': base_lon+0.015, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Falls',                'category': 'nature', 'rating': 4.7,
         'latitude': base_lat-0.010, 'longitude': base_lon-0.018, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Eco Trail',            'category': 'nature', 'rating': 4.4,
         'latitude': base_lat-0.016, 'longitude': base_lon+0.016, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Volcano View',         'category': 'nature', 'rating': 4.6,
         'latitude': base_lat+0.030, 'longitude': base_lon-0.010, 'city': destination, 'tags': 'natural'},

        # Food
        {'name': f'{destination} Lechon House',         'category': 'food', 'rating': 4.7,
         'latitude': base_lat+0.003, 'longitude': base_lon+0.009, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Seafood Grill',        'category': 'food', 'rating': 4.5,
         'latitude': base_lat-0.013, 'longitude': base_lon+0.007, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Carinderia Row',       'category': 'food', 'rating': 4.2,
         'latitude': base_lat+0.006, 'longitude': base_lon-0.011, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Fine Dining',          'category': 'food', 'rating': 4.8,
         'latitude': base_lat+0.009, 'longitude': base_lon+0.001, 'city': destination, 'tags': 'catering'},

        # Museums
        {'name': f'{destination} National Museum',      'category': 'museums', 'rating': 4.5,
         'latitude': base_lat+0.005, 'longitude': base_lon-0.008, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Cultural Center',      'category': 'museums', 'rating': 4.3,
         'latitude': base_lat+0.014, 'longitude': base_lon-0.010, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Heritage Museum',      'category': 'museums', 'rating': 4.2,
         'latitude': base_lat+0.016, 'longitude': base_lon-0.004, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Art Gallery',          'category': 'museums', 'rating': 4.1,
         'latitude': base_lat+0.006, 'longitude': base_lon+0.003, 'city': destination, 'tags': 'education'},

        # Nightlife
        {'name': f'{destination} Night Market',         'category': 'nightlife', 'rating': 4.5,
         'latitude': base_lat+0.008, 'longitude': base_lon-0.003, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Rooftop Bar',          'category': 'nightlife', 'rating': 4.4,
         'latitude': base_lat-0.004, 'longitude': base_lon-0.011, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Jazz & Chill Lounge',  'category': 'nightlife', 'rating': 4.6,
         'latitude': base_lat-0.008, 'longitude': base_lon-0.007, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Skybar',               'category': 'nightlife', 'rating': 4.7,
         'latitude': base_lat+0.007, 'longitude': base_lon-0.013, 'city': destination, 'tags': 'entertainment'},

        # Extra sightseeing filler for 7-day trips
        {'name': f'{destination} Old Church',           'category': 'sightseeing', 'rating': 4.4,
         'latitude': base_lat-0.005, 'longitude': base_lon-0.019, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Baywalk Promenade',    'category': 'sightseeing', 'rating': 4.3,
         'latitude': base_lat+0.012, 'longitude': base_lon+0.022, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Sunset Viewpoint',     'category': 'nature', 'rating': 4.8,
         'latitude': base_lat-0.020, 'longitude': base_lon+0.018, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Luxury Spa & Resort',  'category': 'sightseeing', 'rating': 4.9,
         'latitude': base_lat+0.004, 'longitude': base_lon-0.002, 'city': destination, 'tags': 'leisure'},
    ]
    return seed


# ─────────────────────────────────────────────
# DATABASE HELPERS
# ─────────────────────────────────────────────

def save_places_to_db(places):
    """
    Inserts places into DB using INSERT IGNORE to skip duplicates.
    Uses buffered=True to prevent 'Unread result' InternalError.
    Attaches the DB id back to each place dict for itinerary linking.
    """
    db     =get_db()
    cursor = db.cursor(buffered=True)

    for place in places:
        cursor.execute(
            """
            INSERT IGNORE INTO places
                (name, category, latitude, longitude, rating, city, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                place['name'], place['category'],
                place['latitude'], place['longitude'],
                place['rating'], place['city'], place['tags']
            )
        )
        db.commit()

        cursor.execute(
            "SELECT id FROM places WHERE name = %s AND city = %s",
            (place['name'], place['city'])
        )
        row = cursor.fetchone()
        if row:
            place['id'] = row[0]

    cursor.close()
    db.close()


def save_itinerary(user_id, destination, itinerary):
    """
    Saves a trip and all its day items to the DB.
    Returns the new itinerary ID.
    """
    db     = get_db()
    cursor = db.cursor(buffered=True)

    cursor.execute(
        "INSERT INTO itineraries (user_id, trip_name) VALUES (%s, %s)",
        (user_id, f'Trip to {destination}')
    )
    db.commit()
    itinerary_id = cursor.lastrowid

    for day_num, day_places in itinerary.items():
        for place in day_places:
            place_id = place.get('id')
            if place_id:
                cursor.execute(
                    """
                    INSERT INTO itinerary_items
                        (itinerary_id, day_number, place_id)
                    VALUES (%s, %s, %s)
                    """,
                    (itinerary_id, day_num, place_id)
                )
    db.commit()
    cursor.close()
    db.close()
    return itinerary_id


# ─────────────────────────────────────────────
# RECOMMENDATION ENGINE
# ─────────────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two GPS points."""
    R    = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a    = (math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(lat1)) *
            math.cos(math.radians(lat2)) *
            math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))

def score_place_ml(place, preferences, budget, num_days):
    """
    Uses the trained Random Forest model to predict how good of a match a place is.
    Returns a score from 0.0 to 10.0 based on prediction probability.
    """
    if ml_model is None or ml_columns is None:
        # Failsafe: if the model file is missing, use the old hardcoded logic
        return score_place(place, preferences, budget)

    # 1. Format the current place and user input to match our training CSV structure
    row = {
        'user_budget': budget,
        'user_days': num_days,
        'pref_food': 1 if 'food' in preferences else 0,
        'pref_beach': 1 if 'beach' in preferences else 0,
        'pref_nature': 1 if 'nature' in preferences else 0,
        'pref_museums': 1 if 'museums' in preferences else 0,
        'pref_nightlife': 1 if 'nightlife' in preferences else 0,
        'place_province': place.get('city', ''),  # 'city' key holds the destination in your current dicts
        'place_category': place.get('category', ''),
        'place_rating': float(place.get('rating') or 3.5),
    }
    
    # 2. Convert to DataFrame and apply One-Hot Encoding
    df = pd.DataFrame([row])
    df_encoded = pd.get_dummies(df, columns=['user_budget', 'place_province', 'place_category'])
    
    # 3. Align the columns so they match exactly what the model was trained on
    # (Fills any missing columns with 0)
    df_aligned = df_encoded.reindex(columns=ml_columns, fill_value=0)
    
    # 4. Predict the probability of a match (Class 1)
    # predict_proba returns an array like [[prob_class_0, prob_class_1]]
    match_probability = ml_model.predict_proba(df_aligned)[0][1]
    
    # Convert the 0.0 - 1.0 probability into a 0.0 - 10.0 score so your routing logic can rank them
    return match_probability * 10.0

def score_place(place, preferences, budget):
    """
    Scores a place using:
    - Preference alignment   (+3 per match)
    - Rating quality         (0–2 pts normalized)
    - Travel style modifier  (backpacker vs luxury)
    """
    score    = 0.0
    category = place.get('category', '').lower()
    tags     = (place.get('tags') or '').lower()

    # Preference alignment
    for pref in preferences:
        if pref.lower() in category or pref.lower() in tags:
            score += 3.0

    # Rating bonus
    rating  = float(place.get('rating') or 3.5)
    score  += (rating / 5.0) * 2.0

    # Travel style
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


def build_itinerary(places, preferences, num_days, budget, destination, dest_coords=None):
    """
    Full recommendation pipeline:
    1. Score all places using the AI Model
    2. Deduplicate by name
    3. Pad with PH seed data if needed
    4. Greedy nearest-neighbor routing
    5. Distribute sequentially into days (4 places/day)
    """
    PLACES_PER_DAY = 4
    total_needed   = num_days * PLACES_PER_DAY

    # ─── UPDATED: Score using the Machine Learning Model ───
    for place in places:
        place['score'] = score_place_ml(place, preferences, budget, num_days)

    # Sort + deduplicate
    scored = sorted(places, key=lambda p: p['score'], reverse=True)
    seen   = set()
    unique = []
    for p in scored:
        if p['name'] not in seen:
            seen.add(p['name'])
            unique.append(p)

    # Pad with PH seed data at correct coordinates
    if len(unique) < total_needed:
        seeds = get_ph_seed_places(destination, preferences, dest_coords)
        for s in seeds:
            if s['name'] not in seen:
                seen.add(s['name'])
                # ─── UPDATED: Score seed data using the ML Model ───
                s['score'] = score_place_ml(s, preferences, budget, num_days)
                unique.append(s)

    # Generic filler if still short
    pad   = 1
    b_lat = dest_coords['lat'] if dest_coords else 12.8797
    b_lon = dest_coords['lon'] if dest_coords else 121.7740

    while len(unique) < total_needed:
        cat = 'nightlife' if budget == 'high' else 'sightseeing'
        off = pad * 0.0015
        unique.append({
            'name'      : f'Hidden Gem Experience {pad}',
            'category'  : cat,
            'rating'    : 4.8 if budget == 'high' else 4.0,
            'latitude'  : b_lat + off,
            'longitude' : b_lon + off,
            'city'      : destination,
            'tags'      : 'leisure',
            'score'     : 1.0
        })
        pad += 1

    candidates = unique[:total_needed]
    if not candidates:
        return {}

    # Greedy nearest-neighbor routing
    ordered = []
    current = candidates.pop(0)
    ordered.append(current)

    while candidates:
        nearest = min(
            candidates,
            key=lambda p: haversine(
                current['latitude'], current['longitude'],
                p['latitude'],       p['longitude']
            )
        )
        candidates.remove(nearest)
        ordered.append(nearest)
        current = nearest

    # Distribute into days sequentially
    itinerary = {day: [] for day in range(1, num_days + 1)}
    for i, place in enumerate(ordered):
        day = (i // PLACES_PER_DAY) + 1
        if day <= num_days:
            itinerary[day].append(place)

    return itinerary





# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == '__main__':
    app.run(debug=True)
