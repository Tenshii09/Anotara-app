## Plan: Admin Console Expansion

Build the admin experience as a clean, page-based operations console with a clear hierarchy: overview first, then operational pages, then intelligence, governance, and infrastructure. The goal is to turn the current single tabbed panel into a scalable admin system that covers dashboard, analytics, user/content moderation, ML, email/push operations, weather safety, audit/compliance, and backup/restore without coupling UI logic to route handlers.

**Steps**
1. Define the target admin information architecture and navigation model.
   - Split the current tab list into stable sections: Overview, Operations, Intelligence, Governance, and Infrastructure.
   - Keep the existing admin route but introduce internal subroutes or route-driven sections so the console can grow without becoming one large component.
   - Decide which views are read-only dashboards versus mutation-heavy tools.

2. Design the Dashboard page as the default landing surface.
   - Show executive KPIs, system health, recent incidents, recent admin actions, and quick actions.
   - Surface cross-system health for users, trips, feedback, push tokens, email queue, weather alerts, and ML status.
   - Reuse existing metrics and alerts logic from backend admin overview responses.

3. Design the Analytics page as the intelligence hub.
   - Add charts for user growth, trip volume, destination popularity, feedback quality, push reach, email performance, and ML run quality.
   - Separate descriptive analytics from operational metrics so the page answers “what is happening?” and “what changed?” clearly.
   - Add date filters and export-friendly data shapes.

4. Break the current admin console into focused operational pages.
   - Users & Access: search, suspend/reactivate, role changes, super-admin elevation rules, account history.
   - Places & Content: create/edit/publish/archive destinations, curation notes, source tracking.
   - Trips & Feedback: saved itinerary inspection, collaborator activity, feedback review.
   - Notifications: push compose/send history and coverage.
   - Email Ops: queue, logs, suppression list, retry visibility.
   - ML Lab: training runs, retraining requests, dataset rows, artifact status.
   - Weather & Safety: active alerts, affected itineraries, pivot resolution.
   - Audit & Compliance: privileged action log with filters.
   - Settings & Automation: feature flags and scheduled automation controls.
   - Backups & Restore: backup status, export, and restore workflow.

5. Normalize backend capabilities into service-layer contracts.
   - Keep route handlers thin in [webapp/routes/admin_routes.py](webapp/routes/admin_routes.py) and move any new query-heavy or stateful logic into [webapp/services/database.py](webapp/services/database.py) or dedicated service modules.
   - Add focused helpers for dashboard aggregates, analytics breakdowns, email ops, weather ops, backup metadata, and any new admin drilldowns.
   - Preserve live DB role checks and super-admin restrictions.

6. Extend the admin API surface only where the UI truly needs it.
   - Add endpoints for email queue/log/suppression visibility, weather alert inspection, and backup inventory if they are not already present.
   - Keep all admin mutations audited through the existing privileged-action log pattern.
   - Avoid broad catch-all endpoints; prefer page-specific payloads.

7. Expand the frontend admin shell into a routeable module system.
   - Refactor [frontend/src/components/AdminPanelPage.jsx](frontend/src/components/AdminPanelPage.jsx) into smaller page components or page containers.
   - Keep shared UI primitives for tables, metric cards, filters, status pills, and panels.
   - Preserve the current Aero-Glass styling while making the layout denser and more readable.

8. Wire navigation and access control cleanly.
   - Update the admin entry in [frontend/src/App.jsx](frontend/src/App.jsx) so the dashboard is the landing route and subpages map to predictable URLs.
   - Ensure the frontend still gates the admin UX by role, but backend remains the source of truth.
   - Keep non-admin users redirected safely out of the admin space.

9. Add schema and migration support for any missing operational records.
   - Keep the existing SQL schema backward-compatible.
   - Add migrations for new tables/columns only when needed for email ops, backups, or future admin workflow state.
   - Ensure new schema fields are mirrored in documentation and service-layer helpers.

10. Update documentation alongside every API or schema change.
   - Revise [architecture/SYSTEM_DOCUMENTATION.md](architecture/SYSTEM_DOCUMENTATION.md) so it reflects the final admin pages, navigation, endpoints, and data flow.
   - Keep the documentation aligned with the current source of truth in backend and frontend code.

11. Validate the implementation with targeted checks.
   - Run frontend build and lint checks after admin UI refactors.
   - Run backend error checks for modified Flask routes and services.
   - Verify role-based access, page loading, filter behavior, and mutation flows with a focused manual smoke test.

**Relevant files**
- [frontend/src/components/AdminPanelPage.jsx](frontend/src/components/AdminPanelPage.jsx) — current admin shell to split into smaller page modules.
- [frontend/src/lib/adminApi.js](frontend/src/lib/adminApi.js) — admin request helpers and new API calls.
- [frontend/src/App.jsx](frontend/src/App.jsx) — admin route entry and navigation hookup.
- [webapp/routes/admin_routes.py](webapp/routes/admin_routes.py) — thin route handlers for admin endpoints.
- [webapp/services/database.py](webapp/services/database.py) — admin aggregates, table helpers, and persistence logic.
- [webapp/services/email_service.py](webapp/services/email_service.py) — email queue, suppression, logs, and delivery behavior.
- [webapp/services/weather_monitor.py](webapp/services/weather_monitor.py) — weather alert generation and itinerary risk flow.
- [webapp/services/push_notifications.py](webapp/services/push_notifications.py) — notification delivery and token coverage.
- [travel_planner.sql](travel_planner.sql) — baseline schema to keep aligned with migrations.
- [migrations/20260520_email_notifications.sql](migrations/20260520_email_notifications.sql) — existing email-related migration pattern.
- [architecture/SYSTEM_DOCUMENTATION.md](architecture/SYSTEM_DOCUMENTATION.md) — must stay synchronized with any admin changes.

**Verification**
1. Run backend diagnostics for the modified Flask files and service modules.
2. Run frontend build/lint after the admin shell is split into page modules.
3. Test admin and super-admin access paths with a real session token.
4. Exercise dashboard, analytics, user role changes, place edits, ML retraining, and notification sending.
5. Confirm documentation updates match the implemented routes, pages, and data model.

**Decisions**
- The admin console should remain one protected product area, but it should be organized as multiple pages instead of one oversized tab panel.
- Dashboard and analytics are first-class pages, not just widgets inside the overview.
- Email ops, weather ops, and backups/restore are included because they match real system operations and already have partial backend foundations or clear operational need.
- Keep mutations auditable and RBAC-enforced server-side; the frontend is only for UX gating.
- Follow the decoupled architecture from `.cursorrules`: route handlers stay thin, database logic stays in services, and documentation updates are mandatory for API or schema changes.
