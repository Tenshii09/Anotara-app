/**
 * Energy / Pacing slider (Feature 2).
 *
 * A premium 3-position slider rendered as a row of tappable cards plus a
 * fluid indicator bar.  Mobile-first: the cards are square enough that the
 * fingertip target on a budget Android device stays comfortable.
 */
import Icon from "../common/Icon";
import { tapHaptic } from "../../lib/haptics";

const PACING_OPTIONS = [
  {
    value: "Packed",
    label: "Packed",
    description: "Maximize stops, minimize downtime.",
    icon: "running",
    position: 0,
  },
  {
    value: "Moderate",
    label: "Balanced",
    description: "Steady rhythm with breathing room.",
    icon: "walking",
    position: 50,
  },
  {
    value: "Relaxed",
    label: "Relaxed",
    description: "Lounge longer at every stop.",
    icon: "lounging",
    position: 100,
  },
];

export default function PacingSlider({ value = "Moderate", onChange }) {
  const activeOption =
    PACING_OPTIONS.find((option) => option.value === value) || PACING_OPTIONS[1];

  return (
    <div className="pacing-slider" role="radiogroup" aria-label="Pacing style">
      <div className="pacing-slider__track" aria-hidden="true">
        <span className="pacing-slider__progress" style={{ width: `${activeOption.position}%` }} />
        <span
          className="pacing-slider__thumb"
          style={{ left: `${activeOption.position}%` }}
        />
      </div>
      <div className="pacing-slider__cards">
        {PACING_OPTIONS.map((option) => {
          const isActive = option.value === activeOption.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`pacing-slider__card${isActive ? " is-active" : ""}`}
              onClick={() => {
                tapHaptic();
                onChange?.(option.value);
              }}
            >
              <span className="pacing-slider__icon" aria-hidden="true">
                <Icon name={option.icon} size={24} tone={isActive ? "accent" : "default"} />
              </span>
              <span className="pacing-slider__label">{option.label}</span>
              <span className="pacing-slider__desc">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PACING_OPTIONS };
