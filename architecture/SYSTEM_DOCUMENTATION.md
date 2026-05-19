Anotara Travel Planner System Documentation — Updated

Overview

Anotara is a Philippine travel-planning system that generates personalized itineraries based on a user's destination, travel length, interests, and budget. The system combines a React frontend, a Flask REST API backend, a MySQL database, external mapping and place APIs, and a machine-learning reranker that improves recommendations over time.

The product goal is not just to list nearby places. It acts like a travel companion that selects the best stops, keeps the day route practical, explains why each stop matters, and learns from user feedback.

The current frontend follows the "Aero-Glass" mobile-first design system: a continuous-line bird brand glyph, sticky branded header, glassmorphic surfaces, Explorer Level gamification ring, an inescapable central "Tara Na!" generation FAB, light/dark theme persistence, and full PWA offline support.

Core Product Features

1. User Authentication
- Users can register and log in.
- Authentication uses Flask-JWT-Extended access and refresh tokens.
- Passwords are hashed with bcrypt.
- The frontend stores only the short-lived access JWT in localStorage for API calls. The longer-lived refresh JWT is set by the backend as an HttpOnly cookie scoped to `/api/refresh`, allowing silent renewal without exposing the refresh credential to JavaScript.
- The React API client refreshes access tokens before expiry, retries once after an auth failure, and emits a clean session-expired redirect/toast when renewal is no longer possible.
- Users have a role column (`user` by default, `admin` for privileged accounts). Login responses include the role and JWTs carry the role as an additional claim.
- Local admin access can be seeded with `seed_admin_user.py`, which hashes the runtime `ANOTARA_ADMIN_PASSWORD` value before inserting or promoting `juandelacruz@gmail.com`.
- Profile management endpoints:
  - POST /api/refresh (exchange HttpOnly refresh cookie for a new access token)
  - POST /api/logout (clear JWT cookies)
  - GET /api/profile (fetch current user profile, including algorithmic preferences and member-since timestamp)
  - PATCH /api/profile (update username)
  - PATCH /api/profile/preferences (persist default budget, companion vector, vibe weights, biometric toggle)
  - DELETE /api/account (multi-stage destructive delete protocol requiring the phrase "delete my account")

2. Guided Trip Wizard (Tara Na!)
- Nine-phase React wizard styled as a full-screen modal that takes over the viewport (the bottom nav is hidden on /generate).
- Phase 1 — The Flock: choose solo planning or open a multiplayer voting lobby that friends can join by code.
- Phase 2 — Destination: massive serif input with Surprise-Me random selector tied to the PH destination list.
- Phase 3 — Temporal Horizon: day counts (2/3/5/7/10) + optional start date, plus a non-blocking typhoon-corridor warning when the date falls in Jun-Nov for high-risk provinces.
- Phase 4 — Companions: visual companion cards (Solo, Couple, Family/Kids, Friends, Seniors).
- Phase 5 — Pacing & Transport: PacingSlider + TransportPicker controls calibrate activity density and transit assumptions.
- Phase 6 — Resource Tier: categorical budget pills (Backpacker / Comfort / Luxury) + optional accommodation anchor.
- Phase 7 — Vibe Weighting: up to three "vibe bubbles" (food, beach, nature, heritage, nightlife). Selection order is preserved and visually scales the bubble — the order maps to backend weight priority.
- Phase 8 — Dealbreakers: hard constraints captured before generation so unsafe or unwanted activities can be filtered out by downstream planning.
- Phase 9 — Generative Incubation: branded loader (soaring bird animation across stylized Philippine islands) that cycles through dynamic backend-progress copy while /api/generate is awaited.
- Draft state is persisted to localStorage on every keystroke so progress survives reloads or navigation.
- Voting lobby resolutions are written back into the same wizard state, so the solo /api/generate path remains the final generation path.

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

8. The Flock: Friends, Collaboration, and Voting
- Profile includes a Friends & collaborators hub for searching users, sending friend requests, accepting/declining incoming requests, and removing friends.
- Tara Na! supports pre-generation voting rooms. Hosts create a session code, participants join, vote on destination, trip length, pacing, transport, budget, vibes, and dealbreakers, then the host resolves majority answers into the wizard draft.
- Itinerary pages show a FlockCluster of owner/collaborators with online presence. Presence is refreshed through a lightweight heartbeat rather than websockets.
- Owners can invite friends as itinerary collaborators from the in-trip InviteCompanionSheet.
- Trip activity events are persisted and polled to power collaborative toast notifications such as reordered days, swapped stops, and memory additions.

9. Saved Trips & My Trips Vault
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

10. Interactive Itinerary Workspace
- /itinerary renders a granular day selector, a time-blocked vertical timeline, and the Mapbox view in sync.
- Timeline cards support map focus, day reordering, stop lock/unlock, stop swap, "best pick" / "not ideal" feedback, and start-time adjustment through a bottom sheet.
- Travel-time blocks are computed in frontend/src/lib/timeBlocks.js and reused by both the timeline and PDF export.
- Interactive Memory Log allows collaborators to attach note/photo memories to saved itinerary items.
- Apex Hotel Recommendation Engine returns a cached hotel/basecamp suggestion per day near the final stop, with refresh support and booking search link.
- Printable Souvenir PDF export builds a self-contained A4 HTML document in a hidden iframe, including timeline blocks, metadata, and hotel anchors, then opens the browser print flow.
- Save & Plan UX on /itinerary disables the save action, shows a full-screen "Finalizing your perfect trip..." overlay, then transitions to a success screen with confirmed trip dates, PDF download, and next-step checklist.

11. Device Push Notifications
- Firebase Cloud Messaging sends weather alerts to registered devices.
- Frontend registers the FCM token after permission.
- Backend stores tokens and dispatches alerts.

12. Dashboard / Home Experience (Aero-Glass)
- Sticky branded global header: continuous-line bird glyph + "Tara!" wordmark, time-aware greeting, Explorer Level avatar ring with derived level chip (Novice Flier → Elite Wanderer), pulsing notification bell with red-dot badge.
- Search trigger pops a full-screen Omni-Search overlay containing recent searches, trending vibe tags, quick regions (Luzon/Visayas/Mindanao/Metro Manila), and a live filtered destination list.
- Mood filter pills (Nature, Food, Beach, Culture, Nightlife) reshape downstream lists.
- Dynamic Hero with four conditional states: Empty (with bouncing chevron to the central Tara Na! FAB), Upcoming (countdown + weather hint), Active (Day X of Y + Open today's map), Recently-completed (replan CTA).
- Live Monitor banner is hidden by default and only drops in when smart-suggestion endpoints surface a weather alert — featuring an "Apply Smart Fix" CTA that pings the ML reranker through /itinerary/:id.
- Active trip progress bar, Quick Glance trip carousel with lifecycle chips, image-style Latest Discoveries carousel, Trending Destinations social-proof grid, Travel Stats gamification card (provinces explored fraction, days planned, next countdown), and a "For You" feed with tap-to-reveal "Why this?" reason badges.

12a. Admin Operations Console
- /admin renders a module-based operations console separate from the mobile bottom-navigation shell.
- The frontend checks the stored JWT/profile role for navigation UX, while all admin operations are enforced again on the Flask backend through live database role checks.
- Roles are `user`, `admin`, and `super_admin`. Only `super_admin` can promote or demote admin accounts. Admins can manage content, view analytics, suspend/reactivate accounts, review audit history, and request ML retraining.
- Suspended accounts are blocked during login and cannot use protected routes after their database status is changed.
- Admin APIs:
  - GET /api/admin/overview returns command-center metrics, model status, and recent audit events.
  - GET /api/admin/users returns searchable account-management rows.
  - PATCH /api/admin/users/:id/role is super-admin-only and protects against self-demotion and removing the last active super admin.
  - PATCH /api/admin/users/:id/status suspends or reactivates accounts without deleting user data.
  - GET/POST/PATCH /api/admin/places supports destination/content management for the places catalog.
  - GET /api/admin/itineraries returns searchable saved-trip rows for support inspection.
  - GET /api/admin/itineraries/:id returns owner metadata, ordered itinerary stops, and feedback labels.
  - GET /api/admin/notifications returns push-token coverage and recent admin notification sends.
  - POST /api/admin/notifications/send sends targeted or all-user operational push notifications through FCM when credentials and user tokens exist.
  - GET /api/admin/settings returns editable operational feature flags.
  - PATCH /api/admin/settings/:key is super-admin-only and updates one setting.
  - GET /api/admin/analytics returns chart-ready itinerary, feedback, category, user-growth, push-token, and ML-run data with optional date filters.
  - GET /api/admin/ml/status returns the latest Random Forest training run and run history.
  - POST /api/admin/ml/retrain exports user feedback signals and retrains the Random Forest recommendation classifier.
  - GET /api/admin/audit-log returns privileged-action history with optional action, target, and date filters.
- Admin UI patterns use dense data tables, operational metric cards, progress meters, status pills, filter controls, and command buttons aligned with the existing Aero-Glass design system.
- All privileged mutations write to `admin_audit_log` with actor, action, target, request metadata, and payload context.
- Admin-managed content extends the `places` table with publication status, curation notes, source, updated timestamp, and updater id so destination operations are tied to the recommendation and discovery systems.
- ML operations write to `ml_training_runs`, including status, dataset rows, accuracy, precision/recall/F1 metrics, artifact paths, timestamps, and errors.
- Operations settings are stored in `admin_settings`; admin notification attempts are stored in `admin_notification_log`.

13. Discover Tab
- Dual-state view controller toggles between a Spatial map (stylized Philippine board with algorithmic smart pins whose size + color reflect ML relevance) and a Thematic feed (image-style cards organized in semantic rows: Trending with your flock, Curated by vibe, Off the beaten path).
- Floating Omni-Filter command matrix lets users stack Region + Vibe + Weather filters with a single tap.
- "Anchor & Fly" Bottom Sheet modal: tapping any pin or feed card halts browsing without leaving the page, surfaces logistics chips and a hero block, and presents a single "Build a journey around this" CTA that prefills the wizard via saveWizardDraft and routes to /generate.

14. Profile Tab (Digital Twin Command Center)
- Identity header: Explorer ring avatar, dynamic level label, member-since timestamp, email.
- Inline editable display name (PATCH /api/profile).
- Algorithmic Preference Tuning Matrix:
  - Default Budget Tier Lock (Backpacker / Comfort / Luxury) — persists via /profile/preferences.
  - Companion Persona Vector — multi-select chips (Solo, Couple, Family/Kids, Friends, Seniors, Corporate).
  - Experiential Vibe Tuning Array — sliders for Culinary, Beach, Nature, Heritage, Nightlife. Debounced POSTs to /profile/preferences.
- Security & hardware integration row with biometric authentication toggle (persisted) + active-session indicator.
- Appearance card persists Light/Dark color mode to localStorage and applies it through documentElement data-theme/color-scheme.
- The Flock card manages friends, pending requests, outgoing requests, and user search from the profile surface.
- PWA Memory & Cloud Sync Hub: storage allocation bar fed by navigator.storage.estimate(), Purge Local Cache (clears caches API entries), and Force Cloud Sync (re-pulls itineraries + summary).
- Travel summary card, Help/Privacy/Terms/Logout rows, and a destructive Delete Account protocol that requires typing "delete my account" verbatim and confirms through a Bottom Sheet before calling DELETE /api/account.

15. PWA Launch / Offline UX
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
  - TravelWizard (Tara Na! 9-phase modal with optional voting lobby)
  - DiscoverPage (Spatial map / Thematic feed + Anchor & Fly)
  - ProfilePage (Digital Twin command center)
  - ItineraryPage (per-trip itinerary + map)
- Shared primitives in frontend/src/components/common/:
  - BottomNav.jsx — floating glass nav with center Tara Na! FAB; auto-hides on auth + generator routes.
  - BrandLogo.jsx — bird-in-flight glyph + Tara! wordmark.
  - Avatar.jsx — Explorer Level conic-gradient ring + level chip.
  - Icon.jsx — centralized inline icon set for the feature surfaces.
  - PageSkeleton.jsx — route-specific loading skeletons for saved itinerary fetches and heavy views.
  - FlockCluster.jsx — collaborator avatar stack with online state.
  - InviteCompanionSheet.jsx — friend search/request/collaborator invite bottom sheet.
  - SearchOverlay.jsx — full-screen Omni-Search.
  - BottomSheet.jsx — Anchor & Fly / confirmation modal pattern.
  - OfflineIndicator.jsx — drop-down PWA offline banner.
- Itinerary-specific components in frontend/src/components/itinerary/:
  - DaySelector.jsx — segmented day navigation for the itinerary workspace.
  - VerticalTimeline.jsx — time-blocked stop rail with action chips.
  - TimeAdjustSheet.jsx — bottom-sheet start-time adjustment UI.
  - MemoryLogSheet.jsx — photo/note memory capture for itinerary items.
  - HotelCard.jsx — per-day Apex hotel recommendation surface.
- Wizard-specific components in frontend/src/components/wizard/:
  - VotingLobby.jsx — multiplayer pre-generation voting room.
  - PacingSlider.jsx — visual pacing selector.
  - TransportPicker.jsx — transport mode selector.
  - DealbreakersGrid.jsx — hard-constraint selector.
- lib/apiClient.js — centralized fetch wrapper with normalized error messages, credentialed requests, silent token refresh, and one retry on expired access tokens.
- lib/authSession.js — access-token persistence, JWT expiry decoding, refresh scheduling, logout cookie clearing, and global session-expired events.
- lib/tripsApi.js — trip-focused helpers (getSavedItineraries, getDashboardSummary, getDiscoverFeed, getSmartSuggestion, updateTripStartDate, deleteItinerary, duplicateItinerary).
- lib/profileApi.js — profile and preferences helpers (getProfile, updateProfile, updateProfilePreferences, deleteAccount).
- lib/socialApi.js — friends, collaborators, vote sessions, memories, and hotel helper calls.
- lib/timeBlocks.js — shared schedule/time-block computations for timeline + PDF export.
- lib/pdfExport.js — self-contained printable itinerary/PDF export via browser print.
- lib/theme.js — light/dark theme detection, application, and persistence.
- lib/modalActivity.js — global modal surface activity registry.
- lib/haptics.js — Web Vibration API micro-haptics (tap / success / warning).
- lib/storage.js — wizard/trip/profile/discover-search localStorage helpers.

Backend Layer
- app.py initializes Flask, JWT, CORS, and the blueprints.
- webapp/routes/auth_routes.py
  - POST /api/register
  - POST /api/login
  - POST /api/refresh
  - POST /api/logout
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
- webapp/routes/social_routes.py
  - GET /api/friends/search
  - GET /api/friends
  - POST /api/friends/requests
  - PATCH /api/friends/requests/<friendship_id>
  - DELETE /api/friends/<friend_id>
  - GET / POST /api/itineraries/<id>/collaborators
  - DELETE /api/itineraries/<id>/collaborators/<user_id>
  - POST /api/itineraries/<id>/presence
  - GET / POST /api/itineraries/<id>/activity
  - POST /api/vote-sessions, POST /api/vote-sessions/join
  - GET /api/vote-sessions/<id>, POST /api/vote-sessions/<id>/vote, /advance, /resolve
  - GET /api/itineraries/<id>/items/<item_id>/memories
  - GET /api/itineraries/<id>/memories
  - POST /api/itineraries/<id>/items/<item_id>/memories
  - DELETE /api/memories/<memory_id>
  - GET /api/itineraries/<id>/hotels/<day_number>
- webapp/routes/admin_routes.py
  - GET /api/admin/overview
  - GET /api/admin/users
  - PATCH /api/admin/users/<id>/role
  - PATCH /api/admin/users/<id>/status
  - GET / POST /api/admin/places
  - PATCH /api/admin/places/<id>
  - GET /api/admin/itineraries
  - GET /api/admin/itineraries/<id>
  - GET /api/admin/notifications
  - POST /api/admin/notifications/send
  - GET /api/admin/settings
  - PATCH /api/admin/settings/<key>
  - GET /api/admin/analytics
  - GET /api/admin/ml/status
  - POST /api/admin/ml/retrain
  - GET /api/admin/audit-log
- webapp/services/database.py adds:
  - ensure_user_preference_columns() — defensively adds default_budget, companion_vector, vibe_weights, biometric_enabled, created_at usage to users.
  - update_user_preferences(user_id, …)
  - delete_user_account(user_id)
  - delete_itinerary_for_user(user_id, itinerary_id)
  - duplicate_itinerary_for_user(user_id, itinerary_id) — re-creates the trip and its items in a brand-new Draft row.
  - ensure_admin_tables(), log_admin_action(), admin user/place/trip/notification/settings helpers, analytics aggregations, and ML training-run persistence.
- webapp/services/social.py owns all collaboration persistence:
  - ensure_social_schema() — idempotently creates the social/collaboration tables.
  - Friend search/request/list/remove helpers.
  - Itinerary access checks, collaborator management, presence heartbeat, and activity log writes.
  - Voting session create/join/vote/advance/resolve aggregation.
  - Memory log add/list/delete helpers.
  - Hotel recommendation cache generation and refresh.

Data Layer
- MySQL schema:
  - users (now: default_budget, companion_vector, vibe_weights, biometric_enabled, role, account_status, suspended_at, suspended_reason)
  - places (now: content status, curation notes, source, updated_at, updated_by), itineraries (with trip_start_date), itinerary_items, trip_feedback, weather_alerts, push_tokens
  - admin_audit_log, ml_training_runs, admin_settings, and admin_notification_log
  - friendships, trip_collaborators, trip_activity
  - vote_sessions, vote_session_participants, vote_session_responses
  - itinerary_item_memories
  - hotel_recommendations
- All preference and itinerary writes are parameterized; cascading deletes preserve relational integrity.

External Services
- Mapbox + Geoapify for geocoding and places.
- Local ML model artifact (RandomForestClassifier) for reranking.
- Firebase Cloud Messaging for push notifications.
- Gemini API for itinerary pitch + full LLM itinerary.

Data Flow (Updated)

Authentication: login returns a short-lived access JWT and sets an HttpOnly refresh-cookie JWT. The SPA schedules a silent refresh before access-token expiry, rehydrates the schedule on page reload, and redirects to login with a toast only when the refresh token is missing, expired, invalid, or the account is suspended.

Trip Creation:
1. Wizard collects 9 phases of preferences (solo/flock mode, optional trip_start_date, up to 3 ranked vibes, and dealbreakers).
2. If flock mode is used, the voting lobby resolves group answers into the same wizard state.
3. POST /api/generate persists the trip + items, applies ML reranker, and returns the itinerary plus dest_coords.
4. Frontend stores the trip in localStorage and navigates to /itinerary.

Voting Room:
1. Host creates a vote session via POST /api/vote-sessions and shares the generated code/link.
2. Participants join via POST /api/vote-sessions/join and poll GET /api/vote-sessions/<id> every few seconds.
3. Participants submit per-question votes; host advances steps and resolves the session.
4. Backend aggregates majority decisions into resolved_payload; frontend applies it to the wizard draft.

My Trips:
1. Frontend fetches /api/itineraries, derives lifecycle states client-side (today vs trip_start_date + num_days).
2. Quick actions call DELETE /api/itineraries/<id>, POST /api/itineraries/<id>/duplicate, or PATCH /api/itineraries/<id>/start-date.

Itinerary Collaboration:
1. Opening a saved itinerary fetches owner/collaborator state and starts a 25-second presence heartbeat.
2. The page polls activity every 6 seconds and shows collaborator toasts for remote actions.
3. Owners invite friends as collaborators; collaborators can access itinerary-scoped social endpoints through can_access_itinerary().
4. Reorder, swap, lock, feedback, memory, and hotel interactions update local UI first where safe, then persist through the API.

Profile Preferences:
1. Mounting fetches /api/profile (now returns default_budget, companion_vector, vibe_weights, biometric_enabled, member_since).
2. Tuning controls debounce-PATCH /api/profile/preferences so the ML reranker reflects new weights instantly.

Appearance:
1. App boot applies getInitialTheme() from localStorage or system preference.
2. Profile color-mode toggle persists "light" or "dark" under anotara:theme.
3. CSS theme variables read documentElement[data-theme] and documentElement.style.colorScheme.

Account Deletion:
1. User opens destructive protocol bottom sheet.
2. They must type "delete my account" verbatim.
3. DELETE /api/account fires; cascade removes itineraries, feedback, push tokens, and the user row.

Admin Operations:
1. Admin login returns a JWT role claim and stores the profile role for frontend routing.
2. Every `/api/admin/*` request re-checks the current database role and active account status before executing.
3. Super admins can promote or demote admins, with guards against self-demotion and removing the last active super admin.
4. Admins curate place records, inspect itineraries, suspend/reactivate accounts, inspect analytics, send operational notifications, and request ML retraining.
5. Super admins can update operations settings and feature flags.
6. Mutations are written to `admin_audit_log` so privileged changes remain traceable.
7. Retraining exports feedback-derived rows, trains the RandomForest classifier, updates model artifacts, and records metrics in `ml_training_runs`.

Database Schema Highlights
- itineraries has trip_start_date for server-backed countdown / progress timelines and lifecycle segmentation.
- users has default_budget, companion_vector (JSON), vibe_weights (JSON), biometric_enabled, role, and admin-controlled account_status.
- places has admin curation metadata for publication workflow and recommendation catalog management.
- admin_audit_log stores privileged changes; ml_training_runs stores retraining status and model metrics.
- admin_settings stores operations feature flags; admin_notification_log stores admin-triggered notification delivery attempts.
- trip_feedback uses rating_type ("Best Pick" / "Not Ideal").
- weather_alerts and push_tokens tables back the live monitor + FCM features.
- friendships stores pending/accepted friend relationships with requester/addressee ownership.
- trip_collaborators grants itinerary access and stores role/last_seen_at for presence.
- trip_activity stores JSON activity payloads used by collaborative toast notifications.
- vote_sessions, vote_session_participants, and vote_session_responses back the Tara Na! voting lobby.
- itinerary_item_memories stores note/photo memories as text/base64 payloads attached to itinerary items.
- hotel_recommendations caches one hotel/basecamp recommendation per itinerary/day.

Recent Changelog
- Added The Flock social layer: friends, pending requests, itinerary collaborators, presence heartbeats, and activity polling.
- Added Tara Na! pre-generation voting rooms with join codes, live polling, per-question votes, host step advancement, and resolved wizard payloads.
- Upgraded /itinerary into an interactive workspace with DaySelector, VerticalTimeline, TimeAdjustSheet, MemoryLogSheet, HotelCard, collaborator avatars, and PDF export.
- Added social_routes.py + social.py with idempotent ensure_social_schema() and the MySQL tables for friendships, collaborators, activity logs, vote sessions, memories, and hotel recommendation caching.
- Added a Profile color-mode toggle with persisted light/dark theme support through frontend/src/lib/theme.js and CSS data-theme variables.
- Added PageSkeleton, Icon, FlockCluster, InviteCompanionSheet, wizard-specific controls, and itinerary-specific components.
- Added BrandLogo, Avatar (Explorer Level ring), BottomSheet, SearchOverlay, and OfflineIndicator shared primitives.
- Redesigned Dashboard, My Trips, Trip Generator wizard, Discover, and Profile to follow the Aero-Glass spec end-to-end while preserving every existing flow.
- Hid the bottom nav on /generate so the wizard becomes a true full-screen modal.
- Added DELETE /api/itineraries/<id>, POST /api/itineraries/<id>/duplicate, PATCH /api/profile/preferences, and DELETE /api/account routes with parameterized DB queries.
- Added users preference columns (default_budget, companion_vector, vibe_weights, biometric_enabled) via ensure_user_preference_columns().
- Fixed a backend bug where /api/generate referenced trip_start_date without extracting it from the request body (would crash on save).
- Polished the PWA: pre-paint inline splash, animated React LaunchSplash, theme-color split for light/dark, /dashboard start_url, Tara Na! + My Trips manifest shortcuts, and larger precache cap for the Mapbox bundle.
- Added a Web Vibration micro-haptics layer used across primary interactions.

Current Limitations
- Collaboration is near-real-time polling/heartbeat based; websocket conflict resolution is not implemented yet.
- Memory photos are stored as LONGTEXT/base64 payloads; production object storage would be better for large media.
- Hotel recommendations are curated from the local places catalog and cached per day; they are not yet backed by a live hotel availability API.
- PDF export relies on the browser print dialog rather than a server-rendered/headless PDF pipeline.
- The Spatial map view on Discover is a stylized smart-pin rendering rather than a full Mapbox/Geoapify experience (the live Mapbox screen remains on /itinerary).
- Biometric toggle is a persisted preference flag; the WebAuthn handshake is wired into the API contract but not yet bound to authentication actions.
- ML reranker stays a reranker for now — feedback loops continue to feed it over time.
- Travel-time between stops is not estimated explicitly.

Suggested Next Improvements
- Replace polling collaboration with websocket/SSE channels for presence, activity, and voting updates.
- Move photo memories to object storage and keep only metadata/URLs in MySQL.
- Connect Apex Hotel Recommendation to a live accommodation provider with price/availability checks.
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
- webapp/routes/social_routes.py
- webapp/services/database.py
- webapp/services/trip_planning.py
- webapp/services/pitch_generator.py
- webapp/services/llm_itinerary.py
- webapp/services/social.py
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
- frontend/src/components/common/Icon.jsx
- frontend/src/components/common/PageSkeleton.jsx
- frontend/src/components/common/FlockCluster.jsx
- frontend/src/components/common/InviteCompanionSheet.jsx
- frontend/src/components/common/BottomSheet.jsx
- frontend/src/components/common/SearchOverlay.jsx
- frontend/src/components/common/OfflineIndicator.jsx
- frontend/src/components/itinerary/DaySelector.jsx
- frontend/src/components/itinerary/VerticalTimeline.jsx
- frontend/src/components/itinerary/TimeAdjustSheet.jsx
- frontend/src/components/itinerary/MemoryLogSheet.jsx
- frontend/src/components/itinerary/HotelCard.jsx
- frontend/src/components/wizard/VotingLobby.jsx
- frontend/src/components/wizard/PacingSlider.jsx
- frontend/src/components/wizard/TransportPicker.jsx
- frontend/src/components/wizard/DealbreakersGrid.jsx
- frontend/src/lib/apiClient.js
- frontend/src/lib/tripsApi.js
- frontend/src/lib/profileApi.js
- frontend/src/lib/socialApi.js
- frontend/src/lib/timeBlocks.js
- frontend/src/lib/pdfExport.js
- frontend/src/lib/theme.js
- frontend/src/lib/modalActivity.js
- frontend/src/lib/haptics.js
- frontend/src/lib/storage.js
- frontend/src/lib/config.js
- frontend/src/App.{jsx,css}
- frontend/src/main.jsx
- frontend/index.html
- frontend/vite.config.js

Summary

The Anotara app now ships with a fully redesigned, mobile-first Aero-Glass experience across Dashboard, My Trips, Tara Na!, Discover, Profile, and the itinerary workspace. Every core flow is functional end-to-end, backed by parameterized MySQL queries, centralized API helpers, and dedicated service-layer modules. The latest collaboration layer adds friends, voting rooms, itinerary collaborators, activity toasts, memories, hotel suggestions, printable exports, and persisted light/dark theming while preserving the PWA's graceful offline behavior and branded launch experience.
