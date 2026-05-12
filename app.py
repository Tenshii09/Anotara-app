# app.py — Anotara: Philippines Travel Planner
# Mapbox (maps + geocoding) + Geoapify (places)

from flask import (
    Flask, render_template, request,
    redirect, url_for, session, flash, jsonify
)
from flask_bcrypt import Bcrypt
import mysql.connector
import requests
import math
from config import Config
import pandas as pd
import joblib
import os

# ─────────────────────────────────────────────
# App Initialization
# ─────────────────────────────────────────────

app = Flask(__name__)
app.config.from_object(Config)
bcrypt = Bcrypt(app)

# ─────────────────────────────────────────────
# LOAD MACHINE LEARNING MODEL
# ─────────────────────────────────────────────
ML_MODEL_PATH = 'anotara_ml_model.pkl'
ML_COLUMNS_PATH = 'anotara_model_columns.pkl'

if os.path.exists(ML_MODEL_PATH) and os.path.exists(ML_COLUMNS_PATH):
    ml_model = joblib.load(ML_MODEL_PATH)
    ml_columns = joblib.load(ML_COLUMNS_PATH)
    print("✅ Machine Learning Model Loaded Successfully!")
else:
    ml_model = None
    ml_columns = None
    print("⚠️ ML Model not found. Falling back to rule-based scoring.")

# ── Philippines bounding box ──────────────────
# Used to validate that searched destinations are inside the Philippines
PH_BOUNDS = {
    'min_lat':  4.5,
    'max_lat': 21.5,
    'min_lon': 116.0,
    'max_lon': 127.0
}

# Popular Philippine destinations for autocomplete / suggestions
# Popular Philippine destinations for autocomplete / suggestions
# The 82 Official Philippine Provinces for autocomplete
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
# Database Helper
# ─────────────────────────────────────────────

def get_db():
    """Opens and returns a MySQL connection."""
    return mysql.connector.connect(
        host     = app.config['DB_HOST'],
        user     = app.config['DB_USER'],
        password = app.config['DB_PASSWORD'],
        database = app.config['DB_NAME'],
        port     = app.config.get('DB_PORT', '3306') # Added port
    )


def login_required(f):
    """Decorator — redirects to login if no active session."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to continue.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    """Register with username, email, hashed password."""
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')

        if not username or not email or not password:
            flash('All fields are required.', 'danger')
            return redirect(url_for('register'))

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return redirect(url_for('register'))

        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')

        db     = get_db()
        cursor = db.cursor(buffered=True)
        try:
            cursor.execute(
                "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                (username, email, hashed_pw)
            )
            db.commit()
            flash('Account created! Please log in.', 'success')
            return redirect(url_for('login'))
        except mysql.connector.IntegrityError:
            flash('Username or email already taken.', 'danger')
            return redirect(url_for('register'))
        finally:
            cursor.close()
            db.close()

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login with username or email + password."""
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password   = request.form.get('password', '')

        db     = get_db()
        cursor = db.cursor(dictionary=True, buffered=True)
        cursor.execute(
            "SELECT * FROM users WHERE username = %s OR email = %s",
            (identifier, identifier)
        )
        user = cursor.fetchone()
        cursor.close()
        db.close()

        if user and bcrypt.check_password_hash(user['password'], password):
            session['user_id']  = user['id']
            session['username'] = user['username']
            flash(f"Mabuhay, {user['username']}! 🇵🇭", 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid credentials. Try again.', 'danger')
            return redirect(url_for('login'))

    return render_template('login.html')


@app.route('/logout')
def logout():
    """Clear session and redirect to login."""
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────

@app.route('/dashboard', methods=['GET', 'POST'])
@login_required
def dashboard():
    """
    GET  — Show multi-step wizard form.
    POST — Validate PH destination, fetch places, build itinerary.
    """
    if request.method == 'POST':
        destination = request.form.get('destination', '').strip()
        num_days    = int(request.form.get('num_days', 3))
        budget      = request.form.get('budget', 'comfort')
        preferences = request.form.getlist('preferences')

        if not destination:
            flash('Please enter a destination.', 'warning')
            return redirect(url_for('dashboard'))

        # ── Step 1: Geocode with Mapbox (primary) ─────
        dest_coords = geocode_mapbox(destination)

        # ── Step 2: Validate destination is in Philippines
        if dest_coords and not is_in_philippines(dest_coords['lat'], dest_coords['lon']):
            flash(
                'This app is for Philippine destinations only. '
                'Please enter a city or island in the Philippines. 🇵🇭',
                'danger'
            )
            return redirect(url_for('dashboard'))

        # ── Step 3: Fetch places via Geoapify ─────────
        places = fetch_places(destination, preferences, dest_coords)

        if not places:
            flash('No places found. Try another Philippine destination.', 'warning')
            return redirect(url_for('dashboard'))

        # ── Step 4: Save places to DB ─────────────────
        save_places_to_db(places)

        # ── Step 5: Build itinerary ───────────────────
        itinerary = build_itinerary(
            places, preferences, num_days, budget, destination, dest_coords
        )

        # ── Step 6: Save itinerary ────────────────────
        itinerary_id = save_itinerary(session['user_id'], destination, itinerary)

        return render_template(
            'itinerary.html',
            itinerary    = itinerary,
            destination  = destination,
            num_days     = num_days,
            budget       = budget,
            preferences  = preferences,
            itinerary_id = itinerary_id,
            dest_coords  = dest_coords,
            mapbox_token = app.config['MAPBOX_TOKEN']
        )

    return render_template(
        'dashboard.html',
        destinations = PH_DESTINATIONS
    )


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
    if not token or token == 'YOUR_MAPBOX_TOKEN_HERE':
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
    url     = '[https://api.geoapify.com/v1/geocode/search](https://api.geoapify.com/v1/geocode/search)'
    params  = {
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
    db     = get_db()
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
# MY TRIPS
# ─────────────────────────────────────────────

@app.route('/my-trips')
@login_required
def my_trips():
    """All saved itineraries for the logged-in user."""
    db     = get_db()
    cursor = db.cursor(dictionary=True, buffered=True)
    cursor.execute(
        """
        SELECT i.id, i.trip_name, i.created_at,
               COUNT(ii.id) AS total_places
        FROM itineraries i
        LEFT JOIN itinerary_items ii ON i.id = ii.itinerary_id
        WHERE i.user_id = %s
        GROUP BY i.id
        ORDER BY i.created_at DESC
        """,
        (session['user_id'],)
    )
    trips = cursor.fetchall()
    cursor.close()
    db.close()
    return render_template('my_trips.html', trips=trips)


@app.route('/delete-trips', methods=['POST'])
@login_required
def delete_trips():
    """Bulk delete selected itineraries belonging to the current user."""
    itinerary_ids = request.form.getlist('trip_ids')

    if not itinerary_ids:
        flash('No trips selected.', 'warning')
        return redirect(url_for('my_trips'))

    db     = get_db()
    cursor = db.cursor(buffered=True)
    try:
        placeholders = ','.join(['%s'] * len(itinerary_ids))
        cursor.execute(
            f"DELETE FROM itineraries WHERE id IN ({placeholders}) AND user_id = %s",
            tuple(itinerary_ids) + (session['user_id'],)
        )
        db.commit()
        flash(f'Removed {cursor.rowcount} trip(s).', 'success')
    except mysql.connector.Error as e:
        flash(f'Error: {e}', 'danger')
    finally:
        cursor.close()
        db.close()

    return redirect(url_for('my_trips'))

@app.route('/trip/<int:trip_id>')
@login_required
def view_trip(trip_id):
    """Loads a saved trip from the database and displays it on the itinerary map."""
    db = get_db()
    cursor = db.cursor(dictionary=True, buffered=True)
    
    # 1. Verify the trip exists and belongs to this user
    cursor.execute(
        "SELECT * FROM itineraries WHERE id = %s AND user_id = %s",
        (trip_id, session['user_id'])
    )
    trip = cursor.fetchone()
    
    if not trip:
        flash('Trip not found.', 'danger')
        cursor.close()
        db.close()
        return redirect(url_for('my_trips'))
        
    # 2. Fetch all the saved places for this specific trip
    cursor.execute(
        """
        SELECT ii.day_number, p.* FROM itinerary_items ii
        JOIN places p ON ii.place_id = p.id
        WHERE ii.itinerary_id = %s
        ORDER BY ii.day_number ASC, ii.id ASC
        """,
        (trip_id,)
    )
    items = cursor.fetchall()
    cursor.close()
    db.close()
    
    # 3. Group the places back into days (e.g., Day 1, Day 2)
    itinerary = {}
    num_days = 0
    for item in items:
        day = item['day_number']
        if day > num_days:
            num_days = day
        if day not in itinerary:
            itinerary[day] = []
        itinerary[day].append(item)
        
    # 4. Extract the destination name (Removes "Trip to " from the title)
    destination = trip['trip_name'].replace('Trip to ', '')
    dest_coords = geocode_mapbox(destination)
    
    # 5. Render the exact same map template we use for new trips
    return render_template(
        'itinerary.html',
        itinerary=itinerary,
        destination=destination,
        num_days=num_days,
        budget='Saved Trip', # Fallback label
        preferences=[],      # Fallback label
        dest_coords=dest_coords,
        mapbox_token=app.config.get('MAPBOX_TOKEN', '')
    )


# ─────────────────────────────────────────────
# JSON API ENDPOINT
# ─────────────────────────────────────────────

@app.route('/api/itinerary', methods=['POST'])
@login_required
def api_generate():
    """JSON endpoint — same logic as dashboard POST."""
    data        = request.get_json()
    destination = data.get('destination', '')
    num_days    = int(data.get('num_days', 3))
    preferences = data.get('preferences', [])
    budget      = data.get('budget', 'comfort')

    dest_coords = geocode_mapbox(destination)

    if dest_coords and not is_in_philippines(dest_coords['lat'], dest_coords['lon']):
        return jsonify({'error': 'Destination must be in the Philippines.'}), 400

    places    = fetch_places(destination, preferences, dest_coords)
    itinerary = build_itinerary(
        places, preferences, num_days, budget, destination, dest_coords
    )

    return jsonify({
        'destination' : destination,
        'num_days'    : num_days,
        'dest_coords' : dest_coords,
        'itinerary'   : itinerary
    })


# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == '__main__':
    app.run(debug=True)
