import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { tapHaptic } from "../../lib/haptics";
import { subscribeModalActivity } from "../../lib/modalActivity";
import Icon from "./Icon";
import "./BottomNav.css";

const TABS = [
  { label: "Home", path: "/dashboard", icon: "home" },
  { label: "Trips", path: "/my-trips", icon: "suitcase" },
  { label: "Tara Na!", path: "/generate", icon: "plane", isCenter: true },
  { label: "Discover", path: "/discover", icon: "compass" },
  { label: "Profile", path: "/profile", icon: "user" },
];

const IDLE_HIDE_DELAY_MS = 2600;
const SCROLL_DELTA = 8;

function useAutoHideBottomNav() {
  const [hidden, setHidden] = useState(false);
  const [modalActive, setModalActive] = useState(false);
  const lastScrollYRef = useRef(0);
  const idleTimerRef = useRef(null);

  useEffect(() => subscribeModalActivity(setModalActive), []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function clearIdleTimer() {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    }

    function scheduleIdleHide() {
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        setHidden(true);
      }, IDLE_HIDE_DELAY_MS);
    }

    function revealNav() {
      setHidden(false);
      scheduleIdleHide();
    }

    function handleScroll() {
      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const delta = currentScrollY - lastScrollYRef.current;

      if (Math.abs(delta) >= SCROLL_DELTA) {
        setHidden(delta > 0 && currentScrollY > 48);
        scheduleIdleHide();
      }

      lastScrollYRef.current = currentScrollY;
    }

    lastScrollYRef.current = Math.max(window.scrollY || 0, 0);
    scheduleIdleHide();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pointerdown", revealNav, { passive: true });
    window.addEventListener("touchstart", revealNav, { passive: true });
    window.addEventListener("keydown", revealNav);

    return () => {
      clearIdleTimer();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointerdown", revealNav);
      window.removeEventListener("touchstart", revealNav);
      window.removeEventListener("keydown", revealNav);
    };
  }, []);

  return modalActive || hidden;
}

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldHideNav = useAutoHideBottomNav();

  return (
    <nav
      className={`bottom-nav${shouldHideNav ? " bottom-nav--hidden" : ""}`}
      aria-label="Primary"
      aria-hidden={shouldHideNav ? "true" : undefined}
    >
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
