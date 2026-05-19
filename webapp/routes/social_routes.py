"""Social, collaboration, voting, memory log, and hotel routes.

Every endpoint here goes through the helpers in `webapp.services.social` so
the route layer stays declarative and SQL-free.  Endpoints all require JWT
authentication unless explicitly stated.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from webapp.services.social import (
    add_collaborator,
    add_memory_entry,
    advance_vote_session,
    aggregate_vote_session,
    can_access_itinerary,
    create_vote_session,
    delete_memory,
    get_hotel_recommendation,
    get_vote_session,
    join_vote_session,
    list_collaborators,
    list_friends,
    list_memories,
    list_trip_activity,
    record_trip_activity,
    remove_collaborator,
    remove_friendship,
    respond_to_friend_request,
    search_users,
    send_friend_request,
    submit_vote,
    touch_collaborator_presence,
)

social_bp = Blueprint("social", __name__)


# ---------------------------------------------------------------------------
# Friend search / requests
# ---------------------------------------------------------------------------


@social_bp.route("/api/friends/search", methods=["GET"])
@jwt_required()
def api_friend_search():
    """Search users by username/email for the in-itinerary invite modal."""
    current_user_id = get_jwt_identity()
    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"results": []}), 200
    limit = request.args.get("limit", 8)
    results = search_users(current_user_id, query, limit=limit)
    return jsonify({"results": results}), 200


@social_bp.route("/api/friends/requests", methods=["POST"])
@jwt_required()
def api_send_friend_request():
    """Send (or refresh) a friend request to another user."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    addressee_id = data.get("user_id") or data.get("addressee_id")
    if not addressee_id:
        return jsonify({"error": "user_id is required"}), 400

    friendship, error = send_friend_request(current_user_id, addressee_id)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"friendship": friendship}), 201


@social_bp.route("/api/friends/requests/<int:friendship_id>", methods=["PATCH"])
@jwt_required()
def api_respond_friend_request(friendship_id):
    """Accept or decline an incoming friend request."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    decision = data.get("decision", "accepted")
    friendship, error = respond_to_friend_request(current_user_id, friendship_id, decision)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"friendship": friendship}), 200


@social_bp.route("/api/friends/<int:friend_id>", methods=["DELETE"])
@jwt_required()
def api_remove_friend(friend_id):
    """Remove an existing friendship (or cancel a pending request)."""
    current_user_id = get_jwt_identity()
    removed = remove_friendship(current_user_id, friend_id)
    if not removed:
        return jsonify({"error": "Friendship not found"}), 404
    return jsonify({"message": "Friendship removed."}), 200


@social_bp.route("/api/friends", methods=["GET"])
@jwt_required()
def api_list_friends():
    """Return the user's friends + pending requests in both directions."""
    current_user_id = get_jwt_identity()
    return jsonify(list_friends(current_user_id)), 200


# ---------------------------------------------------------------------------
# Trip collaborators
# ---------------------------------------------------------------------------


@social_bp.route("/api/itineraries/<int:itinerary_id>/collaborators", methods=["GET"])
@jwt_required()
def api_list_collaborators(itinerary_id):
    """Return the owner + collaborators currently editing the itinerary."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    touch_collaborator_presence(itinerary_id, current_user_id)
    return jsonify({"flock": list_collaborators(itinerary_id)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/collaborators", methods=["POST"])
@jwt_required()
def api_add_collaborator(itinerary_id):
    """Add a friend to an itinerary as a collaborator."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    role = data.get("role", "editor")
    add_collaborator(itinerary_id, user_id, current_user_id, role=role)
    record_trip_activity(itinerary_id, current_user_id, "collaborator_added", {"user_id": user_id})
    return jsonify({"flock": list_collaborators(itinerary_id)}), 201


@social_bp.route(
    "/api/itineraries/<int:itinerary_id>/collaborators/<int:user_id>",
    methods=["DELETE"],
)
@jwt_required()
def api_remove_collaborator(itinerary_id, user_id):
    """Remove a collaborator from the itinerary."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    removed = remove_collaborator(itinerary_id, user_id)
    if not removed:
        return jsonify({"error": "Collaborator not found"}), 404
    record_trip_activity(itinerary_id, current_user_id, "collaborator_removed", {"user_id": user_id})
    return jsonify({"flock": list_collaborators(itinerary_id)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/presence", methods=["POST"])
@jwt_required()
def api_collaborator_presence(itinerary_id):
    """Heartbeat endpoint used by the live collaboration ring on avatars."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    touch_collaborator_presence(itinerary_id, current_user_id)
    return jsonify({"flock": list_collaborators(itinerary_id)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/activity", methods=["GET"])
@jwt_required()
def api_trip_activity(itinerary_id):
    """Stream activity log entries that drive the toast notifications."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    since = request.args.get("since")
    limit = request.args.get("limit", 30)
    try:
        since_value = int(since) if since else None
    except ValueError:
        since_value = None
    try:
        limit_value = max(1, min(int(limit or 30), 80))
    except ValueError:
        limit_value = 30
    return jsonify({"activity": list_trip_activity(itinerary_id, since=since_value, limit=limit_value)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/activity", methods=["POST"])
@jwt_required()
def api_post_trip_activity(itinerary_id):
    """Allow the client to broadcast an action (e.g. block edited)."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    action = (data.get("action") or "").strip()
    if not action:
        return jsonify({"error": "action is required"}), 400
    record_trip_activity(itinerary_id, current_user_id, action, data.get("payload") or {})
    return jsonify({"message": "Activity recorded."}), 201


# ---------------------------------------------------------------------------
# Voting room (Tara Na! multiplayer wizard)
# ---------------------------------------------------------------------------


@social_bp.route("/api/vote-sessions", methods=["POST"])
@jwt_required()
def api_create_vote_session():
    """Create a Tara Na! voting room and return the share code."""
    current_user_id = get_jwt_identity()
    session, error = create_vote_session(current_user_id)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"session": session}), 201


@social_bp.route("/api/vote-sessions/join", methods=["POST"])
@jwt_required()
def api_join_vote_session():
    """Join an existing voting room via its session code."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    code = (data.get("session_code") or "").strip()
    if not code:
        return jsonify({"error": "session_code is required"}), 400
    session, error = join_vote_session(code, current_user_id)
    if error:
        return jsonify({"error": error}), 404
    return jsonify({"session": session}), 200


@social_bp.route("/api/vote-sessions/<int:session_id>", methods=["GET"])
@jwt_required()
def api_get_vote_session(session_id):
    """Poll the voting room's full state."""
    current_user_id = get_jwt_identity()
    session = get_vote_session(session_id, current_user_id)
    if not session:
        return jsonify({"error": "Lobby not found"}), 404
    return jsonify({"session": session}), 200


@social_bp.route("/api/vote-sessions/<int:session_id>/vote", methods=["POST"])
@jwt_required()
def api_submit_vote(session_id):
    """Submit a vote for one question in the voting room."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    question_key = (data.get("question_key") or "").strip()
    if not question_key:
        return jsonify({"error": "question_key is required"}), 400

    session, error = submit_vote(session_id, current_user_id, question_key, data.get("response"))
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"session": session}), 200


@social_bp.route("/api/vote-sessions/<int:session_id>/advance", methods=["POST"])
@jwt_required()
def api_advance_vote_session(session_id):
    """Host-only: jump the lobby to the next step."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    session, error = advance_vote_session(
        session_id,
        current_user_id,
        next_step=data.get("next_step"),
        status=data.get("status"),
    )
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"session": session}), 200


@social_bp.route("/api/vote-sessions/<int:session_id>/resolve", methods=["POST"])
@jwt_required()
def api_resolve_vote_session(session_id):
    """Aggregate votes into a single trip blueprint."""
    current_user_id = get_jwt_identity()
    session, error = aggregate_vote_session(session_id, current_user_id)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"session": session}), 200


# ---------------------------------------------------------------------------
# Memory Log
# ---------------------------------------------------------------------------


@social_bp.route("/api/itineraries/<int:itinerary_id>/items/<int:item_id>/memories", methods=["GET"])
@jwt_required()
def api_list_memories(itinerary_id, item_id):
    """Return memories attached to one itinerary block."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"memories": list_memories(itinerary_id, item_id)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/memories", methods=["GET"])
@jwt_required()
def api_list_all_memories(itinerary_id):
    """Return every memory captured across the entire trip."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"memories": list_memories(itinerary_id, None)}), 200


@social_bp.route("/api/itineraries/<int:itinerary_id>/items/<int:item_id>/memories", methods=["POST"])
@jwt_required()
def api_add_memory(itinerary_id, item_id):
    """Attach a photo or note memory to an itinerary block."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    kind = (data.get("kind") or "").lower()
    note = data.get("note")
    image_data = data.get("image_data")
    mime_type = data.get("mime_type")

    memory_id, error = add_memory_entry(
        itinerary_id,
        item_id,
        current_user_id,
        kind=kind,
        note=note,
        image_data=image_data,
        mime_type=mime_type,
    )
    if error:
        return jsonify({"error": error}), 400

    record_trip_activity(itinerary_id, current_user_id, f"memory_{kind}_added", {"item_id": item_id, "memory_id": memory_id})
    return jsonify({"memory_id": memory_id, "memories": list_memories(itinerary_id, item_id)}), 201


@social_bp.route("/api/memories/<int:memory_id>", methods=["DELETE"])
@jwt_required()
def api_delete_memory(memory_id):
    """Delete a memory you previously attached."""
    current_user_id = get_jwt_identity()
    deleted = delete_memory(memory_id, current_user_id)
    if not deleted:
        return jsonify({"error": "Memory not found"}), 404
    return jsonify({"message": "Memory removed."}), 200


# ---------------------------------------------------------------------------
# Apex Hotel Recommendation Engine
# ---------------------------------------------------------------------------


@social_bp.route("/api/itineraries/<int:itinerary_id>/hotels/<int:day_number>", methods=["GET"])
@jwt_required()
def api_get_hotel(itinerary_id, day_number):
    """Return the curated hotel recommendation for a particular day."""
    current_user_id = get_jwt_identity()
    if not can_access_itinerary(current_user_id, itinerary_id):
        return jsonify({"error": "Forbidden"}), 403

    refresh = request.args.get("refresh", "").lower() in {"1", "true", "yes"}
    budget = request.args.get("budget")
    hotel = get_hotel_recommendation(itinerary_id, day_number, refresh=refresh, budget=budget)
    if not hotel:
        return jsonify({"error": "No hotel candidate found"}), 404
    return jsonify({"hotel": hotel}), 200
