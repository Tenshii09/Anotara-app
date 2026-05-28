// Tiny wrapper around the Web Vibration API used to give micro-haptic feedback
// on supported mobile devices.  Silently no-ops elsewhere so the UI remains
// crash-safe on iOS Safari and desktop browsers.

export function tapHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore — vibration is best-effort only.
  }
}

export function successHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([10, 40, 18]);
    }
  } catch {
    // Best-effort only.
  }
}

export function warningHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([28, 60, 28]);
    }
  } catch {
    // Best-effort only.
  }
}
