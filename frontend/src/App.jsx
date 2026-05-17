import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AuthPage from "./components/AuthPage";
import ItineraryPage from "./components/ItineraryPage";
import TravelWizard from "./components/TravelWizard";
import MyTripsPage from "./components/MyTripsPage";
import "./App.css";

// App is the frontend router only.
// The React pages communicate with the Flask REST API instead of using Flask templates.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication pages */}
        <Route path="/" element={<AuthPage initialMode="login" />} />
        <Route path="/login" element={<AuthPage initialMode="login" />} />
        <Route path="/register" element={<AuthPage initialMode="register" />} />

        {/* Main trip creation page */}
        <Route path="/dashboard" element={<TravelWizard />} />

        {/* Saved trips list */}
        <Route path="/my-trips" element={<MyTripsPage />} />

        {/* Newly generated itinerary */}
        <Route path="/itinerary" element={<ItineraryPage />} />

        {/* Saved itinerary opened from My Trips */}
        <Route path="/itinerary/:itineraryId" element={<ItineraryPage />} />

        {/* Fallback route must stay last */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}