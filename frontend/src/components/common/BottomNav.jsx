import { useNavigate, useLocation } from "react-router-dom";

import { tapHaptic } from "../../lib/haptics";
import "./BottomNav.css";

const TABS = [
  { label: "Home", path: "/dashboard", icon: "🏠" },
  { label: "Trips", path: "/my-trips", icon: "🧳" },
  { label: "Tara Na!", path: "/generate", icon: "✈️", isCenter: true },
  { label: "Discover", path: "/discover", icon: "🧭" },
  { label: "Profile", path: "/profile", icon: "👤" },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((tab) => {
        const isActive = location.pathname.startsWith(tab.path);
        return (
          <button
            key={tab.path}
            type="button"
            className={`bottom-nav-btn ${tab.isCenter ? "center-btn" : ""} ${
              isActive ? "active" : ""
            }`}
            onClick={() => {
              tapHaptic();
              navigate(tab.path);
            }}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
          >
            <span className="icon" aria-hidden="true">{tab.icon}</span>
            {!tab.isCenter && <span className="label">{tab.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}