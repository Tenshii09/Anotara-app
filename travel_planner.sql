-- Create and select database
CREATE DATABASE IF NOT EXISTS travel_planner;
USE travel_planner;

-- Users table (authentication)
CREATE TABLE IF NOT EXISTS users (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50)  NOT NULL UNIQUE,
    email    VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,         -- bcrypt hash
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
    physical_intensity  VARCHAR(20) DEFAULT 'Medium'
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
