import { useState } from "react";

import {
  sendAdminNotification,
  updateAdminPlace,
  updateAdminSetting,
  updateAdminUserRole,
} from "../../lib/adminApi";
import { percent, placeStatuses, userRoles } from "./adminConfig";
import { formatNumber } from "./adminUtils";
import {
  ChartBars,
  Field,
  MetricCard,
  Pager,
  ProgressBar,
  StatusPill,
} from "./shared";

export function DashboardPage({
  auditEvents,
  emailOps,
  latestModel,
  modelMetrics,
  mlStatus,
  notifications,
  onOpenAudit,
  onOpenSection,
  onRetrain,
  overview,
  weatherOps,
  backupsPageInfo,
  isMutating,
}) {
  const systemCards = [
    {
      label: "Push Reach",
      value: notifications?.reachable_users || 0,
      delta: `${formatNumber(notifications?.token_count || 0)} registered tokens`,
      tone: "positive",
      path: "notifications",
    },
    {
      label: "Email Queue",
      value: emailOps?.summary?.queued_total || 0,
      delta: `${formatNumber(emailOps?.summary?.log_total || 0)} delivery logs`,
      tone: emailOps?.summary?.queued_total ? "warning" : "positive",
      path: "email",
    },
    {
      label: "Weather Alerts",
      value: weatherOps?.summary?.active_alerts || 0,
      delta: `${formatNumber(weatherOps?.summary?.affected_itineraries || 0)} affected trips`,
      tone: weatherOps?.summary?.active_alerts ? "warning" : "positive",
      path: "weather",
    },
    {
      label: "Backups",
      value: backupsPageInfo?.total || 0,
      delta: "recovery records",
      tone: "positive",
      path: "backups",
    },
  ];

  return (
    <>
      <section className="admin-metric-grid" aria-label="Executive telemetry">
        {(overview?.metrics || []).map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>
      <section className="admin-grid admin-grid--two">
        <AuditPanel
          events={auditEvents.slice(0, 8)}
          compact
          onOpenAudit={onOpenAudit}
        />
        <MlPanel
          latestModel={latestModel}
          modelMetrics={modelMetrics}
          mlStatus={mlStatus}
          onRetrain={onRetrain}
          isMutating={isMutating}
        />
      </section>
      <section className="admin-grid admin-grid--two">
        {systemCards.map((card) => (
          <article className="glass-card admin-panel" key={card.label}>
            <div className="admin-panel__header">
              <MetricCard {...card} />
              <button onClick={() => onOpenSection(card.path)} type="button">
                Review
              </button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export function AuditPanel({
  events,
  compact = false,
  onOpenAudit,
  pageInfo,
  onPageChange,
}) {
  return (
    <article className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Audit Trail</p>
          <h3>Recent Privileged Actions</h3>
        </div>
        {compact ? (
          <button onClick={onOpenAudit} type="button">
            View all
          </button>
        ) : (
          <StatusPill status="healthy">{events.length} events</StatusPill>
        )}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.action}</td>
                <td>
                  {event.actor_name ||
                    event.actor_email ||
                    `User ${event.actor_id}`}
                </td>
                <td>
                  {event.target_type} #{event.target_id || "system"}
                </td>
                <td>{event.created_at || "Just now"}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan="4">
                  No privileged actions have been recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!compact ? (
        <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
      ) : null}
    </article>
  );
}

export function MlPanel({
  latestModel,
  modelMetrics,
  mlStatus,
  onRetrain,
  isMutating,
  full = false,
}) {
  return (
    <article className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Random Forest Monitor</p>
          <h3>Model Quality</h3>
        </div>
        <StatusPill status={latestModel.status || "not trained"}>
          {latestModel.status || "not trained"}
        </StatusPill>
      </div>
      <div className="admin-score-list">
        {modelMetrics.map((metric) => (
          <div className="admin-score-row" key={metric.label}>
            <span>{metric.label}</span>
            <ProgressBar value={metric.value} label={metric.label} />
            <strong>{metric.value}%</strong>
          </div>
        ))}
      </div>
      <p className="muted">
        Dataset rows: {formatNumber(latestModel.dataset_rows)}. Last run:{" "}
        {latestModel.completed_at ||
          latestModel.started_at ||
          "No training run recorded"}
        .
      </p>
      <div className="admin-action-strip">
        <button
          className="primary"
          disabled={isMutating}
          onClick={onRetrain}
          type="button"
        >
          Request retraining
        </button>
      </div>
      {full ? (
        <div className="admin-table-wrap admin-section-gap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Accuracy</th>
                <th>Started by</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {(mlStatus?.history || []).map((run) => (
                <tr key={run.id}>
                  <td>#{run.id}</td>
                  <td>
                    <StatusPill status={run.status}>{run.status}</StatusPill>
                  </td>
                  <td>{formatNumber(run.dataset_rows)}</td>
                  <td>{percent(run.accuracy)}%</td>
                  <td>{run.started_by_name || run.started_by || "system"}</td>
                  <td>{run.completed_at || run.error_message || "Running"}</td>
                </tr>
              ))}
              {(mlStatus?.history || []).length === 0 ? (
                <tr>
                  <td colSpan="6">No training history yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

export function PlacesPage({
  filteredPlaces,
  isMutating,
  onOpenPlaceForm,
  onSearch,
  onPageChange,
  placeQuery,
  pageInfo,
  setPlaceQuery,
  token,
  refreshWithMutation,
}) {
  return (
    <section className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Places Matrix</p>
          <h3>Destination & Content Management</h3>
        </div>
        <div className="admin-filterbar">
          <input
            aria-label="Filter places"
            onChange={(event) => setPlaceQuery(event.target.value)}
            placeholder="Filter by place, province, vibe, status..."
            type="search"
            value={placeQuery}
          />
          <button disabled={isMutating} onClick={onSearch} type="button">
            Search
          </button>
          <button
            className="primary"
            disabled={isMutating}
            onClick={() => onOpenPlaceForm()}
            type="button"
          >
            Create place
          </button>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Province</th>
              <th>Vibe</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlaces.map((place) => (
              <tr key={place.id}>
                <td>
                  <strong>{place.name}</strong>
                  <div className="admin-table__subtext">
                    {place.tags || place.source || "No tags"}
                  </div>
                </td>
                <td>{place.city || "Unassigned"}</td>
                <td>{place.category}</td>
                <td>
                  <StatusPill status={place.status}>{place.status}</StatusPill>
                </td>
                <td>{place.rating || 0}</td>
                <td>
                  <div className="admin-inline-controls">
                    <select
                      className="admin-select"
                      disabled={isMutating}
                      onChange={(event) =>
                        refreshWithMutation(() =>
                          updateAdminPlace(token, place.id, {
                            status: event.target.value,
                          }),
                        )
                      }
                      value={place.status || "review"}
                    >
                      {placeStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={isMutating}
                      onClick={() => onOpenPlaceForm(place)}
                      type="button"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPlaces.length === 0 ? (
              <tr>
                <td colSpan="6">No places match the current filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
    </section>
  );
}

export function UsersPage({
  filteredUsers,
  isMutating,
  isSuperAdmin,
  onSearch,
  onSuspendUser,
  onPageChange,
  refreshWithMutation,
  setUserQuery,
  token,
  userQuery,
  pageInfo,
}) {
  return (
    <section className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Identity & Security</p>
          <h3>User & Admin Management</h3>
        </div>
        <div className="admin-filterbar">
          <input
            aria-label="Filter users"
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Filter by username, email, role, status..."
            type="search"
            value={userQuery}
          />
          <button disabled={isMutating} onClick={onSearch} type="button">
            Search users
          </button>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Trips</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.username}</strong>
                  <div className="admin-table__subtext">
                    Joined {user.created_at || "unknown"}
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <StatusPill status={user.role}>{user.role}</StatusPill>
                </td>
                <td>
                  <StatusPill status={user.account_status}>
                    {user.account_status}
                  </StatusPill>
                  {user.suspended_reason ? (
                    <div className="admin-table__subtext">
                      {user.suspended_reason}
                    </div>
                  ) : null}
                </td>
                <td>{formatNumber(user.trip_count)}</td>
                <td>
                  <div className="admin-inline-controls">
                    <select
                      className="admin-select"
                      disabled={!isSuperAdmin || isMutating}
                      onChange={(event) =>
                        refreshWithMutation(() =>
                          updateAdminUserRole(token, user.id, event.target.value),
                        )
                      }
                      value={user.role || "user"}
                    >
                      {userRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={isMutating}
                      onClick={() => onSuspendUser(user)}
                      type="button"
                    >
                      {user.account_status === "suspended"
                        ? "Reactivate"
                        : "Suspend"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6">No users match the current filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
      {!isSuperAdmin ? (
        <p className="muted">Only super admins can grant or revoke admin roles.</p>
      ) : null}
    </section>
  );
}

export function TripsPage({
  itineraries,
  selectedTrip,
  isMutating,
  onInspect,
  onSearch,
  onPageChange,
  setTripQuery,
  setTripStatus,
  tripQuery,
  tripStatus,
  pageInfo,
}) {
  return (
    <section className="admin-grid admin-grid--two">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Trips</p>
            <h3>Saved Itineraries</h3>
          </div>
          <div className="admin-filterbar">
            <input
              value={tripQuery}
              onChange={(event) => setTripQuery(event.target.value)}
              placeholder="Search trip, destination, owner..."
            />
            <input
              value={tripStatus}
              onChange={(event) => setTripStatus(event.target.value)}
              placeholder="Status"
            />
            <button disabled={isMutating} onClick={onSearch} type="button">
              Search
            </button>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Stops</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {itineraries.map((trip) => (
                <tr key={trip.id}>
                  <td>
                    <strong>
                      {trip.trip_name || trip.destination || `Trip #${trip.id}`}
                    </strong>
                    <div className="admin-table__subtext">
                      {trip.destination || "No destination"} ·{" "}
                      {trip.num_days || 0} days
                    </div>
                  </td>
                  <td>{trip.owner_name || trip.owner_email || "Unknown"}</td>
                  <td>
                    <StatusPill status={trip.status}>
                      {trip.status || "Active"}
                    </StatusPill>
                  </td>
                  <td>
                    {formatNumber(trip.item_count)} stops ·{" "}
                    {formatNumber(trip.feedback_count)} feedback
                  </td>
                  <td>
                    <button
                      disabled={isMutating}
                      onClick={() => onInspect(trip.id)}
                      type="button"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {itineraries.length === 0 ? (
                <tr>
                  <td colSpan="5">No trips match the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
      </article>
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Trip Detail</p>
            <h3>
              {selectedTrip?.itinerary?.trip_name ||
                selectedTrip?.itinerary?.destination ||
                "Select a trip"}
            </h3>
          </div>
          {selectedTrip?.itinerary?.status ? (
            <StatusPill status={selectedTrip.itinerary.status}>
              {selectedTrip.itinerary.status}
            </StatusPill>
          ) : null}
        </div>
        {selectedTrip ? (
          <>
            <p className="muted">
              Owner:{" "}
              {selectedTrip.itinerary.owner_name ||
                selectedTrip.itinerary.owner_email}
              . Budget: {selectedTrip.itinerary.budget || "n/a"}.
            </p>
            <div className="admin-event-list">
              {selectedTrip.items.map((item) => (
                <div className="admin-event admin-event--stacked" key={item.id}>
                  <div>
                    <strong>
                      Day {item.day_number}:{" "}
                      {item.name || `Place #${item.place_id}`}
                    </strong>
                    <span>
                      {item.category || "Uncategorized"} ·{" "}
                      {item.city || "No city"} · {item.estimated_duration || 60}{" "}
                      min
                    </span>
                  </div>
                </div>
              ))}
              {selectedTrip.items.length === 0 ? (
                <p className="muted">This trip has no saved stops.</p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted">
            Inspect a trip to review its owner metadata, stops, and feedback
            labels.
          </p>
        )}
      </article>
    </section>
  );
}

export function NotificationsPage({
  isMutating,
  notifications,
  onSent,
  setError,
  setSuccess,
  token,
}) {
  const summary = notifications?.summary || {};
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState({
    audience_type: "all",
    target_user_id: "",
    title: "",
    body: "",
  });

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError("Notification title and body are required.");
      return;
    }
    setError("");
    setSuccess("");
    setIsSending(true);
    try {
      const response = await onSent(async () => {
        return sendAdminNotification(token, {
          audience_type: form.audience_type,
          audience: form.audience_type,
          target_user_id:
            form.audience_type === "user" ? form.target_user_id : undefined,
          title: form.title.trim(),
          body: form.body.trim(),
        });
      });
      const sentCount = Number(response?.result?.sent || 0);
      setSuccess(
        sentCount > 0
          ? "Notification sent through Firebase."
          : "Notification request completed, but Firebase reported no delivered sends.",
      );
      setForm({
        audience_type: "all",
        target_user_id: "",
        title: "",
        body: "",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="admin-grid admin-grid--two">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Notification Monitoring</p>
            <h3>Coverage and delivery health</h3>
          </div>
          <StatusPill status="healthy">
            {formatNumber(notifications?.reachable_users || 0)} reachable users
          </StatusPill>
        </div>
        <div className="admin-metric-grid">
          <MetricCard
            label="Tokens"
            value={notifications?.token_count || 0}
            delta="registered devices"
            tone="positive"
          />
          <MetricCard
            label="Reachable"
            value={notifications?.reachable_users || 0}
            delta="distinct users"
            tone="positive"
          />
          <MetricCard
            label="Sent"
            value={summary.sent_notifications || 0}
            delta="monitoring records"
            tone="positive"
          />
          <MetricCard
            label="Failed"
            value={summary.failed_notifications || 0}
            delta="delivery gaps"
            tone="warning"
          />
        </div>
        <form className="admin-form admin-section-gap" onSubmit={handleSubmit}>
          <div className="admin-panel__header">
            <div>
              <p className="eyebrow">Compose</p>
              <h3>Send operational push</h3>
            </div>
          </div>
          <div className="admin-form-grid">
            <Field label="Audience">
              <select
                disabled={isMutating || isSending}
                value={form.audience_type}
                onChange={(event) =>
                  setForm({ ...form, audience_type: event.target.value })
                }
              >
                <option value="all">All reachable users</option>
                <option value="user">Specific user ID</option>
              </select>
            </Field>
            {form.audience_type === "user" ? (
              <Field label="Target user ID">
                <input
                  disabled={isMutating || isSending}
                  value={form.target_user_id}
                  onChange={(event) =>
                    setForm({ ...form, target_user_id: event.target.value })
                  }
                  required
                />
              </Field>
            ) : null}
            <Field label="Title">
              <input
                disabled={isMutating || isSending}
                maxLength="140"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
            </Field>
            <Field label="Body">
              <textarea
                disabled={isMutating || isSending}
                rows="3"
                value={form.body}
                onChange={(event) =>
                  setForm({ ...form, body: event.target.value })
                }
                required
              />
            </Field>
          </div>
          <button className="primary" disabled={isMutating || isSending} type="submit">
            {isMutating || isSending ? "Sending..." : "Send notification"}
          </button>
        </form>
      </article>
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Recent Activity</p>
            <h3>Latest notification records</h3>
          </div>
          <StatusPill status="ready">
            {formatNumber(summary.total_notifications || 0)} records
          </StatusPill>
        </div>
        <div className="admin-event-list">
          {(notifications?.recent || []).map((event) => (
            <div className="admin-event admin-event--stacked" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>
                  {event.audience_type} · sent{" "}
                  {formatNumber(event.result?.sent || 0)} · failed{" "}
                  {formatNumber(event.result?.failed || 0)}
                </span>
              </div>
            </div>
          ))}
          {(notifications?.recent || []).length === 0 ? (
            <p className="muted">No admin notifications have been sent yet.</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}

export function EmailOpsPage({
  emailOps,
  emailQuery,
  isMutating,
  loadAdminData,
  onPageChange,
  setEmailQuery,
  pageInfo,
}) {
  const summary = emailOps?.summary || {};
  return (
    <section className="admin-grid">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Email Ops</p>
            <h3>Queue, logs, and suppression</h3>
          </div>
          <div className="admin-filterbar">
            <input
              aria-label="Search email operations"
              onChange={(event) => setEmailQuery(event.target.value)}
              placeholder="Search email, subject, template, status..."
              type="search"
              value={emailQuery}
            />
            <button
              disabled={isMutating}
              onClick={() =>
                loadAdminData("email", { emailSearch: emailQuery, emailPage: 1 })
              }
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="admin-metric-grid">
          <MetricCard
            label="Queued"
            value={summary.queued_total || 0}
            delta={`${summary.queue_total || 0} queue records`}
            tone="warning"
          />
          <MetricCard
            label="Sending"
            value={summary.sending_total || 0}
            delta="live delivery"
            tone="positive"
          />
          <MetricCard
            label="Logs"
            value={summary.log_total || 0}
            delta="delivery history"
            tone="positive"
          />
          <MetricCard
            label="Suppressions"
            value={summary.active_suppressions || 0}
            delta={`${summary.suppression_total || 0} records`}
            tone="warning"
          />
        </div>
      </article>

      <section className="admin-grid admin-grid--two">
        <article className="glass-card admin-panel">
          <div className="admin-panel__header">
            <div>
              <p className="eyebrow">Queue</p>
              <h3>Pending email jobs</h3>
            </div>
            <StatusPill status="ready">
              {formatNumber(emailOps?.totals?.queue || 0)} total
            </StatusPill>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {(emailOps?.queue || []).map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>
                        {job.recipient_name || job.recipient_email}
                      </strong>
                      <div className="admin-table__subtext">
                        {job.template_name} · {job.category}
                      </div>
                    </td>
                    <td>{job.subject}</td>
                    <td>
                      <StatusPill status={job.status}>{job.status}</StatusPill>
                    </td>
                    <td>
                      {job.attempts || 0} / {job.max_attempts || 0}
                    </td>
                  </tr>
                ))}
                {(emailOps?.queue || []).length === 0 ? (
                  <tr>
                    <td colSpan="4">
                      No email queue records match the current filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
        </article>

        <article className="glass-card admin-panel">
          <div className="admin-panel__header">
            <div>
              <p className="eyebrow">Suppression</p>
              <h3>Review and compliance</h3>
            </div>
            <StatusPill status="healthy">
              {formatNumber(emailOps?.totals?.suppressions || 0)} total
            </StatusPill>
          </div>
          <div className="admin-event-list">
            {(emailOps?.suppressions || []).map((item) => (
              <div className="admin-event admin-event--stacked" key={item.id}>
                <div>
                  <strong>{item.email}</strong>
                  <span>
                    {item.reason} · {item.source} ·{" "}
                    {item.is_active ? "active" : "inactive"}
                  </span>
                </div>
              </div>
            ))}
            {(emailOps?.suppressions || []).length === 0 ? (
              <p className="muted">
                No suppression records match the current filter.
              </p>
            ) : null}
          </div>
          <div className="admin-section-gap">
            <p className="eyebrow">Delivery Logs</p>
            <div className="admin-event-list">
              {(emailOps?.logs || []).slice(0, 8).map((item) => (
                <div className="admin-event admin-event--stacked" key={item.id}>
                  <div>
                    <strong>{item.subject}</strong>
                    <span>
                      {item.recipient_email} · {item.status} · {item.provider}
                    </span>
                  </div>
                </div>
              ))}
              {(emailOps?.logs || []).length === 0 ? (
                <p className="muted">No email logs match the current filter.</p>
              ) : null}
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}

export function WeatherOpsPage({
  isMutating,
  loadAdminData,
  onPageChange,
  pageInfo,
  setWeatherActiveOnly,
  setWeatherQuery,
  weatherActiveOnly,
  weatherOps,
  weatherQuery,
}) {
  const summary = weatherOps?.summary || {};
  return (
    <section className="admin-grid">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Weather & Safety</p>
            <h3>Active alert review</h3>
          </div>
          <div className="admin-filterbar">
            <input
              aria-label="Search weather alerts"
              onChange={(event) => setWeatherQuery(event.target.value)}
              placeholder="Search headline, message, trip, or owner..."
              type="search"
              value={weatherQuery}
            />
            <select
              value={weatherActiveOnly}
              onChange={(event) => setWeatherActiveOnly(event.target.value)}
            >
              <option value="all">All alerts</option>
              <option value="active">Active only</option>
              <option value="resolved">Resolved only</option>
            </select>
            <button
              disabled={isMutating}
              onClick={() =>
                loadAdminData("weather", {
                  weatherSearch: weatherQuery,
                  weatherOnlyActive: weatherActiveOnly,
                  weatherPage: 1,
                })
              }
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="admin-metric-grid">
          <MetricCard
            label="Alerts shown"
            value={summary.total_alerts || 0}
            delta="current filter"
            tone="warning"
          />
          <MetricCard
            label="Active"
            value={summary.active_alerts || 0}
            delta="live pivots"
            tone="positive"
          />
          <MetricCard
            label="Resolved"
            value={summary.resolved_alerts || 0}
            delta="closed alerts"
            tone="positive"
          />
          <MetricCard
            label="Itineraries"
            value={summary.affected_itineraries || 0}
            delta="impacted plans"
            tone="warning"
          />
        </div>
      </article>

      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Weather Alerts</p>
            <h3>Itinerary-level safety signals</h3>
          </div>
          <StatusPill status="ready">
            {formatNumber(weatherOps?.alerts?.length || 0)} shown
          </StatusPill>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Alert</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {(weatherOps?.alerts || []).map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <strong>
                      {alert.trip_name ||
                        alert.destination ||
                        `Itinerary #${alert.itinerary_id}`}
                    </strong>
                    <div className="admin-table__subtext">
                      {alert.alert_type} · {alert.alert_key}
                    </div>
                  </td>
                  <td>
                    <strong>{alert.headline}</strong>
                    <div className="admin-table__subtext">{alert.message}</div>
                  </td>
                  <td>
                    <StatusPill
                      status={alert.is_active ? "watching" : "healthy"}
                    >
                      {alert.is_active ? "active" : "resolved"}
                    </StatusPill>
                  </td>
                  <td>{alert.owner_name || alert.owner_email || "Unknown"}</td>
                </tr>
              ))}
              {(weatherOps?.alerts || []).length === 0 ? (
                <tr>
                  <td colSpan="4">
                    No weather alerts match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
      </article>
    </section>
  );
}

export function BackupPage({
  backups,
  backupUploadFile,
  isMutating,
  isSuperAdmin,
  onCreateBackup,
  onDownloadBackup,
  onPageChange,
  onRestoreFromHistory,
  onRestoreUpload,
  pageInfo,
  setBackupUploadFile,
}) {
  return (
    <section className="admin-grid admin-grid--two">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Recovery Operations</p>
            <h3>Export or restore the full database</h3>
          </div>
          <StatusPill status={isSuperAdmin ? "high" : "review"}>
            {isSuperAdmin ? "super admin guarded" : "restore requires super admin"}
          </StatusPill>
        </div>
        <div className="admin-notice">
          Backups are full database archives. Restores replace current data and
          are restricted to super admins after validation.
        </div>
        <div className="admin-action-strip">
          <button
            className="primary"
            disabled={isMutating}
            onClick={onCreateBackup}
            type="button"
          >
            Create backup
          </button>
        </div>
        <form
          className="admin-form admin-section-gap"
          onSubmit={onRestoreUpload}
        >
          <Field label="Restore from upload">
            <input
              accept=".zip"
              disabled={!isSuperAdmin || isMutating}
              onChange={(event) =>
                setBackupUploadFile(event.target.files?.[0] || null)
              }
              type="file"
            />
          </Field>
          <button
            className="primary"
            disabled={!isSuperAdmin || isMutating}
            type="submit"
          >
            Restore uploaded archive
          </button>
          {backupUploadFile ? (
            <p className="muted">Selected file: {backupUploadFile.name}</p>
          ) : null}
        </form>
      </article>

      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Backup History</p>
            <h3>Recent exports and restores</h3>
          </div>
          <StatusPill status="ready">
            {formatNumber(pageInfo?.total || 0)} records
          </StatusPill>
        </div>
        <div className="admin-event-list">
          {backups.map((backup) => (
            <div className="admin-event admin-event--stacked" key={backup.id}>
              <div>
                <strong>{backup.backup_label}</strong>
                <span>
                  {backup.action_type} · {backup.status} · {backup.file_name}
                </span>
              </div>
              <div className="admin-inline-controls">
                <button
                  disabled={isMutating}
                  onClick={() => onDownloadBackup(backup)}
                  type="button"
                >
                  Download
                </button>
                <button
                  disabled={!isSuperAdmin || isMutating}
                  onClick={() => onRestoreFromHistory(backup)}
                  type="button"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
          {backups.length === 0 ? (
            <p className="muted">No backup history exists yet.</p>
          ) : null}
        </div>
        <Pager pageInfo={pageInfo} onPageChange={onPageChange} />
      </article>
    </section>
  );
}

export function SettingsPage({
  isMutating,
  isSuperAdmin,
  refreshWithMutation,
  settings,
  token,
}) {
  return (
    <section className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Operations Feature Flags</h3>
        </div>
        {!isSuperAdmin ? (
          <StatusPill status="review">super admin required</StatusPill>
        ) : null}
      </div>
      <div className="admin-event-list">
        {settings.map((setting) => (
          <div className="admin-setting-row" key={setting.setting_key}>
            <div>
              <strong>{setting.setting_key}</strong>
              <span>{setting.description}</span>
            </div>
            <select
              disabled={
                !isSuperAdmin || isMutating || setting.value_type !== "boolean"
              }
              onChange={(event) =>
                refreshWithMutation(() =>
                  updateAdminSetting(
                    token,
                    setting.setting_key,
                    event.target.value,
                  ),
                )
              }
              value={setting.setting_value}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        ))}
        {settings.length === 0 ? (
          <p className="muted">No settings are configured.</p>
        ) : null}
      </div>
    </section>
  );
}

export function AnalyticsPage({ analytics, filters, setFilters, onApply }) {
  return (
    <section className="admin-grid">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Analytics Filters</p>
            <h3>Date Window</h3>
          </div>
          <button onClick={onApply} type="button">
            Apply
          </button>
        </div>
        <div className="admin-form-grid">
          <Field label="Start date">
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters({ ...filters, startDate: event.target.value })
              }
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters({ ...filters, endDate: event.target.value })
              }
            />
          </Field>
          <MetricCard
            label="Push tokens"
            value={analytics?.totals?.push_tokens || 0}
            delta="notification reach"
            tone="positive"
          />
          <MetricCard
            label="ML runs"
            value={analytics?.totals?.ml_runs || 0}
            delta="training history"
            tone="positive"
          />
          <MetricCard
            label="Notifications"
            value={analytics?.totals?.notification_total || 0}
            delta="monitoring records"
            tone="positive"
          />
          <MetricCard
            label="Notification failures"
            value={analytics?.totals?.notification_failed || 0}
            delta="delivery health"
            tone="warning"
          />
        </div>
      </article>
      <section className="admin-grid admin-grid--three">
        <article className="glass-card admin-panel">
          <p className="eyebrow">Feedback Intelligence</p>
          <h3>Feedback Labels</h3>
          <ChartBars
            data={analytics?.feedback_labels || []}
            label="Feedback label distribution"
          />
        </article>
        <article className="glass-card admin-panel">
          <p className="eyebrow">Travel Demand</p>
          <h3>Itinerary Trend</h3>
          <ChartBars
            data={analytics?.itinerary_trend || []}
            label="Itinerary creation trend"
          />
        </article>
        <article className="glass-card admin-panel">
          <p className="eyebrow">Content Analytics</p>
          <h3>Top Categories</h3>
          <ChartBars
            data={analytics?.top_categories || []}
            label="Top place categories"
          />
        </article>
        <article className="glass-card admin-panel">
          <p className="eyebrow">Audience Growth</p>
          <h3>User Growth</h3>
          <ChartBars
            data={analytics?.user_growth || []}
            label="User growth trend"
          />
        </article>
      </section>
    </section>
  );
}

export function PlaceFormModal({ form, isMutating, onChange, onClose, onSubmit }) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <form className="admin-modal glass-card" onSubmit={onSubmit}>
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Places Matrix</p>
            <h3>{form.id ? "Edit place" : "Create place"}</h3>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="admin-form-grid">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(event) =>
                onChange({ ...form, name: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Category">
            <input
              value={form.category}
              onChange={(event) =>
                onChange({ ...form, category: event.target.value })
              }
              required
            />
          </Field>
          <Field label="City / Province">
            <input
              value={form.city || ""}
              onChange={(event) =>
                onChange({ ...form, city: event.target.value })
              }
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(event) =>
                onChange({ ...form, status: event.target.value })
              }
            >
              {placeStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Latitude">
            <input
              type="number"
              step="0.0000001"
              value={form.latitude}
              onChange={(event) =>
                onChange({ ...form, latitude: event.target.value })
              }
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="0.0000001"
              value={form.longitude}
              onChange={(event) =>
                onChange({ ...form, longitude: event.target.value })
              }
            />
          </Field>
          <Field label="Rating">
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={form.rating}
              onChange={(event) =>
                onChange({ ...form, rating: event.target.value })
              }
            />
          </Field>
          <Field label="Tags">
            <input
              value={form.tags || ""}
              onChange={(event) =>
                onChange({ ...form, tags: event.target.value })
              }
            />
          </Field>
          <Field label="Environment">
            <input
              value={form.environment_type || ""}
              onChange={(event) =>
                onChange({ ...form, environment_type: event.target.value })
              }
            />
          </Field>
          <Field label="Intensity">
            <input
              value={form.physical_intensity || ""}
              onChange={(event) =>
                onChange({ ...form, physical_intensity: event.target.value })
              }
            />
          </Field>
          <Field label="Source">
            <input
              value={form.source || ""}
              onChange={(event) =>
                onChange({ ...form, source: event.target.value })
              }
            />
          </Field>
          <Field label="Curation notes">
            <textarea
              value={form.curation_notes || ""}
              onChange={(event) =>
                onChange({ ...form, curation_notes: event.target.value })
              }
              rows="3"
            />
          </Field>
        </div>
        <div className="admin-action-strip">
          <button disabled={isMutating} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary" disabled={isMutating} type="submit">
            {form.id ? "Save changes" : "Create place"}
          </button>
        </div>
      </form>
    </div>
  );
}
