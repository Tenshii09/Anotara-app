"""Authentication routes for the Anotara backend.

This blueprint handles registration and login and returns JWTs to the frontend.
"""

import mysql.connector
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token

from webapp.extensions import bcrypt
from webapp.services.database import get_admin_account_by_identifier, get_db

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
        token = create_access_token(identity=str(user['id']), additional_claims={'is_admin': False})
        return jsonify({'token': token, 'username': user['username'], 'is_admin': False}), 200

    admin_account = get_admin_account_by_identifier(identifier)
    if admin_account and bcrypt.check_password_hash(admin_account['password_hash'], password):
        token = create_access_token(
            identity=f"admin:{admin_account['id']}",
            additional_claims={
                'is_admin': True,
                'admin_account_id': admin_account['id'],
                'admin_username': admin_account['username'],
            },
        )
        return jsonify({'token': token, 'username': admin_account['username'], 'is_admin': True}), 200

    return jsonify({'error': 'Invalid credentials'}), 401