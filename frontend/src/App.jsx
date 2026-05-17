import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AuthPage from "./components/AuthPage";
import ItineraryPage from "./components/ItineraryPage";
import TravelWizard from "./components/TravelWizard";
import MyTripsPage from "./components/MyTripsPage";
import BottomNav from "./components/common/BottomNav";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ paddingBottom: "80px" }}>
        <Routes>
          <Route path="/" element={<AuthPage initialMode="login" />} />
          <Route path="/login" element={<AuthPage initialMode="login" />} />
          <Route path="/register" element={<AuthPage initialMode="register" />} />

          <Route path="/dashboard" element={<TravelWizard />} />
          <Route path="/my-trips" element={<MyTripsPage />} />
          <Route path="/itinerary" element={<ItineraryPage />} />
          <Route path="/itinerary/:itineraryId" element={<ItineraryPage />} />

          <Route path="/discover" element={<div>Discover Page</div>} />
          <Route path="/profile" element={<div>Profile Page</div>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </BrowserRouter>
  );
}