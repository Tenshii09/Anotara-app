/**
 * Granular Time-Blocked Vertical Timeline (Feature 3).
 *
 * Renders each itinerary stop as a "block" attached to a vertical rail with
 * a small transit connector between consecutive stops.  The block doubles as
 * the interaction surface for:
 *   - Focusing the Mapbox camera on the stop (tap-anywhere).
 *   - Editing the start time via a bottom-sheet dial.
 *   - Locking / unlocking / swapping / liking the stop.
 *   - Attaching a Memory Log entry (photo or note) for past / active trips.
 *
 * Time computations are delegated to `lib/timeBlocks` so the same blocks can
 * be rendered identically inside the PDF export.
 */
import { useMemo } from "react";

import Icon from "../common/Icon";
import { buildTimeBlocksForDay } from "../../lib/timeBlocks";
import { tapHaptic } from "../../lib/haptics";

function formatCategory(category) {
  if (!category) return "";
  return String(category)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Component default export. Time helpers live in `lib/timeBlocks` so this file
 * only exports a single component (required by Vite Fast Refresh).
 */
export default function VerticalTimeline({
  dayNumber,
  places = [],
  trip,
  focusedPlaceKey,
  feedbackState = {},
  swappingItemId,
  memoriesByItemId = {},
  onCardActivate,
  onMovePlace,
  onSwapPlace,
  onToggleLock,
  onPlaceFeedback,
  onAdjustTime,
  onOpenMemoryLog,
  isCollaborative = false,
  isPastTrip = false,
}) {
  const blocks = useMemo(
    () =>
      buildTimeBlocksForDay(places, {
        pacingStyle: trip?.pacingStyle || trip?.pacing_style,
        transportMode: trip?.transportMode || trip?.transport_mode,
        dayStart: trip?.dayStart,
      }),
    [places, trip?.pacingStyle, trip?.pacing_style, trip?.transportMode, trip?.transport_mode, trip?.dayStart],
  );

  if (places.length === 0) {
    return (
      <section className="timeline timeline--empty glass-card">
        <Icon name="hourglass" size={28} tone="muted" />
        <h4 className="serif">Nothing scheduled for Day {dayNumber}</h4>
        <p className="muted">
          Generate or add stops to this day to see the time-blocked schedule.
        </p>
      </section>
    );
  }

  return (
    <section className="timeline" aria-label={`Day ${dayNumber} timeline`}>
      {blocks.map((block, index) => {
        const place = block.place;
        const placeId = place.id || place.place_id;
        const placeKey = `${dayNumber}-${place.item_id || placeId || index}`;
        const isFocused = focusedPlaceKey === placeKey;
        const memories = memoriesByItemId[place.item_id] || [];

        const handleCard = () => onCardActivate?.(place, placeKey);
        const handleKey = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleCard();
          }
        };
        const stop = (handler) => (event) => {
          event.stopPropagation();
          handler?.();
        };

        return (
          <div key={placeKey} className={`timeline__entry${isFocused ? " is-focused" : ""}`}>
            {block.travelMinutes > 0 ? (
              <div className="timeline__transit" aria-label={`${block.travelMinutes} minutes transit`}>
                <span className="timeline__transit-line" aria-hidden="true" />
                <span className="timeline__transit-chip">
                  <Icon
                    name={
                      (trip?.transportMode || trip?.transport_mode) === "Walking"
                        ? "walking"
                        : (trip?.transportMode || trip?.transport_mode) === "Motorcycle"
                          ? "motorbike"
                          : (trip?.transportMode || trip?.transport_mode) === "Private_Car"
                            ? "van"
                            : "bus"
                    }
                    size={14}
                  />
                  {block.travelLabel}
                </span>
              </div>
            ) : null}

            <article
              className={`timeline__block${place.is_locked ? " is-locked" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isFocused}
              onClick={handleCard}
              onKeyDown={handleKey}
            >
              <div className="timeline__rail" aria-hidden="true">
                <span className="timeline__dot" />
                <span className="timeline__line" />
              </div>

              <div className="timeline__body">
                <header className="timeline__header">
                  <p className="timeline__time">
                    <Icon name="clock" size={14} />
                    <span>
                      {block.startLabel} <span aria-hidden="true">→</span> {block.endLabel}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="timeline__time-edit"
                    onClick={stop(() => onAdjustTime?.(dayNumber, index, block))}
                    aria-label={`Adjust start time for ${place.name}`}
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                </header>

                <h4 className="timeline__name">
                  <span className="timeline__sequence">{String(index + 1).padStart(2, "0")}</span>
                  {place.name || "Stop"}
                  {place.is_locked ? (
                    <span className="timeline__locked-pill">
                      <Icon name="lock" size={12} /> Locked
                    </span>
                  ) : null}
                </h4>

                <p className="timeline__meta">
                  <span>
                    <Icon name="vibe" size={14} /> {formatCategory(place.category) || "Stop"}
                  </span>
                  <span>
                    <Icon name="star" size={14} /> {Number(place.rating || 0).toFixed(1)}
                  </span>
                  <span>
                    <Icon name="hourglass" size={14} /> {block.stayMinutes} min stay
                  </span>
                  {place.city ? (
                    <span>
                      <Icon name="mapPin" size={14} /> {place.city}
                    </span>
                  ) : null}
                </p>

                {place.why ? <p className="timeline__why">{place.why}</p> : null}

                {memories.length > 0 ? (
                  <div className="timeline__memories" aria-label="Memory log highlights">
                    {memories.slice(0, 4).map((memory) => (
                      <span key={memory.id} className="timeline__memory-chip">
                        <Icon name={memory.kind === "photo" ? "camera" : "note"} size={14} />
                        {memory.kind === "photo" ? "Photo" : "Note"}
                      </span>
                    ))}
                    {memories.length > 4 ? (
                      <span className="timeline__memory-chip">+{memories.length - 4}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="timeline__actions">
                  {index > 0 ? (
                    <button
                      type="button"
                      className="timeline__chip"
                      onClick={stop(() => {
                        tapHaptic();
                        onMovePlace?.(dayNumber, index, -1);
                      })}
                    >
                      <Icon name="arrowUp" size={14} />
                      <span>Move up</span>
                    </button>
                  ) : null}
                  {index < places.length - 1 ? (
                    <button
                      type="button"
                      className="timeline__chip"
                      onClick={stop(() => {
                        tapHaptic();
                        onMovePlace?.(dayNumber, index, 1);
                      })}
                    >
                      <Icon name="arrowDown" size={14} />
                      <span>Move down</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="timeline__chip"
                    onClick={stop(() => {
                      tapHaptic();
                      onSwapPlace?.(dayNumber, index);
                    })}
                    disabled={swappingItemId === place.item_id}
                  >
                    <Icon name="shuffle" size={14} />
                    <span>{swappingItemId === place.item_id ? "Swapping…" : "Swap"}</span>
                  </button>

                  <button
                    type="button"
                    className={`timeline__chip${place.is_locked ? " is-active" : ""}`}
                    onClick={stop(() => {
                      tapHaptic();
                      onToggleLock?.(dayNumber, index);
                    })}
                  >
                    <Icon name={place.is_locked ? "unlock" : "lock"} size={14} />
                    <span>{place.is_locked ? "Unlock" : "Lock"}</span>
                  </button>

                  <button
                    type="button"
                    className={`timeline__chip${feedbackState[placeId] === "liked" ? " is-active" : ""}`}
                    onClick={stop(() => onPlaceFeedback?.(placeId, "like"))}
                    disabled={feedbackState[placeId] === "liked"}
                  >
                    <Icon name="thumbUp" size={14} />
                    <span>{feedbackState[placeId] === "liked" ? "Saved" : "Best pick"}</span>
                  </button>

                  <button
                    type="button"
                    className={`timeline__chip${feedbackState[placeId] === "disliked" ? " is-active" : ""}`}
                    onClick={stop(() => onPlaceFeedback?.(placeId, "dislike"))}
                    disabled={feedbackState[placeId] === "disliked"}
                  >
                    <Icon name="thumbDown" size={14} />
                    <span>{feedbackState[placeId] === "disliked" ? "Noted" : "Not ideal"}</span>
                  </button>

                  {(isCollaborative || isPastTrip) && place.item_id ? (
                    <button
                      type="button"
                      className="timeline__chip timeline__chip--memory"
                      onClick={stop(() => onOpenMemoryLog?.(place))}
                      aria-label={`Open memory log for ${place.name}`}
                    >
                      <Icon name="camera" size={14} />
                      <span>Memory</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          </div>
        );
      })}
    </section>
  );
}
