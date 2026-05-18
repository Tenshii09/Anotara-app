/**
 * The Ano Tara brand lockup: a continuous-line bird-in-flight glyph next to
 * the "Tara!" wordmark.  Kept as an SVG component so it scales crisply and
 * can be tinted by parent styles via currentColor.
 */
export default function BrandLogo({ size = 28, showWordmark = true, accent }) {
  const strokeColor = accent || "var(--accent)";
  return (
    <span className="brand-logo" aria-label="Ano Tara — Tara!">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="brand-logo__glyph"
      >
        <defs>
          <linearGradient id="brandLogoGradient" x1="0" x2="48" y1="0" y2="48">
            <stop offset="0%" stopColor="#4a3a8a" />
            <stop offset="60%" stopColor="#c44f8a" />
            <stop offset="100%" stopColor="#ff8a72" />
          </linearGradient>
        </defs>
        <path
          d="M3.5 30.5C9 25 13.5 22.5 19 22.5c5.5 0 8.7 3.2 14.2 3.2 4.7 0 8.4-2.4 11.3-7.2"
          stroke="url(#brandLogoGradient)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M14.5 32.5c4.2-3 7.2-4.5 11-4.5 4.4 0 6.7 2.3 11 2.3"
          stroke={strokeColor}
          strokeOpacity="0.55"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="38.5" cy="16.5" r="1.6" fill="url(#brandLogoGradient)" />
      </svg>
      {showWordmark ? (
        <span className="brand-logo__wordmark serif">Tara!</span>
      ) : null}
    </span>
  );
}
