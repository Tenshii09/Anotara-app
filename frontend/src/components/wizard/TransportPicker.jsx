/**
 * Transport Mode Selector (Feature 2).
 *
 * Cinema-style illustrated cards picking how the flock will move. The cards
 * communicate the consequences inline (e.g. "Public transit adds buffer
 * time") so the wizard never silently changes the schedule.
 */
import Icon from "../common/Icon";
import { tapHaptic } from "../../lib/haptics";

const TRANSPORT_OPTIONS = [
  {
    value: "Private_Car",
    label: "Private Van",
    icon: "van",
    description: "Door-to-door comfort, fewer transit gaps.",
  },
  {
    value: "Public",
    label: "Public Commute",
    icon: "bus",
    description: "Authentic vibe — we add buffer time.",
  },
  {
    value: "Motorcycle",
    label: "Motorbike",
    icon: "motorbike",
    description: "Skip traffic — best for solo or duo trips.",
  },
  {
    value: "Walking",
    label: "Walking + Trike",
    icon: "walking",
    description: "Hyper-local exploration in dense areas.",
  },
];

export default function TransportPicker({ value = "Public", onChange }) {
  return (
    <div className="transport-grid" role="radiogroup" aria-label="Transport mode">
      {TRANSPORT_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`transport-card${isActive ? " is-active" : ""}`}
            onClick={() => {
              tapHaptic();
              onChange?.(option.value);
            }}
          >
            <span className="transport-card__icon" aria-hidden="true">
              <Icon name={option.icon} size={30} tone={isActive ? "accent" : "default"} />
            </span>
            <div>
              <span className="transport-card__label">{option.label}</span>
              <p className="transport-card__desc">{option.description}</p>
            </div>
            {isActive ? (
              <span className="transport-card__check" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export { TRANSPORT_OPTIONS };
