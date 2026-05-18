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

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ paddingBottom: "70px" }}> {/* space for bottom nav */}
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