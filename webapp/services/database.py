"""Database helpers for the Anotara backend.

These functions isolate raw MySQL access so route handlers stay short and
focused on request/response logic.
"""

import json

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


def save_places_to_db(places):
    """
    Insert places into DB using INSERT IGNORE to skip duplicates.
    Attaches the DB id back to each place dict for itinerary linking.
    """
    # Insert or reuse place rows, then attach the database id back to each item.
    db = get_db()
    cursor = db.cursor(buffered=True)

    try:
        for place in places:
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


def save_itinerary(user_id, destination, itinerary, num_days=None, budget=None, preferences=None):
    """Save a trip and all its day items to the DB, returning the itinerary ID."""
    ensure_itinerary_metadata_columns()
    db = get_db()
    cursor = db.cursor(buffered=True)
    itinerary_columns = get_table_columns('itineraries')
    preferences_json = json.dumps(preferences or [])

    try:
        if {'destination', 'budget', 'num_days', 'preferences'}.issubset(itinerary_columns):
            cursor.execute(
                """
                INSERT INTO itineraries
                    (user_id, trip_name, destination, budget, num_days, preferences)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    f'Trip to {destination}',
                    destination,
                    budget,
                    num_days,
                    preferences_json,
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
            for place in day_places:
                place_id = place.get('id')
                if place_id:
                    cursor.execute(
                        """
                        INSERT INTO itinerary_items
                            (itinerary_id, day_number, place_id)
                        VALUES (%s, %s, %s)
                        """,
                        (itinerary_id, day_num, place_id),
                    )
        db.commit()
        return itinerary_id
    finally:
        cursor.close()
        db.close()


def save_place_feedback(user_id, itinerary_id, place_id, feedback_value):
    """Store explicit feedback for one itinerary stop."""
    db = get_db()
    cursor = db.cursor(buffered=True)

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS trip_feedback (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id   INT NOT NULL,
                user_id        INT NOT NULL,
                place_id       INT NOT NULL,
                feedback_value TINYINT NOT NULL,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_trip_feedback (itinerary_id, user_id, place_id),
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (place_id)     REFERENCES places(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO trip_feedback (itinerary_id, user_id, place_id, feedback_value)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                feedback_value = VALUES(feedback_value),
                created_at = CURRENT_TIMESTAMP
            """,
            (itinerary_id, user_id, place_id, feedback_value),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()