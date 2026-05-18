Anotara Travel Planner System Documentation — Updated

Overview

Anotara is a Philippine travel-planning system that generates personalized itineraries based on a user's destination, travel length, interests, and budget. The system combines a React frontend, a Flask REST API backend, a MySQL database, external mapping and place APIs, and a machine-learning reranker that improves recommendations over time.

The product goal is not just to list nearby places. It acts like a travel companion that selects the best stops, keeps the day route practical, explains why each stop matters, and learns from user feedback.

The current frontend follows the "Aero-Glass" mobile-first design system: a continuous-line bird brand glyph, sticky branded header, glassmorphic surfaces, Explorer Level gamification ring, an inescapable central "Tara Na!" generation FAB, and full PWA offline support.

Core Product Features

1. User Authentication
- Users can register and log in.
- Authentication uses Flask-JWT-Extended tokens.
- Passwords are hashed with bcrypt.
- The frontend stores the JWT in localStorage for API calls.
- Profile management endpoints:
  - GET /api/profile (fetch current user profile, including algorithmic preferences and member-since timestamp)
  - PATCH /api/profile (update username)
  - PATCH /api/profile/preferences (persist default budget, companion vector, vibe weights, biometric toggle)
  - DELETE /api/account (multi-stage destructive delete protocol requiring the phrase "delete my account")

2. Guided Trip Wizard (Tara Na!)
- Six-phase React wizard styled as a full-screen modal that takes over the viewport (the bottom nav is hidden on /generate).
- Phase 1 — Destination: massive serif input with Surprise-Me random selector tied to the PH destination list.
- Phase 2 — Temporal Horizon: day counts (2/3/5/7/10) + optional start date, plus a non-blocking typhoon-corridor warning when the date falls in Jun–Nov for high-risk provinces.
- Phase 3 — The Flock: visual companion cards (Solo, Couple, Family/Kids, Friends, Seniors) + pacing + transport selectors.
- Phase 4 — Resource Tier: categorical budget pills (Backpacker / Comfort / Luxury) + optional accommodation anchor.
- Phase 5 — Vibe Weighting: up to three "vibe bubbles" (food, beach, nature, heritage, nightlife). Selection order is preserved and visually scales the bubble — the order maps to backend weight priority.
- Phase 6 — Generative Incubation: branded loader (soaring bird animation across stylized Philippine islands) that cycles through dynamic backend-progress copy while /api/generate is awaited.
- Draft state is persisted to localStorage on every keystroke so progress survives reloads or navigation.

3. Personalized Itinerary Generation
- Backend geocodes the destination via Mapbox.
- Candidate places are fetched from Geoapify.
- Local ML reranker scores candidates; rule-based scoring and seed data fall back when the model is unavailable.
- Backend respects the optional trip_start_date so timeline rendering and live monitor logic stay accurate.

4. Route-Aware Planning
- Prefers nearby places when ranking.
- Orders stops to minimize unnecessary movement.
- Each stop carries a suggested stay duration.

5. Map-Based Experience
- Interactive Mapbox map with stops + routes.
- Map and itinerary stay in sync; switching saved trips reloads coordinates.

6. Recommendation Explanations
- Each place has explanations, approximate distance, and recommended stay duration.

6a. AI Pitch Generator
- POST /api/itinerary/pitch sends the top 3 places + travel style to Gemini (2.0 flash) under JSON schema mode.
- Returns { pitch, travel_style, place_names, source }. Falls back to a local sentence when GEMINI_API_KEY is unset.

7. Feedback Loop
- Users mark places as "best pick" or "not ideal".
- Feedback is stored for ML training.

8. Saved Trips & My Trips Vault
- Backend stores generated itineraries.
- Frontend keeps the last trip in localStorage and can fetch saved trips.
- /my-trips ("My Journeys" / "Trip Vault") renders a sticky segmented controller with four lifecycle tabs (Upcoming / Active / Past / Drafts) and real-time count badges.
- Each itinerary renders as a tactile Data Card with cover gradient, title, formatted date range, budget chip, lifecycle status chip, and offline-availability chip.
- Per-card vertical menu opens a Bottom Sheet exposing contextual quick actions that mutate by lifecycle state:
  - Drafts: Resume planning (re-injects state into the wizard via saveWizardDraft), Open itinerary, Share invite link, Delete.
  - Upcoming: Resume planning, Open itinerary, Share invite link, Delete.
  - Active: Open itinerary, Share invite link, Delete.
  - Past: Open itinerary, Share invite link, Duplicate for reuse, Delete.
- Sort & filter pill supports Newest/Oldest, Travel-date soonest, Destination A–Z, and Budget low→high orderings.
- Intelligent empty states per tab render a CTA back to the central Tara Na! flow.

9. Device Push Notifications
- Firebase Cloud Messaging sends weather alerts to registered devices.
- Frontend registers the FCM token after permission.
- Backend stores tokens and dispatches alerts.

10. Dashboard / Home Experience (Aero-Glass)
- Sticky branded global header: continuous-line bird glyph + "Tara!" wordmark, time-aware greeting, Explorer Level avatar ring with derived level chip (Novice Flier → Elite Wanderer), pulsing notification bell with red-dot badge.
- Search trigger pops a full-screen Omni-Search overlay containing recent searches, trending vibe tags, quick regions (Luzon/Visayas/Mindanao/Metro Manila), and a live filtered destination list.
- Mood filter pills (Nature, Food, Beach, Culture, Nightlife) reshape downstream lists.
- Dynamic Hero with four conditional states: Empty (with bouncing chevron to the central Tara Na! FAB), Upcoming (countdown + weather hint), Active (Day X of Y + Open today's map), Recently-completed (replan CTA).
- Live Monitor banner is hidden by default and only drops in when smart-suggestion endpoints surface a weather alert — featuring an "Apply Smart Fix" CTA that pings the ML reranker through /itinerary/:id.
- Active trip progress bar, Quick Glance trip carousel with lifecycle chips, image-style Latest Discoveries carousel, Trending Destinations social-proof grid, Travel Stats gamification card (provinces explored fraction, days planned, next countdown), and a "For You" feed with tap-to-reveal "Why this?" reason badges.

11. Discover Tab
- Dual-state view controller toggles between a Spatial map (stylized Philippine board with algorithmic smart pins whose size + color reflect ML relevance) and a Thematic feed (image-style cards organized in semantic rows: Trending with your flock, Curated by vibe, Off the beaten path).
- Floating Omni-Filter command matrix lets users stack Region + Vibe + Weather filters with a single tap.
- "Anchor & Fly" Bottom Sheet modal: tapping any pin or feed card halts browsing without leaving the page, surfaces logistics chips and a hero block, and presents a single "Build a journey around this" CTA that prefills the wizard via saveWizardDraft and routes to /generate.

12. Profile Tab (Digital Twin Command Center)
- Identity header: Explorer ring avatar, dynamic level label, member-since timestamp, email.
- Inline editable display name (PATCH /api/profile).
- Algorithmic Preference Tuning Matrix:
  - Default Budget Tier Lock (Backpacker / Comfort / Luxury) — persists via /profile/preferences.
  - Companion Persona Vector — multi-select chips (Solo, Couple, Family/Kids, Friends, Seniors, Corporate).
  - Experiential Vibe Tuning Array — sliders for Culinary, Beach, Nature, Heritage, Nightlife. Debounced POSTs to /profile/preferences.
- Security & hardware integration row with biometric authentication toggle (persisted) + active-session indicator.
- PWA Memory & Cloud Sync Hub: storage allocation bar fed by navigator.storage.estimate(), Purge Local Cache (clears caches API entries), and Force Cloud Sync (re-pulls itineraries + summary).
- Travel summary card, Help/Privacy/Terms/Logout rows, and a destructive Delete Account protocol that requires typing "delete my account" verbatim and confirms through a Bottom Sheet before calling DELETE /api/account.

13. PWA Launch / Offline UX
- index.html now renders an inline pre-paint splash (gradient + "Tara!" wordmark) that fades out on window load — no white flash when launching from the home-screen icon.
- React renders an additional LaunchSplash that fades after 1.5 seconds to mask the JS hydration window.
- OfflineIndicator drops in from the top of the viewport only when navigator reports offline, and disappears on reconnect.
- Manifest updated: theme_color #4a3a8a, start_url /dashboard, descriptive Tara! short name, app shortcuts for "Tara Na!" and "My Trips", maximum precache file size lifted to 6 MiB to accommodate the Mapbox bundle.

System Architecture

High-Level Layers
- React Frontend → Flask REST API → Trip Planning Service → Geoapify / Mapbox / Seed Data → MySQL → ML Model Artifact.

Frontend Layer
- React 19 + Vite + vite-plugin-pwa.
- Pages:
  - AuthPage
  - DashboardPage (Aero-Glass home)
  - MyTripsPage (Trip Vault with lifecycle segmentation)
  - TravelWizard (Tara Na! 6-phase modal)
  - DiscoverPage (Spatial map / Thematic feed + Anchor & Fly)
  - ProfilePage (Digital Twin command center)
  - ItineraryPage (per-trip itinerary + map)
- Shared primitives in frontend/src/components/common/:
  - BottomNav.jsx — floating glass nav with center Tara Na! FAB; auto-hides on auth + generator routes.
  - BrandLogo.jsx — bird-in-flight glyph + Tara! wordmark.
  - Avatar.jsx — Explorer Level conic-gradient ring + level chip.
  - SearchOverlay.jsx — full-screen Omni-Search.
  - BottomSheet.jsx — Anchor & Fly / confirmation modal pattern.
  - OfflineIndicator.jsx — drop-down PWA offline banner.
- lib/apiClient.js — centralized fetch wrapper with normalized error messages.
- lib/tripsApi.js — trip-focused helpers (getSavedItineraries, getDashboardSummary, getDiscoverFeed, getSmartSuggestion, updateTripStartDate, deleteItinerary, duplicateItinerary).
- lib/profileApi.js — profile and preferences helpers (getProfile, updateProfile, updateProfilePreferences, deleteAccount).
- lib/haptics.js — Web Vibration API micro-haptics (tap / success / warning).
- lib/storage.js — wizard/trip/profile/discover-search localStorage helpers.

Backend Layer
- app.py initializes Flask, JWT, CORS, and the blueprints.
- webapp/routes/auth_routes.py
  - POST /api/register
  - POST /api/login
  - GET / PATCH /api/profile
  - PATCH /api/profile/preferences (algorithmic tuning matrix)
  - DELETE /api/account (destructive delete protocol)
- webapp/routes/trip_routes.py
  - GET /api/dashboard/summary
  - GET /api/discover/feed
  - POST /api/itinerary (preview)
  - POST /api/itinerary/pitch (Gemini pitch)
  - POST /api/itinerary/llm (Gemini full itinerary)
  - POST /api/generate (now correctly extracts and persists trip_start_date)
  - POST /api/itinerary/<id>/feedback
  - PATCH /api/itineraries/<id>/items/reorder
  - PATCH /api/itineraries/<id>/start-date
  - POST /api/itineraries/<id>/items/<item_id>/swap
  - PATCH /api/itineraries/items/<item_id>/lock
  - GET /api/itineraries/<id>/smart-suggestion
  - GET /api/itineraries/<id>/weather-alerts
  - POST / DELETE /api/push-tokens
  - GET /api/itineraries / GET /api/itineraries/<id>
  - DELETE /api/itineraries/<id> (new — used by My Trips quick action)
  - POST /api/itineraries/<id>/duplicate (new — clones a trip into a Draft for the user)
- webapp/services/database.py adds:
  - ensure_user_preference_columns() — defensively adds default_budget, companion_vector, vibe_weights, biometric_enabled, created_at usage to users.
  - update_user_preferences(user_id, …)
  - delete_user_account(user_id)
  - delete_itinerary_for_user(user_id, itinerary_id)
  - duplicate_itinerary_for_user(user_id, itinerary_id) — re-creates the trip and its items in a brand-new Draft row.

Data Layer
- MySQL schema:
  - users (now: default_budget, companion_vector, vibe_weights, biometric_enabled in addition to baseline columns)
  - places, itineraries (with trip_start_date), itinerary_items, trip_feedback, weather_alerts, push_tokens
- All preference and itinerary writes are parameterized; cascading deletes preserve relational integrity.

External Services
- Mapbox + Geoapify for geocoding and places.
- Local ML model artifact (RandomForestClassifier) for reranking.
- Firebase Cloud Messaging for push notifications.
- Gemini API for itinerary pitch + full LLM itinerary.

Data Flow (Updated)

Authentication: standard JWT issuance unchanged.

Trip Creation:
1. Wizard collects 6 phases of preferences (including optional trip_start_date and up to 3 ranked vibes).
2. POST /api/generate persists the trip + items, applies ML reranker, and returns the itinerary plus dest_coords.
3. Frontend stores the trip in localStorage and navigates to /itinerary.

My Trips:
1. Frontend fetches /api/itineraries, derives lifecycle states client-side (today vs trip_start_date + num_days).
2. Quick actions call DELETE /api/itineraries/<id>, POST /api/itineraries/<id>/duplicate, or PATCH /api/itineraries/<id>/start-date.

Profile Preferences:
1. Mounting fetches /api/profile (now returns default_budget, companion_vector, vibe_weights, biometric_enabled, member_since).
2. Tuning controls debounce-PATCH /api/profile/preferences so the ML reranker reflects new weights instantly.

Account Deletion:
1. User opens destructive protocol bottom sheet.
2. They must type "delete my account" verbatim.
3. DELETE /api/account fires; cascade removes itineraries, feedback, push tokens, and the user row.

Database Schema Highlights
- itineraries has trip_start_date for server-backed countdown / progress timelines and lifecycle segmentation.
- users has default_budget, companion_vector (JSON), vibe_weights (JSON), biometric_enabled.
- trip_feedback uses rating_type ("Best Pick" / "Not Ideal").
- weather_alerts and push_tokens tables back the live monitor + FCM features.

Recent Changelog
- Added BrandLogo, Avatar (Explorer Level ring), BottomSheet, SearchOverlay, and OfflineIndicator shared primitives.
- Redesigned Dashboard, My Trips, Trip Generator wizard, Discover, and Profile to follow the Aero-Glass spec end-to-end while preserving every existing flow.
- Hid the bottom nav on /generate so the wizard becomes a true full-screen modal.
- Added DELETE /api/itineraries/<id>, POST /api/itineraries/<id>/duplicate, PATCH /api/profile/preferences, and DELETE /api/account routes with parameterized DB queries.
- Added users preference columns (default_budget, companion_vector, vibe_weights, biometric_enabled) via ensure_user_preference_columns().
- Fixed a backend bug where /api/generate referenced trip_start_date without extracting it from the request body (would crash on save).
- Polished the PWA: pre-paint inline splash, animated React LaunchSplash, theme-color split for light/dark, /dashboard start_url, Tara Na! + My Trips manifest shortcuts, and larger precache cap for the Mapbox bundle.
- Added a Web Vibration micro-haptics layer used across primary interactions.

Current Limitations
- The Spatial map view on Discover is a stylized smart-pin rendering rather than a full Mapbox/Geoapify experience (the live Mapbox screen remains on /itinerary).
- Biometric toggle is a persisted preference flag; the WebAuthn handshake is wired into the API contract but not yet bound to authentication actions.
- ML reranker stays a reranker for now — feedback loops continue to feed it over time.
- Travel-time between stops is not estimated explicitly.

Suggested Next Improvements
- Code-split the Mapbox bundle behind a dynamic import on /itinerary to shrink first paint.
- Bind biometric toggle to WebAuthn registration + assertion before mutating-itinerary requests.
- Promote the Smart Suggestion CTA into a one-tap rerank action that runs server-side without a navigation.
- Add real explorer-level progress thresholds based on completion + feedback.

Repository Map (Updated)
- app.py
- config.py
- travel_planner.sql
- train_model.py
- webapp/routes/auth_routes.py
- webapp/routes/trip_routes.py
- webapp/services/database.py
- webapp/services/trip_planning.py
- webapp/services/pitch_generator.py
- webapp/services/llm_itinerary.py
- webapp/services/weather_monitor.py
- frontend/src/components/AuthPage.jsx
- frontend/src/components/DashboardPage.jsx
- frontend/src/components/TravelWizard.jsx
- frontend/src/components/MyTripsPage.jsx
- frontend/src/components/ItineraryPage.jsx
- frontend/src/components/ItineraryMap.jsx
- frontend/src/components/DiscoverPage.jsx
- frontend/src/components/ProfilePage.jsx
- frontend/src/components/common/BottomNav.{jsx,css}
- frontend/src/components/common/BrandLogo.jsx
- frontend/src/components/common/Avatar.jsx
- frontend/src/components/common/BottomSheet.jsx
- frontend/src/components/common/SearchOverlay.jsx
- frontend/src/components/common/OfflineIndicator.jsx
- frontend/src/lib/apiClient.js
- frontend/src/lib/tripsApi.js
- frontend/src/lib/profileApi.js
- frontend/src/lib/haptics.js
- frontend/src/lib/storage.js
- frontend/src/lib/config.js
- frontend/src/App.{jsx,css}
- frontend/src/main.jsx
- frontend/index.html
- frontend/vite.config.js

Summary

The Anotara app now ships with a fully redesigned, mobile-first Aero-Glass experience across Dashboard, My Trips, Tara Na!, Discover, and Profile. Every flow is functional end-to-end, backed by parameterized MySQL queries and the centralized API layer. The PWA degrades gracefully when offline, surfaces a branded splash on launch, and bottoms the design system on a single set of shared primitives so future surfaces can be assembled quickly.
