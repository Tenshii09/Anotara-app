Anotara Travel Planner System Documentation – Updated
Overview

Anotara is a Philippine travel planning system that generates personalized itineraries based on a user's destination, travel length, interests, and budget. The system combines a React frontend, a Flask REST API backend, a MySQL database, external mapping and place APIs, and a machine learning reranker that improves recommendations over time.

The product goal is not just to list nearby places. It acts like a travel companion that selects the best stops, keeps the day route practical, explains why each stop matters, and learns from user feedback.

Core Product Features
1. User Authentication
Users can register and log in.
Authentication is handled with Flask JWT tokens.
Passwords are hashed with bcrypt.
The frontend stores the JWT in localStorage for API calls.
2. Guided Trip Wizard
React-based multi-step wizard collects trip preferences.
User selects:
Destination
Number of days
Interests (food, beach, nature, museums, nightlife)
Budget (low, comfort, high)
Draft state is persisted locally.
3. Personalized Itinerary Generation
Backend geocodes the destination.
Fetches candidate places from Geoapify.
Ranks candidates using ML reranker if available.
Falls back to rule-based scoring and seed data.
Keeps only a small number of strong places per day.
4. Route-Aware Planning
Prefers nearby places when ranking candidates.
Orders stops to reduce unnecessary movement.
Each stop includes suggested stay time.
Itinerary feels realistic rather than overstuffed.
5. Map-Based Experience
Interactive map shows stops and routes.
Map and itinerary remain synchronized.
Coordinates updated dynamically when switching between saved trips.
6. Recommendation Explanations
Each place includes explanations, approximate distance, and recommended stay duration.
7. Feedback Loop
Users mark places as “best pick” or “not ideal.”
Feedback is stored in the backend for ML training.
8. Saved Trips
Backend stores generated itineraries.
Frontend keeps trip in localStorage and can fetch saved trips.
My Trips page allows users to view and select saved itineraries.
Itinerary page now reloads correctly when switching between trips.
9. Device Push Notifications
Firebase Cloud Messaging sends weather alerts to registered devices.
Frontend registers FCM token after permission.
Backend stores tokens and sends alerts.
System Architecture
High-Level Layers
React Frontend
  -> Flask REST API
    -> Trip Planning Service
      -> Geoapify / Mapbox / Seed Data
      -> MySQL Database
      -> ML Model Artifact
Frontend Layer
React + Vite
Handles user experience, forms, itineraries, and map.
Pages now include:
AuthPage
TravelWizard
MyTripsPage (view saved trips)
ItineraryPage (renders day-by-day trip)
Discover and Profile placeholders
Bottom Navigation added with center Trip Generator emphasized
State helpers in frontend/src/lib/storage.js
Backend Layer
Flask REST API
Handles auth, trip generation, feedback, itinerary storage
Push notifications via Firebase
Machine learning reranker
Data Layer
MySQL stores:
Users
Places
Itineraries
Itinerary items
Trip feedback
External Services
Mapbox, Geoapify for geocoding and place search
Local ML model artifact for reranking
Firebase for push notifications
Backend Structure
app.py – initializes Flask, JWT, CORS, and blueprints
webapp/routes/auth_routes.py – POST /api/register, POST /api/login
webapp/routes/trip_routes.py – all trip endpoints including /api/itineraries and /api/itineraries/<id>
webapp/services/trip_planning.py – geocoding, place fetching, scoring, route-aware ranking, final itinerary
webapp/services/database.py – DB connection, save trips/feedback, schema checks
Frontend Structure
Components
Component	Description
AuthPage.jsx	Login/Register
TravelWizard.jsx	Collects trip preferences and generates itineraries
MyTripsPage.jsx	Lists saved itineraries and navigates to selected trip
ItineraryPage.jsx	Renders day-by-day itinerary; reloads correct saved trip on selection
ItineraryMap.jsx	Shows map with stops and routes
BottomNav.jsx	Mobile-first navigation; center Trip Generator emphasized
Discover	Placeholder page for suggestions (to implement)
Profile	Placeholder page for user info (to implement)
State Helpers
storage.js handles:
Wizard drafts
Generated trip payloads
Stored auth token
Data Flow
Login
Frontend sends credentials
Backend validates and returns JWT
Trip Creation
Wizard collects preferences
Backend geocodes and fetches candidate places
ML reranker scores places
Itinerary is built and returned
Saved in DB and localStorage
My Trips / Saved Trip Selection
Frontend fetches saved trips from /api/itineraries
User selects a trip → /itinerary/:id
ItineraryPage reloads and map updates
Feedback
User marks places best/not ideal
Backend stores feedback
Push Notifications
Backend sends alerts via FCM
Frontend subscribes devices and displays in-app alerts
Database Schema
Tables: users, places, itineraries, itinerary_items, trip_feedback
Supports metadata like destination, budget, days, and preferences
Older schema handled gracefully
Current Functional Strengths
Full login and JWT auth
Personalized trip generation
Saved trips accessible via My Trips page
Itinerary page reloads correct trip
ML-assisted recommendation ranking
Feedback, swap, reorder, lock features
Map and itinerary synchronization
Mobile-first BottomNav with floating Trip Generator
Current Limitations
Discover and Profile pages not implemented
ML system is a reranker only
Offline/PWA support not fully implemented
Travel-time between stops not estimated
Suggested Next Improvements
Implement Discover page with cards/grid layout
Implement Profile page
Improve TravelWizard with optional “Surprise me” and pacing options
Add route lines and markers in map for mobile
Add offline / PWA support
Add trip completion rating for users
Train stronger ML model as feedback increases
Repository Map (Updated)
app.py
config.py
travel_planner.sql
train_model.py
webapp/routes/auth_routes.py
webapp/routes/trip_routes.py
webapp/services/database.py
webapp/services/trip_planning.py
frontend/src/components/AuthPage.jsx
frontend/src/components/TravelWizard.jsx
frontend/src/components/MyTripsPage.jsx
frontend/src/components/ItineraryPage.jsx
frontend/src/components/ItineraryMap.jsx
frontend/src/components/common/BottomNav.jsx
frontend/src/components/common/BottomNav.css
Summary

The system now supports:

Saved trip selection with correct reloading in ItineraryPage.jsx
Mobile-first bottom navigation with an emphasized Trip Generator button
Full trip CRUD, feedback, swap, lock, reorder, and map visualization
Foundations for Discover and Profile pages ready for implementation

The architecture remains modular and ready for future growth, including offline mode, PWA support, and advanced ML ranking.