-- Create and select database
CREATE DATABASE IF NOT EXISTS travel_planner;
USE travel_planner;

-- Users table (authentication)
CREATE TABLE IF NOT EXISTS users (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50)  NOT NULL UNIQUE,
    email    VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,         -- bcrypt hash
    role     VARCHAR(20)  NOT NULL DEFAULT 'user',
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    suspended_at DATETIME NULL,
    suspended_reason VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Places table (fetched from API or pre-seeded)
CREATE TABLE IF NOT EXISTS places (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(150) NOT NULL,
    category  VARCHAR(50)  NOT NULL,        -- food, beach, museum, etc.
    latitude  DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    rating    DECIMAL(3, 1) DEFAULT 0.0,
    city      VARCHAR(100),
    tags      VARCHAR(255),                 -- comma-separated keywords
    environment_type   VARCHAR(20) DEFAULT 'Mixed',
    physical_intensity  VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    curation_notes TEXT NULL,
    source VARCHAR(40) DEFAULT 'system',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by INT NULL
);

-- Immutable admin action history for privileged operations.
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
);

-- ML operations history for retraining visibility and model quality tracking.
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
);

-- Editable operations settings and feature flags surfaced in /admin.
CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key   VARCHAR(80) PRIMARY KEY,
    setting_value TEXT,
    value_type    VARCHAR(20) NOT NULL DEFAULT 'string',
    description   VARCHAR(255),
    updated_by    INT NULL,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO admin_settings
    (setting_key, setting_value, value_type, description)
VALUES
    ('maintenance_mode', 'false', 'boolean', 'Temporarily pause user-facing trip generation notices.'),
    ('admin_broadcasts_enabled', 'true', 'boolean', 'Allow admins to send targeted push notifications.'),
    ('ml_auto_retrain_enabled', 'false', 'boolean', 'Reserve flag for scheduled recommendation model retraining.'),
    ('content_review_required', 'true', 'boolean', 'Keep newly created admin places in review by default.');

-- Admin-triggered notification delivery attempts.
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
);

-- Itineraries table (saved plans per user)
CREATE TABLE IF NOT EXISTS itineraries (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT  NOT NULL,
    trip_name  VARCHAR(100),
    destination VARCHAR(100),
    budget     VARCHAR(20),
    num_days   INT,
    preferences JSON,
    pacing_style VARCHAR(20) DEFAULT 'Moderate',
    companion_type VARCHAR(30) DEFAULT 'Solo',
    transport_mode VARCHAR(20) DEFAULT 'Public',
    accommodation_lat DECIMAL(10, 7),
    accommodation_lng DECIMAL(10, 7),
    status VARCHAR(20) DEFAULT 'Active',
    trip_start_date DATE NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Itinerary items (places per day per trip)
CREATE TABLE IF NOT EXISTS itinerary_items (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    itinerary_id INT NOT NULL,
    day_number   INT NOT NULL,
    place_id     INT NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    estimated_duration INT DEFAULT 60,
    is_locked   BOOLEAN DEFAULT FALSE,
    swap_history INT DEFAULT 0,
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
    FOREIGN KEY (place_id)     REFERENCES places(id)
);

-- Explicit feedback captured from the itinerary page.
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
);

-- ------------------------------------------------------------------
-- The Flock: social + collaboration + voting + memory + hotel tables
-- ------------------------------------------------------------------

-- Bidirectional friend graph (status: pending / accepted / blocked)
CREATE TABLE IF NOT EXISTS friendships (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    requester_id  INT NOT NULL,
    addressee_id  INT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_friend_pair (requester_id, addressee_id),
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Per-itinerary collaborators (owner is implicit via itineraries.user_id)
CREATE TABLE IF NOT EXISTS trip_collaborators (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    itinerary_id  INT NOT NULL,
    user_id       INT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'editor',
    invited_by    INT,
    accepted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_collab_pair (itinerary_id, user_id),
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity log used by the live "Maria removed Willy's Rock" toasts
CREATE TABLE IF NOT EXISTS trip_activity (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    itinerary_id  INT NOT NULL,
    user_id       INT NOT NULL,
    action        VARCHAR(40) NOT NULL,
    payload       JSON,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tara Na! pre-generation voting room
CREATE TABLE IF NOT EXISTS vote_sessions (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    host_id          INT NOT NULL,
    session_code     VARCHAR(12) NOT NULL UNIQUE,
    status           VARCHAR(20) NOT NULL DEFAULT 'lobby',
    current_step     INT NOT NULL DEFAULT 1,
    expires_at       DATETIME NULL,
    resolved_payload JSON NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vote_session_participants (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    session_id   INT NOT NULL,
    user_id      INT NOT NULL,
    joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_participant (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES vote_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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
);

-- Interactive Memory Log — photos + notes per itinerary block
CREATE TABLE IF NOT EXISTS itinerary_item_memories (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    itinerary_id  INT NOT NULL,
    item_id       INT NOT NULL,
    user_id       INT NOT NULL,
    kind          VARCHAR(20) NOT NULL,
    note          TEXT,
    image_data    LONGTEXT,
    mime_type     VARCHAR(40),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Apex Hotel Recommendation Engine cache
CREATE TABLE IF NOT EXISTS hotel_recommendations (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    itinerary_id   INT NOT NULL,
    day_number     INT NOT NULL,
    name           VARCHAR(180) NOT NULL,
    pitch          TEXT,
    rating         DECIMAL(3,1) DEFAULT 0,
    price_band     VARCHAR(20) DEFAULT 'comfort',
    est_price_php  INT DEFAULT 0,
    latitude       DECIMAL(10, 7),
    longitude      DECIMAL(10, 7),
    booking_url    VARCHAR(400),
    thumbnail_url  VARCHAR(400),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_hotel_per_day (itinerary_id, day_number),
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
