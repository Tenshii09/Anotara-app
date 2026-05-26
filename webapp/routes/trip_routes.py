"""Trip planning routes for the Anotara backend.

This blueprint turns submitted trip preferences into itinerary data and saves
generated trips back to the database.
"""
# TODO: Add error handling for geocoding failures, no places found, and DB issues.
from datetime import datetime
import json

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from webapp.services.email_service import queue_email
from webapp.services.database import (
    create_admin_notification_log,
    delete_itinerary_for_user,
    duplicate_itinerary_for_user,
    get_discover_feed,
    get_db,
    ensure_itinerary_metadata_columns,
    get_itinerary_item_context,
    get_itinerary_overview,
    get_user_profile,
    get_user_travel_stats,
    get_weather_alert_history,
    get_indoor_place_alternatives,
    list_user_notification_events,
    save_itinerary,
    save_place_feedback,
    save_push_token,
    save_places_to_db,
    delete_push_token,
    swap_itinerary_item,
    update_itinerary_start_date,
    update_itinerary_item_lock,
    update_itinerary_item_order,
)
from webapp.services.weather_monitor import build_weather_suggestion
from webapp.services.pitch_generator import generate_itinerary_pitch
from webapp.services.llm_itinerary import generate_llm_itinerary
from webapp.security_utils import sanitize_user_text
from webapp.security_utils import parse_int, parse_json_payload
from webapp.services.social import can_access_itinerary
from webapp.services.push_notifications import send_push_to_user, subscribe_token_to_topic
from webapp.services.trip_planning import (
    build_itinerary,
    fetch_places,
    geocode_mapbox,
    is_in_philippines,
)

trip_bp = Blueprint('trip', __name__)


@trip_bp.route('/api/dashboard/summary', methods=['GET'])
@jwt_required()
def api_dashboard_summary():
    """Return aggregated dashboard stats for the current user."""
    current_user_id = get_jwt_identity()
    stats = get_user_travel_stats(current_user_id)
    try:
        from webapp.services.database import log_audit_event
        log_audit_event('data.access.dashboard_summary', actor_id=current_user_id, target_type='dashboard')
    except Exception:
        current_app.logger.warning('Could not audit dashboard summary access.')
    return jsonify(stats), 200


@trip_bp.route('/api/discover/feed', methods=['GET'])
@jwt_required()
def api_discover_feed():
    """Return discover suggestions and trending destinations."""
    tag = request.args.get('tag', 'all')
    search_query = request.args.get('q', '')
    limit, error = parse_int(request.args.get('limit', 18), 'limit', minimum=1, maximum=50)
    if error:
        return jsonify({'error': error}), 400

    try:
        feed = get_discover_feed(tag=tag, search_query=search_query, limit=limit)
        return jsonify(feed), 200
    except ValueError:
        return jsonify({'error': 'Invalid discover feed parameters'}), 400


@trip_bp.route('/api/notifications', methods=['GET'])
@jwt_required()
def api_user_notifications():
    """Return notification-center events visible to the current user."""
    current_user_id = get_jwt_identity()
    try:
        from webapp.services.database import log_audit_event
        log_audit_event('data.access.notifications', actor_id=current_user_id, target_type='notification')
    except Exception:
        current_app.logger.warning('Could not audit notification access.')
    limit, error = parse_int(request.args.get('limit', 30), 'limit', minimum=1, maximum=80)
    if error:
        return jsonify({'error': error}), 400
    return jsonify(list_user_notification_events(
        current_user_id,
        limit=limit,
    )), 200

# The /api/itinerary route is for generating a preview without saving, while /api/generate saves the itinerary to the DB and returns an ID for future reference.    
@trip_bp.route('/api/itinerary', methods=['POST'])
@jwt_required()
def api_itinerary():
    """Return an itinerary preview without persisting it."""
    data = request.get_json() or {}

    destination = sanitize_user_text(data.get('destination'), max_length=180)
    if not destination:
        return jsonify({'error': 'destination is required'}), 400
    try:
        num_days = max(1, min(int(data.get('num_days', 3)), 14))
    except (TypeError, ValueError):
        return jsonify({'error': 'num_days must be an integer'}), 400
    preferences = data.get('preferences', [])
    if not isinstance(preferences, list):
        return jsonify({'error': 'preferences must be a list'}), 400
    preferences = [sanitize_user_text(item, max_length=40) for item in preferences[:10]]
    budget = sanitize_user_text(data.get('budget', 'comfort'), max_length=20) or 'comfort'
    pacing_style = sanitize_user_text(data.get('pacing_style', 'Moderate'), max_length=40) or 'Moderate'
    companion_type = sanitize_user_text(data.get('companion_type', 'Solo'), max_length=40) or 'Solo'
    transport_mode = sanitize_user_text(data.get('transport_mode', 'Public'), max_length=40) or 'Public'
    accommodation = sanitize_user_text(data.get('accommodation', ''), max_length=180)
    trip_start_date = data.get('trip_start_date')

    if trip_start_date is not None and str(trip_start_date).strip():
        try:
            trip_start_date = datetime.strptime(str(trip_start_date).strip(), '%Y-%m-%d').date().isoformat()
        except ValueError:
            return jsonify({'error': 'trip_start_date must be YYYY-MM-DD'}), 400
    else:
        trip_start_date = None

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


# Generates a short marketing-style pitch for the user's top 3 recommended places.
# Kept as its own endpoint so the frontend can render places instantly and
# fetch the AI pitch in a second, non-blocking request.
@trip_bp.route('/api/itinerary/pitch', methods=['POST'])
@jwt_required()
def api_itinerary_pitch():
    """Return a 1-3 sentence pitch for 3 places + a travel style.

    Expected JSON body:
        {
            "places":       [ {place obj}, {place obj}, {place obj} ],
            "travel_style": "Comfort" | "Couple" | "Backpacker" | ...
        }

    Response (clean JSON, ready for the React frontend):
        {
            "pitch":        "...",
            "travel_style": "Comfort",
            "place_names":  ["A", "B", "C"],
            "source":       "gemini"
        }
    """
    data = request.get_json() or {}
    places = data.get('places', [])
    travel_style = data.get('travel_style', '')

    if not isinstance(places, list) or not places:
        return jsonify({'error': 'places must be a non-empty list'}), 400

    try:
        result = generate_itinerary_pitch(places, travel_style)
        return jsonify(result), 200
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except RuntimeError as error:
        return jsonify({'error': str(error)}), 502


# LLM-powered itinerary generation. Distinct from the ML-driven /api/itinerary
# preview because the response is sourced entirely from Gemini under strict JSON
# mode, then validated server-side before being returned to the frontend.
@trip_bp.route('/api/itinerary/llm', methods=['POST'])
@jwt_required()
def api_itinerary_llm():
    """Generate a personalized itinerary from form data using an LLM.

    Expected JSON body (matches the TravelWizard form):
        {
            "destination":    "Palawan",
            "num_days":       3,                 # or "days"
            "preferences":    ["food", "beach"], # or "interests"
            "budget":         "Comfort",
            "pacing_style":   "Moderate",
            "companion_type": "Solo",
            "transport_mode": "Public"
        }

    Response (clean JSON the React frontend renders directly):
        {
            "destination": "...",
            "days": 3,
            "summary": "...",
            "itinerary": {
                "1": [ {location}, ... ],
                "2": [ ... ],
                "3": [ ... ]
            },
            "pacing_style": "Moderate",
            "budget": "Comfort",
            "source": "gemini"
        }
    """
    form_data = request.get_json() or {}

    try:
        result = generate_llm_itinerary(form_data)
        return jsonify(result), 200
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except RuntimeError as error:
        return jsonify({'error': str(error)}), 502


# This endpoint is separate from the preview route to allow the frontend to confirm before saving the generated itinerary to the DB.
@trip_bp.route('/api/generate', methods=['POST'])
@jwt_required()
def api_generate():
    """Generate, store, and return a finalized itinerary."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    destination = sanitize_user_text(data.get('destination', ''), max_length=180)
    if not destination:
        return jsonify({'error': 'destination is required'}), 400
    try:
        num_days = max(1, min(int(data.get('num_days', 3)), 14))
    except (TypeError, ValueError):
        return jsonify({'error': 'num_days must be an integer'}), 400
    budget = sanitize_user_text(data.get('budget', 'comfort'), max_length=20) or 'comfort'
    preferences = data.get('preferences', [])
    if not isinstance(preferences, list):
        return jsonify({'error': 'preferences must be a list'}), 400
    preferences = [sanitize_user_text(item, max_length=40) for item in preferences[:10]]
    pacing_style = sanitize_user_text(data.get('pacing_style', 'Moderate'), max_length=40) or 'Moderate'
    companion_type = sanitize_user_text(data.get('companion_type', 'Solo'), max_length=40) or 'Solo'
    transport_mode = sanitize_user_text(data.get('transport_mode', 'Public'), max_length=40) or 'Public'
    accommodation = sanitize_user_text(data.get('accommodation', ''), max_length=180)
    trip_start_date = data.get('trip_start_date')

    if trip_start_date is not None and str(trip_start_date).strip():
        try:
            trip_start_date = datetime.strptime(str(trip_start_date).strip(), '%Y-%m-%d').date().isoformat()
        except ValueError:
            return jsonify({'error': 'trip_start_date must be YYYY-MM-DD'}), 400
    else:
        trip_start_date = None

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
        trip_start_date=trip_start_date,
    )

    profile = get_user_profile(current_user_id)
    if profile and profile.get('email'):
        queue_email({
            'recipient_user_id': profile.get('id'),
            'recipient_email': profile.get('email'),
            'recipient_name': profile.get('username'),
            'subject': f'Your itinerary for {destination} was saved',
            'template_name': 'itinerary_saved',
            'category': 'itinerary_updates',
            'context': {
                'recipient_name': profile.get('username'),
                'destination': destination,
            },
        })

    return jsonify({
        'itinerary': itinerary,
        'itinerary_id': itinerary_id,
        'dest_coords': dest_coords,
        'trip_start_date': trip_start_date,
    }), 200


@trip_bp.route('/api/itinerary/<int:itinerary_id>/feedback', methods=['POST'])
@jwt_required()
def api_itinerary_feedback(itinerary_id):
    """Record explicit feedback for a generated itinerary stop."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    place_id, error = parse_int(data.get('place_id'), 'place_id', minimum=1)
    if error:
        return jsonify({'error': error}), 400

    raw_feedback = data.get('feedback')
    if raw_feedback in (1, True, '1', 'like', 'liked', 'up', 'positive'):
        feedback_value = 1
    elif raw_feedback in (0, False, '0', 'dislike', 'disliked', 'down', 'negative'):
        feedback_value = 0
    else:
        return jsonify({'error': 'feedback must be like or dislike'}), 400

    save_place_feedback(current_user_id, itinerary_id, place_id, feedback_value)
    try:
        from webapp.services.database import log_audit_event
        log_audit_event('itinerary.feedback', actor_id=current_user_id, target_type='itinerary', target_id=itinerary_id)
    except Exception:
        current_app.logger.warning('Could not audit itinerary feedback.')
    return jsonify({'message': 'Feedback saved.'}), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/items/reorder', methods=['PATCH'])
@jwt_required()
def api_reorder_itinerary_items(itinerary_id):
    """Update the order of items within an itinerary."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    items = data.get('items', [])

    if not isinstance(items, list) or not items:
        return jsonify({'error': 'items must be a non-empty list'}), 400

    try:
        update_itinerary_item_order(itinerary_id, items)
        try:
            from webapp.services.database import log_audit_event
            log_audit_event('itinerary.reorder', actor_id=current_user_id, target_type='itinerary', target_id=itinerary_id)
        except Exception:
            current_app.logger.warning('Could not audit itinerary reorder.')
        return jsonify({'message': 'Itinerary order updated.'}), 200
    except Exception as error:
        return jsonify({'error': 'Could not reorder itinerary items'}), 500


@trip_bp.route('/api/itineraries/<int:itinerary_id>', methods=['DELETE'])
@jwt_required()
def api_delete_itinerary(itinerary_id):
    """Permanently delete an itinerary owned by the current user."""
    current_user_id = get_jwt_identity()
    deleted = delete_itinerary_for_user(current_user_id, itinerary_id)
    if not deleted:
        return jsonify({'error': 'Itinerary not found'}), 404
    return jsonify({'message': 'Itinerary deleted.'}), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/duplicate', methods=['POST'])
@jwt_required()
def api_duplicate_itinerary(itinerary_id):
    """Copy an itinerary into a fresh Draft row for the current user."""
    current_user_id = get_jwt_identity()
    new_id = duplicate_itinerary_for_user(current_user_id, itinerary_id)
    if not new_id:
        return jsonify({'error': 'Itinerary not found'}), 404
    return jsonify({'message': 'Itinerary duplicated.', 'itinerary_id': new_id}), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/start-date', methods=['PATCH'])
@jwt_required()
def api_update_itinerary_start_date(itinerary_id):
    """Set or clear the trip start date for one itinerary."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    trip_start_date = data.get('trip_start_date')

    if trip_start_date is not None and str(trip_start_date).strip():
        try:
            from datetime import datetime
            parsed = datetime.strptime(str(trip_start_date).strip(), '%Y-%m-%d').date()
            trip_start_date = parsed.isoformat()
        except ValueError:
            return jsonify({'error': 'trip_start_date must be YYYY-MM-DD'}), 400
    else:
        trip_start_date = None

    updated = update_itinerary_start_date(current_user_id, itinerary_id, trip_start_date)
    if not updated:
        return jsonify({'error': 'Itinerary not found'}), 404

    if trip_start_date:
        itinerary = get_itinerary_overview(itinerary_id) or {}
        itinerary_data = itinerary.get('itinerary') or {}
        profile = get_user_profile(current_user_id)
        if profile and profile.get('email'):
            queue_email({
                'recipient_user_id': profile.get('id'),
                'recipient_email': profile.get('email'),
                'recipient_name': profile.get('username'),
                'subject': f'Your trip reminder for {itinerary_data.get("destination") or "your itinerary"} is set',
                'template_name': 'itinerary_start_date',
                'category': 'itinerary_updates',
                'send_at': f'{trip_start_date}T09:00:00',
                'context': {
                    'recipient_name': profile.get('username'),
                    'destination': itinerary_data.get('destination'),
                    'trip_start_date': trip_start_date,
                },
            })

    return jsonify({'message': 'Trip start date updated.', 'trip_start_date': trip_start_date}), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/items/<int:item_id>/swap', methods=['POST'])
@jwt_required()
def api_swap_itinerary_item(itinerary_id, item_id):
    """Replace a single itinerary stop with a nearby stronger candidate."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    preferred_place_id = data.get('preferred_place_id')
    prefer_indoor = bool(data.get('prefer_indoor'))

    swapped_item, error_message = swap_itinerary_item(
        itinerary_id,
        item_id,
        preferred_place_id=preferred_place_id,
        prefer_indoor=prefer_indoor,
    )
    if error_message:
        return jsonify({'error': error_message}), 400

    return jsonify({'message': 'Swap completed.', 'item': swapped_item}), 200


@trip_bp.route('/api/itineraries/items/<int:item_id>/lock', methods=['PATCH'])
@jwt_required()
def api_lock_itinerary_item(item_id):
    """Toggle or explicitly set the lock state of one itinerary stop."""
    current_user_id = get_jwt_identity()
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    itinerary_id, error = parse_int(data.get('itinerary_id'), 'itinerary_id', minimum=1)
    if error:
        return jsonify({'error': error}), 400
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403

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
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403
    suggestion = build_weather_suggestion(itinerary_id, persist=True)
    if not suggestion:
        return jsonify({'error': 'Itinerary not found'}), 404
    return jsonify(suggestion), 200


@trip_bp.route('/api/itineraries/<int:itinerary_id>/weather-alerts', methods=['GET'])
@jwt_required()
def api_weather_alerts(itinerary_id):
    """Return stored weather alerts for an itinerary."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({'error': 'Forbidden'}), 403
    if not get_itinerary_overview(itinerary_id):
        return jsonify({'error': 'Itinerary not found'}), 404

    alert_history = get_weather_alert_history(itinerary_id)
    return jsonify({'alerts': alert_history}), 200


@trip_bp.route('/api/push-tokens', methods=['POST'])
@jwt_required()
def api_save_push_token():
    """Store a Firebase Cloud Messaging token for the current user."""
    current_user_id = get_jwt_identity()
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'error': 'token is required'}), 400

    save_push_token(
        current_user_id,
        token,
        user_agent=request.user_agent.string,
        platform=data.get('platform', 'web'),
    )
    topic_subscription = subscribe_token_to_topic(token, 'all_users')
    return jsonify({
        'message': 'Push token saved.',
        'topic_subscription': topic_subscription,
    }), 200


@trip_bp.route('/api/push-tokens/test', methods=['POST'])
@jwt_required()
def api_send_test_push():
    """Send a real Firebase push notification to the current user's devices."""
    current_user_id = get_jwt_identity()
    payload = {
        'title': 'Ano-Tara! System Alert',
        'body': 'Test successful! Your push notifications are working perfectly.',
        'url': '/profile',
        'source': 'test',
        'tag': 'anotara-test-push',
        'icon': '/ano-tara-notification-icon.png',
        'badge': '/ano-tara-notification-icon.png',
    }
    delivery = send_push_to_user(current_user_id, payload)

    if delivery.get('skipped'):
        return jsonify({
            'error': delivery.get('reason') or 'Push delivery was skipped.',
            'delivery': delivery,
        }), 503

    if int(delivery.get('sent') or 0) == 0:
        delivery_errors = delivery.get('errors') or []
        first_error = delivery_errors[0].get('client_message') if delivery_errors else None
        return jsonify({
            'error': first_error or 'Firebase did not accept delivery for any registered device token.',
            'delivery': delivery,
        }), 502

    notification_id = create_admin_notification_log(
        current_user_id,
        'user',
        current_user_id,
        payload['title'],
        payload['body'],
        delivery,
    )
    return jsonify({
        'message': 'Remote push notification sent through Firebase.',
        'delivery': delivery,
        'notification_id': notification_id,
    }), 200


@trip_bp.route('/api/push-tokens', methods=['DELETE'])
@jwt_required()
def api_delete_push_token():
    """Delete a Firebase Cloud Messaging token for the current user."""
    current_user_id = get_jwt_identity()
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'token is required'}), 400

    delete_push_token(current_user_id, token)
    return jsonify({'message': 'Push token removed.'}), 200

# ========================================================================
# This endpoint returns a list of the user's saved itineraries with basic info for display in the itinerary list page. Detailed info for each itinerary is fetched separately when viewing an itinerary's details.
@trip_bp.route('/api/itineraries', methods=['GET'])
@jwt_required()
def get_saved_itineraries():
    current_user_id = get_jwt_identity()
    ensure_itinerary_metadata_columns()

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                id,
                destination,
                budget,
                num_days AS days,
                preferences,
                status,
                trip_start_date,
                created_at
            FROM itineraries
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (current_user_id,)
        )

        itineraries = cursor.fetchall()

        for trip in itineraries:
            if trip.get("created_at"):
                trip["created_at"] = trip["created_at"].strftime("%Y-%m-%d")
            if trip.get("trip_start_date"):
                trip["trip_start_date"] = trip["trip_start_date"].strftime("%Y-%m-%d")

        return jsonify(itineraries), 200

    except Exception as error:
        current_app.logger.exception("Error fetching itineraries: %s", error)
        return jsonify({"error": "Failed to fetch itineraries"}), 500

    finally:
        cursor.close()
        db.close()


# This endpoint returns detailed info for a single itinerary, including the list of places grouped by day and ordered by sequence. This is used to display the full itinerary when viewing an individual trip. The itinerary overview page only fetches basic info for all itineraries, while this details endpoint is called when viewing a specific itinerary.
@trip_bp.route('/api/itineraries/<int:itinerary_id>', methods=['GET'])
@jwt_required()
def get_saved_itinerary_details(itinerary_id):
    current_user_id = get_jwt_identity()

    try:
        overview = get_itinerary_overview(itinerary_id)

        if not overview:
            return jsonify({"error": "Itinerary not found"}), 404

        trip = overview.get("itinerary")
        items = overview.get("items", [])

        if not can_access_itinerary(current_user_id, itinerary_id):
            return jsonify({"error": "You are not allowed to view this itinerary"}), 403

        itinerary = {}

        for item in items:
            day = str(item.get("day_number"))

            if day not in itinerary:
                itinerary[day] = []

            itinerary[day].append({
                "item_id": item.get("item_id"),
                "place_id": item.get("place_id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "lat": float(item["latitude"]) if item.get("latitude") is not None else None,
                "lon": float(item["longitude"]) if item.get("longitude") is not None else None,
                "rating": float(item["rating"]) if item.get("rating") is not None else 0,
                "city": item.get("city"),
                "tags": item.get("tags"),
                "environment_type": item.get("environment_type"),
                "physical_intensity": item.get("physical_intensity"),
                "sequence_order": item.get("sequence_order"),
                "estimated_duration": item.get("estimated_duration"),
                "recommended_minutes": item.get("estimated_duration"),
                "is_locked": bool(item.get("is_locked")),
                "swap_history": item.get("swap_history", 0),
            })

        response = {
            "id": trip.get("id"),
            "itinerary_id": trip.get("id"),
            "trip_name": trip.get("trip_name"),
            "destination": trip.get("destination"),
            "budget": trip.get("budget"),
            "num_days": trip.get("num_days"),
            "preferences": trip.get("preferences"),
            "pacing_style": trip.get("pacing_style"),
            "companion_type": trip.get("companion_type"),
            "transport_mode": trip.get("transport_mode"),
            "accommodation_lat": float(trip["accommodation_lat"]) if trip.get("accommodation_lat") is not None else None,
            "accommodation_lng": float(trip["accommodation_lng"]) if trip.get("accommodation_lng") is not None else None,
            "status": trip.get("status"),
            "trip_start_date": trip.get("trip_start_date").strftime("%Y-%m-%d")
            if trip.get("trip_start_date") else None,
            "itinerary": itinerary,
            "dest_coords": {
                "lat": float(trip["accommodation_lat"]) if trip.get("accommodation_lat") is not None else None,
                "lon": float(trip["accommodation_lng"]) if trip.get("accommodation_lng") is not None else None,
            },
        }

        return jsonify(response), 200

    except Exception as error:
        current_app.logger.exception("Error fetching itinerary details: %s", error)
        return jsonify({"error": "Failed to fetch itinerary details"}), 500