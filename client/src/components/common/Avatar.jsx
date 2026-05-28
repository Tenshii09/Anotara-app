/**
 * Circular avatar with an optional Explorer Level gamification ring.
 *
 * The ring is drawn with conic-gradient so it can fluidly map a 0-100 progress
 * value to a clockwise sweep without requiring SVG arcs.  When `level` is
 * supplied we additionally render a tiny chip with the level number so the
 * gamification status stays glanceable.
 */
export default function Avatar({
  name = "Traveler",
  imageUrl,
  level = 1,
  progress = 0,
  onClick,
  ariaLabel,
  size = 44,
}) {
  const initial = String(name || "T").trim().charAt(0).toUpperCase() || "T";
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const ringStyle = {
    width: size,
    height: size,
    background: `conic-gradient(var(--accent-alt) ${safeProgress}%, rgba(74, 58, 138, 0.18) ${safeProgress}% 100%)`,
  };

  return (
    <button
      type="button"
      className="explorer-avatar"
      onClick={onClick}
      aria-label={ariaLabel || `${name}, Explorer level ${level}`}
      style={ringStyle}
    >
      <span className="explorer-avatar__inner">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="explorer-avatar__image" />
        ) : (
          <span className="explorer-avatar__initial">{initial}</span>
        )}
      </span>
      <span className="explorer-avatar__level" aria-hidden="true">
        L{level}
      </span>
    </button>
  );
}
