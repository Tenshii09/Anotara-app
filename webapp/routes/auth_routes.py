"""Authentication routes for the Anotara backend.

This blueprint handles registration and login and returns JWTs to the frontend.
"""

import mysql.connector
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from webapp.extensions import bcrypt
from webapp.services.database import (
    delete_user_account,
    get_db,
    get_user_profile,
    update_user_preferences,
    update_user_profile_name,
)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/register', methods=['POST'])
def api_register():
    """Create a new user account if the username and email are available."""
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            'INSERT INTO users (username, email, password) VALUES (%s, %s, %s)',
            (username, email, hashed_pw),
        )
        db.commit()
        return jsonify({'message': 'Account created'}), 201
    except mysql.connector.IntegrityError:
        return jsonify({'error': 'Username/Email taken'}), 409
    finally:
        db.close()


@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    """Validate credentials and issue a JWT access token."""
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')

    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute('SELECT * FROM users WHERE username = %s OR email = %s', (identifier, identifier))
    user = cursor.fetchone()
    db.close()

    if user and bcrypt.check_password_hash(user['password'], password):
        token = create_access_token(identity=str(user['id']))
        return jsonify({'token': token, 'username': user['username']}), 200
    return jsonify({'error': 'Invalid credentials'}), 401


@auth_bp.route('/api/profile', methods=['GET'])
@jwt_required()
def api_get_profile():
    """Return the current user's profile details."""
    current_user_id = get_jwt_identity()
    profile = get_user_profile(current_user_id)
    if not profile:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(profile), 200


@auth_bp.route('/api/profile', methods=['PATCH'])
@jwt_required()
def api_update_profile():
    """Update editable profile fields for the current user."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    username = str(data.get('username') or '').strip()

    if not username:
        return jsonify({'error': 'username is required'}), 400

    if len(username) < 3:
        return jsonify({'error': 'username must be at least 3 characters'}), 400

    try:
        profile = update_user_profile_name(current_user_id, username)
    except mysql.connector.IntegrityError:
        return jsonify({'error': 'username is already taken'}), 409

    if not profile:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(profile), 200


@auth_bp.route('/api/profile/preferences', methods=['PATCH'])
@jwt_required()
def api_update_preferences():
    """Persist the algorithmic preference tuning matrix from the Profile screen."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}

    default_budget = data.get('default_budget')
    companion_vector = data.get('companion_vector')
    vibe_weights = data.get('vibe_weights')
    biometric_enabled = data.get('biometric_enabled')

    if default_budget is not None and default_budget not in {'low', 'comfort', 'high'}:
        return jsonify({'error': 'default_budget must be low, comfort, or high'}), 400

    if companion_vector is not None and not isinstance(companion_vector, list):
        return jsonify({'error': 'companion_vector must be a list of strings'}), 400

    if vibe_weights is not None:
        if not isinstance(vibe_weights, dict):
            return jsonify({'error': 'vibe_weights must be an object'}), 400
        cleaned_weights = {}
        for key, value in vibe_weights.items():
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                return jsonify({'error': f'vibe weight for {key} must be numeric'}), 400
            cleaned_weights[str(key)] = max(0.0, min(1.0, numeric))
        vibe_weights = cleaned_weights

    profile = update_user_preferences(
        current_user_id,
        default_budget=default_budget,
        companion_vector=companion_vector,
        vibe_weights=vibe_weights,
        biometric_enabled=biometric_enabled,
    )

    if not profile:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(profile), 200


@auth_bp.route('/api/account', methods=['DELETE'])
@jwt_required()
def api_delete_account():
    """Run the multi-stage destructive delete-account protocol."""
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    confirmation = str(data.get('confirmation') or '').strip().lower()

    if confirmation != 'delete my account':
        return jsonify({'error': 'Please type "delete my account" exactly to confirm.'}), 400

    deleted = delete_user_account(current_user_id)
    if not deleted:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({'message': 'Account permanently deleted.'}), 200