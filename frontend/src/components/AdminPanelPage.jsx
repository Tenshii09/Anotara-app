import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import {
  createAdminBackup,
  createAdminPlace,
  downloadAdminBackup,
  getAdminAnalytics,
  getAdminAuditLog,
  getAdminBackups,
  getAdminEmailOps,
  getAdminItineraries,
  getAdminItineraryDetail,
  getAdminMlStatus,
  getAdminNotifications,
  getAdminOverview,
  getAdminPlaces,
  getAdminSettings,
  getAdminWeatherOps,
  getAdminUsers,
  restoreAdminBackupFromHistory,
  restoreAdminBackupUpload,
  requestAdminRetraining,
  updateAdminPlace,
  updateAdminSetting,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "../lib/adminApi";
import { logoutSession } from "../lib/authSession";
import { getStoredToken, loadUserProfile } from "../lib/storage";

const adminSections = [
  {
    id: "dashboard",
    path: "dashboard",
    label: "Command Center",
    title: "System Health & Content Operations",
  },
  {
    id: "analytics",
    path: "analytics",
    label: "Analytics",
    title: "Travel Demand Intelligence",
  },
  {
    id: "users",
    path: "users",
    label: "Identity & Security",
    title: "User & Admin Management",
  },
  {
    id: "places",
    path: "places",
    label: "Places Matrix",
    title: "Destination & Content Management",
  },
  { id: "trips", path: "trips", label: "Trips", title: "Itinerary Inspection" },
  {
    id: "notifications",
    path: "notifications",
    label: "Notifications",
    title: "Notification Monitoring",
  },
  {
    id: "email",
    path: "email",
    label: "Email Ops",
    title: "Queue, delivery, and suppression review",
  },
  {
    id: "weather",
    path: "weather",
    label: "Weather & Safety",
    title: "Alert review and pivot support",
  },
  {
    id: "backups",
    path: "backups",
    label: "Backups",
    title: "Export, restore, and recovery history",
  },
  {
    id: "ml",
    path: "ml",
    label: "Random Forest",
    title: "Model Quality & Training Runs",
  },
  {
    id: "settings",
    path: "settings",
    label: "Settings",
    title: "Operations Settings",
  },
  {
    id: "audit",
    path: "audit",
    label: "Audit Trail",
    title: "Privileged Action History",
  },
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
  return (
    <span
      className={`admin-pill admin-pill--${String(status).toLowerCase().replace(/\s+/g, "-")}`}
    >
      {children}
    </span>
  );
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
              <ProgressBar
                value={(value / maxValue) * 100}
                label={`${item.label} ${value}`}
              />
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

function Pager({ pageInfo = {}, onPageChange }) {
  const page = Number(pageInfo.page || 1);
  const pages = Number(pageInfo.pages || 1);
  if (pages <= 1) return null;

  return (
    <div className="admin-pager">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Next
      </button>
    </div>
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

function getAdminSectionFromPath(pathname) {
  const section = String(pathname || "").split("/")[2] || "dashboard";
  return adminSections.some((item) => item.id === section)
    ? section
    : "dashboard";
}

export default function AdminPanelPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeNav = getAdminSectionFromPath(location.pathname);
  const rawSection = String(location.pathname || "").split("/")[2] || "";
  const tablePageSize = 10;
  const [placeQuery, setPlaceQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [tripQuery, setTripQuery] = useState("");
  const [tripStatus, setTripStatus] = useState("");
  const [analyticsFilters, setAnalyticsFilters] = useState({
    startDate: "",
    endDate: "",
  });
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    targetType: "",
    startDate: "",
    endDate: "",
  });
  const [emailQuery, setEmailQuery] = useState("");
  const [weatherQuery, setWeatherQuery] = useState("");
  const [weatherActiveOnly, setWeatherActiveOnly] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile] = useState(() => loadUserProfile());
  const [token] = useState(() => getStoredToken());
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersPageInfo, setUsersPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [places, setPlaces] = useState([]);
  const [placesPageInfo, setPlacesPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [analytics, setAnalytics] = useState(null);
  const [mlStatus, setMlStatus] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditPageInfo, setAuditPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [itineraries, setItineraries] = useState([]);
  const [tripsPageInfo, setTripsPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [emailOps, setEmailOps] = useState(null);
  const [emailPageInfo, setEmailPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [weatherOps, setWeatherOps] = useState(null);
  const [weatherPageInfo, setWeatherPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [backups, setBackups] = useState([]);
  const [backupsPageInfo, setBackupsPageInfo] = useState({
    page: 1,
    limit: tablePageSize,
    total: 0,
    pages: 1,
  });
  const [backupUploadFile, setBackupUploadFile] = useState(null);
  const [settings, setSettings] = useState([]);
  const [placeForm, setPlaceForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState("");

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin" || isSuperAdmin;
  const activeItem =
    adminSections.find((item) => item.id === activeNav) || adminSections[0];

  const shouldRedirectToDashboard =
    location.pathname === "/admin" ||
    location.pathname === "/admin/" ||
    (rawSection && !adminSections.some((item) => item.id === rawSection));

  async function loadAdminData({
    placesQuery = placeQuery,
    usersQuery = userQuery,
    tripsQuery = tripQuery,
    tripsStatus = tripStatus,
    analyticsWindow = analyticsFilters,
    auditWindow = auditFilters,
    emailSearch = emailQuery,
    weatherSearch = weatherQuery,
    weatherOnlyActive = weatherActiveOnly,
    usersPage = usersPageInfo.page,
    placesPage = placesPageInfo.page,
    tripsPage = tripsPageInfo.page,
    auditPage = auditPageInfo.page,
    emailPage = emailPageInfo.page,
    weatherPage = weatherPageInfo.page,
    backupsPage = backupsPageInfo.page,
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
        emailData,
        weatherData,
        backupData,
        settingsData,
      ] = await Promise.all([
        getAdminOverview(token),
        getAdminUsers(token, usersQuery, usersPage, tablePageSize),
        getAdminPlaces(token, placesQuery, placesPage, tablePageSize),
        getAdminAnalytics(token, analyticsWindow),
        getAdminMlStatus(token),
        getAdminAuditLog(token, {
          ...auditWindow,
          page: auditPage,
          limit: tablePageSize,
        }),
        getAdminItineraries(
          token,
          tripsQuery,
          tripsStatus,
          tripsPage,
          tablePageSize,
        ),
        getAdminNotifications(token),
        getAdminEmailOps(token, {
          q: emailSearch,
          page: emailPage,
          limit: tablePageSize,
        }),
        getAdminWeatherOps(token, {
          q: weatherSearch,
          page: weatherPage,
          limit: tablePageSize,
          activeOnly:
            weatherOnlyActive === "all"
              ? undefined
              : weatherOnlyActive === "active",
        }),
        getAdminBackups(token, backupsPage, tablePageSize),
        getAdminSettings(token),
      ]);
      setOverview(overviewData);
      setUsers(usersData.users || usersData.items || []);
      setUsersPageInfo({
        page: usersData.page || usersPage,
        limit: usersData.limit || tablePageSize,
        total: usersData.total || 0,
        pages: usersData.pages || 1,
      });
      setPlaces(placesData.places || placesData.items || []);
      setPlacesPageInfo({
        page: placesData.page || placesPage,
        limit: placesData.limit || tablePageSize,
        total: placesData.total || 0,
        pages: placesData.pages || 1,
      });
      setAnalytics(analyticsData);
      setMlStatus(mlData);
      setAuditEvents(
        auditData.events || auditData.items || overviewData.recent_audit || [],
      );
      setAuditPageInfo({
        page: auditData.page || auditPage,
        limit: auditData.limit || tablePageSize,
        total: auditData.total || 0,
        pages: auditData.pages || 1,
      });
      setItineraries(tripsData.itineraries || tripsData.items || []);
      setTripsPageInfo({
        page: tripsData.page || tripsPage,
        limit: tripsData.limit || tablePageSize,
        total: tripsData.total || 0,
        pages: tripsData.pages || 1,
      });
      setNotifications(notificationData);
      setEmailOps(emailData);
      setEmailPageInfo({
        page: emailData.page || emailPage,
        limit: emailData.limit || tablePageSize,
        total: emailData.totals?.queue || 0,
        pages: emailData.pages || 1,
      });
      setWeatherOps(weatherData);
      setWeatherPageInfo({
        page: weatherData.page || weatherPage,
        limit: weatherData.limit || tablePageSize,
        total: weatherData.total || 0,
        pages: weatherData.pages || 1,
      });
      setBackups(backupData.backups || backupData.items || []);
      setBackupsPageInfo({
        page: backupData.page || backupsPage,
        limit: backupData.limit || tablePageSize,
        total: backupData.total || 0,
        pages: backupData.pages || 1,
      });
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

  async function handleLogout() {
    await logoutSession();
    navigate("/login");
  }

  async function handleCreateBackup() {
    if (!window.confirm("Create a full database backup now?")) {
      return;
    }
    await refreshWithMutation(
      async () => {
        const backup = await createAdminBackup(token);
        const archive = await downloadAdminBackup(token, backup.id);
        const archiveUrl = window.URL.createObjectURL(archive);
        const anchor = document.createElement("a");
        anchor.href = archiveUrl;
        anchor.download = backup.file_name || `${backup.backup_label}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(archiveUrl);
      },
      { backupsPage: backupsPageInfo.page },
    );
  }

  async function handleDownloadBackup(backup) {
    const archive = await downloadAdminBackup(token, backup.id);
    const archiveUrl = window.URL.createObjectURL(archive);
    const anchor = document.createElement("a");
    anchor.href = archiveUrl;
    anchor.download = backup.file_name || `${backup.backup_label}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(archiveUrl);
  }

  async function handleRestoreBackupFromHistory(backup) {
    if (
      !window.confirm(
        `Restore the database from ${backup.file_name}? This is destructive.`,
      )
    ) {
      return;
    }
    await refreshWithMutation(
      async () => {
        await restoreAdminBackupFromHistory(token, backup.id);
      },
      { backupsPage: backupsPageInfo.page },
    );
  }

  async function handleRestoreBackupUpload(event) {
    event.preventDefault();
    if (!backupUploadFile) {
      setError("Choose a backup archive before restoring.");
      return;
    }
    if (
      !window.confirm(
        "Restore the uploaded backup? This will replace the database contents.",
      )
    ) {
      return;
    }
    await refreshWithMutation(
      async () => {
        await restoreAdminBackupUpload(token, backupUploadFile);
        setBackupUploadFile(null);
      },
      { backupsPage: backupsPageInfo.page },
    );
  }

  function updateSectionPage(section, nextPage) {
    const page = Math.max(1, Number(nextPage || 1));
    loadAdminData({
      usersPage: section === "users" ? page : usersPageInfo.page,
      placesPage: section === "places" ? page : placesPageInfo.page,
      tripsPage: section === "trips" ? page : tripsPageInfo.page,
      auditPage: section === "audit" ? page : auditPageInfo.page,
      emailPage: section === "email" ? page : emailPageInfo.page,
      weatherPage: section === "weather" ? page : weatherPageInfo.page,
      backupsPage: section === "backups" ? page : backupsPageInfo.page,
    });
  }

  const filteredPlaces = useMemo(() => {
    const query = placeQuery.trim().toLowerCase();
    if (!query) return places;
    return places.filter((place) =>
      [place.name, place.city, place.category, place.status, place.tags]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [placeQuery, places]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.username, user.email, user.role, user.account_status]
        .join(" ")
        .toLowerCase()
        .includes(query),
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
    if (
      !window.confirm(
        "Retrain the recommendation model using current user feedback?",
      )
    )
      return;
    refreshWithMutation(() => requestAdminRetraining(token));
  }

  function handleSuspendUser(user) {
    const willSuspend = user.account_status !== "suspended";
    const reason = willSuspend
      ? window.prompt(
          "Why is this account being suspended?",
          user.suspended_reason || "Suspended from admin console",
        )
      : "";
    if (willSuspend && reason === null) return;
    refreshWithMutation(() =>
      updateAdminUserStatus(
        token,
        user.id,
        willSuspend ? "suspended" : "active",
        reason,
      ),
    );
  }

  function handleLoadTripDetail(itineraryId) {
    refreshWithMutation(
      async () => {
        const detail = await getAdminItineraryDetail(token, itineraryId);
        setSelectedTrip(detail);
      },
      { tripsQuery: tripQuery, tripsStatus: tripStatus },
    );
  }

  if (shouldRedirectToDashboard) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (!token || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="admin-page">
      <aside
        className={
          sidebarOpen
            ? "admin-sidebar glass-card admin-sidebar--open"
            : "admin-sidebar glass-card"
        }
        aria-label="Admin navigation"
      >
        <div>
          <p className="eyebrow">Ano Tara Admin</p>
          <h1>Operations Console</h1>
          <p className="muted">
            Secure command center for content operations, account management,
            analytics, audit, and ML oversight.
          </p>
        </div>
        <nav className="admin-nav">
          {adminSections.map((item) => (
            <button
              className={
                item.id === activeNav
                  ? "admin-nav__item active"
                  : "admin-nav__item"
              }
              key={item.id}
              onClick={() => navigate(`/admin/${item.path}`)}
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
          <button onClick={handleLogout} type="button">
            Log out
          </button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar glass-card">
          <div className="admin-topbar__titleblock">
            <button
              className="admin-topbar__menu-toggle"
              onClick={() => setSidebarOpen((value) => !value)}
              type="button"
            >
              Menu
            </button>
            <div>
              <p className="eyebrow">{activeItem.label}</p>
              <h2>{activeItem.title}</h2>
            </div>
          </div>
          <div className="admin-topbar__actions">
            <button
              disabled={isMutating}
              onClick={() => loadAdminData()}
              type="button"
            >
              Refresh
            </button>
            <button onClick={handleLogout} type="button">
              Log out
            </button>
            {activeNav === "ml" || activeNav === "dashboard" ? (
              <button
                className="primary"
                disabled={isMutating}
                onClick={handleRetrain}
                type="button"
              >
                Request retraining
              </button>
            ) : null}
          </div>
        </header>

        <section className="admin-hero glass-card">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h3>{profile?.name || profile?.role || "Operations admin"}</h3>
            <p className="muted">
              Use this workspace to review live operations, monitor delivery,
              manage content, and keep the platform recoverable.
            </p>
          </div>
          <div className="admin-hero__actions">
            <StatusPill status={overview?.model_status?.status || "healthy"}>
              {overview?.model_status?.status || "healthy"}
            </StatusPill>
            <button onClick={() => loadAdminData()} type="button">
              Reload live data
            </button>
          </div>
        </section>

        {error ? (
          <div className="admin-notice admin-notice--error">{error}</div>
        ) : null}
        {isLoading ? (
          <div className="admin-notice">
            Loading live admin operations data...
          </div>
        ) : null}

        {activeNav === "dashboard" ? (
          <>
            <section
              className="admin-metric-grid"
              aria-label="Executive telemetry"
            >
              {(overview?.metrics || []).map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </section>
            <section className="admin-grid admin-grid--two">
              <AuditPanel
                events={auditEvents.slice(0, 8)}
                compact
                onOpenAudit={() => navigate("/admin/audit")}
              />
              <MlPanel
                latestModel={latestModel}
                modelMetrics={modelMetrics}
                mlStatus={mlStatus}
                onRetrain={handleRetrain}
                isMutating={isMutating}
              />
            </section>
          </>
        ) : null}

        {activeNav === "places" ? (
          <PlacesPanel
            filteredPlaces={filteredPlaces}
            isMutating={isMutating}
            onOpenPlaceForm={handleOpenPlaceForm}
            onPageChange={(nextPage) => updateSectionPage("places", nextPage)}
            onSearch={() =>
              loadAdminData({ placesQuery: placeQuery, placesPage: 1 })
            }
            placeQuery={placeQuery}
            setPlaceQuery={setPlaceQuery}
            token={token}
            refreshWithMutation={refreshWithMutation}
            pageInfo={placesPageInfo}
          />
        ) : null}

        {activeNav === "ml" ? (
          <MlPanel
            latestModel={latestModel}
            modelMetrics={modelMetrics}
            mlStatus={mlStatus}
            onRetrain={handleRetrain}
            isMutating={isMutating}
            full
          />
        ) : null}

        {activeNav === "users" ? (
          <UsersPanel
            filteredUsers={filteredUsers}
            isMutating={isMutating}
            isSuperAdmin={isSuperAdmin}
            onPageChange={(nextPage) => updateSectionPage("users", nextPage)}
            onSearch={() =>
              loadAdminData({ usersQuery: userQuery, usersPage: 1 })
            }
            onSuspendUser={handleSuspendUser}
            refreshWithMutation={refreshWithMutation}
            setUserQuery={setUserQuery}
            token={token}
            userQuery={userQuery}
            pageInfo={usersPageInfo}
          />
        ) : null}

        {activeNav === "trips" ? (
          <TripsPanel
            itineraries={itineraries}
            selectedTrip={selectedTrip}
            isMutating={isMutating}
            onInspect={handleLoadTripDetail}
            onPageChange={(nextPage) => updateSectionPage("trips", nextPage)}
            onSearch={() =>
              loadAdminData({
                tripsQuery: tripQuery,
                tripsStatus: tripStatus,
                tripsPage: 1,
              })
            }
            setTripQuery={setTripQuery}
            setTripStatus={setTripStatus}
            tripQuery={tripQuery}
            tripStatus={tripStatus}
            pageInfo={tripsPageInfo}
          />
        ) : null}

        {activeNav === "notifications" ? (
          <NotificationsPanel notifications={notifications} />
        ) : null}

        {activeNav === "email" ? (
          <EmailOpsPanel
            emailOps={emailOps}
            emailQuery={emailQuery}
            isMutating={isMutating}
            loadAdminData={loadAdminData}
            setEmailQuery={setEmailQuery}
            onPageChange={(nextPage) => updateSectionPage("email", nextPage)}
            pageInfo={emailPageInfo}
          />
        ) : null}

        {activeNav === "weather" ? (
          <WeatherOpsPanel
            isMutating={isMutating}
            loadAdminData={loadAdminData}
            setWeatherActiveOnly={setWeatherActiveOnly}
            setWeatherQuery={setWeatherQuery}
            weatherActiveOnly={weatherActiveOnly}
            weatherOps={weatherOps}
            weatherQuery={weatherQuery}
            onPageChange={(nextPage) => updateSectionPage("weather", nextPage)}
            pageInfo={weatherPageInfo}
          />
        ) : null}

        {activeNav === "backups" ? (
          <BackupPanel
            backups={backups}
            backupUploadFile={backupUploadFile}
            isMutating={isMutating}
            onCreateBackup={handleCreateBackup}
            onDownloadBackup={handleDownloadBackup}
            onPageChange={(nextPage) => updateSectionPage("backups", nextPage)}
            onRestoreFromHistory={handleRestoreBackupFromHistory}
            onRestoreUpload={handleRestoreBackupUpload}
            pageInfo={backupsPageInfo}
            setBackupUploadFile={setBackupUploadFile}
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
                <button
                  disabled={isMutating}
                  onClick={() => loadAdminData({ auditWindow: auditFilters })}
                  type="button"
                >
                  Apply filters
                </button>
              </div>
              <div className="admin-form-grid admin-form-grid--four">
                <Field label="Action">
                  <input
                    value={auditFilters.action}
                    onChange={(event) =>
                      setAuditFilters({
                        ...auditFilters,
                        action: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Target type">
                  <input
                    value={auditFilters.targetType}
                    onChange={(event) =>
                      setAuditFilters({
                        ...auditFilters,
                        targetType: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Start date">
                  <input
                    type="date"
                    value={auditFilters.startDate}
                    onChange={(event) =>
                      setAuditFilters({
                        ...auditFilters,
                        startDate: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    value={auditFilters.endDate}
                    onChange={(event) =>
                      setAuditFilters({
                        ...auditFilters,
                        endDate: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            <AuditPanel
              events={auditEvents}
              onPageChange={(nextPage) => updateSectionPage("audit", nextPage)}
              pageInfo={auditPageInfo}
            />
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

function AuditPanel({
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

function MlPanel({
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

function PlacesPanel({
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

function UsersPanel({
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
                          updateAdminUserRole(
                            token,
                            user.id,
                            event.target.value,
                          ),
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
        <p className="muted">
          Only super admins can grant or revoke admin roles.
        </p>
      ) : null}
    </section>
  );
}

function TripsPanel({
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

function NotificationsPanel({ notifications }) {
  const summary = notifications?.summary || {};
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

function EmailOpsPanel({
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
                loadAdminData({ emailSearch: emailQuery, emailPage: 1 })
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

function WeatherOpsPanel({
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
                loadAdminData({
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

function BackupPanel({
  backups,
  backupUploadFile,
  isMutating,
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
          <StatusPill status="high">destructive actions guarded</StatusPill>
        </div>
        <div className="admin-notice">
          Backups are full database archives. Restores replace current data and
          should only be performed by a super admin after validation.
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
              onChange={(event) =>
                setBackupUploadFile(event.target.files?.[0] || null)
              }
              type="file"
            />
          </Field>
          <button className="primary" disabled={isMutating} type="submit">
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
                  disabled={isMutating}
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

function SettingsPanel({
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

function AnalyticsPanel({ analytics, filters, setFilters, onApply }) {
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

function PlaceFormModal({ form, isMutating, onChange, onClose, onSubmit }) {
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
