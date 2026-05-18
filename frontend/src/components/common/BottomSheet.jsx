import { useEffect, useRef } from "react";

/**
 * Fluid bottom-up modal used for the Discover "Anchor & Fly" pattern and any
 * other place that needs to halt the browsing state while keeping the page
 * visible behind it.  Closing happens on backdrop tap, escape key, or the
 * explicit close button — never by accidentally tapping the sheet itself.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "lg",
  ariaLabel,
}) {
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="bottom-sheet-root" role="dialog" aria-modal="true" aria-label={ariaLabel || title || "Details"}>
      <button
        type="button"
        className="bottom-sheet-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={`bottom-sheet bottom-sheet--${size} glass-card`}
        onClick={(event) => event.stopPropagation()}
        role="document"
      >
        <div className="bottom-sheet__handle" aria-hidden="true" />
        {title ? (
          <header className="bottom-sheet__header">
            <h2 className="serif bottom-sheet__title">{title}</h2>
            <button
              type="button"
              className="bottom-sheet__close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
        ) : null}
        <div className="bottom-sheet__body">{children}</div>
        {footer ? <footer className="bottom-sheet__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
