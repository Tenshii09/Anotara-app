import { useNavigate, useLocation } from "react-router-dom";
import React from "react";
import "./BottomNav.css";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { label: "Dashboard", path: "/dashboard", icon: "🏠" },
    { label: "My Trips", path: "/my-trips", icon: "🗺️" },
    { label: "Trip Generator", path: "/generate", icon: "✈️", isCenter: true },
    { label: "Discover", path: "/discover", icon: "🔍" },
    { label: "Profile", path: "/profile", icon: "👤" },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const isActive = location.pathname.startsWith(tab.path);

        return (
          <button
            key={tab.path}
            className={`bottom-nav-btn ${tab.isCenter ? "center-btn" : ""} ${
              isActive ? "active" : ""
            }`}
            onClick={() => navigate(tab.path)}
          >
            <span className="icon">{tab.icon}</span>
            {!tab.isCenter && <span className="label">{tab.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}