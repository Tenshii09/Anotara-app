import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import {
  createAdminPlace,
  getAdminAnalytics,
  getAdminAuditLog,
  getAdminItineraries,
  getAdminItineraryDetail,
  getAdminMlStatus,
  getAdminNotifications,
  getAdminOverview,
  getAdminPlaces,
  getAdminSettings,
  getAdminUsers,
  requestAdminRetraining,
  sendAdminNotification,
  updateAdminPlace,
  updateAdminSetting,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "../lib/adminApi";
import { getStoredToken, loadUserProfile } from "../lib/storage";

const navItems = [
  { id: "command", label: "Command Center", title: "System Health & Content Operations" },
  { id: "places", label: "Places Matrix", title: "Destination & Content Management" },
  { id: "ml", label: "Random Forest", title: "Model Quality & Training Runs" },
  { id: "users", label: "Identity & Security", title: "User & Admin Management" },
  { id: "trips", label: "Trips", title: "Itinerary Inspection" },
  { id: "notifications", label: "Notifications", title: "Push Operations" },
  { id: "settings", label: "Settings", title: "Operations Settings" },
  { id: "analytics", label: "Analytics", title: "Travel Demand Intelligence" },
  { id: "audit", label: "Audit Trail", title: "Privileged Action History" },
];

const placeStatuses = ["published", "review", "archived"];
const userRoles = ["user", "admin", "super_admin"];

const emptyPlaceForm = {
  id: "",
  name: "",
  category: "",
  city: "",
  latitude: "",
  longitude: "",
  rating: "",
  tags: "",
  environment_type: "Mixed",
  physical_intensity: "Medium",
  status: "review",
  source: "admin",
  curation_notes: "",
};

function StatusPill({ children, status }) {
  return <span className={`admin-pill admin-pill--${String(status).toLowerCase().replace(/\s+/g, "-")}`}>{children}</span>;
}

function MetricCard({ label, value, delta, tone }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small className={`admin-delta admin-delta--${tone}`}>{delta}</small>
    </article>
  );
}

function ProgressBar({ value, label }) {
  return (
    <div className="admin-progress" aria-label={`${label}: ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function formatNumber(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString();
  }
  return value ?? "0";
}

function percent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function ChartBars({ data = [], label }) {
  const maxValue = Math.max(...data.map((item) => Number(item.value || 0)), 1);
  return (
    <div className="admin-chart-list" aria-label={label}>
      {data.length === 0 ? (
        <p className="muted">No data available yet.</p>
      ) : (
        data.map((item) => {
          const value = Number(item.value || 0);
          return (
            <div className="admin-chart-row" key={`${item.label}-${value}`}>
              <span>{item.label || "Unknown"}</span>
              <ProgressBar value={(value / maxValue) * 100} label={`${item.label} ${value}`} />
              <strong>{formatNumber(value)}</strong>
            </div>
          );
        })
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function toPlaceForm(place = {}) {
  return {
    ...emptyPlaceForm,
    ...place,
    latitude: place.latitude ?? "",
    longitude: place.longitude ?? "",
    rating: place.rating ?? "",
  };
}

function cleanPlacePayload(form) {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    city: form.city.trim(),
    latitude: form.latitude === "" ? null : Number(form.latitude),
    longitude: form.longitude === "" ? null : Number(form.longitude),
    rating: form.rating === "" ? 0 : Number(form.rating),
    tags: form.tags.trim(),
    environment_type: form.environment_type.trim(),
    physical_intensity: form.physical_intensity.trim(),
    status: form.status,
    source: form.source.trim() || "admin",
    curation_notes: form.curation_notes.trim(),
  };
}

export default function AdminPanelPage() {
  const [activeNav, setActiveNav] = useState("command");
  const [placeQuery, setPlaceQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [tripQuery, setTripQuery] = useState("");
  const [tripStatus, setTripStatus] = useState("");
  const [analyticsFilters, setAnalyticsFilters] = useState({ startDate: "", endDate: "" });
  const [auditFilters, setAuditFilters] = useState({ action: "", targetType: "", startDate: "", endDate: "" });
  const [profile] = useState(() => loadUserProfile());
  const [token] = useState(() => getStoredToken());
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [places, setPlaces] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [mlStatus, setMlStatus] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [settings, setSettings] = useState([]);
  const [placeForm, setPlaceForm] = useState(null);
  const [notificationForm, setNotificationForm] = useState({
    audience_type: "user",
    target_user_id: "",
    title: "",
    body: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState("");

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin" || isSuperAdmin;
  const activeItem = navItems.find((item) => item.id === activeNav) || navItems[0];

  async function loadAdminData({
    placesQuery = placeQuery,
    usersQuery = userQuery,
    tripsQuery = tripQuery,
    tripsStatus = tripStatus,
    analyticsWindow = analyticsFilters,
    auditWindow = auditFilters,
  } = {}) {
    if (!token || !isAdmin) return;
    setError("");
    setIsLoading(true);

    try {
      const [
        overviewData,
        usersData,
        placesData,
        analyticsData,
        mlData,
        auditData,
        tripsData,
        notificationData,
        settingsData,
      ] = await Promise.all([
        getAdminOverview(token),
        getAdminUsers(token, usersQuery),
        getAdminPlaces(token, placesQuery),
        getAdminAnalytics(token, analyticsWindow),
        getAdminMlStatus(token),
        getAdminAuditLog(token, auditWindow),
        getAdminItineraries(token, tripsQuery, tripsStatus),
        getAdminNotifications(token),
        getAdminSettings(token),
      ]);
      setOverview(overviewData);
      setUsers(usersData.users || []);
      setPlaces(placesData.places || []);
      setAnalytics(analyticsData);
      setMlStatus(mlData);
      setAuditEvents(auditData.events || overviewData.recent_audit || []);
      setItineraries(tripsData.itineraries || []);
      setNotifications(notificationData);
      setSettings(settingsData.settings || []);
    } catch (requestError) {
      setError(requestError.message || "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const loadInitialAdminData = async () => {
      await loadAdminData();
    };
    loadInitialAdminData();
    // The initial load should only depend on the authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  const filteredPlaces = useMemo(() => {
    const query = placeQuery.trim().toLowerCase();
    if (!query) return places;
    return places.filter((place) =>
      [place.name, place.city, place.category, place.status, place.tags].join(" ").toLowerCase().includes(query),
    );
  }, [placeQuery, places]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.username, user.email, user.role, user.account_status].join(" ").toLowerCase().includes(query),
    );
  }, [userQuery, users]);

  const latestModel = mlStatus?.latest || overview?.model_status || {};
  const modelMetrics = [
    { label: "Accuracy", value: percent(latestModel.accuracy) },
    { label: "Precision", value: percent(latestModel.metrics?.precision) },
    { label: "Recall", value: percent(latestModel.metrics?.recall) },
    { label: "F1 score", value: percent(latestModel.metrics?.f1_score) },
  ];

  async function refreshWithMutation(action, reloadOptions) {
    setError("");
    setIsMutating(true);
    try {
      await action();
      await loadAdminData(reloadOptions);
    } catch (requestError) {
      setError(requestError.message || "Admin action failed.");
    } finally {
      setIsMutating(false);
    }
  }

  function handleOpenPlaceForm(place) {
    setPlaceForm(place ? toPlaceForm(place) : { ...emptyPlaceForm });
  }

  function handleSavePlace(event) {
    event.preventDefault();
    const payload = cleanPlacePayload(placeForm);
    if (!payload.name || !payload.category) {
      setError("Place name and category are required.");
      return;
    }

    refreshWithMutation(async () => {
      if (placeForm.id) {
        await updateAdminPlace(token, placeForm.id, payload);
      } else {
        await createAdminPlace(token, payload);
      }
      setPlaceForm(null);
    });
  }

  function handleRetrain() {
    if (!window.confirm("Retrain the recommendation model using current user feedback?")) return;
    refreshWithMutation(() => requestAdminRetraining(token));
  }

  function handleSuspendUser(user) {
    const willSuspend = user.account_status !== "suspended";
    const reason = willSuspend
      ? window.prompt("Why is this account being suspended?", user.suspended_reason || "Suspended from admin console")
      : "";
    if (willSuspend && reason === null) return;
    refreshWithMutation(() =>
      updateAdminUserStatus(token, user.id, willSuspend ? "suspended" : "active", reason),
    );
  }

  function handleLoadTripDetail(itineraryId) {
    refreshWithMutation(async () => {
      const detail = await getAdminItineraryDetail(token, itineraryId);
      setSelectedTrip(detail);
    }, { tripsQuery: tripQuery, tripsStatus: tripStatus });
  }

  function handleSendNotification(event) {
    event.preventDefault();
    refreshWithMutation(async () => {
      await sendAdminNotification(token, {
        ...notificationForm,
        target_user_id: notificationForm.audience_type === "user" ? notificationForm.target_user_id : null,
      });
      setNotificationForm({ audience_type: "user", target_user_id: "", title: "", body: "" });
    });
  }

  if (!token || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar glass-card" aria-label="Admin navigation">
        <div>
          <p className="eyebrow">Ano Tara Admin</p>
          <h1>Operations Console</h1>
          <p className="muted">
            Secure command center for content operations, account management, analytics, audit, and ML oversight.
          </p>
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <button
              className={item.id === activeNav ? "admin-nav__item active" : "admin-nav__item"}
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <span>Signed in as</span>
          <strong>{profile?.name || profile?.role || "Admin"}</strong>
          <StatusPill status={profile?.role}>{profile?.role}</StatusPill>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar glass-card">
          <div>
            <p className="eyebrow">{activeItem.label}</p>
            <h2>{activeItem.title}</h2>
          </div>
          <div className="admin-topbar__actions">
            <button disabled={isMutating} onClick={() => loadAdminData()} type="button">Refresh</button>
            {activeNav === "ml" || activeNav === "command" ? (
              <button className="primary" disabled={isMutating} onClick={handleRetrain} type="button">Request retraining</button>
            ) : null}
          </div>
        </header>

        {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
        {isLoading ? <div className="admin-notice">Loading live admin operations data...</div> : null}

        {activeNav === "command" ? (
          <>
            <section className="admin-metric-grid" aria-label="Executive telemetry">
              {(overview?.metrics || []).map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </section>
            <section className="admin-grid admin-grid--two">
              <AuditPanel events={auditEvents.slice(0, 8)} compact onOpenAudit={() => setActiveNav("audit")} />
              <MlPanel latestModel={latestModel} modelMetrics={modelMetrics} mlStatus={mlStatus} onRetrain={handleRetrain} isMutating={isMutating} />
            </section>
          </>
        ) : null}

        {activeNav === "places" ? (
          <PlacesPanel
            filteredPlaces={filteredPlaces}
            isMutating={isMutating}
            onOpenPlaceForm={handleOpenPlaceForm}
            onSearch={() => loadAdminData({ placesQuery: placeQuery })}
            placeQuery={placeQuery}
            setPlaceQuery={setPlaceQuery}
            token={token}
            refreshWithMutation={refreshWithMutation}
          />
        ) : null}

        {activeNav === "ml" ? (
          <MlPanel latestModel={latestModel} modelMetrics={modelMetrics} mlStatus={mlStatus} onRetrain={handleRetrain} isMutating={isMutating} full />
        ) : null}

        {activeNav === "users" ? (
          <UsersPanel
            filteredUsers={filteredUsers}
            isMutating={isMutating}
            isSuperAdmin={isSuperAdmin}
            onSearch={() => loadAdminData({ usersQuery: userQuery })}
            onSuspendUser={handleSuspendUser}
            refreshWithMutation={refreshWithMutation}
            setUserQuery={setUserQuery}
            token={token}
            userQuery={userQuery}
          />
        ) : null}

        {activeNav === "trips" ? (
          <TripsPanel
            itineraries={itineraries}
            selectedTrip={selectedTrip}
            isMutating={isMutating}
            onInspect={handleLoadTripDetail}
            onSearch={() => loadAdminData({ tripsQuery: tripQuery, tripsStatus: tripStatus })}
            setTripQuery={setTripQuery}
            setTripStatus={setTripStatus}
            tripQuery={tripQuery}
            tripStatus={tripStatus}
          />
        ) : null}

        {activeNav === "notifications" ? (
          <NotificationsPanel
            form={notificationForm}
            notifications={notifications}
            onSubmit={handleSendNotification}
            setForm={setNotificationForm}
            users={users}
            isMutating={isMutating}
          />
        ) : null}

        {activeNav === "settings" ? (
          <SettingsPanel
            isMutating={isMutating}
            isSuperAdmin={isSuperAdmin}
            refreshWithMutation={refreshWithMutation}
            settings={settings}
            token={token}
          />
        ) : null}

        {activeNav === "analytics" ? (
          <AnalyticsPanel
            analytics={analytics}
            filters={analyticsFilters}
            setFilters={setAnalyticsFilters}
            onApply={() => loadAdminData({ analyticsWindow: analyticsFilters })}
          />
        ) : null}

        {activeNav === "audit" ? (
          <section className="admin-grid">
            <div className="glass-card admin-panel">
              <div className="admin-panel__header">
                <div>
                  <p className="eyebrow">Audit Filters</p>
                  <h3>Search privileged actions</h3>
                </div>
                <button disabled={isMutating} onClick={() => loadAdminData({ auditWindow: auditFilters })} type="button">Apply filters</button>
              </div>
              <div className="admin-form-grid admin-form-grid--four">
                <Field label="Action">
                  <input value={auditFilters.action} onChange={(event) => setAuditFilters({ ...auditFilters, action: event.target.value })} />
                </Field>
                <Field label="Target type">
                  <input value={auditFilters.targetType} onChange={(event) => setAuditFilters({ ...auditFilters, targetType: event.target.value })} />
                </Field>
                <Field label="Start date">
                  <input type="date" value={auditFilters.startDate} onChange={(event) => setAuditFilters({ ...auditFilters, startDate: event.target.value })} />
                </Field>
                <Field label="End date">
                  <input type="date" value={auditFilters.endDate} onChange={(event) => setAuditFilters({ ...auditFilters, endDate: event.target.value })} />
                </Field>
              </div>
            </div>
            <AuditPanel events={auditEvents} />
          </section>
        ) : null}
      </section>

      {placeForm ? (
        <PlaceFormModal
          form={placeForm}
          isMutating={isMutating}
          onChange={setPlaceForm}
          onClose={() => setPlaceForm(null)}
          onSubmit={handleSavePlace}
        />
      ) : null}
    </main>
  );
}

function AuditPanel({ events, compact = false, onOpenAudit }) {
  return (
    <article className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Audit Trail</p>
          <h3>Recent Privileged Actions</h3>
        </div>
        {compact ? (
          <button onClick={onOpenAudit} type="button">View all</button>
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
                <td>{event.actor_name || event.actor_email || `User ${event.actor_id}`}</td>
                <td>{event.target_type} #{event.target_id || "system"}</td>
                <td>{event.created_at || "Just now"}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr><td colSpan="4">No privileged actions have been recorded yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function MlPanel({ latestModel, modelMetrics, mlStatus, onRetrain, isMutating, full = false }) {
  return (
    <article className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Random Forest Monitor</p>
          <h3>Model Quality</h3>
        </div>
        <StatusPill status={latestModel.status || "not trained"}>{latestModel.status || "not trained"}</StatusPill>
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
        Dataset rows: {formatNumber(latestModel.dataset_rows)}. Last run: {latestModel.completed_at || latestModel.started_at || "No training run recorded"}.
      </p>
      <div className="admin-action-strip">
        <button className="primary" disabled={isMutating} onClick={onRetrain} type="button">Request retraining</button>
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
                  <td><StatusPill status={run.status}>{run.status}</StatusPill></td>
                  <td>{formatNumber(run.dataset_rows)}</td>
                  <td>{percent(run.accuracy)}%</td>
                  <td>{run.started_by_name || run.started_by || "system"}</td>
                  <td>{run.completed_at || run.error_message || "Running"}</td>
                </tr>
              ))}
              {(mlStatus?.history || []).length === 0 ? (
                <tr><td colSpan="6">No training history yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

function PlacesPanel({ filteredPlaces, isMutating, onOpenPlaceForm, onSearch, placeQuery, setPlaceQuery, token, refreshWithMutation }) {
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
          <button disabled={isMutating} onClick={onSearch} type="button">Search</button>
          <button className="primary" disabled={isMutating} onClick={() => onOpenPlaceForm()} type="button">Create place</button>
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
                  <div className="admin-table__subtext">{place.tags || place.source || "No tags"}</div>
                </td>
                <td>{place.city || "Unassigned"}</td>
                <td>{place.category}</td>
                <td><StatusPill status={place.status}>{place.status}</StatusPill></td>
                <td>{place.rating || 0}</td>
                <td>
                  <div className="admin-inline-controls">
                    <select
                      className="admin-select"
                      disabled={isMutating}
                      onChange={(event) => refreshWithMutation(() => updateAdminPlace(token, place.id, { status: event.target.value }))}
                      value={place.status || "review"}
                    >
                      {placeStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <button disabled={isMutating} onClick={() => onOpenPlaceForm(place)} type="button">Edit</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPlaces.length === 0 ? (
              <tr><td colSpan="6">No places match the current filter.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersPanel({ filteredUsers, isMutating, isSuperAdmin, onSearch, onSuspendUser, refreshWithMutation, setUserQuery, token, userQuery }) {
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
          <button disabled={isMutating} onClick={onSearch} type="button">Search users</button>
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
                  <div className="admin-table__subtext">Joined {user.created_at || "unknown"}</div>
                </td>
                <td>{user.email}</td>
                <td><StatusPill status={user.role}>{user.role}</StatusPill></td>
                <td>
                  <StatusPill status={user.account_status}>{user.account_status}</StatusPill>
                  {user.suspended_reason ? <div className="admin-table__subtext">{user.suspended_reason}</div> : null}
                </td>
                <td>{formatNumber(user.trip_count)}</td>
                <td>
                  <div className="admin-inline-controls">
                    <select
                      className="admin-select"
                      disabled={!isSuperAdmin || isMutating}
                      onChange={(event) => refreshWithMutation(() => updateAdminUserRole(token, user.id, event.target.value))}
                      value={user.role || "user"}
                    >
                      {userRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <button disabled={isMutating} onClick={() => onSuspendUser(user)} type="button">
                      {user.account_status === "suspended" ? "Reactivate" : "Suspend"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr><td colSpan="6">No users match the current filter.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!isSuperAdmin ? <p className="muted">Only super admins can grant or revoke admin roles.</p> : null}
    </section>
  );
}

function TripsPanel({ itineraries, selectedTrip, isMutating, onInspect, onSearch, setTripQuery, setTripStatus, tripQuery, tripStatus }) {
  return (
    <section className="admin-grid admin-grid--two">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Trips</p>
            <h3>Saved Itineraries</h3>
          </div>
          <div className="admin-filterbar">
            <input value={tripQuery} onChange={(event) => setTripQuery(event.target.value)} placeholder="Search trip, destination, owner..." />
            <input value={tripStatus} onChange={(event) => setTripStatus(event.target.value)} placeholder="Status" />
            <button disabled={isMutating} onClick={onSearch} type="button">Search</button>
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
                    <strong>{trip.trip_name || trip.destination || `Trip #${trip.id}`}</strong>
                    <div className="admin-table__subtext">{trip.destination || "No destination"} · {trip.num_days || 0} days</div>
                  </td>
                  <td>{trip.owner_name || trip.owner_email || "Unknown"}</td>
                  <td><StatusPill status={trip.status}>{trip.status || "Active"}</StatusPill></td>
                  <td>{formatNumber(trip.item_count)} stops · {formatNumber(trip.feedback_count)} feedback</td>
                  <td><button disabled={isMutating} onClick={() => onInspect(trip.id)} type="button">Inspect</button></td>
                </tr>
              ))}
              {itineraries.length === 0 ? (
                <tr><td colSpan="5">No trips match the current filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Trip Detail</p>
            <h3>{selectedTrip?.itinerary?.trip_name || selectedTrip?.itinerary?.destination || "Select a trip"}</h3>
          </div>
          {selectedTrip?.itinerary?.status ? <StatusPill status={selectedTrip.itinerary.status}>{selectedTrip.itinerary.status}</StatusPill> : null}
        </div>
        {selectedTrip ? (
          <>
            <p className="muted">
              Owner: {selectedTrip.itinerary.owner_name || selectedTrip.itinerary.owner_email}. Budget: {selectedTrip.itinerary.budget || "n/a"}.
            </p>
            <div className="admin-event-list">
              {selectedTrip.items.map((item) => (
                <div className="admin-event admin-event--stacked" key={item.id}>
                  <div>
                    <strong>Day {item.day_number}: {item.name || `Place #${item.place_id}`}</strong>
                    <span>{item.category || "Uncategorized"} · {item.city || "No city"} · {item.estimated_duration || 60} min</span>
                  </div>
                </div>
              ))}
              {selectedTrip.items.length === 0 ? <p className="muted">This trip has no saved stops.</p> : null}
            </div>
          </>
        ) : (
          <p className="muted">Inspect a trip to review its owner metadata, stops, and feedback labels.</p>
        )}
      </article>
    </section>
  );
}

function NotificationsPanel({ form, notifications, onSubmit, setForm, users, isMutating }) {
  return (
    <section className="admin-grid admin-grid--two">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Push Operations</p>
            <h3>Send Notification</h3>
          </div>
          <StatusPill status="healthy">{formatNumber(notifications?.reachable_users || 0)} reachable users</StatusPill>
        </div>
        <form className="admin-form" onSubmit={onSubmit}>
          <Field label="Audience">
            <select value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value })}>
              <option value="user">Single user</option>
              <option value="all">All reachable users</option>
            </select>
          </Field>
          {form.audience_type === "user" ? (
            <Field label="Target user">
              <select value={form.target_user_id} onChange={(event) => setForm({ ...form, target_user_id: event.target.value })} required>
                <option value="">Choose a user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.username} · {user.email}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Title">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength="140" required />
          </Field>
          <Field label="Body">
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} rows="4" required />
          </Field>
          <button className="primary" disabled={isMutating} type="submit">Send notification</button>
        </form>
      </article>
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Delivery History</p>
            <h3>Recent Sends</h3>
          </div>
          <StatusPill status="ready">{formatNumber(notifications?.token_count || 0)} tokens</StatusPill>
        </div>
        <div className="admin-event-list">
          {(notifications?.recent || []).map((event) => (
            <div className="admin-event admin-event--stacked" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>{event.audience_type} · sent {formatNumber(event.result?.sent || 0)} · failed {formatNumber(event.result?.failed || 0)}</span>
              </div>
            </div>
          ))}
          {(notifications?.recent || []).length === 0 ? <p className="muted">No admin notifications have been sent yet.</p> : null}
        </div>
      </article>
    </section>
  );
}

function SettingsPanel({ isMutating, isSuperAdmin, refreshWithMutation, settings, token }) {
  return (
    <section className="glass-card admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Operations Feature Flags</h3>
        </div>
        {!isSuperAdmin ? <StatusPill status="review">super admin required</StatusPill> : null}
      </div>
      <div className="admin-event-list">
        {settings.map((setting) => (
          <div className="admin-setting-row" key={setting.setting_key}>
            <div>
              <strong>{setting.setting_key}</strong>
              <span>{setting.description}</span>
            </div>
            <select
              disabled={!isSuperAdmin || isMutating || setting.value_type !== "boolean"}
              onChange={(event) => refreshWithMutation(() => updateAdminSetting(token, setting.setting_key, event.target.value))}
              value={setting.setting_value}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        ))}
        {settings.length === 0 ? <p className="muted">No settings are configured.</p> : null}
      </div>
    </section>
  );
}

function AnalyticsPanel({ analytics, filters, setFilters, onApply }) {
  return (
    <section className="admin-grid">
      <article className="glass-card admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Analytics Filters</p>
            <h3>Date Window</h3>
          </div>
          <button onClick={onApply} type="button">Apply</button>
        </div>
        <div className="admin-form-grid">
          <Field label="Start date">
            <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </Field>
          <Field label="End date">
            <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </Field>
          <MetricCard label="Push tokens" value={analytics?.totals?.push_tokens || 0} delta="notification reach" tone="positive" />
          <MetricCard label="ML runs" value={analytics?.totals?.ml_runs || 0} delta="training history" tone="positive" />
        </div>
      </article>
      <section className="admin-grid admin-grid--three">
        <article className="glass-card admin-panel">
          <p className="eyebrow">Feedback Intelligence</p>
          <h3>Feedback Labels</h3>
          <ChartBars data={analytics?.feedback_labels || []} label="Feedback label distribution" />
        </article>
        <article className="glass-card admin-panel">
          <p className="eyebrow">Travel Demand</p>
          <h3>Itinerary Trend</h3>
          <ChartBars data={analytics?.itinerary_trend || []} label="Itinerary creation trend" />
        </article>
        <article className="glass-card admin-panel">
          <p className="eyebrow">Content Analytics</p>
          <h3>Top Categories</h3>
          <ChartBars data={analytics?.top_categories || []} label="Top place categories" />
        </article>
      </section>
    </section>
  );
}

function PlaceFormModal({ form, isMutating, onChange, onClose, onSubmit }) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <form className="admin-modal glass-card" onSubmit={onSubmit}>
        <div className="admin-panel__header">
          <div>
            <p className="eyebrow">Places Matrix</p>
            <h3>{form.id ? "Edit place" : "Create place"}</h3>
          </div>
          <button onClick={onClose} type="button">Close</button>
        </div>
        <div className="admin-form-grid">
          <Field label="Name">
            <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Category">
            <input value={form.category} onChange={(event) => onChange({ ...form, category: event.target.value })} required />
          </Field>
          <Field label="City / Province">
            <input value={form.city || ""} onChange={(event) => onChange({ ...form, city: event.target.value })} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value })}>
              {placeStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Latitude">
            <input type="number" step="0.0000001" value={form.latitude} onChange={(event) => onChange({ ...form, latitude: event.target.value })} />
          </Field>
          <Field label="Longitude">
            <input type="number" step="0.0000001" value={form.longitude} onChange={(event) => onChange({ ...form, longitude: event.target.value })} />
          </Field>
          <Field label="Rating">
            <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(event) => onChange({ ...form, rating: event.target.value })} />
          </Field>
          <Field label="Tags">
            <input value={form.tags || ""} onChange={(event) => onChange({ ...form, tags: event.target.value })} />
          </Field>
          <Field label="Environment">
            <input value={form.environment_type || ""} onChange={(event) => onChange({ ...form, environment_type: event.target.value })} />
          </Field>
          <Field label="Intensity">
            <input value={form.physical_intensity || ""} onChange={(event) => onChange({ ...form, physical_intensity: event.target.value })} />
          </Field>
          <Field label="Source">
            <input value={form.source || ""} onChange={(event) => onChange({ ...form, source: event.target.value })} />
          </Field>
          <Field label="Curation notes">
            <textarea value={form.curation_notes || ""} onChange={(event) => onChange({ ...form, curation_notes: event.target.value })} rows="3" />
          </Field>
        </div>
        <div className="admin-action-strip">
          <button disabled={isMutating} onClick={onClose} type="button">Cancel</button>
          <button className="primary" disabled={isMutating} type="submit">{form.id ? "Save changes" : "Create place"}</button>
        </div>
      </form>
    </div>
  );
}
