/**
 * Floating Day Selector pill (Feature 4).
 *
 * Sits above the map and the timeline.  Tapping a day commits it as the
 * active day, which then drives both the vertical timeline rendering and the
 * map's progressive disclosure (active day at 100% opacity, others at 30%).
 *
 * On mobile the pill is fully horizontally scrollable to fit any number of
 * days without sacrificing tap target size.
 */
import Icon from "../common/Icon";
import { tapHaptic } from "../../lib/haptics";

export default function DaySelector({
  days = [],
  activeDay,
  onSelectDay,
  onViewAll,
  showViewAll = true,
}) {
  if (!Array.isArray(days) || days.length === 0) return null;

  return (
    <nav className="day-selector" aria-label="Choose a day to focus on">
      {showViewAll ? (
        <button
          type="button"
          className={`day-selector__pill day-selector__pill--all${activeDay === null ? " is-active" : ""}`}
          onClick={() => {
            tapHaptic();
            onViewAll?.();
          }}
        >
          <Icon name="globe" size={14} />
          <span>All days</span>
        </button>
      ) : null}
      {days.map((dayNumber) => (
        <button
          key={dayNumber}
          type="button"
          className={`day-selector__pill${activeDay === dayNumber ? " is-active" : ""}`}
          onClick={() => {
            tapHaptic();
            onSelectDay?.(dayNumber);
          }}
        >
          <span className="day-selector__num">{dayNumber}</span>
          <span className="day-selector__label">Day</span>
        </button>
      ))}
    </nav>
  );
}
