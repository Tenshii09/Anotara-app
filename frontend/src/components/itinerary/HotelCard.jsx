/**
 * Apex Hotel Recommendation card (Feature 7).
 *
 * Renders below the last activity of a daily timeline.  The data is fetched
 * lazily by the parent ItineraryPage from /api/itineraries/:id/hotels/:day.
 * If no recommendation is available the parent simply omits this component.
 */
import Icon from "../common/Icon";
import { tapHaptic } from "../../lib/haptics";

function gradientForName(name) {
  const seed = String(name || "stay")
    .split("")
    .reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed + 70) % 360;
  return `linear-gradient(135deg, hsl(${hueA}, 60%, 52%) 0%, hsl(${hueB}, 72%, 64%) 100%)`;
}

export default function HotelCard({ hotel, dayNumber, onRefresh, refreshing }) {
  if (!hotel) return null;

  const rating = Math.max(0, Math.min(5, Math.round(Number(hotel.rating || 0))));
  const price = Number(hotel.est_price_php || 0);

  return (
    <article className="hotel-card glass-card" aria-label={`Hotel suggestion for Day ${dayNumber}`}>
      <div className="hotel-card__cover" style={{ background: gradientForName(hotel.name) }}>
        <span className="hotel-card__cover-label">Day {dayNumber}</span>
        <Icon name="bed" size={56} className="hotel-card__cover-icon" />
      </div>
      <div className="hotel-card__body">
        <p className="dashboard-kicker">Suggested basecamp</p>
        <h4 className="serif hotel-card__name">{hotel.name}</h4>
        <p className="hotel-card__pitch">{hotel.pitch}</p>

        <div className="hotel-card__meta">
          <span className="hotel-card__stars" aria-label={`Rated ${hotel.rating} out of 5`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Icon
                key={index}
                name="star"
                size={14}
                tone={index < rating ? "accent" : "muted"}
              />
            ))}
            <span className="hotel-card__rating">{Number(hotel.rating || 0).toFixed(1)}</span>
          </span>
          <span className="hotel-card__price">
            <Icon name="wallet" size={14} /> ₱{price.toLocaleString("en-PH")} / night
          </span>
          <span className="hotel-card__tier">
            <Icon name="hotel" size={14} /> {String(hotel.price_band || "Comfort").replace(/^./, (character) => character.toUpperCase())}
          </span>
        </div>

        <div className="hotel-card__actions">
          <a
            href={hotel.booking_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-luxury hotel-card__cta"
            onClick={() => tapHaptic()}
          >
            <Icon name="arrowRight" size={16} />
            <span>Book this stay</span>
          </a>
          <button
            type="button"
            className="btn-outline-luxury hotel-card__refresh"
            onClick={() => {
              tapHaptic();
              onRefresh?.();
            }}
            disabled={refreshing}
          >
            <Icon name="shuffle" size={16} />
            <span>{refreshing ? "Refreshing…" : "Suggest another"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
