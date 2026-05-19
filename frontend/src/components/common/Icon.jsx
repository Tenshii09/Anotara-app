/**
 * Anotara unified SVG icon system — the canonical replacement for native OS
 * emojis everywhere in the app.  Every icon is hand-tuned to feel cohesive
 * with the brand's bird-in-flight glyph:
 *
 *   - 24x24 native viewBox, rendered at any size via the `size` prop.
 *   - 1.8px round stroke (`strokeWidth` overridable for marketing surfaces).
 *   - `currentColor` strokes so parent CSS / Tailwind utilities tint freely.
 *   - Optional `tone` chooses between subtle accent fills used by selected
 *     states (e.g. an icon "filling" with Amihan Azure on tap).
 *
 * Usage:
 *   <Icon name="map" size={20} />
 *   <Icon name="users" tone="accent" />
 *   <Icon name="bus" stroke={2} className="text-amihan" />
 *
 * The named library covers every situation in the system: navigation, wizard,
 * itinerary cards, social collaboration, memory log, export, weather, etc.
 */
import { memo } from "react";

const STROKE_BASE_DEFAULTS = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
  stroke: "currentColor",
};

const ICONS = {
  /* --- Navigation & shell ---------------------------------------------- */
  home: (
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a2 2 0 0 1 4 0V20h3.5a1 1 0 0 0 1-1v-9" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.4 8.6-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  suitcase: (
    <>
      <rect x="4.5" y="7.5" width="15" height="12" rx="2.2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M9 11v6M15 11v6" />
    </>
  ),
  plane: (
    <>
      <path d="M3 14.5 10 11 4 4.5l2-1 8 5 4.6-2.4a2 2 0 0 1 2.6 2.6L19 13l-5 8-1-2 3-6-7 3.5-3 3.5-2-1 2-3.5Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 16.5h11.6a1 1 0 0 0 .9-1.4l-1.5-3.1V10a5.2 5.2 0 0 0-10.4 0v2l-1.5 3.1a1 1 0 0 0 .9 1.4Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,

  /* --- Wizard & preferences -------------------------------------------- */
  running: (
    <>
      <circle cx="15.5" cy="4.8" r="1.9" />
      <path d="m6 20 3.5-5L7 13l1-4 3-1 3.2 3 4 .8M9 13l-2.4 3.4" />
    </>
  ),
  walking: (
    <>
      <circle cx="13.5" cy="4.8" r="1.9" />
      <path d="M9.5 20 12 13l3 2 2-3 3.5 1M12 13l-1.5-4-3 .5L6 12" />
    </>
  ),
  lounging: (
    <>
      <circle cx="6.5" cy="9" r="1.9" />
      <path d="M3.5 18.5h17M5 18.5V15a2 2 0 0 1 2-2h6l5 2v3.5" />
    </>
  ),
  van: (
    <>
      <path d="M3 16V8a2 2 0 0 1 2-2h7l4 3h2a2 2 0 0 1 2 2v5" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
      <path d="M9 17h6M3 13h17" />
    </>
  ),
  bus: (
    <>
      <rect x="4.5" y="4" width="15" height="14" rx="2.2" />
      <path d="M4.5 10h15M8 18v1.5M16 18v1.5" />
      <circle cx="8.5" cy="14.5" r="1" />
      <circle cx="15.5" cy="14.5" r="1" />
    </>
  ),
  motorbike: (
    <>
      <circle cx="6" cy="16.5" r="3" />
      <circle cx="18" cy="16.5" r="3" />
      <path d="M9 16.5h5l-2.5-4H9l-2-3h3M14 12.5l3-4h2" />
    </>
  ),
  bicycle: (
    <>
      <circle cx="6" cy="17" r="3.2" />
      <circle cx="18" cy="17" r="3.2" />
      <path d="M9.2 17 12 9.5l-3-2M14 8h3l1 9" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="5" r="1.8" />
      <path d="m9 20 2.5-5L9 13l1-4 3 1 2.5 3.5 3 .5M9 13l-2 4" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2.2" />
      <path d="M16 12.5h2M3.5 9.5h14" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 3 2.5 14 0 17M12 3.5c-2.5 3-2.5 14 0 17" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 4 1.4 3.6L17 9l-3.6 1.4L12 14l-1.4-3.6L7 9l3.6-1.4Z" />
      <path d="M18 14.5 19 17l2.5 1L19 19l-1 2.5L17 19l-2.5-1L17 17Z" />
    </>
  ),
  vibe: (
    <>
      <path d="M5 13c0-4 3-7 7-7s7 3 7 7c0 4-3 7-7 7-1.5 0-3-.5-4-1.5L5 20l1-3.5C5.5 15.5 5 14.3 5 13Z" />
    </>
  ),

  /* --- Itinerary, time, location --------------------------------------- */
  mapPin: (
    <>
      <path d="M12 21c-3.5-4-7-7.5-7-11a7 7 0 0 1 14 0c0 3.5-3.5 7-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6 9 4l6 2 5.5-2v14L15 20l-6-2-5.5 2V6Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17M8 3.5V7M16 3.5V7" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="11" width="13" height="8" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5.5" y="11" width="13" height="8" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 6.5-1.8" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 6h3l4 6-4 6H4M17 6h3M17 18h3M14 6l6 6-6 6" />
    </>
  ),
  star: <path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.6L12 17l-5.1 2.6 1-5.6L3.8 10l5.7-.8Z" />,
  heart: (
    <path d="M12 19.5C7 16 4 13 4 9.5a4 4 0 0 1 7-2.7A4 4 0 0 1 18 9.5c0 3.5-3 6.5-8 10Z" />
  ),
  thumbDown: (
    <>
      <path d="M7 4h7l3 8v6h-3l-2-2v-4H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M17 4h2v8h-2" />
    </>
  ),
  thumbUp: (
    <>
      <path d="M7 20h7l3-8V6h-3l-2 2v4H7a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z" />
      <path d="M17 20h2v-8h-2" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M7 7v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19V7M10 11v6M14 11v6" />
    </>
  ),

  /* --- Social & collaboration ------------------------------------------ */
  users: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3 19a6 6 0 0 1 12 0M14 19a4.5 4.5 0 0 1 7-3.6" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8.5" r="3" />
      <path d="M3.5 19a6.5 6.5 0 0 1 13 0M18 8v6M15 11h6" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="10" cy="8.5" r="3" />
      <path d="M3.5 19a6.5 6.5 0 0 1 13 0M16 11.5l2 2 3.5-3.5" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="m8 11 8-4M8 13l8 4" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5 7 16.5a3.5 3.5 0 0 1-5-5L5 8.5M14 10.5l3-3a3.5 3.5 0 0 1 5 5l-3 3M9 15l6-6" />
    </>
  ),
  message: (
    <>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9L6 20v-3.5H4.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 20 1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  vote: (
    <>
      <path d="M4 14V8.5L12 4l8 4.5V14M4 14l8 4.5L20 14M4 14l8-4.5L20 14" />
    </>
  ),

  /* --- Memory log, media ----------------------------------------------- */
  camera: (
    <>
      <path d="M4 8h3.5l1.5-2h6l1.5 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 3 3 4-4 4 4" />
    </>
  ),
  note: (
    <>
      <path d="M5 4h11l3 3v13H5Z" />
      <path d="M9 10h7M9 13h7M9 16h5" />
    </>
  ),
  paperclip: (
    <>
      <path d="m20 12-8 8a5 5 0 1 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7-7" />
    </>
  ),

  /* --- Hotel, food, accessibility -------------------------------------- */
  hotel: (
    <>
      <path d="M3.5 19.5h17M5 19.5V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11.5" />
      <path d="M5 11.5h14M9 14h2M13 14h2" />
    </>
  ),
  bed: (
    <>
      <path d="M3.5 18V8M20.5 18v-5a3 3 0 0 0-3-3H10v8" />
      <path d="M3.5 14h17" />
      <circle cx="7" cy="11" r="1.6" />
    </>
  ),
  fork: (
    <>
      <path d="M9 3v8a3 3 0 0 1-3 3H6v7M9 7l-3 1M9 7l3 1M16 3a3 3 0 0 0-3 3v5h3v10" />
    </>
  ),
  wheelchair: (
    <>
      <circle cx="9" cy="5" r="1.8" />
      <path d="M9 8v5h4l3 5M5 19a5 5 0 0 1 5-5h2" />
      <circle cx="14" cy="17" r="3.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M19 5c-1 7-3.5 13-12 14-1-7 2-13 12-14Z" />
      <path d="M5 19c4-3 8-7 11-13" />
    </>
  ),
  signal: (
    <>
      <path d="M4 18h2v-3H4ZM9 18h2v-6H9ZM14 18h2v-9h-2ZM19 18h2V6h-2Z" />
    </>
  ),

  /* --- Weather --------------------------------------------------------- */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 17.5h11a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.7-1A3.5 3.5 0 0 0 7 17.5Z" />
    </>
  ),
  rain: (
    <>
      <path d="M7 13.5h11a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.7-1A3.5 3.5 0 0 0 7 13.5Z" />
      <path d="m9 17-1 3M13 17l-1 3M17 17l-1 3" />
    </>
  ),

  /* --- Export, settings ------------------------------------------------- */
  download: (
    <>
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v4h4M9 12h6M9 15h6M9 18h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.5 12h-2M21.5 12h-2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M6.3 17.7l-1.5 1.5M19.2 4.8l-1.5 1.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 4.5 6v6c0 4.4 3 7.7 7.5 9.5 4.5-1.8 7.5-5.1 7.5-9.5V6Z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 5H5.5A1.5 1.5 0 0 0 4 6.5v11A1.5 1.5 0 0 0 5.5 19H9" />
      <path d="m14 8 4 4-4 4M9 12h9" />
    </>
  ),

  /* --- Status / feedback ----------------------------------------------- */
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8.4v.2" />
    </>
  ),
  alert: (
    <>
      <path d="m12 4 9 16H3Z" />
      <path d="M12 10v4M12 17.2v.2" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3.5 4.5 6v6c0 4.4 3 7.7 7.5 9.5 4.5-1.8 7.5-5.1 7.5-9.5V6Z" />
      <path d="m8.5 12 2.5 2.5L16 9.5" />
    </>
  ),

  /* --- Loading / activity ---------------------------------------------- */
  loader: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
};

const Icon = memo(function Icon({
  name,
  size = 22,
  stroke = 1.8,
  className = "",
  tone = "default",
  ariaLabel,
  ariaHidden = true,
  style,
  title,
}) {
  const glyph = ICONS[name];
  if (!glyph) {
    if (typeof console !== "undefined") {
      console.warn(`[Icon] Unknown name "${name}".`);
    }
    return null;
  }

  const toneStyle =
    tone === "accent"
      ? { color: "var(--amihan, var(--accent))" }
      : tone === "danger"
        ? { color: "#c4346a" }
        : tone === "muted"
          ? { color: "var(--muted)" }
          : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={stroke}
      className={`anotara-icon anotara-icon--${name} ${className}`.trim()}
      role={ariaHidden ? undefined : "img"}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : ariaLabel || name}
      style={{ ...STROKE_BASE_DEFAULTS, ...toneStyle, ...style }}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
});

export default Icon;
