"""Admin analytics, account management, and retraining routes for Sprint 5."""

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from webapp.services.admin_analytics import get_admin_analytics, retrain_model
from webapp.services.database import (
    create_admin_account,
    get_admin_account_by_id,
    get_db,
    list_admin_accounts,
    record_admin_activity,
    update_admin_account_password,
)
from webapp.extensions import bcrypt

admin_bp = Blueprint('admin', __name__)


def _split_csv_env(value):
    return {item.strip().lower() for item in (value or '').split(',') if item.strip()}


def _is_admin_user(user_id):
    # Admins can come from either the JWT claim-based admin accounts or the older env allowlist.
    claims = get_jwt()
    if claims.get('is_admin'):
        admin_account_id = claims.get('admin_account_id')
        if admin_account_id:
            return bool(get_admin_account_by_id(admin_account_id))
        return True

    allowed_usernames = _split_csv_env(current_app.config.get('ADMIN_USERNAMES'))
    allowed_emails = _split_csv_env(current_app.config.get('ADMIN_EMAILS'))

    if not allowed_usernames and not allowed_emails:
        return False

    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute('SELECT username, email FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        if not user:
            return False

        return (
            str(user.get('username') or '').lower() in allowed_usernames
            or str(user.get('email') or '').lower() in allowed_emails
        )
    finally:
        cursor.close()
        db.close()


@admin_bp.route('/api/admin/accounts', methods=['GET'])
@jwt_required()
def api_admin_accounts():
    """Return the current admin accounts for the settings panel."""
    current_user_id = get_jwt_identity()
    if not _is_admin_user(current_user_id):
        return jsonify({'error': 'Admin access required.'}), 403

    return jsonify({'accounts': list_admin_accounts()}), 200


@admin_bp.route('/api/admin/accounts', methods=['POST'])
@jwt_required()
def api_create_admin_account():
    """Create another admin account from the settings page."""
    current_user_id = get_jwt_identity()
    if not _is_admin_user(current_user_id):
        return jsonify({'error': 'Admin access required.'}), 403

    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not username or not email or not password:
        return jsonify({'error': 'username, email, and password are required'}), 400

    try:
        # Hash the password before storing it so the database never keeps raw credentials.
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        admin_account_id = create_admin_account(username, email, password_hash)
        record_admin_activity(
            str(current_user_id),
            'create_admin_account',
            target_type='admin_account',
            target_identifier=username,
            details={'email': email, 'admin_account_id': admin_account_id},
        )
    except Exception as error:
        message = str(error).lower()
        if 'duplicate' in message or 'unique' in message:
            return jsonify({'error': 'Username or email already exists.'}), 409
        return jsonify({'error': f'Could not create admin account: {error}'}), 500

    return jsonify({'message': 'Admin account created.', 'admin_account_id': admin_account_id}), 201


@admin_bp.route('/api/admin/accounts/<int:admin_account_id>/password', methods=['PATCH'])
@jwt_required()
def api_update_admin_password(admin_account_id):
    """Change the password for an existing admin account."""
    current_user_id = get_jwt_identity()
    if not _is_admin_user(current_user_id):
        return jsonify({'error': 'Admin access required.'}), 403

    data = request.get_json() or {}
    new_password = data.get('new_password') or ''

    if not new_password:
        return jsonify({'error': 'new_password is required'}), 400

    if not get_admin_account_by_id(admin_account_id):
        return jsonify({'error': 'Admin account not found.'}), 404

    # Password updates reuse the same hashing flow as account creation.
    password_hash = bcrypt.generate_password_hash(new_password).decode('utf-8')
    update_admin_account_password(admin_account_id, password_hash)
    record_admin_activity(
        str(current_user_id),
        'update_admin_password',
        target_type='admin_account',
        target_identifier=str(admin_account_id),
        details={'admin_account_id': admin_account_id},
    )
    return jsonify({'message': 'Admin password updated.'}), 200


@admin_bp.route('/api/admin/analytics', methods=['GET'])
@jwt_required()
def api_admin_analytics():
    """Return feedback analytics and model status for the admin dashboard."""
    current_user_id = get_jwt_identity()
    if not _is_admin_user(current_user_id):
        return jsonify({'error': 'Admin access required.'}), 403

    return jsonify(get_admin_analytics()), 200


@admin_bp.route('/api/admin/retrain', methods=['POST'])
@jwt_required()
def api_admin_retrain():
    """Trigger a reranker retraining run."""
    current_user_id = get_jwt_identity()
    if not _is_admin_user(current_user_id):
        return jsonify({'error': 'Admin access required.'}), 403

    try:
        # Retraining is intentionally isolated in a subprocess so the Flask request stays simple.
        result = retrain_model()
    except Exception as error:
        return jsonify({'error': f'Could not retrain model: {error}'}), 500

    if not result['success']:
        return jsonify({'error': 'Training finished with errors.', 'details': result}), 500

    record_admin_activity(
        str(current_user_id),
        'retrain_model',
        target_type='model_artifact',
        target_identifier='anotara_ml_model.pkl',
        details={
            'returncode': result.get('returncode'),
            'trained_at': result.get('trained_at'),
            'dataset_rows': result.get('model_status', {}).get('summary', {}).get('dataset_rows'),
        },
    )

    return jsonify(result), 200