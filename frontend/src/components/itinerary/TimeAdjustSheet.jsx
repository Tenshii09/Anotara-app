/**
 * Time-block adjust modal for Feature 3. Users tap a block to open this
 * sheet, drag the start-time dial (or use the numeric input fallback), and
 * the parent re-computes downstream blocks accordingly.
 */
import { useEffect, useState } from "react";

import BottomSheet from "../common/BottomSheet";
import Icon from "../common/Icon";
import { minutesToClock, clockToMinutes } from "../../lib/timeBlocks";

const HOUR_STEP = 15;

export default function TimeAdjustSheet({ open, onClose, block, onSave }) {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!open || !block) return;
    async function syncTime() {
      const totalMinutes = block.startMinutes ?? clockToMinutes(block.startLabel);
      setHour(Math.floor(totalMinutes / 60));
      setMinute(totalMinutes % 60);
    }
    syncTime();
  }, [open, block]);

  if (!block) return null;

  const previewMinutes = hour * 60 + minute;
  const previewLabel = minutesToClock(previewMinutes);

  function changeMinute(delta) {
    let next = minute + delta;
    let nextHour = hour;
    if (next >= 60) {
      next = 0;
      nextHour = Math.min(23, hour + 1);
    } else if (next < 0) {
      next = 60 - HOUR_STEP;
      nextHour = Math.max(0, hour - 1);
    }
    setMinute(next);
    setHour(nextHour);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Adjust start time"
      size="md"
      footer={
        <>
          <button className="btn-outline-luxury" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-luxury"
            type="button"
            onClick={() => {
              onSave?.(previewMinutes);
              onClose?.();
            }}
          >
            Save time
          </button>
        </>
      }
    >
      <div className="time-adjust">
        <p className="muted" style={{ margin: 0 }}>
          Pick a new start time for <strong>{block.place?.name || "this stop"}</strong>. We will push
          every later block automatically.
        </p>

        <div className="time-adjust__display" aria-live="polite">
          {previewLabel}
        </div>

        <div className="time-adjust__row">
          <button
            type="button"
            className="time-adjust__step"
            onClick={() => setHour((current) => Math.max(0, current - 1))}
            aria-label="Decrease hour"
          >
            <Icon name="minus" size={16} />
          </button>
          <div className="time-adjust__column">
            <span className="time-adjust__column-value">{String(((hour + 11) % 12) + 1).padStart(2, "0")}</span>
            <span className="time-adjust__column-label">Hour</span>
          </div>
          <button
            type="button"
            className="time-adjust__step"
            onClick={() => setHour((current) => Math.min(23, current + 1))}
            aria-label="Increase hour"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>

        <div className="time-adjust__row">
          <button
            type="button"
            className="time-adjust__step"
            onClick={() => changeMinute(-HOUR_STEP)}
            aria-label="Decrease minute"
          >
            <Icon name="minus" size={16} />
          </button>
          <div className="time-adjust__column">
            <span className="time-adjust__column-value">{String(minute).padStart(2, "0")}</span>
            <span className="time-adjust__column-label">Minute</span>
          </div>
          <button
            type="button"
            className="time-adjust__step"
            onClick={() => changeMinute(HOUR_STEP)}
            aria-label="Increase minute"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>

        <div className="time-adjust__row">
          <span className="time-adjust__column-label">AM / PM</span>
          <div className="time-adjust__period">
            <button
              type="button"
              className={`time-adjust__period-btn${hour < 12 ? " is-active" : ""}`}
              onClick={() => setHour((current) => (current >= 12 ? current - 12 : current))}
            >
              AM
            </button>
            <button
              type="button"
              className={`time-adjust__period-btn${hour >= 12 ? " is-active" : ""}`}
              onClick={() => setHour((current) => (current < 12 ? current + 12 : current))}
            >
              PM
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
