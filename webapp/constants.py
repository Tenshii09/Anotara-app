"""Shared constants for the Anotara backend.

This file keeps geography and category mappings in one place so the route and
service modules do not duplicate the same lists.
"""

PH_BOUNDS = {
    'min_lat': 4.5,
    'max_lat': 21.5,
    'min_lon': 116.0,
    'max_lon': 127.0,
}

# Used by fallback seed generation and destination validation.
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
    'Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay',
]

# Maps the user-facing interests to Geoapify place categories.
CATEGORY_MAP = {
    'food': 'catering.restaurant,catering.cafe,catering.fast_food',
    'beach': 'beach,leisure.park',
    'nature': 'natural,leisure.park,tourism.attraction',
    'museums': 'tourism.attraction,education.library',
    # Geoapify does not support entertainment.nightclub, so use categories it actually accepts.
    'nightlife': 'catering.bar,adult.nightclub,entertainment.cinema,entertainment.culture.theatre',
}
