# Anotara App Implementation Roadmap

## Purpose

This roadmap turns the new travel-planning vision into a dependency-driven delivery plan. It is organized from the foundation outward so the database, API, ML layer, and frontend never outrun each other.

The current system already supports:

- User registration and login with JWT auth
- Trip generation from destination, days, interests, and budget
- Geoapify and Mapbox geocoding
- ML-assisted ranking of candidate places
- Saved itineraries and place persistence
- Explicit feedback capture on itinerary stops

The roadmap below extends that base into a more advanced itinerary engine with richer context, offline support, granular editing, live monitoring, and retraining analytics.

## Delivery Principles

1. Build schema before UI.
2. Build API contracts before new screens.
3. Build generation logic before editing tools.
4. Build feedback capture before retraining automation.
5. Validate each sprint with a narrow, executable test.

## Current Baseline

The codebase currently includes:

- Flask entrypoint in [app.py](app.py)
- Auth routes in [webapp/routes/auth_routes.py](webapp/routes/auth_routes.py)
- Trip generation routes in [webapp/routes/trip_routes.py](webapp/routes/trip_routes.py)
- Ranking and itinerary logic in [webapp/services/trip_planning.py](webapp/services/trip_planning.py)
- Database helpers in [webapp/services/database.py](webapp/services/database.py)
- React wizard in [frontend/src/components/TravelWizard.jsx](frontend/src/components/TravelWizard.jsx)
- React itinerary view in [frontend/src/components/ItineraryPage.jsx](frontend/src/components/ItineraryPage.jsx)
- Feedback endpoint for place ratings
- A training script that can learn from bootstrap CSV data and, later, database feedback

## Sprint 0: Architecture and Schema Foundation

### Goal

Prepare the database and backend to support the new itinerary context, granular editing, and analytics without breaking the current trip flow.

### Scope

#### Itineraries table

Add fields for:

- `pacing_style`
- `companion_type`
- `transport_mode`
- `accommodation_lat`
- `accommodation_lng`
- `status`

Recommended values:

- `pacing_style`: `Packed`, `Moderate`, `Relaxed`
- `companion_type`: `Solo`, `Couple`, `Family_Kids`, `Friends`, `Seniors`
- `transport_mode`: `Public`, `Private_Car`, `Motorcycle`, `Walking`
- `status`: `Draft`, `Active`, `Archived`, `Completed`

#### Itinerary items table

Add fields for:

- `sequence_order`
- `estimated_duration`
- `is_locked`
- `swap_history`

#### Places table

Add fields for:

- `environment_type`
- `physical_intensity`

Recommended values:

- `environment_type`: `Indoor`, `Outdoor`, `Mixed`
- `physical_intensity`: `Low`, `Medium`, `High`

#### Feedback table

Expand the feedback model if needed to support richer ratings later:

- `rating_type`
- `feedback_notes`

### Backend Work

- Add schema migration logic or SQL upgrade scripts.
- Make save logic backward-compatible with older databases.
- Standardize JSON responses from trip endpoints.

### QA Gate

- Existing login and generation flow still works.
- Existing itinerary saving still works.
- New columns exist and are writable.

## Sprint 1: Travel Context and Intelligent Filtering

### Goal

Collect the missing context from the frontend and use it to constrain ML selection before the final itinerary is built.

### Frontend Work

Update the wizard to collect:

- Pacing style
- Companion type
- Transport mode
- Accommodation anchor location

### Backend Work

Upgrade the generation endpoint to ingest the new variables.

Recommended API payload for generation:

```json
{
  "destination": "Cebu",
  "num_days": 3,
  "preferences": ["food", "beach"],
  "budget": "comfort",
  "pacing_style": "Relaxed",
  "companion_type": "Family_Kids",
  "transport_mode": "Private_Car",
  "accommodation_lat": 10.3157,
  "accommodation_lng": 123.8854
}
```

### Logic Rules

- Hard filter high physical intensity places for `Family_Kids` and `Seniors`.
- Use accommodation coordinates as the route anchor.
- Cap daily stops based on pacing style.
- Increase duration buffers for relaxed trips.
- Prefer transport-aware travel time estimates.

### QA Gate

- Trips still generate with old payloads.
- Trips become more selective when the new fields are present.
- Family and senior trips never include unsafe high-intensity places.

## Sprint 2: PWA and Offline Support

### Goal

Make the app installable and resilient when connectivity is weak or unavailable.

### Frontend Work

- Add PWA support with a manifest.
- Add a service worker for the app shell.
- Cache static assets and the latest generated itinerary payload.
- Keep the auth token and latest trip in device storage.

### QA Gate

- App shell loads offline.
- Last itinerary remains visible offline.
- Install prompt works on supported mobile browsers.

## Sprint 3: Granular Itinerary Editing

### Goal

Let users adjust a generated trip without forcing a full regeneration.

### Backend Work

Add lightweight endpoints such as:

- `PATCH /api/v1/itineraries/{id}/items/reorder`
- `POST /api/v1/itineraries/{id}/items/{item_id}/swap`
- `PATCH /api/v1/itineraries/items/{item_id}/lock`

### Frontend Work

- Build a master overview screen.
- Add day tabs for day-by-day navigation.
- Enable drag-and-drop reordering.
- Add swap and lock controls to each stop.

### Logic Rules

- Reordering updates `sequence_order`.
- Swapping picks the next best candidate in the same cluster.
- Locked stops remain in place during regeneration.

### QA Gate

- Reordering updates persist in the database.
- Swapping changes a single stop only.
- Locked items survive day regeneration.

## Sprint 4: Live Monitor and Smart Suggestions

### Goal

Proactively adjust trips when weather or external conditions change.

### Backend Work

- Add a scheduled worker that checks active itineraries.
- Query itineraries within a 72-hour horizon.
- Call an external weather API.
- Precompute indoor alternatives when rain is likely.

### Frontend and Notification Work

- Add push notifications through Firebase Cloud Messaging or a similar service.
- Display a smart suggestion banner when the trip needs attention.
- Let the user apply a suggested route change quickly.

### QA Gate

- Weather checks run on schedule.
- Indoor fallback suggestions are generated correctly.
- Notifications reach supported devices.

## Sprint 5: Admin Analytics and ML Retraining Loop

### Goal

Turn trip interactions into a real improvement loop.

### Backend Work

- Capture ratings and feedback reliably.
- Aggregate feedback into a training dataset.
- Retrain the reranker off-peak.
- Downgrade poor-performing places and reward strong ones.

### Admin Dashboard Work

- Build an admin-only analytics page.
- Show category popularity.
- Show feedback trends.
- Show top-performing routes and places.

### QA Gate

- Training data is reproducible.
- Model artifacts are regenerated cleanly.
- Admin views reflect the latest system state.

## Recommended API Contract

### Generation

- `POST /api/v1/itineraries/generate`

### Editing

- `PATCH /api/v1/itineraries/{id}/items/reorder`
- `POST /api/v1/itineraries/{id}/items/{item_id}/swap`
- `PATCH /api/v1/itineraries/items/{item_id}/lock`

### Feedback

- `POST /api/v1/feedback`

### Monitoring

- Background worker endpoint or scheduled job entrypoint for weather checks and smart suggestions

## Database Upgrade Summary

### Itineraries

- Planning style
- Companion type
- Transport mode
- Accommodation coordinates
- Status lifecycle

### Itinerary Items

- Day grouping
- Sequence order
- Duration estimate
- Lock flag
- Swap history

### Places

- Environment type
- Physical intensity

### Feedback

- Rating type
- Optional notes

## Implementation Order

1. Update schema and migrations.
2. Expand backend payloads and save logic.
3. Add new frontend context fields.
4. Implement hard filters and pacing rules.
5. Add PWA and offline cache support.
6. Add reorder, swap, and lock endpoints.
7. Add weather monitor and smart suggestions.
8. Expand analytics and retraining automation.

## Risks To Manage

- Schema drift between local and deployed databases.
- API contract mismatch between React and Flask.
- Overfetching places before ranking.
- Model artifacts becoming stale.
- External API rate limits.
- Offline cache invalidation.

## Definition of Done For Each Sprint

Each sprint is complete only if:

- The feature works in the UI.
- The backend validates the request.
- The database stores the correct state.
- The feature has a narrow test or verification step.
- Existing flows still work.

## Final Target State

At the end of the roadmap, Anotara should behave like a practical itinerary assistant that:

- Understands trip context beyond basic interests
- Produces fewer but stronger recommendations
- Lets users edit trips without starting over
- Works better on mobile and offline
- Reacts to live conditions like weather
- Learns from feedback over time

This is the right structure for a real product and a strong panel presentation, because it shows architecture, integration, and user-centered design all moving together.
