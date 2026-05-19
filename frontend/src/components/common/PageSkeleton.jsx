function SkeletonLine({ width = "100%", height, className = "" }) {
  const style = { width };
  if (height) style.height = height;

  return <span className={`skeleton-line ${className}`.trim()} style={style} aria-hidden="true" />;
}

function SkeletonCard({ variant = "default", lines = 3 }) {
  return (
    <article className={`glass-card skeleton-card skeleton-card--${variant}`} aria-hidden="true">
      {variant === "trip" || variant === "discover" ? <span className="skeleton-media" /> : null}
      <SkeletonLine width="42%" height="12px" />
      <SkeletonLine width="72%" height="24px" />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine key={index} width={`${88 - index * 14}%`} />
      ))}
    </article>
  );
}

const VARIANT_CONFIG = {
  dashboard: {
    titleWidth: "58%",
    subtitleWidth: "78%",
    cards: ["hero", "trip", "default", "default"],
  },
  trips: {
    titleWidth: "48%",
    subtitleWidth: "70%",
    cards: ["trip", "trip", "trip"],
  },
  discover: {
    titleWidth: "52%",
    subtitleWidth: "74%",
    cards: ["discover", "discover", "discover", "discover"],
  },
  profile: {
    titleWidth: "46%",
    subtitleWidth: "66%",
    cards: ["profile", "default", "default", "default"],
  },
  itinerary: {
    titleWidth: "62%",
    subtitleWidth: "72%",
    cards: ["itinerary", "itinerary"],
  },
};

export default function PageSkeleton({
  variant = "dashboard",
  title = "Loading",
  subtitle = "Getting everything ready.",
}) {
  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.dashboard;
  const isItinerary = variant === "itinerary";

  return (
    <main className={`app-page${isItinerary ? " itinerary-page" : ""}`}>
      <section className={isItinerary ? "itinerary-shell" : "dashboard-shell"}>
        <div className={`page-skeleton page-skeleton--${variant}`} role="status" aria-live="polite">
          <article className="glass-card page-skeleton__header">
            <p className="dashboard-kicker">{title}</p>
            <SkeletonLine width={config.titleWidth} height="34px" />
            <SkeletonLine width={config.subtitleWidth} />
          </article>

          <div className="page-skeleton__grid">
            {config.cards.map((cardVariant, index) => (
              <SkeletonCard key={`${cardVariant}-${index}`} variant={cardVariant} lines={index === 0 ? 4 : 3} />
            ))}
          </div>

          <span className="sr-only">{subtitle}</span>
        </div>
      </section>
    </main>
  );
}
