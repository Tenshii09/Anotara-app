"""Database helpers for the Anotara backend.

These functions isolate raw MySQL access so route handlers stay short and
focused on request/response logic.
"""

import hashlib
import json
from decimal import Decimal

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


def ensure_admin_account_columns():
    """Create the table used to persist admin login accounts."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                username      VARCHAR(50) NOT NULL UNIQUE,
                email         VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_admin_activity_columns():
    """Create the table used to audit admin actions."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_activity_log (
                id                 INT AUTO_INCREMENT PRIMARY KEY,
                actor_identity     VARCHAR(100) NOT NULL,
                action             VARCHAR(80) NOT NULL,
                target_type        VARCHAR(80),
                target_identifier   VARCHAR(120),
                details            JSON,
                created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_admin_activity_created_at (created_at),
                INDEX idx_admin_activity_actor (actor_identity)
            )
            """
        )
        existing_columns = get_table_columns('admin_activity_log')
        if 'details' not in existing_columns:
            cursor.execute('ALTER TABLE admin_activity_log ADD COLUMN details JSON')
        db.commit()
    finally:
        cursor.close()
        db.close()


def ensure_schema_upgrades():
    """Apply all database schema upgrades needed by the current codebase."""
    ensure_itinerary_metadata_columns()
    ensure_place_metadata_columns()
    ensure_itinerary_item_columns()
    ensure_feedback_columns()
    ensure_weather_alert_columns()
    ensure_push_token_columns()
    ensure_admin_account_columns()
    ensure_admin_activity_columns()


def create_admin_account(username, email, password_hash):
    """Insert a new admin account and return its id."""
    ensure_admin_account_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO admin_accounts (username, email, password_hash)
            VALUES (%s, %s, %s)
            """,
            (username, email, password_hash),
        )
        db.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        db.close()


def list_admin_accounts():
    """Return all admin accounts without exposing password hashes."""
    ensure_admin_account_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, username, email, is_active, created_at, updated_at
            FROM admin_accounts
            ORDER BY created_at DESC, id DESC
            """
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


def get_admin_account_by_identifier(identifier):
    """Look up an active admin account by username or email."""
    ensure_admin_account_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, username, email, password_hash, is_active
            FROM admin_accounts
            WHERE (username = %s OR email = %s) AND is_active = TRUE
            LIMIT 1
            """,
            (identifier, identifier),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        db.close()


def get_admin_account_by_id(admin_account_id):
    """Look up an active admin account by id."""
    ensure_admin_account_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, username, email, password_hash, is_active
            FROM admin_accounts
            WHERE id = %s AND is_active = TRUE
            LIMIT 1
            """,
            (admin_account_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        db.close()


def update_admin_account_password(admin_account_id, password_hash):
    """Update the stored password hash for an admin account."""
    ensure_admin_account_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            UPDATE admin_accounts
            SET password_hash = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (password_hash, admin_account_id),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def record_admin_activity(actor_identity, action, target_type=None, target_identifier=None, details=None):
    """Persist an auditable record of an admin action."""
    ensure_admin_activity_columns()
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO admin_activity_log
                (actor_identity, action, target_type, target_identifier, details)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                actor_identity,
                action,
                target_type,
                target_identifier,
                json.dumps(_json_safe_value(details or {})),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def list_admin_activity(limit=25):
    """Return the latest admin audit events."""
    ensure_admin_activity_columns()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, actor_identity, action, target_type, target_identifier, details, created_at
            FROM admin_activity_log
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (int(limit),),
        )
        return cursor.fetchall()
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
    }

    try:
        if {'destination', 'budget', 'num_days', 'preferences'}.issubset(itinerary_columns):
            cursor.execute(
                """
                INSERT INTO itineraries
                    (user_id, trip_name, destination, budget, num_days, preferences, pacing_style, companion_type, transport_mode, accommodation_lat, accommodation_lng, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                status
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