import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AuthPage from "./components/AuthPage";
import ItineraryPage from "./components/ItineraryPage";
import TravelWizard from "./components/TravelWizard";
import MyTripsPage from "./components/MyTripsPage";
import BottomNav from "./components/common/BottomNav";
import DashboardPage from "./components/DashboardPage";
import DiscoverPage from "./components/DiscoverPage";
import ProfilePage from "./components/ProfilePage";

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

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedBackground />
      {/*
        The bottom padding reserves space for the floating glass nav so the
        last card on each route is never clipped by it.
      */}
      <div style={{ paddingBottom: "96px" }}>
        <Routes>
          <Route path="/" element={<AuthPage initialMode="login" />} />
          <Route path="/login" element={<AuthPage initialMode="login" />} />
          <Route path="/register" element={<AuthPage initialMode="register" />} />

          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-trips" element={<MyTripsPage />} />
          <Route path="/itinerary" element={<ItineraryPage />} />
          <Route path="/itinerary/:itineraryId" element={<ItineraryPage />} />
          <Route path="/generate" element={<TravelWizard />} />

          {/* Discover and Profile placeholders */}
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </BrowserRouter>
  );
}
