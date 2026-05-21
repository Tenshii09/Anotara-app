"""Authentication routes for the Anotara backend.

This blueprint handles registration and login and returns JWTs to the frontend.
"""

import hashlib

import mysql.connector
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from webapp.extensions import bcrypt, limiter
from webapp.security_utils import (
    EMAIL_PATTERN,
    USERNAME_PATTERN,
    parse_json_payload,
    validate_string_field,
)
from webapp.services.email_service import queue_email
from webapp.services.database import (
    create_user_account,
    delete_user_account,
    ensure_user_columns,
    get_db,
    get_user_auth_record_by_email,
    get_user_auth_record_by_id_and_email,
    get_user_profile,
    update_user_preferences,
    update_user_password,
    update_user_profile_name,
)

auth_bp = Blueprint('auth', __name__)
RESET_TOKEN_SALT = 'password-reset'
RESET_TOKEN_MAX_AGE_SECONDS = 30 * 60


def _build_login_response(user):
    """Issue short-lived access tokens plus a refresh cookie for silent renewal."""
    role = user.get('role') or 'user'
    identity = str(user['id'])
    claims = {'role': role}
    access_token = create_access_token(identity=identity, additional_claims=claims)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)
    response = jsonify({
        'token': access_token,
        'username': user['username'],
        'role': role,
    })
    set_refresh_cookies(response, refresh_token)
    return response


def _password_reset_serializer():
    secret_key = current_app.config['SECRET_KEY']
    return URLSafeTimedSerializer(secret_key, salt=RESET_TOKEN_SALT)


def _build_frontend_reset_url(token):
    frontend_url = str(current_app.config.get('FRONTEND_URL') or '').rstrip('/')
    if frontend_url:
        return f'{frontend_url}/reset-password/{token}'
    return f'/reset-password/{token}'


def _password_reset_fingerprint(password_hash):
    return hashlib.sha256(str(password_hash or '').encode('utf-8')).hexdigest()


def _load_user_from_reset_token(token):
    payload = _password_reset_serializer().loads(
        token,
        max_age=RESET_TOKEN_MAX_AGE_SECONDS,
    )
    user = get_user_auth_record_by_id_and_email(payload.get('user_id'), payload.get('email'))
    if not user:
        return None
    if payload.get('password_fingerprint') != _password_reset_fingerprint(user.get('password')):
        return None
    return user


def _get_active_user_for_refresh(user_id):
    """Load active account metadata before minting a replacement access token."""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            'SELECT id, username, role, account_status FROM users WHERE id = %s',
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        db.close()


@auth_bp.route('/api/register', methods=['POST'])
@limiter.limit('5 per minute')
def api_register():
    """Create a new user account if the username and email are available."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    username, error = validate_string_field(
        data,
        'username',
        min_length=3,
        max_length=50,
        pattern=USERNAME_PATTERN,
    )
    if error:
        return jsonify({'error': error}), 400

    email, error = validate_string_field(
        data,
        'email',
        min_length=5,
        max_length=100,
        pattern=EMAIL_PATTERN,
    )
    if error:
        return jsonify({'error': error}), 400

    password, error = validate_string_field(data, 'password', min_length=8, max_length=128)
    if error:
        return jsonify({'error': error}), 400

    if data.get('legal_consent') is not True:
        return jsonify({'error': 'Terms of Service and Privacy Policy consent is required'}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
    try:
        user_id = create_user_account(username, email, hashed_pw, legal_consent=True)
        queue_email({
            'recipient_user_id': user_id,
            'recipient_email': email,
            'recipient_name': username,
            'subject': 'Welcome to Ano Tara!',
            'template_name': 'welcome',
            'category': 'messages',
            'context': {'username': username},
        })
        return jsonify({'message': 'Account created'}), 201
    except mysql.connector.IntegrityError:
        return jsonify({'error': 'Username/Email taken'}), 409


@auth_bp.route('/api/login', methods=['POST'])
@limiter.limit('5 per minute')
def api_login():
    """Validate credentials and issue a JWT access token."""
    ensure_user_columns()
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    identifier, error = validate_string_field(data, 'identifier', min_length=3, max_length=100)
    if error:
        return jsonify({'error': error}), 400

    password, error = validate_string_field(data, 'password', min_length=1, max_length=128)
    if error:
        return jsonify({'error': error}), 400

    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute('SELECT * FROM users WHERE username = %s OR email = %s', (identifier, identifier))
    user = cursor.fetchone()
    db.close()

    if user and user.get('account_status') == 'suspended':
        return jsonify({'error': 'This account is suspended. Please contact an administrator.'}), 403

    if user and bcrypt.check_password_hash(user['password'], password):
        return _build_login_response(user), 200
    return jsonify({'error': 'Invalid credentials'}), 401


@auth_bp.route('/api/password-reset/request', methods=['POST'])
@limiter.limit('5 per minute')
def api_request_password_reset():
    """Send a short-lived password reset link when the email belongs to a user."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    email, error = validate_string_field(
        data,
        'email',
        min_length=5,
        max_length=100,
        pattern=EMAIL_PATTERN,
    )
    if error:
        return jsonify({'error': error}), 400

    generic_message = 'If that email is registered, a password reset link has been sent.'
    user = get_user_auth_record_by_email(email)
    if not user or user.get('account_status') == 'suspended':
        return jsonify({'message': generic_message}), 200

    token = _password_reset_serializer().dumps({
        'user_id': user['id'],
        'email': user['email'],
        'password_fingerprint': _password_reset_fingerprint(user.get('password')),
    })
    reset_url = _build_frontend_reset_url(token)

    queue_email({
        'recipient_user_id': user['id'],
        'recipient_email': user['email'],
        'recipient_name': user.get('username'),
        'subject': 'Reset your Ano Tara password',
        'template_name': 'password_reset',
        'category': 'security',
        'priority': 10,
        'context': {
            'username': user.get('username'),
            'reset_url': reset_url,
            'expires_minutes': 30,
        },
    })

    return jsonify({'message': generic_message}), 200


@auth_bp.route('/api/password-reset/validate/<token>', methods=['GET'])
@limiter.limit('20 per minute')
def api_validate_password_reset_token(token):
    """Allow the frontend reset form to reject expired or malformed tokens early."""
    try:
        user = _load_user_from_reset_token(token)
    except SignatureExpired:
        return jsonify({'error': 'Password reset link has expired.'}), 400
    except BadSignature:
        return jsonify({'error': 'Password reset link is invalid.'}), 400

    if not user or user.get('account_status') == 'suspended':
        return jsonify({'error': 'Password reset link is invalid.'}), 400

    return jsonify({'message': 'Password reset link is valid.'}), 200


@auth_bp.route('/api/password-reset/confirm', methods=['POST'])
@limiter.limit('5 per minute')
def api_confirm_password_reset():
    """Validate a password reset token, hash the new password, and persist it."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    token, error = validate_string_field(data, 'token', min_length=20, max_length=512)
    if error:
        return jsonify({'error': error}), 400

    password, error = validate_string_field(data, 'password', min_length=8, max_length=128)
    if error:
        return jsonify({'error': error}), 400

    try:
        user = _load_user_from_reset_token(token)
    except SignatureExpired:
        return jsonify({'error': 'Password reset link has expired.'}), 400
    except BadSignature:
        return jsonify({'error': 'Password reset link is invalid.'}), 400

    if not user or user.get('account_status') == 'suspended':
        return jsonify({'error': 'Password reset link is invalid.'}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
    if not update_user_password(user['id'], hashed_pw):
        return jsonify({'error': 'User not found'}), 404

    queue_email({
        'recipient_user_id': user['id'],
        'recipient_email': user['email'],
        'recipient_name': user.get('username'),
        'subject': 'Your Ano Tara password was changed',
        'template_name': 'password_changed',
        'category': 'security',
        'context': {'username': user.get('username')},
    })

    return jsonify({'message': 'Password updated. Please log in with your new password.'}), 200


@auth_bp.route('/api/refresh', methods=['POST'])
@jwt_required(refresh=True, locations=['cookies'])
def api_refresh():
    """Exchange the HttpOnly refresh cookie for a fresh access token."""
    current_user_id = get_jwt_identity()
    user = _get_active_user_for_refresh(current_user_id)

    if not user:
        response = jsonify({'error': 'User not found', 'code': 'user_not_found'})
        unset_jwt_cookies(response)
        return response, 404

    if user.get('account_status') == 'suspended':
        response = jsonify({
            'error': 'This account is suspended. Please contact an administrator.',
            'code': 'account_suspended',
        })
        unset_jwt_cookies(response)
        return response, 403

    role = user.get('role') or 'user'
    token = create_access_token(
        identity=str(user['id']),
        additional_claims={'role': role},
    )
    return jsonify({'token': token, 'username': user['username'], 'role': role}), 200


@auth_bp.route('/api/logout', methods=['POST'])
def api_logout():
    """Clear JWT cookies so the browser cannot silently refresh again."""
    response = jsonify({'message': 'Logged out'})
    unset_jwt_cookies(response)
    return response, 200


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
    email_preferences = data.get('email_preferences')
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

    if email_preferences is not None:
        if not isinstance(email_preferences, dict):
            return jsonify({'error': 'email_preferences must be an object'}), 400
        allowed_preferences = {'security', 'collaboration', 'itinerary_updates', 'weather_alerts', 'messages', 'marketing'}
        cleaned_preferences = {}
        for key, value in email_preferences.items():
            preference_key = str(key).strip().lower()
            if preference_key not in allowed_preferences:
                return jsonify({'error': f'invalid email preference: {key}'}), 400
            cleaned_preferences[preference_key] = bool(value)
        email_preferences = cleaned_preferences

    profile = update_user_preferences(
        current_user_id,
        default_budget=default_budget,
        companion_vector=companion_vector,
        vibe_weights=vibe_weights,
        email_preferences=email_preferences,
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

    profile = get_user_profile(current_user_id)
    deleted = delete_user_account(current_user_id)
    if not deleted:
        return jsonify({'error': 'User not found'}), 404

    if profile and profile.get('email'):
        queue_email({
            'recipient_email': profile.get('email'),
            'recipient_name': profile.get('username'),
            'subject': 'Your Ano Tara account was deleted',
            'template_name': 'account_deleted',
            'category': 'security',
            'context': {'username': profile.get('username')},
        })

    return jsonify({'message': 'Account permanently deleted.'}), 200