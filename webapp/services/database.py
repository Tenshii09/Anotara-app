"""Database helpers for the Anotara backend.

These functions isolate raw MySQL access so route handlers stay short and
focused on request/response logic.
"""

import hashlib
import json
import csv
import tempfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import mysql.connector
from flask import current_app


def get_db():
    """Open and return a MySQL connection using the active Flask config."""
    return mysql.connector.connect(
        host=current_app.config['DB_HOST'],
        user=current_app.config['DB_USER'],
        password=current_app.config['DB_PASSWORD'],
        database=current_app.config['DB_NAME'],
        port=current_app.config.get('DB_PORT', '3306'),
    )


def get_table_columns(table_name):
    """Return the column names available for a given table."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """,
            (current_app.config['DB_NAME'], table_name),
        )
        return {row[0] for row in cursor.fetchall()}
    finally:
        cursor.close()
        db.close()

def ensure_user_columns():
    """Add optional user columns used by profile tuning and admin RBAC.

    Preference columns power the Profile "Algorithmic Preference Tuning Matrix"
    so future Tara Na! wizard runs inherit explicit user preferences. The role
    column is the backend source of truth for privileged admin access.
    """
    existing_columns = get_table_columns('users')
    missing_columns = []

    if 'role' not in existing_columns:
        missing_columns.append("ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'")
    if 'default_budget' not in existing_columns:
        missing_columns.append("ADD COLUMN default_budget VARCHAR(20) DEFAULT 'comfort'")
    if 'companion_vector' not in existing_columns:
        missing_columns.append("ADD COLUMN companion_vector JSON NULL")
    if 'vibe_weights' not in existing_columns:
        missing_columns.append("ADD COLUMN vibe_weights JSON NULL")
    if 'email_preferences' not in existing_columns:
        missing_columns.append("ADD COLUMN email_preferences JSON NULL")
    if 'biometric_enabled' not in existing_columns:
        missing_columns.append("ADD COLUMN biometric_enabled BOOLEAN DEFAULT FALSE")
    if 'account_status' not in existing_columns:
        missing_columns.append("ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'")
    if 'suspended_at' not in existing_columns:
        missing_columns.append('ADD COLUMN suspended_at DATETIME NULL')
    if 'suspended_reason' not in existing_columns:
        missing_columns.append('ADD COLUMN suspended_reason VARCHAR(255) NULL')

    if not missing_columns:
        return

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(f"ALTER TABLE users {', '.join(missing_columns)}")
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_user_preference_columns():
    """Backward-compatible wrapper for older service callers."""
    ensure_user_columns()


def get_user_profile(user_id):
    """Return the basic profile payload for one user."""
    ensure_user_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
                 SELECT id, username, email, default_budget, companion_vector,
                     vibe_weights, email_preferences, biometric_enabled, role, created_at
            FROM users
            WHERE id = %s
            """,
            (int(user_id),),
        )
        profile = cursor.fetchone()
        if not profile:
            return None

        for json_key in ('companion_vector', 'vibe_weights', 'email_preferences'):
            raw_value = profile.get(json_key)
            if isinstance(raw_value, str):
                try:
                    profile[json_key] = json.loads(raw_value)
                except (TypeError, ValueError):
                    profile[json_key] = None

        if profile.get('created_at'):
            profile['member_since'] = profile['created_at'].strftime('%Y-%m-%d')

        return profile
    finally:
        cursor.close()
        db.close()


def update_user_preferences(user_id, *, default_budget=None, companion_vector=None, vibe_weights=None, email_preferences=None, biometric_enabled=None):
    """Persist a partial update of the user's algorithmic preferences."""
    ensure_user_columns()

    assignments = []
    params = []

    if default_budget is not None:
        assignments.append('default_budget = %s')
        params.append(str(default_budget)[:20])
    if companion_vector is not None:
        assignments.append('companion_vector = %s')
        params.append(json.dumps(companion_vector))
    if vibe_weights is not None:
        assignments.append('vibe_weights = %s')
        params.append(json.dumps(vibe_weights))
    if email_preferences is not None:
        assignments.append('email_preferences = %s')
        params.append(json.dumps(email_preferences))
    if biometric_enabled is not None:
        assignments.append('biometric_enabled = %s')
        params.append(bool(biometric_enabled))

    if not assignments:
        return get_user_profile(user_id)

    params.append(int(user_id))

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            f"UPDATE users SET {', '.join(assignments)} WHERE id = %s",
            tuple(params),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()

    return get_user_profile(user_id)


def delete_user_account(user_id):
    """Permanently expunge a user's data from the system.

    Foreign key cascades take care of itineraries, items, feedback, and tokens
    once the parent users row is deleted.
    """
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute('DELETE FROM users WHERE id = %s', (int(user_id),))
        db.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        db.close()


def update_user_profile_name(user_id, username):
    """Update a user's username and return the new profile row."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE users
            SET username = %s
            WHERE id = %s
            """,
            (username, int(user_id)),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()

    return get_user_profile(user_id)


def get_user_travel_stats(user_id):
    """Return aggregate travel stats for one user."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_trips,
                COALESCE(SUM(num_days), 0) AS total_days,
                COUNT(DISTINCT destination) AS unique_destinations
            FROM itineraries
            WHERE user_id = %s
            """,
            (int(user_id),),
        )
        stats = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT destination, COUNT(*) AS trip_count
            FROM itineraries
            WHERE user_id = %s AND destination IS NOT NULL AND destination <> ''
            GROUP BY destination
            ORDER BY trip_count DESC, MAX(created_at) DESC
            LIMIT 1
            """,
            (int(user_id),),
        )
        top_destination = cursor.fetchone()

        return {
            'total_trips': int(stats.get('total_trips') or 0),
            'total_days': int(stats.get('total_days') or 0),
            'unique_destinations': int(stats.get('unique_destinations') or 0),
            'top_destination': top_destination.get('destination') if top_destination else None,
        }
    finally:
        cursor.close()
        db.close()


def get_discover_feed(tag='all', search_query='', limit=18):
    """Return discover suggestions and trending destinations."""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    safe_limit = max(1, min(int(limit or 18), 30))
    safe_query = str(search_query or '').strip()
    safe_tag = str(tag or 'all').strip().lower()

    place_conditions = []
    place_params = []

    if safe_query:
        like_value = f"%{safe_query}%"
        place_conditions.append("(name LIKE %s OR city LIKE %s OR tags LIKE %s)")
        place_params.extend([like_value, like_value, like_value])

    if safe_tag == 'nature':
        place_conditions.append("(category LIKE %s OR tags LIKE %s)")
        place_params.extend(['%nature%', '%nature%'])
    elif safe_tag == 'food':
        place_conditions.append("(category LIKE %s OR tags LIKE %s)")
        place_params.extend(['%food%', '%food%'])
    elif safe_tag == 'beach':
        place_conditions.append("(category LIKE %s OR tags LIKE %s)")
        place_params.extend(['%beach%', '%beach%'])
    elif safe_tag == 'culture':
        place_conditions.append("(category LIKE %s OR tags LIKE %s OR tags LIKE %s)")
        place_params.extend(['%museum%', '%culture%', '%history%'])
    elif safe_tag == 'nightlife':
        place_conditions.append("(category LIKE %s OR tags LIKE %s OR tags LIKE %s)")
        place_params.extend(['%night%', '%nightlife%', '%bar%'])

    where_sql = f"WHERE {' AND '.join(place_conditions)}" if place_conditions else ""

    try:
        cursor.execute(
            f"""
            SELECT id, name, city, category, rating, tags
            FROM places
            {where_sql}
            ORDER BY id DESC, rating DESC
            LIMIT %s
            """,
            tuple(place_params + [safe_limit]),
        )
        suggestions = cursor.fetchall()

        trending_conditions = ["destination IS NOT NULL", "destination <> ''"]
        trending_params = []
        if safe_query:
            like_value = f"%{safe_query}%"
            trending_conditions.append("destination LIKE %s")
            trending_params.append(like_value)

        cursor.execute(
            f"""
            SELECT destination, COUNT(*) AS trip_count
            FROM itineraries
            WHERE {' AND '.join(trending_conditions)}
            GROUP BY destination
            ORDER BY trip_count DESC, MAX(created_at) DESC
            LIMIT 5
            """,
            tuple(trending_params),
        )
        trending = cursor.fetchall()

        return {
            'suggestions': suggestions,
            'trending': [
                {
                    'destination': row.get('destination'),
                    'score': f"{int(row.get('trip_count') or 0)} saved trip"
                    + ("s" if int(row.get('trip_count') or 0) != 1 else ""),
                }
                for row in trending
            ],
        }
    finally:
        cursor.close()
        db.close()


def _json_safe_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json_safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe_value(item) for item in value]
    return value


def ensure_itinerary_metadata_columns():
    """Add itinerary metadata columns when the database is still on the old schema."""
    existing_columns = get_table_columns('itineraries')
    missing_columns = []

    if 'destination' not in existing_columns:
        missing_columns.append('ADD COLUMN destination VARCHAR(100)')
    if 'budget' not in existing_columns:
        missing_columns.append('ADD COLUMN budget VARCHAR(20)')
    if 'num_days' not in existing_columns:
        missing_columns.append('ADD COLUMN num_days INT')
    if 'preferences' not in existing_columns:
        missing_columns.append('ADD COLUMN preferences JSON')
    if 'pacing_style' not in existing_columns:
        missing_columns.append("ADD COLUMN pacing_style VARCHAR(20) DEFAULT 'Moderate'")
    if 'companion_type' not in existing_columns:
        missing_columns.append("ADD COLUMN companion_type VARCHAR(30) DEFAULT 'Solo'")
    if 'transport_mode' not in existing_columns:
        missing_columns.append("ADD COLUMN transport_mode VARCHAR(20) DEFAULT 'Public'")
    if 'accommodation_lat' not in existing_columns:
        missing_columns.append('ADD COLUMN accommodation_lat DECIMAL(10, 7)')
    if 'accommodation_lng' not in existing_columns:
        missing_columns.append('ADD COLUMN accommodation_lng DECIMAL(10, 7)')
    if 'status' not in existing_columns:
        missing_columns.append("ADD COLUMN status VARCHAR(20) DEFAULT 'Active'")
    if 'trip_start_date' not in existing_columns:
        missing_columns.append('ADD COLUMN trip_start_date DATE NULL')

    if not missing_columns:
        return

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(f"ALTER TABLE itineraries {', '.join(missing_columns)}")
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_place_metadata_columns():
    """Add place metadata columns needed for smarter filtering and monitoring."""
    existing_columns = get_table_columns('places')
    missing_columns = []

    if 'environment_type' not in existing_columns:
        missing_columns.append("ADD COLUMN environment_type VARCHAR(20) DEFAULT 'Mixed'")
    if 'physical_intensity' not in existing_columns:
        missing_columns.append("ADD COLUMN physical_intensity VARCHAR(20) DEFAULT 'Medium'")
    if 'status' not in existing_columns:
        missing_columns.append("ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published'")
    if 'curation_notes' not in existing_columns:
        missing_columns.append('ADD COLUMN curation_notes TEXT NULL')
    if 'source' not in existing_columns:
        missing_columns.append("ADD COLUMN source VARCHAR(40) DEFAULT 'system'")
    if 'updated_at' not in existing_columns:
        missing_columns.append('ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    if 'updated_by' not in existing_columns:
        missing_columns.append('ADD COLUMN updated_by INT NULL')

    if not missing_columns:
        return

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(f"ALTER TABLE places {', '.join(missing_columns)}")
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_itinerary_item_columns():
    """Add itinerary item columns needed for granular editing."""
    existing_columns = get_table_columns('itinerary_items')
    missing_columns = []

    if 'sequence_order' not in existing_columns:
        missing_columns.append('ADD COLUMN sequence_order INT NOT NULL DEFAULT 1')
    if 'estimated_duration' not in existing_columns:
        missing_columns.append('ADD COLUMN estimated_duration INT DEFAULT 60')
    if 'is_locked' not in existing_columns:
        missing_columns.append('ADD COLUMN is_locked BOOLEAN DEFAULT FALSE')
    if 'swap_history' not in existing_columns:
        missing_columns.append('ADD COLUMN swap_history INT DEFAULT 0')

    if not missing_columns:
        return

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(f"ALTER TABLE itinerary_items {', '.join(missing_columns)}")
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_feedback_columns():
    """Upgrade feedback storage to support future rating labels and notes."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS trip_feedback (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id   INT NOT NULL,
                user_id        INT NOT NULL,
                place_id       INT NOT NULL,
                rating_type    VARCHAR(20) NOT NULL,
                feedback_notes TEXT,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_trip_feedback (itinerary_id, user_id, place_id),
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (place_id)     REFERENCES places(id) ON DELETE CASCADE
            )
            """
        )

        existing_columns = get_table_columns('trip_feedback')
        if 'rating_type' not in existing_columns:
            cursor.execute("ALTER TABLE trip_feedback ADD COLUMN rating_type VARCHAR(20) NOT NULL DEFAULT 'Best Pick'")
        if 'feedback_notes' not in existing_columns:
            cursor.execute('ALTER TABLE trip_feedback ADD COLUMN feedback_notes TEXT')
        if 'feedback_value' in existing_columns:
            cursor.execute('UPDATE trip_feedback SET rating_type = CASE WHEN feedback_value = 1 THEN \'Best Pick\' ELSE \'Not Ideal\' END WHERE rating_type IS NULL OR rating_type = \'\'')
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_weather_alert_columns():
    """Create the table used to persist weather alerts and smart suggestions."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_alerts (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id INT NOT NULL,
                alert_key    VARCHAR(100) NOT NULL,
                alert_type   VARCHAR(40) NOT NULL,
                headline     VARCHAR(200) NOT NULL,
                message      TEXT NOT NULL,
                payload      JSON,
                is_active    BOOLEAN DEFAULT TRUE,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                resolved_at  DATETIME NULL,
                notification_signature VARCHAR(128),
                notification_sent_at DATETIME NULL,
                UNIQUE KEY unique_weather_alert (itinerary_id, alert_key),
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
            )
            """
        )

        existing_columns = get_table_columns('weather_alerts')
        if 'notification_signature' not in existing_columns:
            cursor.execute('ALTER TABLE weather_alerts ADD COLUMN notification_signature VARCHAR(128)')
        if 'notification_sent_at' not in existing_columns:
            cursor.execute('ALTER TABLE weather_alerts ADD COLUMN notification_sent_at DATETIME NULL')
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_push_token_columns():
    """Create the table used to persist Firebase Cloud Messaging tokens."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS push_tokens (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                user_id         INT NOT NULL,
                token           TEXT NOT NULL,
                token_hash      CHAR(64) NOT NULL,
                platform        VARCHAR(40) DEFAULT 'web',
                user_agent      VARCHAR(255),
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_push_token (user_id, token_hash),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def save_push_token(user_id, token, user_agent=None, platform='web'):
    """Persist or refresh an FCM token for one user."""
    ensure_push_token_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        cursor.execute(
            """
            INSERT INTO push_tokens
                (user_id, token, token_hash, platform, user_agent)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                token = VALUES(token),
                platform = VALUES(platform),
                user_agent = VALUES(user_agent),
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                user_id,
                token,
                token_hash,
                platform,
                user_agent,
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def delete_push_token(user_id, token):
    """Remove an FCM token for one user."""
    ensure_push_token_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        cursor.execute(
            """
            DELETE FROM push_tokens
            WHERE user_id = %s AND token_hash = %s
            """,
            (user_id, token_hash),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def list_push_tokens(user_id):
    """Return all stored FCM tokens for a user."""
    ensure_push_token_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, user_id, token, token_hash, platform, user_agent, created_at, updated_at
            FROM push_tokens
            WHERE user_id = %s
            ORDER BY updated_at DESC, id DESC
            """,
            (user_id,),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def save_places_to_db(places):
    """
    Insert places into DB using INSERT IGNORE to skip duplicates.
    Attaches the DB id back to each place dict for itinerary linking.
    """
    # Insert or reuse place rows, then attach the database id back to each item.
    ensure_place_metadata_columns()
    db = get_db()
    cursor = db.cursor(buffered=True)
    place_columns = get_table_columns('places')

    try:
        for place in places:
            place_environment = place.get('environment_type', 'Mixed')
            place_intensity = place.get('physical_intensity', 'Medium')
            if 'environment_type' in place_columns and 'physical_intensity' in place_columns:
                cursor.execute(
                    """
                    INSERT IGNORE INTO places
                        (name, category, latitude, longitude, rating, city, tags, environment_type, physical_intensity)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        place['name'], place['category'],
                        place['latitude'], place['longitude'],
                        place['rating'], place['city'], place['tags'],
                        place_environment, place_intensity,
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT IGNORE INTO places
                        (name, category, latitude, longitude, rating, city, tags)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        place['name'], place['category'],
                        place['latitude'], place['longitude'],
                        place['rating'], place['city'], place['tags'],
                    ),
                )
            db.commit()

            cursor.execute(
                "SELECT id FROM places WHERE name = %s AND city = %s",
                (place['name'], place['city']),
            )
            row = cursor.fetchone()
            if row:
                place['id'] = row[0]
    finally:
        cursor.close()
        db.close()


def save_itinerary(
    user_id,
    destination,
    itinerary,
    num_days=None,
    budget=None,
    preferences=None,
    pacing_style='Moderate',
    companion_type='Solo',
    transport_mode='Public',
    accommodation_lat=None,
    accommodation_lng=None,
    status='Active',
    trip_start_date=None,
):
    """Save a trip and all its day items to the DB, returning the itinerary ID."""
    ensure_itinerary_metadata_columns()
    ensure_itinerary_item_columns()
    db = get_db()
    cursor = db.cursor(buffered=True)
    itinerary_columns = get_table_columns('itineraries')
    item_columns = get_table_columns('itinerary_items')
    preferences_json = json.dumps(preferences or [])
    itinerary_context = {
        'pacing_style': pacing_style or 'Moderate',
        'companion_type': companion_type or 'Solo',
        'transport_mode': transport_mode or 'Public',
        'accommodation_lat': accommodation_lat,
        'accommodation_lng': accommodation_lng,
        'status': status or 'Active',
        'trip_start_date': trip_start_date,
    }

    try:
        if {'destination', 'budget', 'num_days', 'preferences'}.issubset(itinerary_columns):
            cursor.execute(
                """
                INSERT INTO itineraries
                    (user_id, trip_name, destination, budget, num_days, preferences, pacing_style, companion_type, transport_mode, accommodation_lat, accommodation_lng, status, trip_start_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    f'Trip to {destination}',
                    destination,
                    budget,
                    num_days,
                    preferences_json,
                    itinerary_context['pacing_style'],
                    itinerary_context['companion_type'],
                    itinerary_context['transport_mode'],
                    itinerary_context['accommodation_lat'],
                    itinerary_context['accommodation_lng'],
                    itinerary_context['status'],
                    itinerary_context['trip_start_date'],
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO itineraries (user_id, trip_name) VALUES (%s, %s)",
                (user_id, f'Trip to {destination}'),
            )
        db.commit()
        itinerary_id = cursor.lastrowid

        for day_num, day_places in itinerary.items():
            for sequence_order, place in enumerate(day_places, start=1):
                place_id = place.get('id')
                if place_id:
                    if {'sequence_order', 'estimated_duration', 'is_locked', 'swap_history'}.issubset(item_columns):
                        cursor.execute(
                            """
                            INSERT INTO itinerary_items
                                (itinerary_id, day_number, place_id, sequence_order, estimated_duration, is_locked, swap_history)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                itinerary_id,
                                day_num,
                                place_id,
                                sequence_order,
                                place.get('recommended_minutes', 60),
                                bool(place.get('is_locked', False)),
                                int(place.get('swap_history', 0) or 0),
                            ),
                        )
                        place['item_id'] = cursor.lastrowid
                        place['day_number'] = day_num
                        place['sequence_order'] = sequence_order
                        place['estimated_duration'] = place.get('recommended_minutes', 60)
                        place['is_locked'] = bool(place.get('is_locked', False))
                        place['swap_history'] = int(place.get('swap_history', 0) or 0)
                    else:
                        cursor.execute(
                            """
                            INSERT INTO itinerary_items
                                (itinerary_id, day_number, place_id)
                            VALUES (%s, %s, %s)
                            """,
                            (itinerary_id, day_num, place_id),
                        )
                        place['item_id'] = cursor.lastrowid
                        place['day_number'] = day_num
                        place['sequence_order'] = sequence_order
        db.commit()
        return itinerary_id
    finally:
        cursor.close()
        db.close()


def delete_itinerary_for_user(user_id, itinerary_id):
    """Permanently delete one itinerary owned by the given user.

    Returns the number of rows deleted (0 if the itinerary does not exist or
    does not belong to the user, 1 on success).  ON DELETE CASCADE on the
    itinerary_items and trip_feedback foreign keys keeps relational integrity
    automatically.
    """
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            DELETE FROM itineraries
            WHERE id = %s AND user_id = %s
            """,
            (int(itinerary_id), int(user_id)),
        )
        db.commit()
        return cursor.rowcount
    finally:
        cursor.close()
        db.close()


def duplicate_itinerary_for_user(user_id, itinerary_id):
    """Copy an itinerary (and its items) into a brand-new row for the same user.

    This powers the My Trips "Duplicate / Reuse" quick action.  The new row
    starts as a Draft with no trip_start_date so the user can re-plan freely.
    """
    overview = get_itinerary_overview(itinerary_id)
    if not overview:
        return None

    itinerary = overview['itinerary']
    if int(itinerary.get('user_id')) != int(user_id):
        return None

    items = overview.get('items', [])
    grouped = {}
    for item in items:
        day_key = str(item.get('day_number'))
        grouped.setdefault(day_key, []).append({
            'id': item.get('place_id'),
            'recommended_minutes': item.get('estimated_duration', 60),
        })

    preferences = itinerary.get('preferences')
    if isinstance(preferences, str):
        try:
            preferences = json.loads(preferences)
        except (TypeError, ValueError):
            preferences = []

    return save_itinerary(
        user_id,
        itinerary.get('destination'),
        grouped,
        num_days=itinerary.get('num_days'),
        budget=itinerary.get('budget'),
        preferences=preferences or [],
        pacing_style=itinerary.get('pacing_style') or 'Moderate',
        companion_type=itinerary.get('companion_type') or 'Solo',
        transport_mode=itinerary.get('transport_mode') or 'Public',
        accommodation_lat=itinerary.get('accommodation_lat'),
        accommodation_lng=itinerary.get('accommodation_lng'),
        status='Draft',
        trip_start_date=None,
    )


def update_itinerary_start_date(user_id, itinerary_id, trip_start_date):
    """Update the start date of one user's itinerary."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE itineraries
            SET trip_start_date = %s
            WHERE id = %s AND user_id = %s
            """,
            (trip_start_date, int(itinerary_id), int(user_id)),
        )
        db.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        db.close()


def save_place_feedback(user_id, itinerary_id, place_id, feedback_value):
    """Store explicit feedback for one itinerary stop."""
    ensure_feedback_columns()
    db = get_db()
    cursor = db.cursor(buffered=True)

    try:
        cursor.execute(
            """
            INSERT INTO trip_feedback (itinerary_id, user_id, place_id, rating_type, feedback_notes)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                rating_type = VALUES(rating_type),
                created_at = CURRENT_TIMESTAMP
            """,
            (
                itinerary_id,
                user_id,
                place_id,
                'Best Pick' if int(feedback_value) == 1 else 'Not Ideal',
                None,
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def get_active_itineraries():
    """Return active itineraries that should be checked by the weather monitor."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                id,
                user_id,
                trip_name,
                destination,
                budget,
                num_days,
                preferences,
                pacing_style,
                companion_type,
                transport_mode,
                accommodation_lat,
                accommodation_lng,
                status,
                created_at
            FROM itineraries
            WHERE status = 'Active'
            ORDER BY id ASC
            """
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def get_itinerary_item_context(itinerary_id, item_id):
    """Return the itinerary, item, and place data needed for editing operations."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                ii.id AS item_id,
                ii.itinerary_id,
                ii.day_number,
                ii.place_id,
                ii.sequence_order,
                ii.estimated_duration,
                ii.is_locked,
                ii.swap_history,
                i.user_id,
                i.destination,
                i.budget,
                i.num_days,
                i.preferences,
                i.pacing_style,
                i.companion_type,
                i.transport_mode,
                i.accommodation_lat,
                i.accommodation_lng,
                p.name AS place_name,
                p.category AS place_category,
                p.latitude,
                p.longitude,
                p.rating,
                p.city,
                p.tags,
                p.environment_type,
                p.physical_intensity
            FROM itinerary_items ii
            INNER JOIN itineraries i ON i.id = ii.itinerary_id
            INNER JOIN places p ON p.id = ii.place_id
            WHERE ii.id = %s AND ii.itinerary_id = %s
            """,
            (item_id, itinerary_id),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        db.close()


def get_itinerary_overview(itinerary_id):
    """Return itinerary metadata and all saved items in day order."""
    ensure_itinerary_metadata_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                id,
                user_id,
                trip_name,
                destination,
                budget,
                num_days,
                preferences,
                pacing_style,
                companion_type,
                transport_mode,
                accommodation_lat,
                accommodation_lng,
                status,
                trip_start_date
            FROM itineraries
            WHERE id = %s
            """,
            (itinerary_id,),
        )
        itinerary = cursor.fetchone()
        if not itinerary:
            return None

        cursor.execute(
            """
            SELECT
                ii.id AS item_id,
                ii.day_number,
                ii.sequence_order,
                ii.estimated_duration,
                ii.is_locked,
                ii.swap_history,
                p.id AS place_id,
                p.name,
                p.category,
                p.latitude,
                p.longitude,
                p.rating,
                p.city,
                p.tags,
                p.environment_type,
                p.physical_intensity
            FROM itinerary_items ii
            INNER JOIN places p ON p.id = ii.place_id
            WHERE ii.itinerary_id = %s
            ORDER BY ii.day_number ASC, ii.sequence_order ASC, ii.id ASC
            """,
            (itinerary_id,),
        )
        items = cursor.fetchall()
        return {
            'itinerary': itinerary,
            'items': items,
        }
    finally:
        cursor.close()
        db.close()


def get_itinerary_day_items(itinerary_id, day_number):
    """Return one itinerary day with place metadata attached."""
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                ii.id AS item_id,
                ii.itinerary_id,
                ii.day_number,
                ii.place_id,
                ii.sequence_order,
                ii.estimated_duration,
                ii.is_locked,
                ii.swap_history,
                p.name,
                p.category,
                p.latitude,
                p.longitude,
                p.rating,
                p.city,
                p.tags,
                p.environment_type,
                p.physical_intensity
            FROM itinerary_items ii
            INNER JOIN places p ON p.id = ii.place_id
            WHERE ii.itinerary_id = %s AND ii.day_number = %s
            ORDER BY ii.sequence_order ASC, ii.id ASC
            """,
            (itinerary_id, day_number),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def update_itinerary_day_items(itinerary_id, day_number, replacements):
    """Replace the unlocked items for one day with new place ids."""
    db = get_db()
    cursor = db.cursor()

    try:
        for replacement in replacements:
            cursor.execute(
                """
                UPDATE itinerary_items
                SET place_id = %s,
                    sequence_order = %s,
                    estimated_duration = %s,
                    swap_history = COALESCE(swap_history, 0) + 1
                WHERE id = %s AND itinerary_id = %s AND day_number = %s
                """,
                (
                    int(replacement['place_id']),
                    int(replacement.get('sequence_order', 1)),
                    int(replacement.get('estimated_duration', 60)),
                    int(replacement['item_id']),
                    itinerary_id,
                    day_number,
                ),
            )
        db.commit()
    finally:
        cursor.close()
        db.close()


def upsert_weather_alert(itinerary_id, alert_key, alert_type, headline, message, payload):
    """Persist or refresh a weather alert for later review in the UI."""
    ensure_weather_alert_columns()
    db = get_db()
    cursor = db.cursor()

    notification_signature = (payload or {}).get('notification_signature')

    try:
        cursor.execute(
            """
            INSERT INTO weather_alerts
                (itinerary_id, alert_key, alert_type, headline, message, payload, is_active, resolved_at, notification_signature, notification_sent_at)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, NULL, %s, NULL)
            ON DUPLICATE KEY UPDATE
                alert_type = VALUES(alert_type),
                headline = VALUES(headline),
                message = VALUES(message),
                payload = VALUES(payload),
                is_active = TRUE,
                resolved_at = NULL,
                notification_signature = VALUES(notification_signature),
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                itinerary_id,
                alert_key,
                alert_type,
                headline,
                message,
                json.dumps(_json_safe_value(payload or {})),
                notification_signature,
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def resolve_weather_alert(itinerary_id, alert_key):
    """Mark a weather alert as resolved when the weather clears."""
    ensure_weather_alert_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE weather_alerts
            SET is_active = FALSE,
                resolved_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE itinerary_id = %s AND alert_key = %s
            """,
            (itinerary_id, alert_key),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def list_weather_alerts(itinerary_id, active_only=True):
    """Return stored alerts for an itinerary."""
    ensure_weather_alert_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        query = """
            SELECT
                id,
                itinerary_id,
                alert_key,
                alert_type,
                headline,
                message,
                payload,
                is_active,
                notification_signature,
                notification_sent_at,
                created_at,
                updated_at,
                resolved_at
            FROM weather_alerts
            WHERE itinerary_id = %s
        """
        params = [itinerary_id]
        if active_only:
            query += ' AND is_active = TRUE'
        query += ' ORDER BY created_at DESC, id DESC'

        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def mark_weather_alert_notified(itinerary_id, alert_key, notification_signature):
    """Record that a weather alert was already delivered through push notifications."""
    ensure_weather_alert_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE weather_alerts
            SET notification_signature = %s,
                notification_sent_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE itinerary_id = %s AND alert_key = %s
            """,
            (notification_signature, itinerary_id, alert_key),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def get_weather_alert_history(itinerary_id):
    """Return all stored weather alerts for an itinerary, newest first."""
    return list_weather_alerts(itinerary_id, active_only=False)


def list_admin_weather_alerts(search_query='', active_only=None, limit=50):
    """Return weather alerts across itineraries for admin review."""
    ensure_weather_alert_columns()
    safe_query = str(search_query or '').strip()
    safe_limit = max(1, min(int(limit or 50), 100))
    conditions = []
    params = []

    if safe_query:
        like_value = f'%{safe_query}%'
        conditions.append(
            '(weather_alerts.headline LIKE %s OR weather_alerts.message LIKE %s OR weather_alerts.alert_type LIKE %s '
            'OR itineraries.trip_name LIKE %s OR itineraries.destination LIKE %s OR users.username LIKE %s OR users.email LIKE %s)'
        )
        params.extend([like_value, like_value, like_value, like_value, like_value, like_value, like_value])

    if active_only is True:
        conditions.append('weather_alerts.is_active = TRUE')
    elif active_only is False:
        conditions.append('weather_alerts.is_active = FALSE')

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            f"""
            SELECT
                weather_alerts.id,
                weather_alerts.itinerary_id,
                weather_alerts.alert_key,
                weather_alerts.alert_type,
                weather_alerts.headline,
                weather_alerts.message,
                weather_alerts.payload,
                weather_alerts.is_active,
                weather_alerts.created_at,
                weather_alerts.updated_at,
                weather_alerts.resolved_at,
                weather_alerts.notification_signature,
                weather_alerts.notification_sent_at,
                itineraries.trip_name,
                itineraries.destination,
                itineraries.status AS itinerary_status,
                users.username AS owner_name,
                users.email AS owner_email
            FROM weather_alerts
            LEFT JOIN itineraries ON itineraries.id = weather_alerts.itinerary_id
            LEFT JOIN users ON users.id = itineraries.user_id
            {where_sql}
            ORDER BY weather_alerts.updated_at DESC, weather_alerts.id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        rows = cursor.fetchall()
        for row in rows:
            row['payload'] = _coerce_json_value(row.get('payload'), {})
        return {
            'summary': {
                'total_alerts': len(rows),
                'active_alerts': sum(1 for row in rows if row.get('is_active')),
                'resolved_alerts': sum(1 for row in rows if not row.get('is_active')),
                'affected_itineraries': len({row.get('itinerary_id') for row in rows if row.get('itinerary_id')}),
            },
            'alerts': [_json_safe(row) for row in rows],
        }
    finally:
        cursor.close()
        db.close()


def get_indoor_place_alternatives(city, excluded_place_ids=None, limit=4):
    """Return indoor alternatives for weather pivots, filtered away from used places."""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    excluded_place_ids = [int(place_id) for place_id in (excluded_place_ids or []) if place_id]

    try:
        query = (
            """
            SELECT id, name, category, latitude, longitude, rating, city, tags, environment_type, physical_intensity
            FROM places
            WHERE city = %s AND environment_type = 'Indoor'
            """
        )
        params = [city]

        if excluded_place_ids:
            placeholders = ','.join(['%s'] * len(excluded_place_ids))
            query += f" AND id NOT IN ({placeholders})"
            params.extend(excluded_place_ids)

        query += ' ORDER BY rating DESC, name ASC LIMIT %s'
        params.append(int(limit))

        cursor.execute(query, tuple(params))
        results = cursor.fetchall()

        if results:
            return results

        cursor.execute(
            """
            SELECT id, name, category, latitude, longitude, rating, city, tags, environment_type, physical_intensity
            FROM places
            WHERE city = %s
            ORDER BY rating DESC, name ASC
            LIMIT %s
            """,
            (city, int(limit)),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def update_itinerary_item_order(itinerary_id, item_orders):
    """Batch update the order of items within an itinerary."""
    db = get_db()
    cursor = db.cursor()

    try:
        for item in item_orders:
            cursor.execute(
                """
                UPDATE itinerary_items
                SET day_number = %s, sequence_order = %s
                WHERE id = %s AND itinerary_id = %s
                """,
                (
                    int(item.get('day_number', 1)),
                    int(item.get('sequence_order', 1)),
                    int(item['item_id']),
                    itinerary_id,
                ),
            )
        db.commit()
    finally:
        cursor.close()
        db.close()


def update_itinerary_item_lock(itinerary_id, item_id, locked):
    """Set the lock state of an itinerary item."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE itinerary_items
            SET is_locked = %s
            WHERE id = %s AND itinerary_id = %s
            """,
            (bool(locked), item_id, itinerary_id),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def _haversine(lat1, lon1, lat2, lon2):
    """Compute distance in kilometers between two coordinates."""
    import math

    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return radius * 2 * math.asin(math.sqrt(a))


def swap_itinerary_item(itinerary_id, item_id):
    """Replace a place inside an itinerary with the next-best nearby candidate."""
    context = get_itinerary_item_context(itinerary_id, item_id)
    if not context:
        return None, 'Item not found.'

    if context.get('is_locked'):
        return None, 'Locked items cannot be swapped.'

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT place_id
            FROM itinerary_items
            WHERE itinerary_id = %s AND id <> %s
            """,
            (itinerary_id, item_id),
        )
        used_place_ids = {row['place_id'] for row in cursor.fetchall()}

        cursor.execute(
            """
            SELECT id, name, category, latitude, longitude, rating, city, tags, environment_type, physical_intensity
            FROM places
            WHERE city = %s AND id <> %s
            """,
            (context['city'], context['place_id']),
        )
        candidates = cursor.fetchall()

        companion_type = str(context.get('companion_type') or 'Solo').lower()
        current_lat = float(context['latitude']) if context.get('latitude') is not None else None
        current_lon = float(context['longitude']) if context.get('longitude') is not None else None
        current_env = str(context.get('environment_type') or 'Mixed').lower()
        current_category = str(context.get('place_category') or '').lower()
        current_rating = float(context.get('rating') or 3.5)

        scored_candidates = []
        for candidate in candidates:
            if candidate['id'] in used_place_ids:
                continue

            if companion_type in ['family_kids', 'seniors'] and str(candidate.get('physical_intensity') or '').lower() == 'high':
                continue

            candidate_lat = candidate.get('latitude')
            candidate_lon = candidate.get('longitude')
            if current_lat is not None and current_lon is not None and candidate_lat is not None and candidate_lon is not None:
                distance_km = _haversine(current_lat, current_lon, float(candidate_lat), float(candidate_lon))
            else:
                distance_km = 999

            if distance_km > 3.0:
                continue

            score = float(candidate.get('rating') or 3.5) * 2.0
            if str(candidate.get('environment_type') or '').lower() == current_env:
                score += 1.5
            if str(candidate.get('category') or '').lower() == current_category:
                score += 1.0
            score -= distance_km
            score -= abs(float(candidate.get('rating') or 3.5) - current_rating) * 0.4
            scored_candidates.append((score, distance_km, candidate))

        if not scored_candidates:
            for candidate in candidates:
                if candidate['id'] in used_place_ids:
                    continue
                if companion_type in ['family_kids', 'seniors'] and str(candidate.get('physical_intensity') or '').lower() == 'high':
                    continue
                score = float(candidate.get('rating') or 3.5)
                scored_candidates.append((score, 999, candidate))

        if not scored_candidates:
            return None, 'No suitable replacement found.'

        scored_candidates.sort(key=lambda item: (item[0], -item[1]), reverse=True)
        chosen_candidate = scored_candidates[0][2]

        cursor.execute(
            """
            UPDATE itinerary_items
            SET place_id = %s, swap_history = COALESCE(swap_history, 0) + 1
            WHERE id = %s AND itinerary_id = %s
            """,
            (chosen_candidate['id'], item_id, itinerary_id),
        )
        db.commit()

        updated_item = get_itinerary_item_context(itinerary_id, item_id)
        return {
            'item_id': updated_item['item_id'],
            'day_number': updated_item['day_number'],
            'sequence_order': updated_item['sequence_order'],
            'estimated_duration': updated_item['estimated_duration'],
            'is_locked': bool(updated_item['is_locked']),
            'swap_history': updated_item['swap_history'],
            'place': {
                'id': updated_item['place_id'],
                'name': updated_item['place_name'],
                'category': updated_item['place_category'],
                'latitude': updated_item['latitude'],
                'longitude': updated_item['longitude'],
                'rating': updated_item['rating'],
                'city': updated_item['city'],
                'tags': updated_item['tags'],
                'environment_type': updated_item['environment_type'],
                'physical_intensity': updated_item['physical_intensity'],
            },
        }, None
    finally:
        cursor.close()
        db.close()


ADMIN_ROLES = {'admin', 'super_admin'}
USER_ROLES = {'user', 'admin', 'super_admin'}
ACCOUNT_STATUSES = {'active', 'suspended'}
PLACE_STATUSES = {'published', 'review', 'archived'}


def _json_safe(value):
    """Convert DB values into JSON-friendly primitives."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode('utf-8')
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _coerce_json_value(value, fallback=None):
    """Decode JSON columns that may be returned as strings by mysql-connector."""
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def ensure_admin_tables():
    """Create and upgrade durable tables needed by the admin console."""
    ensure_user_columns()
    ensure_place_metadata_columns()
    ensure_itinerary_metadata_columns()
    ensure_itinerary_item_columns()
    ensure_feedback_columns()
    ensure_push_token_columns()
    ensure_weather_alert_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                actor_id    INT NOT NULL,
                action      VARCHAR(80) NOT NULL,
                target_type VARCHAR(40) NOT NULL,
                target_id   INT NULL,
                payload     JSON,
                ip_address  VARCHAR(64),
                user_agent  VARCHAR(255),
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS ml_training_runs (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                status          VARCHAR(20) NOT NULL DEFAULT 'running',
                dataset_rows    INT DEFAULT 0,
                accuracy        DECIMAL(6, 4) NULL,
                metrics         JSON,
                artifact_paths  JSON,
                started_by      INT NULL,
                started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at    DATETIME NULL,
                error_message   TEXT,
                FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_settings (
                setting_key   VARCHAR(80) PRIMARY KEY,
                setting_value TEXT,
                value_type    VARCHAR(20) NOT NULL DEFAULT 'string',
                description   VARCHAR(255),
                updated_by    INT NULL,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_notification_log (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                actor_id       INT NOT NULL,
                audience_type  VARCHAR(30) NOT NULL,
                target_user_id INT NULL,
                title          VARCHAR(140) NOT NULL,
                body           TEXT NOT NULL,
                result         JSON,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        cursor.executemany(
            """
            INSERT IGNORE INTO admin_settings
                (setting_key, setting_value, value_type, description)
            VALUES (%s, %s, %s, %s)
            """,
            (
                ('maintenance_mode', 'false', 'boolean', 'Temporarily pause user-facing trip generation notices.'),
                ('admin_broadcasts_enabled', 'true', 'boolean', 'Allow admins to send targeted push notifications.'),
                ('ml_auto_retrain_enabled', 'false', 'boolean', 'Reserve flag for scheduled recommendation model retraining.'),
                ('content_review_required', 'true', 'boolean', 'Keep newly created admin places in review by default.'),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def get_user_role(user_id):
    """Return the current role for authorization decisions."""
    ensure_user_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id, role, account_status FROM users WHERE id = %s",
            (int(user_id),),
        )
        user = cursor.fetchone()
        if not user:
            return None
        return {
            'id': int(user['id']),
            'role': user.get('role') or 'user',
            'account_status': user.get('account_status') or 'active',
        }
    finally:
        cursor.close()
        db.close()


def log_admin_action(actor_id, action, target_type, target_id=None, payload=None, ip_address=None, user_agent=None):
    """Persist a privileged action for auditability."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO admin_audit_log
                (actor_id, action, target_type, target_id, payload, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                int(actor_id),
                str(action)[:80],
                str(target_type)[:40],
                int(target_id) if target_id is not None else None,
                json.dumps(_json_safe(payload or {})),
                str(ip_address or '')[:64],
                str(user_agent or '')[:255],
            ),
        )
        db.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        db.close()


def _append_date_filters(conditions, params, column_name, start_date=None, end_date=None):
    """Append optional date-window filters to a query."""
    if start_date:
        conditions.append(f'DATE({column_name}) >= %s')
        params.append(str(start_date)[:10])
    if end_date:
        conditions.append(f'DATE({column_name}) <= %s')
        params.append(str(end_date)[:10])


def get_admin_audit_log(limit=30, offset=0, action='', target_type='', actor_id=None, start_date=None, end_date=None):
    """Return paginated privileged-action history."""
    ensure_admin_tables()
    safe_limit = max(1, min(int(limit or 30), 100))
    safe_offset = max(0, int(offset or 0))
    conditions = []
    params = []
    if action:
        conditions.append('audit.action LIKE %s')
        params.append(f'%{str(action).strip()}%')
    if target_type:
        conditions.append('audit.target_type = %s')
        params.append(str(target_type).strip()[:40])
    if actor_id:
        conditions.append('audit.actor_id = %s')
        params.append(int(actor_id))
    _append_date_filters(conditions, params, 'audit.created_at', start_date, end_date)
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            f"""
            SELECT
                audit.id,
                audit.actor_id,
                users.username AS actor_name,
                users.email AS actor_email,
                audit.action,
                audit.target_type,
                audit.target_id,
                audit.payload,
                audit.ip_address,
                audit.user_agent,
                audit.created_at
            FROM admin_audit_log audit
            LEFT JOIN users ON users.id = audit.actor_id
            {where_sql}
            ORDER BY audit.created_at DESC, audit.id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [safe_limit, safe_offset]),
        )
        rows = cursor.fetchall()
        for row in rows:
            row['payload'] = _coerce_json_value(row.get('payload'), {})
        return [_json_safe(row) for row in rows]
    finally:
        cursor.close()
        db.close()


def get_admin_overview():
    """Return command-center metrics backed by live database data."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("SELECT COUNT(*) AS value FROM users")
        total_users = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM users WHERE account_status = 'active'")
        active_users = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM users WHERE role IN ('admin', 'super_admin')")
        admin_users = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM itineraries")
        itinerary_count = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM trip_feedback")
        feedback_count = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM places")
        places_count = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM places WHERE status = 'review'")
        review_places = int((cursor.fetchone() or {}).get('value') or 0)

        latest_run = get_latest_ml_training_run()
        return {
            'metrics': [
                {'label': 'Active users', 'value': active_users, 'delta': f'{total_users} total accounts', 'tone': 'positive'},
                {'label': 'Generated itineraries', 'value': itinerary_count, 'delta': f'{feedback_count} feedback signals', 'tone': 'positive'},
                {'label': 'Places catalog', 'value': places_count, 'delta': f'{review_places} in review', 'tone': 'warning' if review_places else 'positive'},
                {'label': 'Admin accounts', 'value': admin_users, 'delta': 'RBAC protected', 'tone': 'positive'},
            ],
            'model_status': latest_run,
            'recent_audit': get_admin_audit_log(limit=6),
        }
    finally:
        cursor.close()
        db.close()


def list_admin_users(search_query='', limit=50):
    """Return a searchable user-management list."""
    ensure_user_columns()
    safe_query = str(search_query or '').strip()
    safe_limit = max(1, min(int(limit or 50), 100))
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        where_sql = ''
        params = []
        if safe_query:
            where_sql = 'WHERE username LIKE %s OR email LIKE %s OR role LIKE %s OR account_status LIKE %s'
            like_value = f'%{safe_query}%'
            params.extend([like_value, like_value, like_value, like_value])

        cursor.execute(
            f"""
            SELECT
                users.id,
                users.username,
                users.email,
                users.role,
                users.account_status,
                users.suspended_at,
                users.suspended_reason,
                users.created_at,
                COUNT(DISTINCT itineraries.id) AS trip_count,
                MAX(itineraries.created_at) AS last_trip_at
            FROM users
            LEFT JOIN itineraries ON itineraries.user_id = users.id
            {where_sql}
            GROUP BY users.id, users.username, users.email, users.role, users.account_status,
                     users.suspended_at, users.suspended_reason, users.created_at
            ORDER BY users.created_at DESC, users.id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        return [_json_safe(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        db.close()


def update_admin_user_role(actor_id, target_user_id, role):
    """Change a user's role while preserving super-admin invariants."""
    ensure_user_columns()
    safe_role = str(role or '').strip()
    if safe_role not in USER_ROLES:
        return None, 'Invalid role.'

    actor_id = int(actor_id)
    target_user_id = int(target_user_id)
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute('SELECT id, role FROM users WHERE id = %s', (target_user_id,))
        target = cursor.fetchone()
        if not target:
            return None, 'User not found.'

        if actor_id == target_user_id and target.get('role') == 'super_admin' and safe_role != 'super_admin':
            return None, 'You cannot demote your own super admin account.'

        if target.get('role') == 'super_admin' and safe_role != 'super_admin':
            cursor.execute("SELECT COUNT(*) AS value FROM users WHERE role = 'super_admin' AND account_status = 'active'")
            super_admin_count = int((cursor.fetchone() or {}).get('value') or 0)
            if super_admin_count <= 1:
                return None, 'At least one active super admin is required.'

        cursor.execute('UPDATE users SET role = %s WHERE id = %s', (safe_role, target_user_id))
        db.commit()
        return {'id': target_user_id, 'role': safe_role}, None
    finally:
        cursor.close()
        db.close()


def update_admin_user_status(actor_id, target_user_id, status, reason=''):
    """Suspend or reactivate a user account without deleting data."""
    ensure_user_columns()
    safe_status = str(status or '').strip().lower()
    if safe_status not in ACCOUNT_STATUSES:
        return None, 'Invalid account status.'

    actor_id = int(actor_id)
    target_user_id = int(target_user_id)
    if actor_id == target_user_id and safe_status == 'suspended':
        return None, 'You cannot suspend your own admin account.'

    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute('SELECT id, role, account_status FROM users WHERE id = %s', (target_user_id,))
        target = cursor.fetchone()
        if not target:
            return None, 'User not found.'

        if target.get('role') == 'super_admin' and safe_status == 'suspended':
            cursor.execute("SELECT COUNT(*) AS value FROM users WHERE role = 'super_admin' AND account_status = 'active'")
            super_admin_count = int((cursor.fetchone() or {}).get('value') or 0)
            if super_admin_count <= 1:
                return None, 'At least one active super admin is required.'

        cursor.execute(
            """
            UPDATE users
            SET account_status = %s,
                suspended_at = CASE WHEN %s = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,
                suspended_reason = CASE WHEN %s = 'suspended' THEN %s ELSE NULL END
            WHERE id = %s
            """,
            (safe_status, safe_status, safe_status, str(reason or '')[:255], target_user_id),
        )
        db.commit()
        cursor.execute('SELECT id, username, email, role, account_status FROM users WHERE id = %s', (target_user_id,))
        updated_target = cursor.fetchone() or target
        return {
            'id': target_user_id,
            'username': updated_target.get('username'),
            'email': updated_target.get('email'),
            'role': updated_target.get('role'),
            'account_status': updated_target.get('account_status'),
            'previous_account_status': target.get('account_status'),
        }, None
    finally:
        cursor.close()
        db.close()


def list_admin_places(search_query='', limit=80):
    """Return content-management rows from the places catalog."""
    ensure_place_metadata_columns()
    safe_query = str(search_query or '').strip()
    safe_limit = max(1, min(int(limit or 80), 150))
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        where_sql = ''
        params = []
        if safe_query:
            where_sql = 'WHERE name LIKE %s OR city LIKE %s OR category LIKE %s OR tags LIKE %s OR status LIKE %s'
            like_value = f'%{safe_query}%'
            params.extend([like_value, like_value, like_value, like_value, like_value])

        cursor.execute(
            f"""
            SELECT
                id, name, category, latitude, longitude, rating, city, tags,
                environment_type, physical_intensity, status, curation_notes,
                source, updated_at, updated_by
            FROM places
            {where_sql}
            ORDER BY updated_at DESC, rating DESC, name ASC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        return [_json_safe(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        db.close()


def create_admin_place(actor_id, payload):
    """Create a destination/content record managed by admins."""
    ensure_place_metadata_columns()
    name = str(payload.get('name') or '').strip()
    category = str(payload.get('category') or '').strip()
    if not name or not category:
        return None, 'Place name and category are required.'

    status = str(payload.get('status') or 'review').strip().lower()
    if status not in PLACE_STATUSES:
        return None, 'Invalid place status.'

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO places
                (name, category, latitude, longitude, rating, city, tags,
                 environment_type, physical_intensity, status, curation_notes, source, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                name,
                category[:50],
                payload.get('latitude'),
                payload.get('longitude'),
                payload.get('rating') or 0,
                str(payload.get('city') or '')[:100],
                str(payload.get('tags') or '')[:255],
                str(payload.get('environment_type') or 'Mixed')[:20],
                str(payload.get('physical_intensity') or 'Medium')[:20],
                status,
                payload.get('curation_notes'),
                str(payload.get('source') or 'admin')[:40],
                int(actor_id),
            ),
        )
        db.commit()
        place_id = cursor.lastrowid
        return {'id': place_id}, None
    finally:
        cursor.close()
        db.close()


def update_admin_place(actor_id, place_id, payload):
    """Patch editable admin fields for a destination/content record."""
    ensure_place_metadata_columns()
    allowed_fields = {
        'name': 150,
        'category': 50,
        'latitude': None,
        'longitude': None,
        'rating': None,
        'city': 100,
        'tags': 255,
        'environment_type': 20,
        'physical_intensity': 20,
        'status': 20,
        'curation_notes': None,
        'source': 40,
    }
    assignments = []
    params = []

    for field, max_length in allowed_fields.items():
        if field not in payload:
            continue
        value = payload.get(field)
        if field == 'status':
            value = str(value or '').strip().lower()
            if value not in PLACE_STATUSES:
                return None, 'Invalid place status.'
        elif isinstance(value, str) and max_length:
            value = value.strip()[:max_length]
        assignments.append(f'{field} = %s')
        params.append(value)

    if not assignments:
        return {'id': int(place_id)}, None

    assignments.extend(['updated_by = %s', 'updated_at = CURRENT_TIMESTAMP'])
    params.extend([int(actor_id), int(place_id)])

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            f"UPDATE places SET {', '.join(assignments)} WHERE id = %s",
            tuple(params),
        )
        db.commit()
        if cursor.rowcount == 0:
            return None, 'Place not found.'
        return {'id': int(place_id)}, None
    finally:
        cursor.close()
        db.close()


def list_admin_itineraries(search_query='', status='', limit=60):
    """Return searchable itinerary rows for admin inspection."""
    ensure_admin_tables()
    safe_query = str(search_query or '').strip()
    safe_status = str(status or '').strip()
    safe_limit = max(1, min(int(limit or 60), 150))
    conditions = []
    params = []
    if safe_query:
        like_value = f'%{safe_query}%'
        conditions.append(
            '(itineraries.trip_name LIKE %s OR itineraries.destination LIKE %s '
            'OR users.username LIKE %s OR users.email LIKE %s)'
        )
        params.extend([like_value, like_value, like_value, like_value])
    if safe_status:
        conditions.append('itineraries.status = %s')
        params.append(safe_status[:20])
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ''
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            f"""
            SELECT
                itineraries.id,
                itineraries.trip_name,
                itineraries.destination,
                itineraries.budget,
                itineraries.num_days,
                itineraries.pacing_style,
                itineraries.companion_type,
                itineraries.transport_mode,
                itineraries.status,
                itineraries.trip_start_date,
                itineraries.created_at,
                users.id AS user_id,
                users.username AS owner_name,
                users.email AS owner_email,
                COUNT(DISTINCT itinerary_items.id) AS item_count,
                COUNT(DISTINCT trip_feedback.id) AS feedback_count
            FROM itineraries
            LEFT JOIN users ON users.id = itineraries.user_id
            LEFT JOIN itinerary_items ON itinerary_items.itinerary_id = itineraries.id
            LEFT JOIN trip_feedback ON trip_feedback.itinerary_id = itineraries.id
            {where_sql}
            GROUP BY
                itineraries.id, itineraries.trip_name, itineraries.destination, itineraries.budget,
                itineraries.num_days, itineraries.pacing_style, itineraries.companion_type,
                itineraries.transport_mode, itineraries.status, itineraries.trip_start_date,
                itineraries.created_at, users.id, users.username, users.email
            ORDER BY itineraries.created_at DESC, itineraries.id DESC
            LIMIT %s
            """,
            tuple(params + [safe_limit]),
        )
        return [_json_safe(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        db.close()


def get_admin_itinerary_detail(itinerary_id):
    """Return one itinerary with owner metadata and ordered stops."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                itineraries.*,
                users.username AS owner_name,
                users.email AS owner_email
            FROM itineraries
            LEFT JOIN users ON users.id = itineraries.user_id
            WHERE itineraries.id = %s
            """,
            (int(itinerary_id),),
        )
        itinerary = cursor.fetchone()
        if not itinerary:
            return None

        itinerary['preferences'] = _coerce_json_value(itinerary.get('preferences'), {})
        cursor.execute(
            """
            SELECT
                itinerary_items.id,
                itinerary_items.day_number,
                itinerary_items.sequence_order,
                itinerary_items.estimated_duration,
                itinerary_items.is_locked,
                itinerary_items.swap_history,
                places.id AS place_id,
                places.name,
                places.category,
                places.city,
                places.rating,
                places.status AS place_status
            FROM itinerary_items
            LEFT JOIN places ON places.id = itinerary_items.place_id
            WHERE itinerary_items.itinerary_id = %s
            ORDER BY itinerary_items.day_number ASC, itinerary_items.sequence_order ASC, itinerary_items.id ASC
            """,
            (int(itinerary_id),),
        )
        items = cursor.fetchall()
        cursor.execute(
            """
            SELECT rating_type AS label, COUNT(*) AS value
            FROM trip_feedback
            WHERE itinerary_id = %s
            GROUP BY rating_type
            ORDER BY value DESC
            """,
            (int(itinerary_id),),
        )
        feedback = cursor.fetchall()
        return _json_safe({'itinerary': itinerary, 'items': items, 'feedback': feedback})
    finally:
        cursor.close()
        db.close()


def get_admin_notification_overview():
    """Return push-token coverage and recent admin notification sends."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("SELECT COUNT(*) AS value FROM push_tokens")
        token_count = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(DISTINCT user_id) AS value FROM push_tokens")
        reachable_users = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM users WHERE account_status = 'active'")
        active_users = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute(
            """
            SELECT
                log.id,
                log.actor_id,
                users.username AS actor_name,
                log.audience_type,
                log.target_user_id,
                target.username AS target_name,
                log.title,
                log.body,
                log.result,
                log.created_at
            FROM admin_notification_log log
            LEFT JOIN users ON users.id = log.actor_id
            LEFT JOIN users target ON target.id = log.target_user_id
            ORDER BY log.created_at DESC, log.id DESC
            LIMIT 20
            """
        )
        recent = cursor.fetchall()
        for row in recent:
            row['result'] = _coerce_json_value(row.get('result'), {})
        return _json_safe({
            'token_count': token_count,
            'reachable_users': reachable_users,
            'active_users': active_users,
            'recent': recent,
        })
    finally:
        cursor.close()
        db.close()


def create_admin_notification_log(actor_id, audience_type, target_user_id, title, body, result):
    """Persist the result of an admin-initiated notification send."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO admin_notification_log
                (actor_id, audience_type, target_user_id, title, body, result)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                int(actor_id),
                str(audience_type or 'targeted')[:30],
                int(target_user_id) if target_user_id else None,
                str(title or '')[:140],
                str(body or ''),
                json.dumps(_json_safe(result or {})),
            ),
        )
        db.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        db.close()


def list_admin_push_recipient_ids(audience_type='all', target_user_id=None):
    """Return user ids eligible for an admin push notification."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        if audience_type == 'user' and target_user_id:
            cursor.execute(
                """
                SELECT DISTINCT users.id
                FROM users
                INNER JOIN push_tokens ON push_tokens.user_id = users.id
                WHERE users.id = %s AND users.account_status = 'active'
                """,
                (int(target_user_id),),
            )
        else:
            cursor.execute(
                """
                SELECT DISTINCT users.id
                FROM users
                INNER JOIN push_tokens ON push_tokens.user_id = users.id
                WHERE users.account_status = 'active'
                ORDER BY users.id ASC
                LIMIT 500
                """
            )
        return [int(row['id']) for row in cursor.fetchall()]
    finally:
        cursor.close()
        db.close()


def list_admin_settings():
    """Return editable operations settings."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                settings.setting_key,
                settings.setting_value,
                settings.value_type,
                settings.description,
                settings.updated_by,
                users.username AS updated_by_name,
                settings.updated_at
            FROM admin_settings settings
            LEFT JOIN users ON users.id = settings.updated_by
            ORDER BY settings.setting_key ASC
            """
        )
        return [_json_safe(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        db.close()


def update_admin_setting(actor_id, setting_key, setting_value):
    """Update one existing operations setting."""
    ensure_admin_tables()
    safe_key = str(setting_key or '').strip()[:80]
    if not safe_key:
        return None, 'Setting key is required.'
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute('SELECT setting_key, value_type FROM admin_settings WHERE setting_key = %s', (safe_key,))
        existing = cursor.fetchone()
        if not existing:
            return None, 'Setting not found.'

        value_type = existing.get('value_type') or 'string'
        safe_value = setting_value
        if value_type == 'boolean':
            safe_value = 'true' if str(setting_value).lower() in ('1', 'true', 'yes', 'on') else 'false'
        elif value_type == 'number':
            try:
                safe_value = str(float(setting_value))
            except (TypeError, ValueError):
                return None, 'Setting value must be numeric.'
        else:
            safe_value = str(setting_value or '')[:500]

        cursor.execute(
            """
            UPDATE admin_settings
            SET setting_value = %s, updated_by = %s
            WHERE setting_key = %s
            """,
            (safe_value, int(actor_id), safe_key),
        )
        db.commit()
        return {'setting_key': safe_key, 'setting_value': safe_value}, None
    finally:
        cursor.close()
        db.close()


def get_admin_analytics(start_date=None, end_date=None):
    """Return lightweight visualization data for the operations console."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        date_conditions = []
        date_params = []
        _append_date_filters(date_conditions, date_params, 'created_at', start_date, end_date)
        date_where = f"WHERE {' AND '.join(date_conditions)}" if date_conditions else ''

        cursor.execute(
            f"""
            SELECT DATE(created_at) AS label, COUNT(*) AS value
            FROM itineraries
            {date_where}
            GROUP BY DATE(created_at)
            ORDER BY label DESC
            LIMIT 14
            """,
            tuple(date_params),
        )
        itinerary_trend = list(reversed(cursor.fetchall()))

        feedback_conditions = []
        feedback_params = []
        _append_date_filters(feedback_conditions, feedback_params, 'created_at', start_date, end_date)
        feedback_where = f"WHERE {' AND '.join(feedback_conditions)}" if feedback_conditions else ''
        cursor.execute(
            f"""
            SELECT rating_type AS label, COUNT(*) AS value
            FROM trip_feedback
            {feedback_where}
            GROUP BY rating_type
            ORDER BY value DESC
            """,
            tuple(feedback_params),
        )
        feedback_labels = cursor.fetchall()

        cursor.execute(
            """
            SELECT COALESCE(category, 'Uncategorized') AS label, COUNT(*) AS value
            FROM places
            GROUP BY COALESCE(category, 'Uncategorized')
            ORDER BY value DESC
            LIMIT 8
            """
        )
        top_categories = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT DATE(created_at) AS label, COUNT(*) AS value
            FROM users
            {date_where}
            GROUP BY DATE(created_at)
            ORDER BY label DESC
            LIMIT 14
            """,
            tuple(date_params),
        )
        user_growth = list(reversed(cursor.fetchall()))

        cursor.execute("SELECT COUNT(*) AS value FROM push_tokens")
        push_tokens = int((cursor.fetchone() or {}).get('value') or 0)
        cursor.execute("SELECT COUNT(*) AS value FROM ml_training_runs")
        ml_runs = int((cursor.fetchone() or {}).get('value') or 0)

        return _json_safe({
            'itinerary_trend': itinerary_trend,
            'feedback_labels': feedback_labels,
            'top_categories': top_categories,
            'user_growth': user_growth,
            'totals': {
                'push_tokens': push_tokens,
                'ml_runs': ml_runs,
            },
        })
    finally:
        cursor.close()
        db.close()


def create_ml_training_run(started_by, status='running', dataset_rows=0):
    """Create a training-run record before work begins."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO ml_training_runs (status, dataset_rows, started_by)
            VALUES (%s, %s, %s)
            """,
            (status, int(dataset_rows or 0), int(started_by)),
        )
        db.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        db.close()


def finish_ml_training_run(run_id, *, status, dataset_rows=0, accuracy=None, metrics=None, artifact_paths=None, error_message=None):
    """Complete a training-run record with metrics or failure details."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE ml_training_runs
            SET status = %s,
                dataset_rows = %s,
                accuracy = %s,
                metrics = %s,
                artifact_paths = %s,
                error_message = %s,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (
                status,
                int(dataset_rows or 0),
                accuracy,
                json.dumps(_json_safe(metrics or {})),
                json.dumps(_json_safe(artifact_paths or {})),
                error_message,
                int(run_id),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def get_latest_ml_training_run():
    """Return the newest ML training run and artifact metadata."""
    ensure_admin_tables()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                runs.id,
                runs.status,
                runs.dataset_rows,
                runs.accuracy,
                runs.metrics,
                runs.artifact_paths,
                runs.started_by,
                users.username AS started_by_name,
                runs.started_at,
                runs.completed_at,
                runs.error_message
            FROM ml_training_runs runs
            LEFT JOIN users ON users.id = runs.started_by
            ORDER BY runs.started_at DESC, runs.id DESC
            LIMIT 1
            """
        )
        run = cursor.fetchone()
        if run:
            run['metrics'] = _coerce_json_value(run.get('metrics'), {})
            run['artifact_paths'] = _coerce_json_value(run.get('artifact_paths'), {})
            return _json_safe(run)

        base_dir = Path(current_app.root_path).resolve()
        artifacts = {
            'model': base_dir / 'anotara_ml_model.pkl',
            'columns': base_dir / 'anotara_model_columns.pkl',
            'place_catalog': base_dir / 'anotara_place_catalog.pkl',
        }
        artifact_status = {
            key: {
                'path': str(path),
                'exists': path.exists(),
                'updated_at': datetime.fromtimestamp(path.stat().st_mtime).isoformat() if path.exists() else None,
            }
            for key, path in artifacts.items()
        }
        return {
            'id': None,
            'status': 'ready' if all(item['exists'] for item in artifact_status.values()) else 'not_trained',
            'dataset_rows': 0,
            'accuracy': None,
            'metrics': {},
            'artifact_paths': artifact_status,
            'started_by': None,
            'started_by_name': None,
            'started_at': None,
            'completed_at': None,
            'error_message': None,
        }
    finally:
        cursor.close()
        db.close()


def list_ml_training_runs(limit=8):
    """Return recent ML training history for the admin console."""
    ensure_admin_tables()
    safe_limit = max(1, min(int(limit or 8), 30))
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                runs.id,
                runs.status,
                runs.dataset_rows,
                runs.accuracy,
                runs.metrics,
                runs.started_at,
                runs.completed_at,
                runs.error_message,
                users.username AS started_by_name
            FROM ml_training_runs runs
            LEFT JOIN users ON users.id = runs.started_by
            ORDER BY runs.started_at DESC, runs.id DESC
            LIMIT %s
            """,
            (safe_limit,),
        )
        rows = cursor.fetchall()
        for row in rows:
            row['metrics'] = _coerce_json_value(row.get('metrics'), {})
        return [_json_safe(row) for row in rows]
    finally:
        cursor.close()
        db.close()


def export_feedback_training_dataset():
    """Export user-generated planning signals into a CSV for model retraining."""
    ensure_feedback_columns()
    ensure_itinerary_metadata_columns()
    ensure_place_metadata_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                itineraries.budget AS user_budget,
                itineraries.num_days AS user_days,
                itineraries.preferences,
                places.name AS place_name,
                COALESCE(places.city, '') AS place_province,
                places.category AS place_category,
                places.rating AS place_rating,
                trip_feedback.rating_type
            FROM trip_feedback
            INNER JOIN itineraries ON itineraries.id = trip_feedback.itinerary_id
            INNER JOIN places ON places.id = trip_feedback.place_id
            WHERE places.name IS NOT NULL
            ORDER BY trip_feedback.created_at DESC
            """
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        db.close()

    preference_keys = ['food', 'beach', 'nature', 'museums', 'nightlife']
    records = []
    for row in rows:
        preferences = _coerce_json_value(row.get('preferences'), [])
        preference_tokens = {str(item).lower() for item in preferences if item}
        record = {
            'user_budget': row.get('user_budget') or 'comfort',
            'user_days': int(row.get('user_days') or 1),
            'place_name': row.get('place_name') or '',
            'place_province': row.get('place_province') or '',
            'place_category': row.get('place_category') or 'general',
            'place_rating': float(row.get('place_rating') or 3.5),
            'is_recommended': 1 if str(row.get('rating_type') or '').lower() in {'best pick', 'best_pick', 'like', 'liked'} else 0,
        }
        for key in preference_keys:
            record[f'pref_{key}'] = 1 if key in preference_tokens else 0
        records.append(record)

    if not records:
        return None, 0

    label_values = {record['is_recommended'] for record in records}
    if len(label_values) < 2:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT
                    name,
                    COALESCE(city, '') AS city,
                    category,
                    COALESCE(rating, 3.5) AS rating
                FROM places
                WHERE name IS NOT NULL
                ORDER BY rating ASC, name ASC
                LIMIT %s
                """,
                (max(12, len(records)),),
            )
            fallback_places = cursor.fetchall()
        finally:
            cursor.close()
            db.close()

        if fallback_places:
            synthetic_labels = {0 if 1 in label_values else 1}
            for index, place in enumerate(fallback_places):
                source_record = records[index % len(records)]
                synthetic_record = dict(source_record)
                synthetic_record.update({
                    'place_name': place.get('name') or source_record['place_name'],
                    'place_province': place.get('city') or source_record['place_province'],
                    'place_category': place.get('category') or source_record['place_category'],
                    'place_rating': float(place.get('rating') or 3.5),
                    'is_recommended': next(iter(synthetic_labels)),
                })
                records.append(synthetic_record)

    fieldnames = [
        'user_budget',
        'user_days',
        'pref_beach',
        'pref_food',
        'pref_museums',
        'pref_nature',
        'pref_nightlife',
        'place_name',
        'place_province',
        'place_category',
        'place_rating',
        'is_recommended',
    ]
    dataset_file = tempfile.NamedTemporaryFile(
        mode='w',
        newline='',
        suffix='.csv',
        prefix='anotara_feedback_training_',
        delete=False,
        encoding='utf-8',
    )
    with dataset_file:
        writer = csv.DictWriter(dataset_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    return dataset_file.name, len(records)