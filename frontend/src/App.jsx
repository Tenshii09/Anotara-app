import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthPage from "./components/AuthPage";
import ItineraryPage from "./components/ItineraryPage";
import TravelWizard from "./components/TravelWizard";
import MyTripsPage from "./components/MyTripsPage";
import BottomNav from "./components/common/BottomNav";
import BrandLogo from "./components/common/BrandLogo";
import OfflineIndicator from "./components/common/OfflineIndicator";
import DashboardPage from "./components/DashboardPage";
import DiscoverPage from "./components/DiscoverPage";
import ProfilePage from "./components/ProfilePage";
import AdminPanelPage from "./components/AdminPanelPage";
import {
  clearSession,
  getValidAccessToken,
  hasStoredSession,
  onSessionExpired,
  scheduleSilentRefresh,
} from "./lib/authSession";
import { getStoredToken } from "./lib/storage";
import { applyTheme, getInitialTheme } from "./lib/theme";

import "./App.css";

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
    <div className="app-splash" role="status" aria-label="Loading Ano Tara">
      <div className="app-splash__inner">
        <BrandLogo size={56} showWordmark={false} />
        <h1 className="app-splash__title">Tara!</h1>
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
  const hiddenPrefixes = ["/login", "/register", "/generate", "/admin"];
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

      if (!["/", "/login", "/register"].includes(window.location.pathname)) {
        navigate("/login", { replace: true });
      }
    });
  }, [navigate]);

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

function AppRouteFrame() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

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
            : "app-route-frame"
        }
      >
        <Routes>
          <Route path="/" element={<AuthPage initialMode="login" />} />
          <Route path="/login" element={<AuthPage initialMode="login" />} />
          <Route
            path="/register"
            element={<AuthPage initialMode="register" />}
          />

          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-trips" element={<MyTripsPage />} />
          <Route path="/itinerary" element={<ItineraryPage />} />
          <Route path="/itinerary/:itineraryId" element={<ItineraryPage />} />
          <Route path="/generate" element={<TravelWizard />} />

          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/*" element={<AdminPanelPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
