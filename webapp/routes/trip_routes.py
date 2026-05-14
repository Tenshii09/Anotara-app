"""Trip planning routes for the Anotara backend.

This blueprint turns submitted trip preferences into itinerary data and saves
generated trips back to the database.
"""
# TODO: Add error handling for geocoding failures, no places found, and DB issues.

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from webapp.services.database import (
    get_itinerary_item_context,
    get_itinerary_overview,
    get_weather_alert_history,
    get_indoor_place_alternatives,
    save_itinerary,
    save_place_feedback,
    save_push_token,
    save_places_to_db,
    delete_push_token,
    swap_itinerary_item,
    update_itinerary_item_lock,
    update_itinerary_item_order,
)
from webapp.services.weather_monitor import build_weather_suggestion
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
    pacing_style = data.get('pacing_style', 'Moderate')
    companion_type = data.get('companion_type', 'Solo')
    transport_mode = data.get('transport_mode', 'Public')
    accommodation = data.get('accommodation', '')

    dest_coords = geocode_mapbox(destination)
    accommodation_coords = geocode_mapbox(accommodation) if accommodation else None
    if not accommodation_coords:
        accommodation_coords = dest_coords
    places = fetch_places(destination, preferences, dest_coords, {
        'pacing_style': pacing_style,
        'companion_type': companion_type,
        'transport_mode': transport_mode,
        'accommodation_coords': accommodation_coords,
    })
    itinerary = build_itinerary(places, preferences, num_days, budget, destination, dest_coords, {
        'pacing_style': pacing_style,
        'companion_type': companion_type,
        'transport_mode': transport_mode,
        'accommodation_coords': accommodation_coords,
    })

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
    pacing_style = data.get('pacing_style', 'Moderate')
    companion_type = data.get('companion_type', 'Solo')
    transport_mode = data.get('transport_mode', 'Public')
    accommodation = data.get('accommodation', '')

    dest_coords = geocode_mapbox(destination)
    if dest_coords and not is_in_philippines(dest_coords['lat'], dest_coords['lon']):
        return jsonify({'error': 'Philippine destinations only 🇵🇭'}), 400

    accommodation_coords = geocode_mapbox(accommodation) if accommodation else None
    if not accommodation_coords:
        accommodation_coords = dest_coords

    trip_context = {
        'pacing_style': pacing_style,
        'companion_type': companion_type,
        'transport_mode': transport_mode,
        'accommodation_coords': accommodation_coords,
    }

    places = fetch_places(destination, preferences, dest_coords, trip_context)
    itinerary = build_itinerary(places, preferences, num_days, budget, destination, dest_coords, trip_context)
    selected_places = [place for day_places in itinerary.values() for place in day_places]
    save_places_to_db(selected_places)
    itinerary_id = save_itinerary(
        current_user_id,
        destination,
        itinerary,
        num_days,
        budget,
        preferences,
        pacing_style=pacing_style,
        companion_type=companion_type,
        transport_mode=transport_mode,
        accommodation_lat=(accommodation_coords or {}).get('lat'),
        accommodation_lng=(accommodation_coords or {}).get('lon'),
    )

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


@trip_bp.route('/api/itineraries/<int:itinerary_id>/items/reorder', methods=['PATCH'])
@jwt_required()
def api_reorder_itinerary_items(itinerary_id):
    """Update the order of items within an itinerary."""
    data = request.get_json() or {}
    items = data.get('items', [])

    if not isinstance(items, list) or not items:
        return jsonify({'error': 'items must be a non-empty list'}), 400

    try:
        update_itinerary_item_order(itinerary_id, items)
        return jsonify({'message': 'Itinerary order updated.'}), 200
    except Exception as error:
        return jsonify({'error': 'Could not reorder itinerary items'}), 500


@trip_bp.route('/api/itineraries/<int:itinerary_id>/items/<int:item_id>/swap', methods=['POST'])
@jwt_required()
def api_swap_itinerary_item(itinerary_id, item_id):
    """Replace a single itinerary stop with a nearby stronger candidate."""
    swapped_item, error_message = swap_itinerary_item(itinerary_id, item_id)
    if error_message:
        return jsonify({'error': error_message}), 400

    return jsonify({'message': 'Swap completed.', 'item': swapped_item}), 200


@trip_bp.route('/api/itineraries/items/<int:item_id>/lock', methods=['PATCH'])
@jwt_required()
def api_lock_itinerary_item(item_id):
    """Toggle or explicitly set the lock state of one itinerary stop."""
    data = request.get_json() or {}
    itinerary_id = data.get('itinerary_id')
    if not itinerary_id:
        return jsonify({'error': 'itinerary_id is required'}), 400

    context = get_itinerary_item_context(itinerary_id, item_id)
    if not context:
        return jsonify({'error': 'Item not found'}), 404

    desired_lock = data.get('is_locked')
    if desired_lock is None:
        desired_lock = not bool(context.get('is_locked'))

    update_itinerary_item_lock(itinerary_id, item_id, desired_lock)
    return jsonify({'message': 'Lock updated.', 'is_locked': bool(desired_lock)}), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/smart-suggestion', methods=['GET'])
@jwt_required()
def api_smart_suggestion(itinerary_id):
    """Return a weather-aware suggestion banner for the saved itinerary."""
    suggestion = build_weather_suggestion(itinerary_id, persist=True)
    if not suggestion:
        return jsonify({'error': 'Itinerary not found'}), 404
    return jsonify(suggestion), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/weather-alerts', methods=['GET'])
@jwt_required()
def api_weather_alerts(itinerary_id):
    """Return stored weather alerts for an itinerary."""
    if not get_itinerary_overview(itinerary_id):
        return jsonify({'error': 'Itinerary not found'}), 404

    alert_history = get_weather_alert_history(itinerary_id)
    return jsonify({'alerts': alert_history}), 200


@trip_bp.route('/api/push-tokens', methods=['POST'])
@jwt_required()
def api_save_push_token():
    """Store a Firebase Cloud Messaging token for the current user."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'error': 'token is required'}), 400

    save_push_token(
        current_user_id,
        token,
        user_agent=request.user_agent.string,
        platform=data.get('platform', 'web'),
    )
    return jsonify({'message': 'Push token saved.'}), 200


@trip_bp.route('/api/push-tokens', methods=['DELETE'])
@jwt_required()
def api_delete_push_token():
    """Delete a Firebase Cloud Messaging token for the current user."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'token is required'}), 400

    delete_push_token(current_user_id, token)
    return jsonify({'message': 'Push token removed.'}), 200