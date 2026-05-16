# Anotara Travel Planner System Documentation

## Overview

Anotara is a Philippine travel planning system that generates personalized itineraries based on a user's destination, travel length, interests, and budget. The system combines a React frontend, a Flask REST API backend, a MySQL database, external mapping and place APIs, and a machine learning reranker that improves recommendations over time.

The product goal is not just to list nearby places. It is to act like a travel companion that selects the best stops, keeps the day route practical, explains why each stop matters, and learns from user feedback.

## Core Product Features

### 1. User Authentication

- Users can register and log in.
- Authentication is handled with Flask JWT tokens.
- Passwords are hashed with bcrypt.
- The frontend stores the JWT in localStorage for later API calls.

### 2. Guided Trip Wizard

- A React-based multi-step wizard collects trip preferences.
- The user selects:
  - Destination
  - Number of days
  - Interests such as food, beach, nature, museums, and nightlife
  - Budget level such as low, comfort, or high
- The wizard persists draft state locally so users can refresh without losing progress.

### 3. Personalized Itinerary Generation

- The backend geocodes the destination.
- It fetches candidate places from Geoapify.
- It scores and ranks candidates using a machine-learning model when available.
- It falls back to rule-based scoring and seeded places when live API data is weak or unavailable.
- The final itinerary keeps only a small number of strong places per day.

### 4. Route-Aware Planning

- The system prefers nearby places when ranking candidates.
- Places are ordered to reduce unnecessary movement.
- Each stop includes a suggested time to spend.
- The itinerary tries to feel realistic rather than overstuffed.

### 5. Map-Based Experience

- The frontend shows the generated itinerary on an interactive map.
- The map layer visualizes stops, route sequence, and destination context.
- The itinerary and the map stay synchronized.

### 6. Recommendation Explanations

- Each place can include a short explanation for why it was selected.
- The system can show approximate distance from the destination.
- The UI can show recommended stay duration.

### 7. Feedback Loop

- Users can mark a place as a best pick or not ideal.
- Feedback is saved to the backend.
- This creates training data for future model updates.

### 8. Saved Trips

- Generated itineraries are saved in the database.
- The backend returns an itinerary ID.
- The frontend keeps the trip in localStorage so it can survive navigation or refresh.

### 9. Device Push Notifications

- Firebase Cloud Messaging sends weather alerts to registered devices.
- The frontend registers an FCM token after notification permission is granted.
- The backend stores user tokens and the weather monitor sends alert payloads through Firebase Admin.

#### Firebase Setup Flow

1. Create a Firebase project in the Firebase console.
2. Add a web app and copy its config values into the frontend env file.
3. Enable Cloud Messaging and copy the public VAPID key into `VITE_FIREBASE_VAPID_KEY`.
4. Create a service account key for the backend and store it as JSON or a file path.
5. Set `FIREBASE_PROJECT_ID` on the backend.
6. Restart both the frontend and backend so the worker and push routes can read the new config.
7. Open the itinerary page, grant notifications, and click the device push button to save the token.

## System Architecture

### High-Level Layers

```text
React Frontend
  -> Flask REST API
    -> Trip Planning Service
      -> Geoapify / Mapbox / Seed Data
      -> MySQL Database
      -> ML Model Artifact
```

### Frontend Layer

The frontend is built with React and Vite. It handles the user experience, form flow, and itinerary visualization.

Main frontend responsibilities:

- Authentication screens
- Trip wizard flow
- API requests to the Flask backend
- Rendering itinerary cards and map view
- Saving and restoring temporary trip state
- Collecting explicit feedback from the user

### Backend Layer

The backend is a Flask application that exposes REST endpoints for authentication and trip generation.

Main backend responsibilities:

- Register and login users
- Issue JWT tokens
- Generate itineraries from user preferences
- Fetch and normalize place data
- Save places, trips, and feedback to MySQL
- Load and apply the machine learning reranker
- Send Firebase Cloud Messaging alerts from the weather monitor

### Data Layer

The database stores:

- Users
- Places
- Itineraries
- Itinerary items
- Trip feedback

### External Services

- Mapbox geocoding is used first when available.
- Geoapify is used for fallback geocoding and place search.
- The system also uses a local ML model artifact saved as a joblib file.
- Firebase Cloud Messaging is used for background push alerts.

## Backend Structure

### Entrypoint

The main entrypoint is [app.py](app.py).

It:

- Loads Flask configuration
- Initializes CORS, bcrypt, and JWT
- Registers authentication and trip blueprints
- Imports the ML model artifact at startup

### Authentication Routes

The authentication blueprint lives in [webapp/routes/auth_routes.py](webapp/routes/auth_routes.py).

It provides:

- `POST /api/register`
- `POST /api/login`

### Trip Routes

The trip blueprint lives in [webapp/routes/trip_routes.py](webapp/routes/trip_routes.py).

It provides:

- `POST /api/itinerary` for preview generation
- `POST /api/generate` for final saved trip generation
- `POST /api/itinerary/<itinerary_id>/feedback` for explicit user feedback
- `POST /api/push-tokens` for FCM token registration
- `DELETE /api/push-tokens` for FCM token removal

### Trip Planning Service

The planning logic lives in [webapp/services/trip_planning.py](webapp/services/trip_planning.py).

It handles:

- Destination geocoding
- Geoapify place fetching
- Category simplification
- ML scoring
- Route-aware ranking
- Final itinerary construction
- Seed fallback generation

### Database Helpers

The database logic lives in [webapp/services/database.py](webapp/services/database.py).

It handles:

- Database connection creation
- Saving places
- Saving itineraries
- Saving explicit feedback
- Saving Firebase push tokens
- Schema compatibility checks for older databases

## Frontend Structure

The React app lives in `frontend/src`.

### Main UI Components

#### `AuthPage.jsx`

- Handles login and registration
- Explains the product flow to the user
- Stores the auth token after login

#### `TravelWizard.jsx`

- Collects destination, days, interests, and budget
- Calls the backend generation endpoint
- Saves the generated trip to localStorage

#### `ItineraryPage.jsx`

- Renders the day-by-day trip
- Displays place details and explanations
- Lets users rate stops as best pick or not ideal

#### `ItineraryMap.jsx`

- Displays stops and route context on the map
- Uses coordinates from the itinerary payload

### Frontend State Helpers

The local storage helpers live in [frontend/src/lib/storage.js](frontend/src/lib/storage.js).

They preserve:

- Wizard draft data
- Generated trip payloads
- Stored auth token

## Data Flow

### 1. User Login

1. The user submits credentials.
2. The frontend calls the auth API.
3. The backend validates the user.
4. A JWT is returned to the frontend.

### 2. Trip Creation

1. The user fills in the wizard.
2. The frontend sends destination, days, interests, and budget to the backend.
3. The backend geocodes the destination.
4. Candidate places are fetched from Geoapify.
5. The reranker scores the candidates.
6. The itinerary builder keeps only the strongest stops.
7. The final trip is returned and saved.

### 3. Feedback Collection

1. The user opens the itinerary page.
2. The user marks stops as best pick or not ideal.
3. The backend stores the feedback in `trip_feedback`.
4. Future training runs can use that data.

### 4. Model Refresh

1. `train_model.py` loads the bootstrap CSV dataset.
2. If the database has enough itinerary metadata and feedback, it also loads real usage data.
3. The model is retrained.
4. The updated artifacts are saved as joblib files.
5. The backend loads the new model on startup.

### 5. Admin Analytics

1. The backend exposes `/api/admin/analytics` for feedback trends and model status.
2. The backend exposes `/api/admin/retrain` to run the training script on demand.
3. Admin access is controlled by `ADMIN_EMAILS` and `ADMIN_USERNAMES` in the root `.env`.
4. The React dashboard lives at `/admin` and shows category trends, top places, recent feedback, and artifact status.
5. Retraining writes `anotara_model_metrics.json` alongside the joblib artifacts.
6. Admin accounts can be created and updated from the admin dashboard after logging in with an allowed admin account.
7. Admin accounts log in through the same login form as regular users, but they are redirected to `/admin` after authentication.

### 6. Schema Migration

1. Run `flask migrate-schema` in the deployed app context to apply all idempotent database upgrades.
2. If Flask CLI is not available in deployment, run `python migrate_schema.py` from the project root.
3. The migration only adds missing tables and columns, so it is safe to run more than once.

## Machine Learning Design

### Current Role of ML

The ML model is used as a reranker. It does not fully generate itineraries by itself. Instead, it helps choose which candidate places are most likely to satisfy the user's preferences and budget.

### Model Inputs

The current feature set includes:

- User budget
- Number of travel days
- Interest flags for food, beach, nature, museums, and nightlife
- Place province or city
- Place category
- Place rating

### Model Output

The model predicts whether a place should be recommended.

### Current Training Strategy

The trainer uses two possible sources:

- Bootstrap CSV data generated from the original heuristic system
- Live database rows from saved itineraries and explicit feedback

If the live schema is not fully upgraded yet, the trainer safely falls back to the CSV.

### Why This Works

This design gives you a working model immediately, while also allowing the system to learn from real user behavior as more feedback is collected.

## Recommendation Logic

The itinerary builder is intentionally conservative.

It tries to optimize for:

- Match to user interests
- Strong rating quality
- Proximity and route simplicity
- Practical time allocation per stop
- Variety across categories

The system is designed to produce a short list of high-value experiences instead of many weak suggestions.

## Database Schema

### Existing Tables

- `users`
- `places`
- `itineraries`
- `itinerary_items`

### Feedback Table

- `trip_feedback`

### Important Notes

- The system now supports itinerary metadata such as destination, budget, number of days, and preferences when the database schema is updated.
- Older schemas are handled gracefully.

## Current Functional Strengths

- End-to-end login and JWT auth
- Personalized trip generation
- Live geocoding with fallback
- External place lookup with fallback seed data
- ML-assisted recommendation ranking
- Route-aware stop ordering
- Saved itinerary persistence
- User feedback capture
- Recovery through localStorage

## Current Limitations

- The ML system is still a reranker, not a full travel planning agent.
- The first production-quality training signal will improve as more feedback is collected.
- The current database may need schema migration before all training data paths are active.
- External API quality still affects how rich the candidate pool is.

## Suggested Next Improvements

1. Add per-place rating controls beyond like/dislike.
2. Collect trip completion feedback after the user finishes a trip.
3. Train a stronger learning-to-rank model with more interaction data.
4. Add travel-time estimation between stops for better route optimization.
5. Add user profile memory so repeated trips become more personalized.
6. Add itinerary style modes such as relaxed, balanced, and packed.

## Repository Map

- [app.py](app.py)
- [config.py](config.py)
- [travel_planner.sql](travel_planner.sql)
- [train_model.py](train_model.py)
- [migrate_schema.py](migrate_schema.py)
- [webapp/routes/auth_routes.py](webapp/routes/auth_routes.py)
- [webapp/routes/trip_routes.py](webapp/routes/trip_routes.py)
- [webapp/routes/admin_routes.py](webapp/routes/admin_routes.py)
- [webapp/services/database.py](webapp/services/database.py)
- [webapp/services/trip_planning.py](webapp/services/trip_planning.py)
- [webapp/services/admin_analytics.py](webapp/services/admin_analytics.py)
- [frontend/src/components/AuthPage.jsx](frontend/src/components/AuthPage.jsx)
- [frontend/src/components/TravelWizard.jsx](frontend/src/components/TravelWizard.jsx)
- [frontend/src/components/ItineraryPage.jsx](frontend/src/components/ItineraryPage.jsx)
- [frontend/src/components/AdminDashboard.jsx](frontend/src/components/AdminDashboard.jsx)
- [frontend/src/components/ItineraryMap.jsx](frontend/src/components/ItineraryMap.jsx)

## Summary

Anotara is now a full travel-planning system with authentication, trip generation, map visualization, ML-based ranking, and feedback capture. The architecture is already structured for growth: the React UI stays separate from the Flask API, the planning logic is isolated in services, and the training loop can evolve from bootstrap data into real user-driven intelligence.
