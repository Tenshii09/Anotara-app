import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AdminDashboard from "./components/AdminDashboard";
import AuthPage from "./components/AuthPage";
import ItineraryPage from "./components/ItineraryPage";
import TravelWizard from "./components/TravelWizard";
import "./App.css";

// App is now the frontend router only.
// The UI is split into small pages that talk to the Flask REST API instead of
// rendering server-side templates.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth is separate from the trip flow so login and registration stay focused. */}
        <Route path="/" element={<AuthPage initialMode="login" />} />
        <Route path="/login" element={<AuthPage initialMode="login" />} />
        <Route path="/register" element={<AuthPage initialMode="register" />} />
        {/* The dashboard route preserves the old wizard experience in React. */}
        <Route path="/dashboard" element={<TravelWizard />} />
        {/* Admin analytics and retraining live on a guarded page. */}
        <Route path="/admin" element={<AdminDashboard />} />
        {/* The itinerary page is the React replacement for the old Flask Jinja result page. */}
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
