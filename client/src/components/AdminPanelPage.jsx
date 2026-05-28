import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import AdminLayout from "./admin/AdminLayout";
import {
  adminSections,
  buildModelMetrics,
  cleanPlacePayload,
  emptyPlaceForm,
  getAdminSectionFromPath,
  tablePageSize,
  toPlaceForm,
} from "./admin/adminConfig";
import {
  AnalyticsPage,
  AuditPanel,
  BackupPage,
  DashboardPage,
  EmailOpsPage,
  MlPanel,
  NotificationsPage,
  PlaceFormModal,
  PlacesPage,
  SettingsPage,
  TripsPage,
  UsersPage,
  WeatherOpsPage,
} from "./admin/AdminPages";
import BottomSheet from "./common/BottomSheet";
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
  updateAdminUserStatus,
} from "../lib/adminApi";
import { logoutSession } from "../lib/authSession";
import { getStoredToken, loadUserProfile } from "../lib/storage";

const emptyPageInfo = {
  page: 1,
  limit: tablePageSize,
  total: 0,
  pages: 1,
};

export default function AdminPanelPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeNav = getAdminSectionFromPath(location.pathname);
  const rawSection = String(location.pathname || "").split("/")[2] || "";
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
  const [usersPageInfo, setUsersPageInfo] = useState(emptyPageInfo);
  const [places, setPlaces] = useState([]);
  const [placesPageInfo, setPlacesPageInfo] = useState(emptyPageInfo);
  const [analytics, setAnalytics] = useState(null);
  const [mlStatus, setMlStatus] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditPageInfo, setAuditPageInfo] = useState(emptyPageInfo);
  const [itineraries, setItineraries] = useState([]);
  const [tripsPageInfo, setTripsPageInfo] = useState(emptyPageInfo);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [emailOps, setEmailOps] = useState(null);
  const [emailPageInfo, setEmailPageInfo] = useState(emptyPageInfo);
  const [weatherOps, setWeatherOps] = useState(null);
  const [weatherPageInfo, setWeatherPageInfo] = useState(emptyPageInfo);
  const [backups, setBackups] = useState([]);
  const [backupsPageInfo, setBackupsPageInfo] = useState(emptyPageInfo);
  const [backupUploadFile, setBackupUploadFile] = useState(null);
  const [settings, setSettings] = useState([]);
  const [placeForm, setPlaceForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin" || isSuperAdmin;
  const activeItem =
    adminSections.find((item) => item.id === activeNav) || adminSections[0];

  const shouldRedirectToDashboard =
    location.pathname === "/admin" ||
    location.pathname === "/admin/" ||
    (rawSection && !adminSections.some((item) => item.id === rawSection));

  async function loadAdminData(
    section = activeNav,
    {
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
    } = {},
  ) {
    if (!token || !isAdmin) return;
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      if (section === "dashboard") {
        const [
          overviewData,
          mlData,
          auditData,
          notificationData,
          emailData,
          weatherData,
          backupData,
        ] = await Promise.all([
          getAdminOverview(token),
          getAdminMlStatus(token),
          getAdminAuditLog(token, { page: 1, limit: 8 }),
          getAdminNotifications(token),
          getAdminEmailOps(token, { page: 1, limit: 5 }),
          getAdminWeatherOps(token, { page: 1, limit: 5, activeOnly: true }),
          getAdminBackups(token, 1, 5),
        ]);
        setOverview(overviewData);
        setMlStatus(mlData);
        setAuditEvents(
          auditData.events ||
            auditData.items ||
            overviewData.recent_audit?.events ||
            overviewData.recent_audit ||
            [],
        );
        setNotifications(notificationData);
        setEmailOps(emailData);
        setWeatherOps(weatherData);
        setBackupsPageInfo({
          page: backupData.page || 1,
          limit: backupData.limit || 5,
          total: backupData.total || 0,
          pages: backupData.pages || 1,
        });
      } else if (section === "users") {
        const usersData = await getAdminUsers(
          token,
          usersQuery,
          usersPage,
          tablePageSize,
        );
        setUsers(usersData.users || usersData.items || []);
        setUsersPageInfo(pageInfoFrom(usersData, usersPage));
      } else if (section === "places") {
        const placesData = await getAdminPlaces(
          token,
          placesQuery,
          placesPage,
          tablePageSize,
        );
        setPlaces(placesData.places || placesData.items || []);
        setPlacesPageInfo(pageInfoFrom(placesData, placesPage));
      } else if (section === "analytics") {
        setAnalytics(await getAdminAnalytics(token, analyticsWindow));
      } else if (section === "ml") {
        setMlStatus(await getAdminMlStatus(token));
      } else if (section === "audit") {
        const auditData = await getAdminAuditLog(token, {
          ...auditWindow,
          page: auditPage,
          limit: tablePageSize,
        });
        setAuditEvents(auditData.events || auditData.items || []);
        setAuditPageInfo(pageInfoFrom(auditData, auditPage));
      } else if (section === "trips") {
        const tripsData = await getAdminItineraries(
          token,
          tripsQuery,
          tripsStatus,
          tripsPage,
          tablePageSize,
        );
        setItineraries(tripsData.itineraries || tripsData.items || []);
        setTripsPageInfo(pageInfoFrom(tripsData, tripsPage));
      } else if (section === "notifications") {
        setNotifications(await getAdminNotifications(token));
      } else if (section === "email") {
        const emailData = await getAdminEmailOps(token, {
          q: emailSearch,
          page: emailPage,
          limit: tablePageSize,
        });
        setEmailOps(emailData);
        setEmailPageInfo({
          page: emailData.page || emailPage,
          limit: emailData.limit || tablePageSize,
          total: emailData.totals?.queue || 0,
          pages: emailData.pages || 1,
        });
      } else if (section === "weather") {
        const weatherData = await getAdminWeatherOps(token, {
          q: weatherSearch,
          page: weatherPage,
          limit: tablePageSize,
          activeOnly:
            weatherOnlyActive === "all"
              ? undefined
              : weatherOnlyActive === "active",
        });
        setWeatherOps(weatherData);
        setWeatherPageInfo(pageInfoFrom(weatherData, weatherPage));
      } else if (section === "backups") {
        const backupData = await getAdminBackups(token, backupsPage, tablePageSize);
        setBackups(backupData.backups || backupData.items || []);
        setBackupsPageInfo(pageInfoFrom(backupData, backupsPage));
      } else if (section === "settings") {
        const settingsData = await getAdminSettings(token);
        setSettings(settingsData.settings || []);
      }
    } catch (requestError) {
      setError(requestError.message || "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const loadInitialAdminData = async () => {
      await loadAdminData(activeNav);
    };
    loadInitialAdminData();
    // Route changes intentionally drive page-specific admin loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, activeNav]);

  async function handleLogout() {
    setIsLogoutModalOpen(false);
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
        downloadBlob(archive, backup.file_name || `${backup.backup_label}.zip`);
      },
      "backups",
      { backupsPage: backupsPageInfo.page },
    );
  }

  async function handleDownloadBackup(backup) {
    const archive = await downloadAdminBackup(token, backup.id);
    downloadBlob(archive, backup.file_name || `${backup.backup_label}.zip`);
  }

  async function handleRestoreBackupFromHistory(backup) {
    if (!isSuperAdmin) {
      setError("Only super admins can restore database backups.");
      return;
    }
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
      "backups",
      { backupsPage: backupsPageInfo.page },
    );
  }

  async function handleRestoreBackupUpload(event) {
    event.preventDefault();
    if (!isSuperAdmin) {
      setError("Only super admins can restore database backups.");
      return;
    }
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
      "backups",
      { backupsPage: backupsPageInfo.page },
    );
  }

  function updateSectionPage(section, nextPage) {
    const page = Math.max(1, Number(nextPage || 1));
    loadAdminData(section, {
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
  const modelMetrics = buildModelMetrics(latestModel);

  async function refreshWithMutation(action, section = activeNav, reloadOptions) {
    setError("");
    setIsMutating(true);
    try {
      const result = await action();
      await loadAdminData(section, reloadOptions);
      return result;
    } catch (requestError) {
      setSuccess("");
      setError(requestError.message || "Admin action failed.");
      throw requestError;
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
    }, "places");
  }

  function handleRetrain() {
    if (
      !window.confirm(
        "Retrain the recommendation model using current user feedback?",
      )
    ) {
      return;
    }
    refreshWithMutation(() => requestAdminRetraining(token), "ml");
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
    refreshWithMutation(
      () =>
        updateAdminUserStatus(
          token,
          user.id,
          willSuspend ? "suspended" : "active",
          reason,
        ),
      "users",
    );
  }

  function handleLoadTripDetail(itineraryId) {
    refreshWithMutation(
      async () => {
        const detail = await getAdminItineraryDetail(token, itineraryId);
        setSelectedTrip(detail);
      },
      "trips",
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
    <AdminLayout
      activeItem={activeItem}
      activeNav={activeNav}
      error={error}
      isLoading={isLoading}
      isMutating={isMutating}
      onLogout={() => setIsLogoutModalOpen(true)}
      onNavigate={navigate}
      onRefresh={() => loadAdminData(activeNav)}
      onRetrain={handleRetrain}
      overview={overview}
      profile={profile}
      setSidebarOpen={setSidebarOpen}
      sidebarOpen={sidebarOpen}
      success={success}
    >
      {renderActivePage()}
      <BottomSheet
        open={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="Log out?"
        size="sm"
        footer={
          <>
            <button
              className="btn-outline-luxury"
              type="button"
              onClick={() => setIsLogoutModalOpen(false)}
            >
              Cancel
            </button>
            <button className="btn-luxury" type="button" onClick={handleLogout}>
              Log Out
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          Are you sure you want to log out of the admin console?
        </p>
      </BottomSheet>
      {placeForm ? (
        <PlaceFormModal
          form={placeForm}
          isMutating={isMutating}
          onChange={setPlaceForm}
          onClose={() => setPlaceForm(null)}
          onSubmit={handleSavePlace}
        />
      ) : null}
    </AdminLayout>
  );

  function renderActivePage() {
    if (activeNav === "dashboard") {
      return (
        <DashboardPage
          auditEvents={auditEvents}
          backupsPageInfo={backupsPageInfo}
          emailOps={emailOps}
          isMutating={isMutating}
          latestModel={latestModel}
          mlStatus={mlStatus}
          modelMetrics={modelMetrics}
          notifications={notifications}
          onOpenAudit={() => navigate("/admin/audit")}
          onOpenSection={(path) => navigate(`/admin/${path}`)}
          onRetrain={handleRetrain}
          overview={overview}
          weatherOps={weatherOps}
        />
      );
    }

    if (activeNav === "places") {
      return (
        <PlacesPage
          filteredPlaces={filteredPlaces}
          isMutating={isMutating}
          onOpenPlaceForm={handleOpenPlaceForm}
          onPageChange={(nextPage) => updateSectionPage("places", nextPage)}
          onSearch={() =>
            loadAdminData("places", { placesQuery: placeQuery, placesPage: 1 })
          }
          pageInfo={placesPageInfo}
          placeQuery={placeQuery}
          refreshWithMutation={(action) =>
            refreshWithMutation(action, "places")
          }
          setPlaceQuery={setPlaceQuery}
          token={token}
        />
      );
    }

    if (activeNav === "ml") {
      return (
        <MlPanel
          latestModel={latestModel}
          modelMetrics={modelMetrics}
          mlStatus={mlStatus}
          onRetrain={handleRetrain}
          isMutating={isMutating}
          full
        />
      );
    }

    if (activeNav === "users") {
      return (
        <UsersPage
          filteredUsers={filteredUsers}
          isMutating={isMutating}
          isSuperAdmin={isSuperAdmin}
          onPageChange={(nextPage) => updateSectionPage("users", nextPage)}
          onSearch={() =>
            loadAdminData("users", { usersQuery: userQuery, usersPage: 1 })
          }
          onSuspendUser={handleSuspendUser}
          pageInfo={usersPageInfo}
          refreshWithMutation={(action) => refreshWithMutation(action, "users")}
          setUserQuery={setUserQuery}
          token={token}
          userQuery={userQuery}
        />
      );
    }

    if (activeNav === "trips") {
      return (
        <TripsPage
          itineraries={itineraries}
          selectedTrip={selectedTrip}
          isMutating={isMutating}
          onInspect={handleLoadTripDetail}
          onPageChange={(nextPage) => updateSectionPage("trips", nextPage)}
          onSearch={() =>
            loadAdminData("trips", {
              tripsQuery: tripQuery,
              tripsStatus: tripStatus,
              tripsPage: 1,
            })
          }
          pageInfo={tripsPageInfo}
          setTripQuery={setTripQuery}
          setTripStatus={setTripStatus}
          tripQuery={tripQuery}
          tripStatus={tripStatus}
        />
      );
    }

    if (activeNav === "notifications") {
      return (
        <NotificationsPage
          isMutating={isMutating}
          notifications={notifications}
          onSent={(action) => refreshWithMutation(action, "notifications")}
          setError={setError}
          setSuccess={setSuccess}
          token={token}
        />
      );
    }

    if (activeNav === "email") {
      return (
        <EmailOpsPage
          emailOps={emailOps}
          emailQuery={emailQuery}
          isMutating={isMutating}
          loadAdminData={loadAdminData}
          setEmailQuery={setEmailQuery}
          onPageChange={(nextPage) => updateSectionPage("email", nextPage)}
          pageInfo={emailPageInfo}
        />
      );
    }

    if (activeNav === "weather") {
      return (
        <WeatherOpsPage
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
      );
    }

    if (activeNav === "backups") {
      return (
        <BackupPage
          backups={backups}
          backupUploadFile={backupUploadFile}
          isMutating={isMutating}
          isSuperAdmin={isSuperAdmin}
          onCreateBackup={handleCreateBackup}
          onDownloadBackup={handleDownloadBackup}
          onPageChange={(nextPage) => updateSectionPage("backups", nextPage)}
          onRestoreFromHistory={handleRestoreBackupFromHistory}
          onRestoreUpload={handleRestoreBackupUpload}
          pageInfo={backupsPageInfo}
          setBackupUploadFile={setBackupUploadFile}
        />
      );
    }

    if (activeNav === "settings") {
      return (
        <SettingsPage
          isMutating={isMutating}
          isSuperAdmin={isSuperAdmin}
          refreshWithMutation={(action) =>
            refreshWithMutation(action, "settings")
          }
          settings={settings}
          token={token}
        />
      );
    }

    if (activeNav === "analytics") {
      return (
        <AnalyticsPage
          analytics={analytics}
          filters={analyticsFilters}
          setFilters={setAnalyticsFilters}
          onApply={() =>
            loadAdminData("analytics", { analyticsWindow: analyticsFilters })
          }
        />
      );
    }

    if (activeNav === "audit") {
      return (
        <section className="admin-grid">
          <div className="glass-card admin-panel">
            <div className="admin-panel__header">
              <div>
                <p className="eyebrow">Audit Filters</p>
                <h3>Search privileged actions</h3>
              </div>
              <button
                disabled={isMutating}
                onClick={() =>
                  loadAdminData("audit", {
                    auditWindow: auditFilters,
                    auditPage: 1,
                  })
                }
                type="button"
              >
                Apply filters
              </button>
            </div>
            <div className="admin-form-grid admin-form-grid--four">
              <label className="admin-field">
                <span>Action</span>
                <input
                  value={auditFilters.action}
                  onChange={(event) =>
                    setAuditFilters({
                      ...auditFilters,
                      action: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>Target type</span>
                <input
                  value={auditFilters.targetType}
                  onChange={(event) =>
                    setAuditFilters({
                      ...auditFilters,
                      targetType: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>Start date</span>
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
              </label>
              <label className="admin-field">
                <span>End date</span>
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
              </label>
            </div>
          </div>
          <AuditPanel
            events={auditEvents}
            onPageChange={(nextPage) => updateSectionPage("audit", nextPage)}
            pageInfo={auditPageInfo}
          />
        </section>
      );
    }

    return null;
  }
}

function pageInfoFrom(payload = {}, fallbackPage = 1) {
  return {
    page: payload.page || fallbackPage,
    limit: payload.limit || tablePageSize,
    total: payload.total || 0,
    pages: payload.pages || 1,
  };
}

function downloadBlob(blob, fileName) {
  const archiveUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = archiveUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(archiveUrl);
}
