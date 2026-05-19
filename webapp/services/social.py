"""Social and collaboration database helpers for the Anotara backend.

This module owns every persistence concern for "The Flock" — friendships,
trip collaborators, the Tara Na! voting room (multiplayer wizard), the
Interactive Memory Log, and the Apex Hotel Recommendation cache.

All routes go through these helpers so the Flask blueprints stay thin and
SQL-free, matching the project's strict service-layer mandate.
"""

import json
import secrets
from datetime import datetime, timedelta

from webapp.services.database import (
    get_db,
    get_table_columns,
)


# ---------------------------------------------------------------------------
# Schema bootstrapping — idempotent migrations executed on demand so the app
# never crashes on a stale database. Mirrors the existing `ensure_*` helpers
# in `database.py` and keeps the SQL inside the service layer.
# ---------------------------------------------------------------------------


def ensure_social_schema():
    """Create every table required by the social/collaboration features."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS friendships (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                requester_id INT NOT NULL,
                addressee_id INT NOT NULL,
                status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_friend_pair (requester_id, addressee_id),
                FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS trip_collaborators (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id INT NOT NULL,
                user_id      INT NOT NULL,
                role         VARCHAR(20) NOT NULL DEFAULT 'editor',
                invited_by   INT,
                accepted_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_collab_pair (itinerary_id, user_id),
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS trip_activity (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id INT NOT NULL,
                user_id      INT NOT NULL,
                action       VARCHAR(40) NOT NULL,
                payload      JSON,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vote_sessions (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                host_id       INT NOT NULL,
                session_code  VARCHAR(12) NOT NULL UNIQUE,
                status        VARCHAR(20) NOT NULL DEFAULT 'lobby',
                current_step  INT NOT NULL DEFAULT 1,
                expires_at    DATETIME NULL,
                resolved_payload JSON NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vote_session_participants (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                session_id   INT NOT NULL,
                user_id      INT NOT NULL,
                joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_participant (session_id, user_id),
                FOREIGN KEY (session_id) REFERENCES vote_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vote_session_responses (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                session_id   INT NOT NULL,
                user_id      INT NOT NULL,
                question_key VARCHAR(40) NOT NULL,
                response     JSON,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_vote_response (session_id, user_id, question_key),
                FOREIGN KEY (session_id) REFERENCES vote_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS itinerary_item_memories (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id INT NOT NULL,
                item_id      INT NOT NULL,
                user_id      INT NOT NULL,
                kind         VARCHAR(20) NOT NULL,
                note         TEXT,
                image_data   LONGTEXT,
                mime_type    VARCHAR(40),
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS hotel_recommendations (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                itinerary_id  INT NOT NULL,
                day_number    INT NOT NULL,
                name          VARCHAR(180) NOT NULL,
                pitch         TEXT,
                rating        DECIMAL(3,1) DEFAULT 0,
                price_band    VARCHAR(20) DEFAULT 'comfort',
                est_price_php INT DEFAULT 0,
                latitude      DECIMAL(10, 7),
                longitude     DECIMAL(10, 7),
                booking_url   VARCHAR(400),
                thumbnail_url VARCHAR(400),
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_hotel_per_day (itinerary_id, day_number),
                FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
            )
            """
        )

        db.commit()
    finally:
        cursor.close()
        db.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_friend_summary(row):
    """Normalize a user row into the lightweight friend payload sent to the UI."""
    if not row:
        return None
    return {
        "id": row.get("id"),
        "username": row.get("username"),
        "email": row.get("email"),
    }


# ---------------------------------------------------------------------------
# Friendships
# ---------------------------------------------------------------------------


def search_users(current_user_id, query, limit=8):
    """Return up to `limit` users whose username or email matches the query."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    safe_query = f"%{(query or '').strip()}%"
    safe_limit = max(1, min(int(limit or 8), 25))

    try:
        cursor.execute(
            """
            SELECT
                u.id,
                u.username,
                u.email,
                f.status AS friendship_status,
                f.requester_id AS friendship_requester
            FROM users u
            LEFT JOIN friendships f
                ON (f.requester_id = u.id AND f.addressee_id = %s)
                OR (f.addressee_id = u.id AND f.requester_id = %s)
            WHERE u.id <> %s
              AND (u.username LIKE %s OR u.email LIKE %s)
            ORDER BY u.username ASC
            LIMIT %s
            """,
            (
                int(current_user_id),
                int(current_user_id),
                int(current_user_id),
                safe_query,
                safe_query,
                safe_limit,
            ),
        )
        rows = cursor.fetchall()
        results = []
        for row in rows:
            status = row.get("friendship_status")
            requester = row.get("friendship_requester")
            relation = "none"
            if status == "accepted":
                relation = "friend"
            elif status == "pending":
                relation = (
                    "request_sent" if requester == int(current_user_id) else "request_received"
                )
            elif status == "blocked":
                relation = "blocked"
            results.append(
                {
                    "id": row.get("id"),
                    "username": row.get("username"),
                    "email": row.get("email"),
                    "relation": relation,
                }
            )
        return results
    finally:
        cursor.close()
        db.close()


def send_friend_request(requester_id, addressee_id):
    """Create or reactivate a friend request, returning the friendship row."""
    if int(requester_id) == int(addressee_id):
        return None, "You can't add yourself as a friend."

    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, status, requester_id, addressee_id
            FROM friendships
            WHERE (requester_id = %s AND addressee_id = %s)
               OR (requester_id = %s AND addressee_id = %s)
            """,
            (
                int(requester_id),
                int(addressee_id),
                int(addressee_id),
                int(requester_id),
            ),
        )
        existing = cursor.fetchone()

        if existing and existing.get("status") == "accepted":
            return _serialize_friendship(existing), None

        if existing:
            cursor.execute(
                """
                UPDATE friendships
                SET status = 'pending',
                    requester_id = %s,
                    addressee_id = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (int(requester_id), int(addressee_id), existing["id"]),
            )
            db.commit()
            cursor.execute("SELECT * FROM friendships WHERE id = %s", (existing["id"],))
            return _serialize_friendship(cursor.fetchone()), None

        cursor.execute(
            """
            INSERT INTO friendships (requester_id, addressee_id, status)
            VALUES (%s, %s, 'pending')
            """,
            (int(requester_id), int(addressee_id)),
        )
        db.commit()
        cursor.execute(
            "SELECT * FROM friendships WHERE id = %s", (cursor.lastrowid,)
        )
        return _serialize_friendship(cursor.fetchone()), None
    finally:
        cursor.close()
        db.close()


def respond_to_friend_request(user_id, friendship_id, decision):
    """Accept or decline a pending friend request that targets this user."""
    if decision not in {"accepted", "declined"}:
        return None, "Decision must be 'accepted' or 'declined'."

    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT id, status, requester_id, addressee_id
            FROM friendships
            WHERE id = %s AND addressee_id = %s
            """,
            (int(friendship_id), int(user_id)),
        )
        existing = cursor.fetchone()
        if not existing:
            return None, "Friend request not found."
        if existing.get("status") != "pending":
            return _serialize_friendship(existing), None

        if decision == "declined":
            cursor.execute(
                "DELETE FROM friendships WHERE id = %s",
                (int(friendship_id),),
            )
            db.commit()
            return {"id": int(friendship_id), "status": "declined"}, None

        cursor.execute(
            """
            UPDATE friendships
            SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (int(friendship_id),),
        )
        db.commit()
        cursor.execute("SELECT * FROM friendships WHERE id = %s", (int(friendship_id),))
        return _serialize_friendship(cursor.fetchone()), None
    finally:
        cursor.close()
        db.close()


def remove_friendship(user_id, target_user_id):
    """Delete any friendship row between the two users."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            DELETE FROM friendships
            WHERE (requester_id = %s AND addressee_id = %s)
               OR (requester_id = %s AND addressee_id = %s)
            """,
            (
                int(user_id),
                int(target_user_id),
                int(target_user_id),
                int(user_id),
            ),
        )
        db.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        db.close()


def list_friends(user_id):
    """Return the user's accepted friends and any pending requests in/out."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                f.id AS friendship_id,
                f.status,
                f.requester_id,
                f.addressee_id,
                u.id AS user_id,
                u.username,
                u.email
            FROM friendships f
            INNER JOIN users u
                ON u.id = CASE WHEN f.requester_id = %s THEN f.addressee_id ELSE f.requester_id END
            WHERE f.requester_id = %s OR f.addressee_id = %s
            ORDER BY f.updated_at DESC, f.created_at DESC
            """,
            (int(user_id), int(user_id), int(user_id)),
        )
        rows = cursor.fetchall()
        friends = []
        incoming = []
        outgoing = []
        for row in rows:
            entry = {
                "friendship_id": row["friendship_id"],
                "id": row["user_id"],
                "username": row["username"],
                "email": row["email"],
            }
            if row["status"] == "accepted":
                friends.append(entry)
            elif row["status"] == "pending":
                if row["requester_id"] == int(user_id):
                    outgoing.append(entry)
                else:
                    incoming.append(entry)
        return {"friends": friends, "incoming": incoming, "outgoing": outgoing}
    finally:
        cursor.close()
        db.close()


def _serialize_friendship(row):
    if not row:
        return None
    return {
        "id": row.get("id"),
        "status": row.get("status"),
        "requester_id": row.get("requester_id"),
        "addressee_id": row.get("addressee_id"),
    }


# ---------------------------------------------------------------------------
# Trip collaborators
# ---------------------------------------------------------------------------


def _itinerary_owner_id(itinerary_id):
    """Return the owner of an itinerary, or None when missing."""
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            "SELECT user_id FROM itineraries WHERE id = %s",
            (int(itinerary_id),),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else None
    finally:
        cursor.close()
        db.close()


def can_access_itinerary(user_id, itinerary_id):
    """True when the user owns the itinerary or is a collaborator."""
    owner_id = _itinerary_owner_id(itinerary_id)
    if owner_id is None:
        return False
    if owner_id == int(user_id):
        return True

    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            SELECT 1 FROM trip_collaborators
            WHERE itinerary_id = %s AND user_id = %s
            """,
            (int(itinerary_id), int(user_id)),
        )
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        db.close()


def add_collaborator(itinerary_id, invited_user_id, invited_by_id, role="editor"):
    """Insert (or refresh) a trip collaborator row."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO trip_collaborators
                (itinerary_id, user_id, role, invited_by)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                role = VALUES(role),
                invited_by = VALUES(invited_by),
                last_seen_at = CURRENT_TIMESTAMP
            """,
            (
                int(itinerary_id),
                int(invited_user_id),
                str(role)[:20],
                int(invited_by_id),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def remove_collaborator(itinerary_id, user_id):
    """Drop a collaborator from an itinerary."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            DELETE FROM trip_collaborators
            WHERE itinerary_id = %s AND user_id = %s
            """,
            (int(itinerary_id), int(user_id)),
        )
        db.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        db.close()


def list_collaborators(itinerary_id):
    """Return owner + collaborators for an itinerary, oldest first."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                u.id AS user_id,
                u.username,
                u.email,
                'owner' AS role,
                i.created_at AS accepted_at,
                i.created_at AS last_seen_at
            FROM itineraries i
            INNER JOIN users u ON u.id = i.user_id
            WHERE i.id = %s
            UNION ALL
            SELECT
                u.id AS user_id,
                u.username,
                u.email,
                tc.role,
                tc.accepted_at,
                tc.last_seen_at
            FROM trip_collaborators tc
            INNER JOIN users u ON u.id = tc.user_id
            WHERE tc.itinerary_id = %s
            ORDER BY accepted_at ASC
            """,
            (int(itinerary_id), int(itinerary_id)),
        )
        rows = cursor.fetchall()
        flock = []
        for row in rows:
            last_seen = row.get("last_seen_at")
            is_online = False
            if isinstance(last_seen, datetime):
                is_online = (datetime.utcnow() - last_seen).total_seconds() < 90
            flock.append(
                {
                    "user_id": row.get("user_id"),
                    "username": row.get("username"),
                    "email": row.get("email"),
                    "role": row.get("role"),
                    "is_online": is_online,
                }
            )
        return flock
    finally:
        cursor.close()
        db.close()


def touch_collaborator_presence(itinerary_id, user_id):
    """Refresh last_seen_at so other collaborators can see live presence."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE trip_collaborators
            SET last_seen_at = CURRENT_TIMESTAMP
            WHERE itinerary_id = %s AND user_id = %s
            """,
            (int(itinerary_id), int(user_id)),
        )
        if cursor.rowcount == 0:
            cursor.execute(
                """
                UPDATE itineraries SET created_at = created_at
                WHERE id = %s AND user_id = %s
                """,
                (int(itinerary_id), int(user_id)),
            )
        db.commit()
    finally:
        cursor.close()
        db.close()


def record_trip_activity(itinerary_id, user_id, action, payload=None):
    """Append a log entry that powers the live collaboration toast notifications."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO trip_activity (itinerary_id, user_id, action, payload)
            VALUES (%s, %s, %s, %s)
            """,
            (
                int(itinerary_id),
                int(user_id),
                str(action)[:40],
                json.dumps(payload or {}),
            ),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def list_trip_activity(itinerary_id, since=None, limit=30):
    """Return the most recent collaboration events for an itinerary."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        if since:
            cursor.execute(
                """
                SELECT ta.id, ta.user_id, ta.action, ta.payload, ta.created_at, u.username
                FROM trip_activity ta
                INNER JOIN users u ON u.id = ta.user_id
                WHERE ta.itinerary_id = %s AND ta.id > %s
                ORDER BY ta.id ASC
                LIMIT %s
                """,
                (int(itinerary_id), int(since), int(limit)),
            )
        else:
            cursor.execute(
                """
                SELECT ta.id, ta.user_id, ta.action, ta.payload, ta.created_at, u.username
                FROM trip_activity ta
                INNER JOIN users u ON u.id = ta.user_id
                WHERE ta.itinerary_id = %s
                ORDER BY ta.id DESC
                LIMIT %s
                """,
                (int(itinerary_id), int(limit)),
            )
        rows = cursor.fetchall()
        for row in rows:
            payload = row.get("payload")
            if isinstance(payload, str):
                try:
                    row["payload"] = json.loads(payload)
                except (TypeError, ValueError):
                    row["payload"] = {}
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].isoformat()
        return rows
    finally:
        cursor.close()
        db.close()


# ---------------------------------------------------------------------------
# Tara Na! voting room
# ---------------------------------------------------------------------------


def _new_session_code():
    """Return a 8-character URL-safe lobby code."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def create_vote_session(host_id, ttl_minutes=90):
    """Create a fresh voting room and return its public payload."""
    ensure_social_schema()
    expires_at = datetime.utcnow() + timedelta(minutes=int(ttl_minutes or 90))
    db = get_db()
    cursor = db.cursor()

    try:
        # Retry a couple of times in the rare event the random code collides.
        for _ in range(5):
            session_code = _new_session_code()
            try:
                cursor.execute(
                    """
                    INSERT INTO vote_sessions
                        (host_id, session_code, status, current_step, expires_at)
                    VALUES (%s, %s, 'lobby', 1, %s)
                    """,
                    (int(host_id), session_code, expires_at),
                )
                session_id = cursor.lastrowid
                cursor.execute(
                    """
                    INSERT INTO vote_session_participants (session_id, user_id)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP
                    """,
                    (session_id, int(host_id)),
                )
                db.commit()
                return get_vote_session(session_id, host_id), None
            except Exception:  # pragma: no cover - retry path
                continue
        return None, "Could not allocate a session code. Try again."
    finally:
        cursor.close()
        db.close()


def join_vote_session(session_code, user_id):
    """Join an existing lobby by code; refreshes presence if already joined."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id FROM vote_sessions WHERE session_code = %s",
            (str(session_code).strip().upper(),),
        )
        row = cursor.fetchone()
        if not row:
            return None, "Lobby not found."
        session_id = row["id"]
        cursor.execute(
            """
            INSERT INTO vote_session_participants (session_id, user_id)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP
            """,
            (session_id, int(user_id)),
        )
        db.commit()
        return get_vote_session(session_id, user_id), None
    finally:
        cursor.close()
        db.close()


def submit_vote(session_id, user_id, question_key, response):
    """Persist a participant's response for one question."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            INSERT INTO vote_session_participants (session_id, user_id)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP
            """,
            (int(session_id), int(user_id)),
        )

        cursor.execute(
            """
            INSERT INTO vote_session_responses
                (session_id, user_id, question_key, response)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                response = VALUES(response),
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                int(session_id),
                int(user_id),
                str(question_key)[:40],
                json.dumps(response),
            ),
        )
        db.commit()
        return get_vote_session(session_id, user_id), None
    finally:
        cursor.close()
        db.close()


def advance_vote_session(session_id, host_id, next_step=None, status=None):
    """Host-only: move the lobby forward to the next question or status."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT host_id, current_step FROM vote_sessions WHERE id = %s",
            (int(session_id),),
        )
        session_row = cursor.fetchone()
        if not session_row:
            return None, "Lobby not found."
        if int(session_row["host_id"]) != int(host_id):
            return None, "Only the host can advance the lobby."

        sets = []
        params = []
        if next_step is not None:
            sets.append("current_step = %s")
            params.append(int(next_step))
        if status is not None:
            sets.append("status = %s")
            params.append(str(status)[:20])

        if not sets:
            return get_vote_session(session_id, host_id), None

        params.append(int(session_id))
        cursor.execute(
            f"UPDATE vote_sessions SET {', '.join(sets)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            tuple(params),
        )
        db.commit()
        return get_vote_session(session_id, host_id), None
    finally:
        cursor.close()
        db.close()


def get_vote_session(session_id, requester_id=None):
    """Return the full voting room payload — session, participants, votes."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                vs.id,
                vs.host_id,
                vs.session_code,
                vs.status,
                vs.current_step,
                vs.expires_at,
                vs.resolved_payload,
                vs.created_at,
                vs.updated_at,
                u.username AS host_username
            FROM vote_sessions vs
            INNER JOIN users u ON u.id = vs.host_id
            WHERE vs.id = %s
            """,
            (int(session_id),),
        )
        session = cursor.fetchone()
        if not session:
            return None

        cursor.execute(
            """
            SELECT vsp.user_id, vsp.joined_at, vsp.last_seen_at, u.username
            FROM vote_session_participants vsp
            INNER JOIN users u ON u.id = vsp.user_id
            WHERE vsp.session_id = %s
            ORDER BY vsp.joined_at ASC
            """,
            (int(session_id),),
        )
        participants_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT user_id, question_key, response, updated_at
            FROM vote_session_responses
            WHERE session_id = %s
            """,
            (int(session_id),),
        )
        responses_rows = cursor.fetchall()

        votes_by_question = {}
        for row in responses_rows:
            try:
                response_value = json.loads(row["response"]) if isinstance(row["response"], str) else row["response"]
            except (TypeError, ValueError):
                response_value = row["response"]
            votes_by_question.setdefault(row["question_key"], []).append(
                {
                    "user_id": row["user_id"],
                    "value": response_value,
                }
            )

        participants = []
        for row in participants_rows:
            last_seen = row.get("last_seen_at")
            is_online = False
            if isinstance(last_seen, datetime):
                is_online = (datetime.utcnow() - last_seen).total_seconds() < 60
            participants.append(
                {
                    "user_id": row["user_id"],
                    "username": row["username"],
                    "is_online": is_online,
                    "is_host": int(row["user_id"]) == int(session["host_id"]),
                }
            )

        return {
            "id": session["id"],
            "host_id": session["host_id"],
            "host_username": session.get("host_username"),
            "session_code": session["session_code"],
            "status": session["status"],
            "current_step": session["current_step"],
            "expires_at": session["expires_at"].isoformat() if isinstance(session.get("expires_at"), datetime) else None,
            "resolved": json.loads(session["resolved_payload"]) if isinstance(session.get("resolved_payload"), str) else session.get("resolved_payload"),
            "participants": participants,
            "votes": votes_by_question,
            "requester_is_host": requester_id is not None and int(requester_id) == int(session["host_id"]),
        }
    finally:
        cursor.close()
        db.close()


def aggregate_vote_session(session_id, host_id):
    """Compute majority decisions across the lobby and persist the resolved payload."""
    session = get_vote_session(session_id, host_id)
    if not session:
        return None, "Lobby not found."
    if int(session["host_id"]) != int(host_id):
        return None, "Only the host can resolve the lobby."

    resolved = {}
    for question_key, entries in (session.get("votes") or {}).items():
        if not entries:
            continue
        if question_key == "preferences":
            tally = {}
            for entry in entries:
                values = entry.get("value") or []
                if not isinstance(values, list):
                    continue
                for vibe in values:
                    tally[vibe] = tally.get(vibe, 0) + 1
            ordered = sorted(tally.items(), key=lambda item: item[1], reverse=True)
            resolved[question_key] = [name for name, _ in ordered[:3]]
        elif question_key in {"numDays", "num_days"}:
            numeric_values = [int(entry.get("value") or 0) for entry in entries if entry.get("value")]
            if numeric_values:
                resolved["numDays"] = max(set(numeric_values), key=numeric_values.count)
        else:
            tally = {}
            for entry in entries:
                value = entry.get("value")
                key = json.dumps(value, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
                tally[key] = tally.get(key, 0) + 1
            winning_key = max(tally.items(), key=lambda item: item[1])[0]
            try:
                resolved[question_key] = json.loads(winning_key)
            except (TypeError, ValueError):
                resolved[question_key] = winning_key

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE vote_sessions
            SET resolved_payload = %s,
                status = 'resolved',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (json.dumps(resolved), int(session_id)),
        )
        db.commit()
    finally:
        cursor.close()
        db.close()

    refreshed = get_vote_session(session_id, host_id)
    return refreshed, None


# ---------------------------------------------------------------------------
# Memory Log
# ---------------------------------------------------------------------------


def add_memory_entry(itinerary_id, item_id, user_id, *, kind, note=None, image_data=None, mime_type=None):
    """Attach a photo or note to one itinerary block."""
    ensure_social_schema()
    if kind not in {"photo", "note"}:
        return None, "Memory kind must be 'photo' or 'note'."
    if kind == "photo" and not image_data:
        return None, "Photo memories require image_data."
    if kind == "note" and not (note or "").strip():
        return None, "Note memories require text."

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO itinerary_item_memories
                (itinerary_id, item_id, user_id, kind, note, image_data, mime_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                int(itinerary_id),
                int(item_id),
                int(user_id),
                kind,
                (note or "").strip() or None,
                image_data,
                str(mime_type)[:40] if mime_type else None,
            ),
        )
        db.commit()
        return cursor.lastrowid, None
    finally:
        cursor.close()
        db.close()


def list_memories(itinerary_id, item_id=None):
    """Return every memory attached to an itinerary, optionally filtered by item."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        if item_id is None:
            cursor.execute(
                """
                SELECT m.id, m.itinerary_id, m.item_id, m.user_id, m.kind, m.note,
                       m.image_data, m.mime_type, m.created_at, u.username
                FROM itinerary_item_memories m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.itinerary_id = %s
                ORDER BY m.created_at DESC, m.id DESC
                """,
                (int(itinerary_id),),
            )
        else:
            cursor.execute(
                """
                SELECT m.id, m.itinerary_id, m.item_id, m.user_id, m.kind, m.note,
                       m.image_data, m.mime_type, m.created_at, u.username
                FROM itinerary_item_memories m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.itinerary_id = %s AND m.item_id = %s
                ORDER BY m.created_at DESC, m.id DESC
                """,
                (int(itinerary_id), int(item_id)),
            )
        rows = cursor.fetchall()
        for row in rows:
            created_at = row.get("created_at")
            if isinstance(created_at, datetime):
                row["created_at"] = created_at.isoformat()
        return rows
    finally:
        cursor.close()
        db.close()


def delete_memory(memory_id, user_id):
    """Remove a memory entry if the requesting user owns it."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            DELETE FROM itinerary_item_memories
            WHERE id = %s AND user_id = %s
            """,
            (int(memory_id), int(user_id)),
        )
        db.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        db.close()


# ---------------------------------------------------------------------------
# Apex Hotel Recommendation Engine
# ---------------------------------------------------------------------------


def _last_item_coords_for_day(itinerary_id, day_number):
    """Return the (lat, lon) of the latest stop in a particular itinerary day."""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT p.latitude, p.longitude, p.city
            FROM itinerary_items ii
            INNER JOIN places p ON p.id = ii.place_id
            WHERE ii.itinerary_id = %s AND ii.day_number = %s
            ORDER BY ii.sequence_order DESC, ii.id DESC
            LIMIT 1
            """,
            (int(itinerary_id), int(day_number)),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        db.close()


def _curate_hotel_for_day(itinerary_id, day_number, budget):
    """Pick a plausible hotel near the day's final stop based on the catalog."""
    anchor = _last_item_coords_for_day(itinerary_id, day_number)
    db = get_db()
    cursor = db.cursor(dictionary=True)

    band_label = {
        "low": "Backpacker",
        "comfort": "Comfort",
        "high": "Luxury",
    }.get(str(budget or "comfort").lower(), "Comfort")

    price_estimate = {
        "low": 950,
        "comfort": 2800,
        "high": 7800,
    }.get(str(budget or "comfort").lower(), 2800)

    try:
        if anchor and anchor.get("city"):
            cursor.execute(
                """
                SELECT id, name, city, latitude, longitude, rating
                FROM places
                WHERE city = %s AND (
                    LOWER(category) LIKE '%%hotel%%' OR LOWER(category) LIKE '%%resort%%' OR
                    LOWER(category) LIKE '%%lodging%%' OR LOWER(category) LIKE '%%inn%%' OR
                    LOWER(tags) LIKE '%%hotel%%' OR LOWER(tags) LIKE '%%resort%%'
                )
                ORDER BY rating DESC, name ASC
                LIMIT 6
                """,
                (anchor["city"],),
            )
            candidates = cursor.fetchall()
            if not candidates:
                cursor.execute(
                    """
                    SELECT id, name, city, latitude, longitude, rating
                    FROM places
                    WHERE city = %s
                    ORDER BY rating DESC, name ASC
                    LIMIT 6
                    """,
                    (anchor["city"],),
                )
                candidates = cursor.fetchall()
        else:
            candidates = []

        chosen = candidates[0] if candidates else None
        latitude = float(chosen["latitude"]) if chosen and chosen.get("latitude") is not None else (
            float(anchor["latitude"]) if anchor and anchor.get("latitude") is not None else None
        )
        longitude = float(chosen["longitude"]) if chosen and chosen.get("longitude") is not None else (
            float(anchor["longitude"]) if anchor and anchor.get("longitude") is not None else None
        )
        rating = float(chosen["rating"]) if chosen and chosen.get("rating") is not None else 4.4

        name = chosen["name"] if chosen and chosen.get("name") else (
            f"{(anchor or {}).get('city') or 'Local'} {band_label} Stay"
        )

        pitch = (
            f"Located within minutes of your final stop on Day {day_number} — a "
            f"{band_label.lower()} pick that keeps you close to tomorrow's first activity."
        )

        booking_query = name.replace(" ", "+")
        booking_url = f"https://www.booking.com/search.html?ss={booking_query}"

        return {
            "name": name,
            "pitch": pitch,
            "rating": rating,
            "price_band": str(budget or "comfort").lower(),
            "est_price_php": price_estimate,
            "latitude": latitude,
            "longitude": longitude,
            "booking_url": booking_url,
            "thumbnail_url": None,
        }
    finally:
        cursor.close()
        db.close()


def get_hotel_recommendation(itinerary_id, day_number, refresh=False, budget=None):
    """Return a cached hotel recommendation, generating one on demand."""
    ensure_social_schema()
    db = get_db()
    cursor = db.cursor(dictionary=True)

    try:
        if not refresh:
            cursor.execute(
                """
                SELECT * FROM hotel_recommendations
                WHERE itinerary_id = %s AND day_number = %s
                """,
                (int(itinerary_id), int(day_number)),
            )
            cached = cursor.fetchone()
            if cached:
                return _hotel_row_to_payload(cached)

        curated = _curate_hotel_for_day(itinerary_id, day_number, budget)
        if not curated:
            return None

        cursor.execute(
            """
            INSERT INTO hotel_recommendations
                (itinerary_id, day_number, name, pitch, rating, price_band,
                 est_price_php, latitude, longitude, booking_url, thumbnail_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                pitch = VALUES(pitch),
                rating = VALUES(rating),
                price_band = VALUES(price_band),
                est_price_php = VALUES(est_price_php),
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                booking_url = VALUES(booking_url),
                thumbnail_url = VALUES(thumbnail_url)
            """,
            (
                int(itinerary_id),
                int(day_number),
                curated["name"],
                curated["pitch"],
                curated["rating"],
                curated["price_band"],
                curated["est_price_php"],
                curated["latitude"],
                curated["longitude"],
                curated["booking_url"],
                curated["thumbnail_url"],
            ),
        )
        db.commit()

        cursor.execute(
            """
            SELECT * FROM hotel_recommendations
            WHERE itinerary_id = %s AND day_number = %s
            """,
            (int(itinerary_id), int(day_number)),
        )
        return _hotel_row_to_payload(cursor.fetchone())
    finally:
        cursor.close()
        db.close()


def _hotel_row_to_payload(row):
    if not row:
        return None
    return {
        "id": row.get("id"),
        "itinerary_id": row.get("itinerary_id"),
        "day_number": row.get("day_number"),
        "name": row.get("name"),
        "pitch": row.get("pitch"),
        "rating": float(row.get("rating") or 0),
        "price_band": row.get("price_band"),
        "est_price_php": int(row.get("est_price_php") or 0),
        "latitude": float(row["latitude"]) if row.get("latitude") is not None else None,
        "longitude": float(row["longitude"]) if row.get("longitude") is not None else None,
        "booking_url": row.get("booking_url"),
        "thumbnail_url": row.get("thumbnail_url"),
    }


__all__ = [
    "ensure_social_schema",
    "search_users",
    "send_friend_request",
    "respond_to_friend_request",
    "remove_friendship",
    "list_friends",
    "can_access_itinerary",
    "add_collaborator",
    "remove_collaborator",
    "list_collaborators",
    "touch_collaborator_presence",
    "record_trip_activity",
    "list_trip_activity",
    "create_vote_session",
    "join_vote_session",
    "submit_vote",
    "advance_vote_session",
    "get_vote_session",
    "aggregate_vote_session",
    "add_memory_entry",
    "list_memories",
    "delete_memory",
    "get_hotel_recommendation",
]
