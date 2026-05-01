# app.py — Main Flask application
# Travel Planner with Auth + Recommendation Engine

from flask import (
    Flask, render_template, request,
    redirect, url_for, session, flash, jsonify
)

from flask_bcrypt import Bcrypt
import mysql.connector
import requests
import math
from config import Config

# ─────────────────────────────────────────────
# App Initialization
# ─────────────────────────────────────────────

app = Flask(__name__)
app.config.from_object(Config)
bcrypt = Bcrypt(app)


# ─────────────────────────────────────────────
# Database Helper
# ─────────────────────────────────────────────

def get_db():
    """
    Opens and returns a MySQL connection.
    Called at the start of each route that needs DB access.
    """
    return mysql.connector.connect(
        host     = app.config['DB_HOST'],
        user     = app.config['DB_USER'],
        password = app.config['DB_PASSWORD'],
        database = app.config['DB_NAME']
    )


def login_required(f):
    """
    Decorator: redirects to login if user is not in session.
    Wrap any route that requires authentication with @login_required.
    """
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
    """Root route — redirect to dashboard if logged in, else login."""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    """
    GET  — Show registration form.
    POST — Validate inputs, hash password, insert user into DB.
    """
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')

        # ── Basic validation ──────────────────────────
        if not username or not email or not password:
            flash('All fields are required.', 'danger')
            return redirect(url_for('register'))

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return redirect(url_for('register'))

        # ── Hash the password ─────────────────────────
        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')

        # ── Insert into DB ────────────────────────────
        db = get_db()
        cursor = db.cursor()
        try:
            cursor.execute(
                "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                (username, email, hashed_pw)  # prepared statement — safe from SQL injection
            )
            db.commit()
            flash('Account created! Please log in.', 'success')
            return redirect(url_for('login'))
        except mysql.connector.IntegrityError:
            # Triggered when username or email already exists (UNIQUE constraint)
            flash('Username or email already taken.', 'danger')
            return redirect(url_for('register'))
        finally:
            cursor.close()
            db.close()

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """
    GET  — Show login form.
    POST — Verify credentials, create session, redirect to dashboard.
    """
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()  # username OR email
        password   = request.form.get('password', '')

        db = get_db()
        cursor = db.cursor(dictionary=True)  # returns rows as dicts

        # Allow login with either username or email
        cursor.execute(
            "SELECT * FROM users WHERE username = %s OR email = %s",
            (identifier, identifier)
        )
        user = cursor.fetchone()
        cursor.close()
        db.close()

        # Verify user exists and password matches the stored hash
        if user and bcrypt.check_password_hash(user['password'], password):
            session['user_id']  = user['id']
            session['username'] = user['username']
            flash(f"Welcome back, {user['username']}!", 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid credentials. Try again.', 'danger')
            return redirect(url_for('login'))

    return render_template('login.html')


@app.route('/logout')
def logout():
    """Clear the session and send user back to login."""
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
# DASHBOARD — User Input
# ─────────────────────────────────────────────

@app.route('/dashboard', methods=['GET', 'POST'])
@login_required
def dashboard():
    """
    GET  — Show the trip planning form.
    POST — Collect inputs, fetch API data, run recommendation engine,
           save itinerary to DB, render results.
    """
    if request.method == 'POST':
        destination  = request.form.get('destination', '').strip()
        num_days     = int(request.form.get('num_days', 3))
        budget       = request.form.get('budget', 'medium')
        # Checkboxes return a list; getlist handles multiple selections
        preferences  = request.form.getlist('preferences')

        if not destination:
            flash('Please enter a destination.', 'warning')
            return redirect(url_for('dashboard'))

        # ── Step 1: Fetch places from API ─────────────
        places = fetch_places(destination, preferences)

        if not places:
            flash('No places found for that destination. Try another city.', 'warning')
            return redirect(url_for('dashboard'))

        # ── Step 2: Store fetched places in DB ────────
        place_ids = save_places_to_db(places)

        # ── Step 3: Run recommendation engine ─────────
        itinerary = build_itinerary(places, preferences, num_days, budget)

        # ── Step 4: Save itinerary to DB ──────────────
        itinerary_id = save_itinerary(session['user_id'], destination, itinerary)

        # ── Step 5: Render results ─────────────────────
        return render_template(
            'itinerary.html',
            itinerary    = itinerary,
            destination  = destination,
            num_days     = num_days,
            budget       = budget,
            preferences  = preferences,
            itinerary_id = itinerary_id
        )

    return render_template('dashboard.html')


# ─────────────────────────────────────────────
# API DATA FETCHING MODULE
# ─────────────────────────────────────────────

# Category mapping: user preference → Geoapify place category codes
CATEGORY_MAP = {
    'food'      : 'catering.restaurant,catering.cafe,catering.fast_food',
    'beach'     : 'beach,leisure.park',
    'nature'    : 'natural,leisure.park,tourism.attraction',
    'museums'   : 'tourism.attraction,education.library',
    'nightlife' : 'entertainment.nightclub,catering.bar',
}

def fetch_places(destination, preferences):
    """
    Calls Geoapify Places API to retrieve attractions for the destination.
    Prints errors to the terminal if the API fails!
    """
    api_key = app.config.get('GEOAPIFY_KEY', '')
    print(f"\n--- TRYING TO FETCH REAL DATA FOR: {destination} ---")
    print(f"Using API Key: {api_key[:5]}... (if this is empty, config.py is wrong!)")

    if preferences:
        categories = ','.join(CATEGORY_MAP.get(p, 'tourism.attraction') for p in preferences)
    else:
        categories = 'tourism.attraction,catering.restaurant,natural'

    # ── Step A: Geocode the destination to lat/lon ────
    geo_url = 'https://api.geoapify.com/v1/geocode/search'
    geo_params = {'text': destination, 'limit': 1, 'apiKey': api_key}

    try:
        geo_resp = requests.get(geo_url, params=geo_params, timeout=8)
        geo_data = geo_resp.json()
        
        # Catch API rejections (like Invalid Key)
        if geo_resp.status_code != 200:
            print(f"❌ GEOCODING API ERROR: {geo_data}")
            return get_seed_places(destination, preferences)

        coords = geo_data['features'][0]['geometry']['coordinates']
        lon, lat = coords[0], coords[1]
        print(f"✅ Geocoding Success! Found coordinates: Lat {lat}, Lon {lon}")

    except Exception as e:
        print(f"❌ GEOCODING CRASH: {e}")
        return get_seed_places(destination, preferences)

    # ── Step B: Fetch places around those coordinates ─
    places_url = 'https://api.geoapify.com/v2/places'
    places_params = {
        'categories' : categories,
        'filter'     : f'circle:{lon},{lat},10000',
        'limit'      : 40,
        'apiKey'     : api_key
    }

    try:
        resp = requests.get(places_url, params=places_params, timeout=10)
        data = resp.json()

        if resp.status_code != 200:
            print(f"❌ PLACES API ERROR: {data}")
            return get_seed_places(destination, preferences)

        features = data.get('features', [])
    except Exception as e:
        print(f"❌ PLACES FETCH CRASH: {e}")
        return get_seed_places(destination, preferences)

    # ── Step C: Normalize API response ─
    places = []
    for feat in features:
        props = feat.get('properties', {})
        geom  = feat.get('geometry', {})
        coords = geom.get('coordinates', [0, 0])

        raw_cat  = props.get('categories', ['tourism'])[0] if props.get('categories') else 'tourism'
        category = simplify_category(raw_cat)

        places.append({
            'name'      : props.get('name', 'Unknown Place'),
            'category'  : category,
            'latitude'  : coords[1],
            'longitude' : coords[0],
            'rating'    : round(props.get('datasource', {}).get('raw', {}).get('stars', 3.5) or 3.5, 1),
            'city'      : destination,
            'tags'      : raw_cat
        })

    print(f"✅ SUCCESS! Fetched {len(places)} real places from Geoapify.")
    return places if places else get_seed_places(destination, preferences)


def simplify_category(raw):
    """Maps verbose Geoapify category strings to simple labels."""
    mapping = {
        'catering'      : 'food',
        'beach'         : 'beach',
        'natural'       : 'nature',
        'leisure'       : 'nature',
        'tourism'       : 'sightseeing',
        'education'     : 'museums',
        'entertainment' : 'nightlife',
    }
    prefix = raw.split('.')[0]
    return mapping.get(prefix, 'sightseeing')


def get_seed_places(destination, preferences):
    """
    Fallback dataset used when the API is unavailable.
    Returns a curated list of generic places tagged to common categories.
    Useful for offline demos and testing.
    """
    seed = [
        {'name': f'{destination} Old Town',        'category': 'sightseeing', 'rating': 4.5, 'latitude': 14.5995, 'longitude': 120.9842, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} National Museum',  'category': 'museums',     'rating': 4.3, 'latitude': 14.5890, 'longitude': 120.9820, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Central Park',     'category': 'nature',      'rating': 4.2, 'latitude': 14.5780, 'longitude': 120.9910, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Beach Resort',     'category': 'beach',       'rating': 4.6, 'latitude': 14.5600, 'longitude': 121.0000, 'city': destination, 'tags': 'beach'},
        {'name': f'{destination} Night Market',     'category': 'nightlife',   'rating': 4.4, 'latitude': 14.5700, 'longitude': 120.9850, 'city': destination, 'tags': 'entertainment'},
        {'name': f'Casa {destination} Restaurant',  'category': 'food',        'rating': 4.1, 'latitude': 14.5950, 'longitude': 120.9900, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Rooftop Bar',      'category': 'nightlife',   'rating': 4.0, 'latitude': 14.5660, 'longitude': 120.9870, 'city': destination, 'tags': 'entertainment'},
        {'name': f'{destination} Heritage Walk',    'category': 'sightseeing', 'rating': 4.2, 'latitude': 14.5800, 'longitude': 120.9760, 'city': destination, 'tags': 'tourism'},
        {'name': f'{destination} Street Food Hub',  'category': 'food',        'rating': 4.3, 'latitude': 14.5910, 'longitude': 120.9835, 'city': destination, 'tags': 'catering'},
        {'name': f'{destination} Botanical Garden', 'category': 'nature',      'rating': 4.5, 'latitude': 14.5740, 'longitude': 120.9950, 'city': destination, 'tags': 'natural'},
        {'name': f'{destination} Art Gallery',      'category': 'museums',     'rating': 4.1, 'latitude': 14.5820, 'longitude': 120.9800, 'city': destination, 'tags': 'education'},
        {'name': f'{destination} Waterfront',       'category': 'beach',       'rating': 4.4, 'latitude': 14.5580, 'longitude': 121.0050, 'city': destination, 'tags': 'beach'},
    ]
    return seed


# ─────────────────────────────────────────────
# DATABASE SAVE HELPERS
# ─────────────────────────────────────────────

def save_places_to_db(places):
    """
    Inserts fetched places into the `places` table.
    Uses INSERT IGNORE to avoid duplicate entries on repeat trips.
    Returns list of inserted/existing place IDs.
    """
    db = get_db()
    # ADD buffered=True TO THIS LINE
    cursor = db.cursor(buffered=True) 
    
    ids = []
    for place in places:
        cursor.execute(
            """
            INSERT IGNORE INTO places (name, category, latitude, longitude, rating, city, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (place['name'], place['category'], place['latitude'],
             place['longitude'], place['rating'], place['city'], place['tags'])
        )
        db.commit()

        # Retrieve the ID (either newly inserted or existing)
        cursor.execute("SELECT id FROM places WHERE name = %s AND city = %s",
                       (place['name'], place['city']))
        row = cursor.fetchone()
        if row:
            place['id'] = row[0]  # Attach DB id back to the dict
            ids.append(row[0])

    cursor.close()
    db.close()
    return ids


def save_itinerary(user_id, destination, itinerary):
    """
    Saves the generated itinerary to the database under the logged-in user.
    Returns the new itinerary ID.
    """
    db = get_db()
    cursor = db.cursor()

    # Create the parent itinerary record
    cursor.execute(
        "INSERT INTO itineraries (user_id, trip_name) VALUES (%s, %s)",
        (user_id, f'Trip to {destination}')
    )
    db.commit()
    itinerary_id = cursor.lastrowid

    # Insert each place per day as an itinerary item
    for day_num, day_places in itinerary.items():
        for place in day_places:
            place_id = place.get('id')
            if place_id:
                cursor.execute(
                    "INSERT INTO itinerary_items (itinerary_id, day_number, place_id) VALUES (%s, %s, %s)",
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
    """
    Calculates the great-circle distance (km) between two GPS coordinates.
    Used to score proximity between places.
    """
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def score_place(place, preferences, budget):
    """
    Advanced scoring engine to differentiate between Luxury and Backpacker styles.
    """
    score = 0.0
    category = place.get('category', '').lower()
    tags = (place.get('tags') or '').lower()

    # 1. Preference Alignment (+3 points per match)
    for pref in preferences:
        if pref.lower() in category or pref.lower() in tags:
            score += 3.0

    # 2. Rating Quality (Normalized 0–2 points)
    rating = float(place.get('rating') or 3.5)
    score += (rating / 5.0) * 2.0

    # 3. Travel Style Intelligence
    if budget == 'high':
        # LUXURY: Prioritize the "Best of the Best" and high-end categories
        if rating >= 4.5:
            score += 2.0  # Huge bonus for elite ratings
        if category in ['food', 'nightlife']:
            score += 1.5  # Bonus for curated dining and entertainment
        if 'luxury' in tags or 'boutique' in tags:
            score += 2.0

    elif budget == 'low':
        # BACKPACKER: Prioritize beauty (Nature) and value (Street Food/Markets)
        if category in ['nature', 'beach']:
            score += 2.5  # Nature is beautiful and usually free/cheap
        if 'market' in tags or 'street_food' in tags:
            score += 2.0
        if category == 'food' and rating < 4.0:
            score += 1.0  # Favor local "hole-in-the-wall" spots that are still good
        
        # Penalty for places that are traditionally very expensive
        if 'fine_dining' in tags or 'resort' in tags:
            score -= 3.0 

    return score


def build_itinerary(places, preferences, num_days, budget):
    """
    Core recommendation engine with Geographical Routing.
    """
    PLACES_PER_DAY = 4  
    total_needed = num_days * PLACES_PER_DAY

    # 1. Score all places
    for place in places:
        place['score'] = score_place(place, preferences, budget)

    # 2. Sort by score and remove duplicates
    scored = sorted(places, key=lambda p: p['score'], reverse=True)
    seen = set()
    unique = []
    for p in scored:
        if p['name'] not in seen:
            seen.add(p['name'])
            unique.append(p)

    # Grab the top candidates
    candidates = unique[:total_needed]
    if not candidates:
        return {}

    # 3. GREEDY NEAREST NEIGHBOR ALGORITHM
    # Start the trip at the highest-rated place
    ordered_places = []
    current_place = candidates.pop(0)
    ordered_places.append(current_place)

    # Find the closest next place, move there, and repeat
    while candidates:
        nearest = min(candidates, key=lambda p: haversine(
            current_place['latitude'], current_place['longitude'],
            p['latitude'], p['longitude']
        ))
        candidates.remove(nearest)
        ordered_places.append(nearest)
        current_place = nearest

    # 4. Distribute into days sequentially (not round-robin!)
    # Day 1 gets the first 4 places grouped together, Day 2 gets the next 4, etc.
    itinerary = {day: [] for day in range(1, num_days + 1)}
    for i, place in enumerate(ordered_places):
        day = (i // PLACES_PER_DAY) + 1 
        if day <= num_days:
            itinerary[day].append(place)

    return itinerary


# ─────────────────────────────────────────────
# SAVED ITINERARIES VIEW
# ─────────────────────────────────────────────

@app.route('/my-trips')
@login_required
def my_trips():
    """Shows all itineraries saved by the logged-in user."""
    db = get_db()
    cursor = db.cursor(dictionary=True)
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


# ─────────────────────────────────────────────
# OPTIONAL JSON API ENDPOINT
# ─────────────────────────────────────────────

@app.route('/api/itinerary', methods=['POST'])
@login_required
def api_generate():
    """
    JSON endpoint — same logic as dashboard POST
    but returns JSON instead of rendering a template.
    Useful if you later build a mobile app frontend.
    """
    data        = request.get_json()
    destination = data.get('destination')
    num_days    = int(data.get('num_days', 3))
    preferences = data.get('preferences', [])
    budget      = data.get('budget', 'medium')

    places    = fetch_places(destination, preferences)
    itinerary = build_itinerary(places, preferences, num_days, budget)

    return jsonify({
        'destination' : destination,
        'num_days'    : num_days,
        'itinerary'   : itinerary
    })

@app.route('/delete-trips', methods=['POST'])
@login_required
def delete_trips():
    itinerary_ids = request.form.getlist('trip_ids')
    if not itinerary_ids:
        return redirect(url_for('my_trips'))

    db = get_db()
    cursor = db.cursor()
    format_strings = ','.join(['%s'] * len(itinerary_ids))
    query = f"DELETE FROM itineraries WHERE id IN ({format_strings}) AND user_id = %s"
    params = tuple(itinerary_ids) + (session['user_id'],)
    cursor.execute(query, params)
    db.commit()
    cursor.close()
    db.close()
    return redirect(url_for('my_trips'))
# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == '__main__':
    app.run(debug=True)

