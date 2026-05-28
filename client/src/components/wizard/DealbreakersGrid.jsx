/**
 * Dealbreakers & Accessibility Input (Feature 2).
 *
 * A multi-select grid of pill-buttons that surfaces hard constraints the AI
 * must respect (e.g. accessible routes, vegan options, cell signal).
 * Implemented as a flat collection of toggles for maximum mobile-friendliness.
 */
import Icon from "../common/Icon";
import { tapHaptic } from "../../lib/haptics";

const DEALBREAKER_OPTIONS = [
  {
    value: "accessible",
    label: "Accessible routes",
    icon: "wheelchair",
    description: "Ramps, lifts, step-free transit.",
  },
  {
    value: "vegan",
    label: "Vegan / plant-based",
    icon: "leaf",
    description: "Plant-based menus available nearby.",
  },
  {
    value: "needs_signal",
    label: "Reliable cell signal",
    icon: "signal",
    description: "Prefer destinations with stable coverage.",
  },
  {
    value: "halal",
    label: "Halal-friendly",
    icon: "fork",
    description: "Halal-certified or halal-friendly meals.",
  },
  {
    value: "kid_friendly",
    label: "Kid-friendly only",
    icon: "users",
    description: "Skip extreme adventure and nightlife.",
  },
  {
    value: "secure",
    label: "High-security area",
    icon: "shield",
    description: "Prioritize well-lit, supervised zones.",
  },
];

export default function DealbreakersGrid({ value = [], onChange }) {
  const activeSet = new Set(value || []);

  function toggle(option) {
    tapHaptic();
    const next = new Set(activeSet);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    onChange?.(Array.from(next));
  }

  return (
    <div className="dealbreaker-grid" role="group" aria-label="Dealbreakers and accessibility">
      {DEALBREAKER_OPTIONS.map((option) => {
        const isActive = activeSet.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`dealbreaker-card${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            onClick={() => toggle(option.value)}
          >
            <span className="dealbreaker-card__icon" aria-hidden="true">
              <Icon name={option.icon} size={20} tone={isActive ? "accent" : "default"} />
            </span>
            <div>
              <span className="dealbreaker-card__label">{option.label}</span>
              <p className="dealbreaker-card__desc">{option.description}</p>
            </div>
            <span
              className={`dealbreaker-card__indicator${isActive ? " is-active" : ""}`}
              aria-hidden="true"
            >
              {isActive ? <Icon name="check" size={14} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { DEALBREAKER_OPTIONS };
