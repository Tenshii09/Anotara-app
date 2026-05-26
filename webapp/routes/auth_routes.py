"""Authentication routes for the Anotara backend.

This blueprint handles registration and login and returns JWTs to the frontend.
"""

import hashlib
import hmac
import base64
from io import BytesIO
import secrets
from datetime import datetime, timedelta

import mysql.connector
import pyotp
import qrcode
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
    verify_jwt_in_request,
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
    create_login_otp_challenge,
    create_login_totp_challenge,
    consume_login_otp_challenge,
    delete_user_account,
    enable_user_totp,
    ensure_user_columns,
    get_admin_user_for_totp_challenge,
    get_login_otp_challenge,
    get_db,
    get_user_auth_record_by_email,
    get_user_auth_record_by_id_and_email,
    get_user_profile,
    log_audit_event,
    mark_login_otp_attempt,
    update_user_profile,
    update_user_preferences,
    update_user_password,
)

auth_bp = Blueprint('auth', __name__)
RESET_TOKEN_SALT = 'password-reset'
RESET_TOKEN_MAX_AGE_SECONDS = 30 * 60
OTP_CODE_LENGTH = 6
OTP_MAX_ATTEMPTS = 5
ADMIN_ROLES = {'admin', 'super_admin'}
TOTP_CHALLENGE_MINUTES = 10


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


def _is_admin_role(role):
    return str(role or '').strip() in ADMIN_ROLES


def _challenge_is_active(challenge):
    if not challenge or challenge.get('consumed_at'):
        return False
    expires_at = challenge.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    return bool(expires_at and expires_at >= datetime.utcnow())


def _build_totp_challenge_response(user):
    challenge_id = create_login_totp_challenge(
        user['id'],
        datetime.utcnow() + timedelta(minutes=TOTP_CHALLENGE_MINUTES),
    )
    needs_setup = not bool(user.get('totp_enabled')) or not user.get('totp_secret')
    return jsonify({
        'requires_totp_setup': needs_setup,
        'requires_totp': not needs_setup,
        'user_id': user['id'],
        'challenge_id': challenge_id,
        'role': user.get('role') or 'admin',
        'message': 'Authenticator setup required.' if needs_setup else 'Authenticator code required.',
    }), 200


def _verify_admin_totp_challenge(data):
    try:
        user_id = int(data.get('user_id'))
        challenge_id = int(data.get('challenge_id'))
    except (TypeError, ValueError):
        return None, jsonify({'error': 'Invalid authenticator challenge'}), 400

    challenge = get_admin_user_for_totp_challenge(challenge_id, user_id)
    if (
        not challenge
        or not _is_admin_role(challenge.get('role'))
        or challenge.get('account_status') != 'active'
        or not _challenge_is_active(challenge)
    ):
        return None, jsonify({'error': 'Invalid authenticator challenge'}), 400
    if int(challenge.get('attempts') or 0) >= OTP_MAX_ATTEMPTS:
        return None, jsonify({'error': 'Too many authenticator attempts'}), 400
    return challenge, None, None


def _qr_code_data_url(provisioning_uri):
    image = qrcode.make(provisioning_uri)
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    return f'data:image/png;base64,{encoded}'


def _generate_otp_code():
    """Return a cryptographically random six-digit numeric OTP."""
    return f'{secrets.randbelow(1_000_000):06d}'


def _hash_otp_code(code):
    secret_key = current_app.config['SECRET_KEY']
    return hashlib.sha256(f'{secret_key}:{code}'.encode('utf-8')).hexdigest()


def _send_login_otp(user, code, expires_minutes):
    """Deliver the login OTP using the configured transactional mail provider."""
    return queue_email({
        'recipient_user_id': user['id'],
        'recipient_email': user['email'],
        'recipient_name': user.get('username'),
        'subject': 'Your Ano Tara login verification code',
        'template_name': 'login_otp',
        'category': 'security',
        'priority': 5,
        'context': {
            'username': user.get('username'),
            'otp_code': code,
            'expires_minutes': expires_minutes,
        },
    })


def _request_context():
    """Capture request metadata for non-sensitive audit records."""
    return {
        'ip_address': request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip(),
        'user_agent': request.headers.get('User-Agent', ''),
    }


def _audit(event_type, *, actor_id=None, target_type=None, target_id=None, outcome='success', payload=None):
    context = _request_context()
    try:
        log_audit_event(
            event_type,
            actor_id=actor_id,
            target_type=target_type,
            target_id=target_id,
            outcome=outcome,
            payload=payload,
            ip_address=context['ip_address'],
            user_agent=context['user_agent'],
        )
    except Exception as error:  # pragma: no cover - audit must not block auth.
        current_app.logger.warning('Could not write audit event %s: %s', event_type, error)


def _password_reset_serializer():
    secret_key = current_app.config['SECRET_KEY']
    return URLSafeTimedSerializer(secret_key, salt=RESET_TOKEN_SALT)


def _build_frontend_reset_url(token):
    frontend_url = str(
        current_app.config.get('FRONTEND_URL') or 'http://localhost:5173'
    ).rstrip('/').replace('127.0.0.1', 'localhost')
    return f'{frontend_url}/reset-password?token={token}'


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


def _get_active_user_for_otp(user_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            'SELECT id, username, email, role, account_status FROM users WHERE id = %s',
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

    if 'newPassword' in data and 'password' not in data:
        data = {**data, 'password': data.get('newPassword')}
    password, error = validate_string_field(data, 'password', min_length=8, max_length=128)
    if error:
        return jsonify({'error': error}), 400

    if data.get('legal_consent') is not True:
        return jsonify({'error': 'Terms of Service and Privacy Policy consent is required'}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
    try:
        user_id = create_user_account(username, email, hashed_pw, legal_consent=True)
        _audit('auth.register', actor_id=user_id, target_type='user', target_id=user_id)
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
        _audit('auth.login', actor_id=user.get('id'), outcome='blocked', payload={'reason': 'account_suspended'})
        return jsonify({'error': 'This account is suspended. Please contact an administrator.'}), 403

    if user and bcrypt.check_password_hash(user['password'], password):
        if _is_admin_role(user.get('role')):
            _audit('auth.login.password_verified', actor_id=user.get('id'), payload={'mfa': 'totp'})
            return _build_totp_challenge_response(user)

        code = _generate_otp_code()
        expires_minutes = int(current_app.config.get('OTP_EXPIRES_MINUTES', 5))
        expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
        challenge_id = create_login_otp_challenge(
            user['id'],
            _hash_otp_code(code),
            expires_at,
        )
        delivery = _send_login_otp(user, code, expires_minutes)
        if delivery.get('skipped') or delivery.get('sent') is False:
            _audit('auth.login.otp_send', actor_id=user.get('id'), outcome='failure')
            return jsonify({'error': 'Could not send verification code. Please try again later.'}), 503
        _audit('auth.login.password_verified', actor_id=user.get('id'), payload={'challenge_id': challenge_id})
        return jsonify({
            'requires_otp': True,
            'user_id': user['id'],
            'challenge_id': challenge_id,
            'masked_email': _mask_email(user.get('email')),
            'expires_in_seconds': expires_minutes * 60,
            'message': 'Verification code sent to your email.',
        }), 200
    _audit('auth.login', outcome='failure', payload={'identifier': identifier[:100]})
    return jsonify({'error': 'Invalid credentials'}), 401


@auth_bp.route('/api/totp/generate', methods=['POST'])
@limiter.limit('10 per minute')
def api_totp_generate():
    """Generate an admin authenticator setup secret and QR code."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    challenge, error_response, status_code = _verify_admin_totp_challenge(data)
    if error_response:
        return error_response, status_code

    if bool(challenge.get('totp_enabled')) and challenge.get('totp_secret'):
        return jsonify({'error': 'Authenticator is already enabled.'}), 400

    try:
        secret = pyotp.random_base32()
        account_name = challenge.get('email') or challenge.get('username') or f"user-{challenge['id']}"
        provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
            name=account_name,
            issuer_name='Ano-Tara!',
        )
        qr_code = _qr_code_data_url(provisioning_uri)
    except Exception as error:
        current_app.logger.exception('Could not generate TOTP QR code: %s', error)
        _audit('auth.totp.generate', actor_id=challenge['id'], outcome='failure')
        return jsonify({
            'error': 'Failed to generate authenticator QR code.',
            'detail': str(error),
        }), 500

    _audit('auth.totp.generate', actor_id=challenge['id'])
    return jsonify({
        'secret': secret,
        'provisioning_uri': provisioning_uri,
        'qr_code': qr_code,
    }), 200


@auth_bp.route('/api/totp/enable', methods=['POST'])
@limiter.limit('10 per minute')
def api_totp_enable():
    """Verify and persist an admin authenticator secret."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    challenge, error_response, status_code = _verify_admin_totp_challenge(data)
    if error_response:
        return error_response, status_code

    secret, error = validate_string_field(data, 'secret', min_length=16, max_length=64)
    if error:
        return jsonify({'error': error}), 400
    code, error = validate_string_field(data, 'code', min_length=6, max_length=6)
    if error:
        return jsonify({'error': error}), 400
    if not code.isdigit() or not pyotp.TOTP(secret).verify(code, valid_window=1):
        mark_login_otp_attempt(challenge['challenge_id'])
        _audit('auth.totp.enable', actor_id=challenge['id'], outcome='failure')
        return jsonify({'error': 'Invalid authenticator code'}), 400

    enable_user_totp(challenge['id'], secret)
    consume_login_otp_challenge(challenge['challenge_id'])
    user = _get_active_user_for_otp(challenge['id'])
    _audit('auth.totp.enable', actor_id=challenge['id'])
    _audit('auth.login', actor_id=challenge['id'], payload={'totp_setup': True})
    return _build_login_response(user), 200


@auth_bp.route('/api/totp/verify', methods=['POST'])
@limiter.limit('10 per minute')
def api_totp_verify():
    """Verify an admin authenticator code and issue the final session."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    challenge, error_response, status_code = _verify_admin_totp_challenge(data)
    if error_response:
        return error_response, status_code

    code, error = validate_string_field(data, 'code', min_length=6, max_length=6)
    if error:
        return jsonify({'error': error}), 400
    if (
        not challenge.get('totp_secret')
        or not bool(challenge.get('totp_enabled'))
        or not code.isdigit()
        or not pyotp.TOTP(challenge['totp_secret']).verify(code, valid_window=1)
    ):
        mark_login_otp_attempt(challenge['challenge_id'])
        _audit('auth.totp.verify', actor_id=challenge['id'], outcome='failure')
        return jsonify({'error': 'Invalid authenticator code'}), 400

    consume_login_otp_challenge(challenge['challenge_id'])
    user = _get_active_user_for_otp(challenge['id'])
    _audit('auth.login', actor_id=challenge['id'], payload={'totp_verified': True})
    return _build_login_response(user), 200


def _mask_email(email):
    email = str(email or '')
    if '@' not in email:
        return email
    name, domain = email.split('@', 1)
    if len(name) <= 2:
        masked_name = f'{name[:1]}***'
    else:
        masked_name = f'{name[:2]}***{name[-1:]}'
    return f'{masked_name}@{domain}'


@auth_bp.route('/api/verify-otp', methods=['POST'])
@limiter.limit('10 per minute')
def api_verify_otp():
    """Validate a five-minute email OTP and issue the final JWT session."""
    data, error_response, status_code = parse_json_payload()
    if error_response:
        return error_response, status_code

    user_id = data.get('user_id')
    challenge_id = data.get('challenge_id')
    code, error = validate_string_field(
        data,
        'code',
        min_length=OTP_CODE_LENGTH,
        max_length=OTP_CODE_LENGTH,
    )
    if error:
        return jsonify({'error': error}), 400
    if not code.isdigit():
        return jsonify({'error': 'Invalid Code'}), 400

    try:
        user_id = int(user_id)
        challenge_id = int(challenge_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid OTP challenge'}), 400

    challenge = get_login_otp_challenge(challenge_id, user_id)
    if not challenge or challenge.get('consumed_at'):
        return jsonify({'error': 'Invalid Code'}), 400

    if int(challenge.get('attempts') or 0) >= OTP_MAX_ATTEMPTS:
        _audit('auth.login.otp_verify', actor_id=user_id, outcome='blocked', payload={'reason': 'too_many_attempts'})
        return jsonify({'error': 'Invalid Code'}), 400

    expires_at = challenge.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if not expires_at or expires_at < datetime.utcnow():
        _audit('auth.login.otp_verify', actor_id=user_id, outcome='expired')
        return jsonify({'error': 'Expired Code'}), 400

    expected_hash = str(challenge.get('code_hash') or '')
    provided_hash = _hash_otp_code(code)
    if not hmac.compare_digest(expected_hash, provided_hash):
        mark_login_otp_attempt(challenge_id)
        _audit('auth.login.otp_verify', actor_id=user_id, outcome='failure')
        return jsonify({'error': 'Invalid Code'}), 400

    user = _get_active_user_for_otp(user_id)
    if not user or user.get('account_status') == 'suspended':
        return jsonify({'error': 'Invalid OTP challenge'}), 400
    if not consume_login_otp_challenge(challenge_id):
        return jsonify({'error': 'Invalid Code'}), 400

    _audit('auth.login', actor_id=user_id, payload={'otp_verified': True})
    return _build_login_response(user), 200


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

    _audit('auth.password_reset.request', actor_id=user['id'], target_type='user', target_id=user['id'])

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

    _audit('auth.password_reset.confirm', actor_id=user['id'], target_type='user', target_id=user['id'])

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
    try:
        verify_jwt_in_request(optional=True)
        current_user_id = get_jwt_identity()
    except Exception:
        current_user_id = None
    if current_user_id:
        _audit('auth.logout', actor_id=current_user_id)
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
    has_username = 'username' in data
    username = str(data.get('username') or '').strip() if has_username else None
    has_profile_image = 'profile_image' in data
    profile_image = data.get('profile_image')

    if not has_username and not has_profile_image:
        return jsonify({'error': 'No profile fields supplied'}), 400

    if has_username and not username:
        return jsonify({'error': 'username is required'}), 400

    if has_username and len(username) < 3:
        return jsonify({'error': 'username must be at least 3 characters'}), 400

    if has_profile_image:
        if profile_image is not None and not isinstance(profile_image, str):
            return jsonify({'error': 'profile_image must be a string'}), 400
        allowed_image_prefixes = (
            'data:image/jpeg;',
            'data:image/png;',
            'data:image/webp;',
            'data:image/gif;',
        )
        if profile_image and not profile_image.startswith(allowed_image_prefixes):
            return jsonify({'error': 'profile_image must be a JPG, PNG, WebP, or GIF data URL'}), 400
        if profile_image and len(profile_image) > 750000:
            return jsonify({'error': 'profile_image is too large'}), 413

    try:
        profile = update_user_profile(
            current_user_id,
            username=username,
            profile_image=profile_image,
            profile_image_provided=has_profile_image,
        )
    except mysql.connector.IntegrityError:
        return jsonify({'error': 'username is already taken'}), 409

    if not profile:
        return jsonify({'error': 'User not found'}), 404

    _audit('profile.update', actor_id=current_user_id, target_type='user', target_id=current_user_id)
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

    _audit('profile.preferences.update', actor_id=current_user_id, target_type='user', target_id=current_user_id)
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

    _audit('account.delete', actor_id=current_user_id, target_type='user', target_id=current_user_id)

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