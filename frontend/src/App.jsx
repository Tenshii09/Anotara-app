import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthPage from "./components/AuthPage";
import BottomNav from "./components/common/BottomNav";
import BrandLogo from "./components/common/BrandLogo";
import OfflineIndicator from "./components/common/OfflineIndicator";
import {
  clearSession,
  getValidAccessToken,
  hasStoredSession,
  onSessionExpired,
  scheduleSilentRefresh,
  startIdleSessionTimeout,
} from "./lib/authSession";
import { getStoredToken, loadUserProfile } from "./lib/storage";
import { applyTheme, getInitialTheme } from "./lib/theme";

import "./App.css";

const DashboardPage = lazy(() => import("./components/DashboardPage"));
const DiscoverPage = lazy(() => import("./components/DiscoverPage"));
const NotificationsPage = lazy(() => import("./components/NotificationsPage"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const MyTripsPage = lazy(() => import("./components/MyTripsPage"));
const ItineraryPage = lazy(() => import("./components/ItineraryPage"));
const TravelWizard = lazy(() => import("./components/TravelWizard"));
const AdminPanelPage = lazy(() => import("./components/AdminPanelPage"));
const ResetPasswordPage = lazy(() => import("./components/ResetPasswordPage"));
const LandingPage = lazy(() => import("./components/LandingPage"));

/**
 * Renders the fixed, animated fluid-pastel background that sits behind
 * every route. The orbs are GPU-accelerated radial gradients defined in
 * App.css. Decorative-only — hidden from assistive tech.
 */
function AnimatedBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <span className="app-bg__orb app-bg__orb--pink" />
      <span className="app-bg__orb app-bg__orb--lavender" />
      <span className="app-bg__orb app-bg__orb--sky" />
      <span className="app-bg__orb app-bg__orb--mint" />
      <span className="app-bg__orb app-bg__orb--peach" />
    </div>
  );
}

/**
 * One-shot launch splash for the PWA.  It paints over the app while React
 * mounts so the user never sees a flash of blank pixels when they tap the
 * home-screen icon, then fades away cleanly on its own.
 */
function LaunchSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="app-splash" role="status" aria-label="Loading Ano-Tara!">
      <div className="app-splash__inner">
        <div className="app-splash__brand">
          <BrandLogo size={360} variant="full" />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Your Philippine journey is loading…
        </p>
      </div>
    </div>
  );
}

/**
 * Hides the floating bottom nav on routes that demand a distraction-free,
 * full-screen treatment (auth, the trip generator wizard, etc.).
 */
function RouteAwareBottomNav() {
  const location = useLocation();
  const hiddenPrefixes = [
    "/login",
    "/register",
    "/reset-password",
    "/landing",
    "/generate",
    "/itinerary",
    "/admin",
  ];
  const pathname = location.pathname;
  const shouldHide =
    pathname === "/" ||
    hiddenPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (shouldHide) return null;
  return <BottomNav />;
}

function SessionManager() {
  const navigate = useNavigate();
  const [sessionToast, setSessionToast] = useState("");

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    if (hasStoredSession()) {
      scheduleSilentRefresh(token);
      return;
    }

    getValidAccessToken({ forceRefresh: true }).catch(() => {
      clearSession();
    });
  }, []);

  useEffect(() => {
    return onSessionExpired((event) => {
      const message =
        event.detail?.message || "Your session expired. Please log in again.";
      setSessionToast(message);

      if (
        !["/", "/login", "/register"].includes(window.location.pathname) &&
        !window.location.pathname.startsWith("/reset-password")
      ) {
        navigate("/login", { replace: true });
      }
    });
  }, [navigate]);

  useEffect(() => startIdleSessionTimeout(), []);

  useEffect(() => {
    if (!sessionToast) return undefined;
    const timer = window.setTimeout(() => setSessionToast(""), 5200);
    return () => window.clearTimeout(timer);
  }, [sessionToast]);

  return sessionToast ? (
    <div className="session-toast" role="status" aria-live="polite">
      {sessionToast}
    </div>
  ) : null;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!hasStoredSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function AdminRoute({ children }) {
  const location = useLocation();
  const profile = loadUserProfile();
  const isAdmin = ["admin", "super_admin"].includes(profile?.role);

  if (!hasStoredSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRouteFrame() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const hidesBottomNav =
    location.pathname === "/" ||
    [
      "/login",
      "/register",
      "/reset-password",
      "/landing",
      "/generate",
      "/itinerary",
      "/admin",
    ].some((prefix) => location.pathname.startsWith(prefix));

  return (
    <>
      {/*
        The bottom padding reserves space for the floating glass nav on mobile
        routes. The desktop admin console owns the full viewport.
      */}
      <div
        className={
          isAdminRoute
            ? "app-route-frame app-route-frame--admin"
            : `app-route-frame${hidesBottomNav ? " app-route-frame--no-nav" : ""}`
        }
      >
        <Suspense
          fallback={<div className="admin-notice">Loading workspace...</div>}
        >
          <Routes>
            <Route path="/" element={<AuthPage initialMode="login" />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage initialMode="login" />} />
            <Route
              path="/register"
              element={<AuthPage initialMode="register" />}
            />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/my-trips" element={<ProtectedRoute><MyTripsPage /></ProtectedRoute>} />
            <Route path="/itinerary" element={<ProtectedRoute><ItineraryPage /></ProtectedRoute>} />
            <Route path="/itinerary/:itineraryId" element={<ProtectedRoute><ItineraryPage /></ProtectedRoute>} />
            <Route path="/generate" element={<ProtectedRoute><TravelWizard /></ProtectedRoute>} />

            <Route path="/discover" element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route
              path="/admin/*"
              element={
                <AdminRoute>
                  <Suspense
                    fallback={
                      <div className="admin-notice">Loading admin console...</div>
                    }
                  >
                    <AdminPanelPage />
                  </Suspense>
                </AdminRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <RouteAwareBottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedBackground />
      <LaunchSplash />
      <OfflineIndicator />
      <SessionManager />
      <AppRouteFrame />
    </BrowserRouter>
  );
}
