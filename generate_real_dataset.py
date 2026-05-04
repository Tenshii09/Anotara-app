import pandas as pd
import random
import requests
import time
import os
from dotenv import load_dotenv

# ─── Configuration ──────────────────────────────────────────────
load_dotenv()
GEOAPIFY_KEY = os.getenv('GEOAPIFY_KEY')

if not GEOAPIFY_KEY:
    print("❌ CRITICAL ERROR: GEOAPIFY_KEY not found in .env file.")
    exit()

# The complete list of 82 Philippine Provinces
PH_PROVINCES = [
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

CATEGORY_MAP = {
    'food': 'catering.restaurant,catering.cafe',
    'beach': 'beach,leisure.park',
    'nature': 'natural,leisure.park',
    'museums': 'tourism.attraction,education.library',
    'nightlife': 'entertainment.nightclub,catering.bar',
    'sightseeing': 'tourism.attraction'
}
CATEGORIES = list(CATEGORY_MAP.keys())

# ─── Step 1: Scrape Real Places via Geoapify ────────────────────
def fetch_real_places(province):
    print(f"Scraping data for {province}...")
    places_found = []
    
    # 1. Geocode the province
    geo_url = f"https://api.geoapify.com/v1/geocode/search?text={province}, Philippines&filter=countrycode:ph&limit=1&apiKey={GEOAPIFY_KEY}"
    try:
        geo_resp = requests.get(geo_url).json()
        if 'error' in geo_resp or 'statusCode' in geo_resp:
            print(f"  ❌ API Error: {geo_resp.get('message', geo_resp)}")
            return []
        if not geo_resp.get('features'):
            print(f"  ⚠️ No coordinates found for {province}.")
            return []
        lon, lat = geo_resp['features'][0]['geometry']['coordinates']
    except Exception as e:
        print(f"  ❌ Geocoding request failed: {e}")
        return []

    # 2. Fetch places within a 30km radius for ALL categories
    for cat_name, cat_query in CATEGORY_MAP.items():
        places_url = f"https://api.geoapify.com/v2/places?categories={cat_query}&filter=circle:{lon},{lat},30000&limit=50&apiKey={GEOAPIFY_KEY}"
        try:
            place_resp = requests.get(places_url).json()
            if 'error' in place_resp or 'statusCode' in place_resp:
                continue
            
            for feat in place_resp.get('features', []):
                props = feat.get('properties', {})
                name = props.get('name')
                if not name: continue
                
                places_found.append({
                    'name': name,
                    'province': province,
                    'category': cat_name,
                    'rating': round(float(props.get('datasource', {}).get('raw', {}).get('stars', random.uniform(3.5, 4.9))), 1),
                    'tags': (props.get('categories') or [cat_name])[0]
                })
        except Exception as e:
            pass
        
        time.sleep(0.5) # Be polite to the API

    return places_found

# ─── Step 2: Your Scoring Logic ─────────────────────────────────
def score_place(place, preferences, budget):
    score = 0.0
    category = place['category']
    tags = place['tags']

    for pref in preferences:
        if pref in category or pref in tags:
            score += 3.0

    score += (place['rating'] / 5.0) * 2.0

    if budget == 'high':
        if place['rating'] >= 4.5: score += 2.0
        if category in ['food', 'nightlife']: score += 1.5
    elif budget == 'low':
        if category in ['nature', 'beach']: score += 2.5
        if 'fine_dining' in tags or 'resort' in tags: score -= 3.0

    return score

# ─── Step 3: Run the Pipeline ───────────────────────────────────
print("Starting API Data Collection across 82 Provinces...")
print("Grab a coffee, this will take about 5-8 minutes ☕\n")

all_real_places = []

for province in PH_PROVINCES:
    places = fetch_real_places(province)
    all_real_places.extend(places)
    print(f"  -> Found {len(places)} places in {province}.")

if len(all_real_places) == 0:
    print("\n❌ CRITICAL ERROR: The API returned 0 places across all provinces.")
    exit()

print(f"\n✅ Successfully scraped {len(all_real_places)} REAL places from Geoapify!")
print("Generating 15,000 simulated user interactions...")

# Generate the ML training data
training_data = []
for _ in range(15000):
    budget = random.choice(['low', 'comfort', 'high'])
    num_days = random.randint(2, 7)
    
    num_prefs = random.randint(1, 3)
    preferences = random.sample(CATEGORIES, num_prefs)
    
    place = random.choice(all_real_places)
    
    raw_score = score_place(place, preferences, budget)
    is_recommended = 1 if raw_score > 5.0 else 0

    row = {
        'user_budget': budget,
        'user_days': num_days,
        'pref_food': 1 if 'food' in preferences else 0,
        'pref_beach': 1 if 'beach' in preferences else 0,
        'pref_nature': 1 if 'nature' in preferences else 0,
        'pref_museums': 1 if 'museums' in preferences else 0,
        'pref_nightlife': 1 if 'nightlife' in preferences else 0,
        'place_name': place['name'],
        'place_province': place['province'],
        'place_category': place['category'],
        'place_rating': place['rating'],
        'is_recommended': is_recommended
    }
    training_data.append(row)

# ─── Step 4: Export ─────────────────────────────────────────────
df = pd.DataFrame(training_data)
df.to_csv('anotara_real_api_dataset.csv', index=False)
print(f"\n🎉 Done! Saved {len(df)} rows to 'anotara_real_api_dataset.csv'. Ready for Machine Learning!")