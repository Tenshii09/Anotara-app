## Plan: Transactional Email Notifications

### Objective

Add transactional email for user-critical events without breaking the current Flask/React architecture. The implementation must stay service-layer driven, parameterized, testable, and reversible.

### Current State

The codebase already has:

- Flask + JWT + bcrypt authentication
- A service layer under [webapp/services/](webapp/services)
- MySQL-backed persistence
- React profile and preferences surfaces
- PWA/offline behavior already in the frontend

It does not yet have:

- Mail provider configuration in [config.py](config.py)
- An email service abstraction
- Email audit/suppression storage
- Webhook handling for bounces/complaints
- Background delivery infrastructure

### Non-Negotiable Constraints

1. Keep provider logic out of route handlers.
2. Keep all send, render, queue, and suppression logic in the service layer.
3. Do not send marketing mail by default; transactional mail only unless the user opts in.
4. Use parameterized DB writes only.
5. Add documentation in the same change set if the API, schema, or ops flow changes.

### Delivery Order

1. Foundation and config
   - Add mail configuration to [config.py](config.py).
   - Required keys: `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`.
   - Optional keys: `MAIL_DOMAIN`, `MAIL_DKIM_SELECTOR`, `MAIL_WEBHOOK_SECRET`, `MAIL_SUPPRESSION_DB`.
   - Keep defaults safe: disabled behavior should fail closed, not silently send through an unconfigured provider.

2. Service abstraction
   - Create [webapp/services/email_service.py](webapp/services/email_service.py).
   - Provide a minimal public surface: `render_email`, `send_email`, `queue_email`, `process_queue`.
   - Separate provider adapter code from business logic.
   - Make the service usable in tests without a live provider.

3. Delivery worker
   - Choose one queue mechanism and document it clearly. RQ + Redis is the simplest operational choice; do not support multiple workers on day one.
   - Add retry policy, backoff, idempotency keys, and a dead-letter path.
   - Avoid synchronous delivery inside request handlers except in tests or explicit admin tooling.

4. Templates
   - Add `templates/emails/` with a base layout and event-specific HTML/text pairs.
   - Include plain-text fallbacks for every message.
   - Keep templates branded, terse, and link-safe.

5. Storage and suppression
   - Add `email_logs` for delivery audit and `email_suppression` for bounces, complaints, and user opt-outs.
   - Record enough metadata to trace message id, template, recipient, provider response, and suppression reason.
   - Use migrations or versioned SQL under a dedicated `migrations/` path.

6. Webhooks and deliverability
   - Add a protected webhook endpoint for provider bounce/complaint events.
   - Verify webhook authenticity with a secret or signed payload check.
   - Document SPF, DKIM, and DMARC requirements for `MAIL_DOMAIN`.

7. Preferences
   - Extend `/api/profile/preferences` in [webapp/routes/auth_routes.py](webapp/routes/auth_routes.py) only if the backend already persists a JSON-safe preferences field.
   - Add categories for `security`, `collaboration`, `itinerary_updates`, `weather_alerts`, and `messages`.
   - Treat `marketing` as opt-in and keep it disabled unless explicitly enabled later.
   - Update the Profile UI only after the backend contract is stable.

8. Integrations
   - Wire sends through the relevant service entry points, not directly from routes.
   - Candidate touchpoints are the auth, admin, social, trip, and weather service flows already listed in the roadmap.
   - Confirm exact function names before wiring; do not assume a route name from the plan is still current.

### Implementation Sequence

1. Update [config.py](config.py) first so the backend has a stable mail config surface before any code tries to read it.
2. Create [webapp/services/email_service.py](webapp/services/email_service.py) next so rendering, queueing, suppression, and provider adapters live behind one API.
3. Add the email templates under `templates/emails/` so the service has concrete message bodies before wiring any send call.
4. Add the storage layer next: `email_logs` and `email_suppression` migrations under `migrations/`.
5. Add the webhook route in the appropriate Flask routes module only after the service and storage paths exist.
6. Extend [webapp/routes/auth_routes.py](webapp/routes/auth_routes.py) for preferences only after the backend persistence shape for email categories is decided.
7. Wire the service entry points in the existing auth, social, trip, admin, and weather code paths one slice at a time.
8. Update [requirements.txt](requirements.txt) and add [docs/email_setup.md](docs/email_setup.md) once the implementation shape is settled.
9. Add tests last, but before merge, and cover templates, payload validation, suppression, webhook handling, and queue idempotency.

### Critical Scope Notes

- Do not make email a hard dependency for core auth or trip generation.
- Do not block user actions on email delivery unless the feature is explicitly security-critical.
- Start with a small set of messages: welcome, account deletion confirmation, collaborator invite, itinerary saved, and weather alert fallback.
- Defer rich campaigns, attachments, and bulk sends until the transactional path is stable.

### Verification

1. Unit tests
   - Render each template to HTML and plain text.
   - Validate payload schema and required fields.
   - Verify suppression lookup blocks sending.

2. Integration tests
   - Mock the provider adapter.
   - Mock webhook bounce/complaint events and assert suppression records update.
   - Confirm queue processing is idempotent.

3. Manual smoke checks
   - Register an account, trigger a collaborator action, and trigger a trip save or weather alert.
   - Confirm the message is queued, logged, and rendered correctly.

4. Operational checks
   - Review send rate, failure rate, and suppression rate.
   - Treat sustained bounce rate above 2% as a delivery problem, not a template problem.

### Documentation To Add

- `docs/email_setup.md` with provider setup, env vars, webhook setup, queue run commands, and troubleshooting.
- `requirements.txt` updates for the chosen queue/provider dependencies.
- `architecture/SYSTEM_DOCUMENTATION.md` only if the backend API, schema, or operational behavior changes in code.

### Open Risks

1. The current codebase does not yet expose a unified preferences persistence model for email categories, so that contract may need a schema decision before UI work starts.
2. Queue choice affects deployment complexity; pick one worker stack early and do not dual-track it.
3. Some of the listed integration points may need exact symbol verification before implementation because route and service names can drift.
