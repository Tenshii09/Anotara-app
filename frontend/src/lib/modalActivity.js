const MODAL_ACTIVITY_EVENT = "anotara:modal-activity-change";

let activeModalCount = 0;

function emitModalActivityChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MODAL_ACTIVITY_EVENT, {
      detail: { active: activeModalCount > 0 },
    }),
  );
}

export function isModalSurfaceActive() {
  return activeModalCount > 0;
}

export function registerModalSurface() {
  activeModalCount += 1;
  emitModalActivityChange();

  let released = false;
  return function unregisterModalSurface() {
    if (released) return;
    released = true;
    activeModalCount = Math.max(0, activeModalCount - 1);
    emitModalActivityChange();
  };
}

export function subscribeModalActivity(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function handleChange(event) {
    listener(Boolean(event.detail?.active));
  }

  window.addEventListener(MODAL_ACTIVITY_EVENT, handleChange);
  listener(isModalSurfaceActive());
  return () => window.removeEventListener(MODAL_ACTIVITY_EVENT, handleChange);
}
