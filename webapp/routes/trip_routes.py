"""Trip planning routes for the Anotara backend.

This blueprint turns submitted trip preferences into itinerary data and saves
generated trips back to the database.
"""
# TODO: Add error handling for geocoding failures, no places found, and DB issues.
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from webapp.services.database import save_itinerary, save_place_feedback, save_places_to_db
from webapp.services.trip_planning import (
    build_itinerary,
    fetch_places,
    geocode_mapbox,
    is_in_philippines,
)

trip_bp = Blueprint('trip', __name__)

# The /api/itinerary route is for generating a preview without saving, while /api/generate saves the itinerary to the DB and returns an ID for future reference.    
@trip_bp.route('/api/itinerary', methods=['POST'])
@jwt_required()
def api_itinerary():
    """Return an itinerary preview without persisting it."""
    data = request.get_json()

    destination = data.get('destination')
    num_days = int(data.get('num_days', 3))
    preferences = data.get('preferences', [])
    budget = data.get('budget', 'comfort')

    dest_coords = geocode_mapbox(destination)
    places = fetch_places(destination, preferences, dest_coords)
    itinerary = build_itinerary(places, preferences, num_days, budget, destination, dest_coords)

    return jsonify({
        'itinerary': itinerary,
        'dest_coords': dest_coords,
    }), 200


# This endpoint is separate from the preview route to allow the frontend to confirm before saving the generated itinerary to the DB.
@trip_bp.route('/api/generate', methods=['POST'])
@jwt_required()
def api_generate():
    """Generate, store, and return a finalized itinerary."""
    current_user_id = get_jwt_identity()
    data = request.get_json()

    destination = data.get('destination', '')
    num_days = int(data.get('num_days', 3))
    budget = data.get('budget', 'comfort')
    preferences = data.get('preferences', [])

    dest_coords = geocode_mapbox(destination)
    if dest_coords and not is_in_philippines(dest_coords['lat'], dest_coords['lon']):
        return jsonify({'error': 'Philippine destinations only 🇵🇭'}), 400

    places = fetch_places(destination, preferences, dest_coords)
    itinerary = build_itinerary(places, preferences, num_days, budget, destination, dest_coords)
    selected_places = [place for day_places in itinerary.values() for place in day_places]
    save_places_to_db(selected_places)
    itinerary_id = save_itinerary(current_user_id, destination, itinerary, num_days, budget, preferences)

    return jsonify({
        'itinerary': itinerary,
        'itinerary_id': itinerary_id,
        'dest_coords': dest_coords,
    }), 200


@trip_bp.route('/api/itinerary/<int:itinerary_id>/feedback', methods=['POST'])
@jwt_required()
def api_itinerary_feedback(itinerary_id):
    """Record explicit feedback for a generated itinerary stop."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    place_id = data.get('place_id')
    if not place_id:
        return jsonify({'error': 'place_id is required'}), 400

    raw_feedback = data.get('feedback')
    if raw_feedback in (1, True, '1', 'like', 'liked', 'up', 'positive'):
        feedback_value = 1
    elif raw_feedback in (0, False, '0', 'dislike', 'disliked', 'down', 'negative'):
        feedback_value = 0
    else:
        return jsonify({'error': 'feedback must be like or dislike'}), 400

    save_place_feedback(current_user_id, itinerary_id, place_id, feedback_value)
    return jsonify({'message': 'Feedback saved.'}), 200