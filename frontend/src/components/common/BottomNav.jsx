import { useNavigate, useLocation } from "react-router-dom";

import { tapHaptic } from "../../lib/haptics";
import Icon from "./Icon";
import "./BottomNav.css";

const TABS = [
  { label: "Home", path: "/dashboard", icon: "home" },
  { label: "Trips", path: "/my-trips", icon: "suitcase" },
  { label: "Tara Na!", path: "/generate", icon: "plane", isCenter: true },
  { label: "Discover", path: "/discover", icon: "compass" },
  { label: "Profile", path: "/profile", icon: "user" },
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
            <span className="icon" aria-hidden="true">
              <Icon name={tab.icon} size={tab.isCenter ? 26 : 22} />
            </span>
            {!tab.isCenter && <span className="label">{tab.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
