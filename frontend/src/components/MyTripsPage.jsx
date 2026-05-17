import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredToken } from "../lib/storage";

export default function MyTripsPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadTrips() {
      try {
        const token = getStoredToken();

        const response = await fetch("http://localhost:5000/api/itineraries", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        setTrips(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load trips:", error);
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, []);

  if (loading) return <p>Loading your trips...</p>;

  if (trips.length === 0) {
    return (
      <div>
        <h1>My Trips</h1>
        <p>No saved trips yet.</p>
        <button onClick={() => navigate("/dashboard")}>Plan a Trip</button>
      </div>
    );
  }

  return (
    <div>
      <h1>My Trips</h1>

      {trips.map((trip) => (
        <div key={trip.id} className="trip-card">
          <h2>{trip.destination}</h2>
          <p>{trip.days} days</p>
          <p>Budget: {trip.budget}</p>

          <button
                type="button"
                onClick={() => navigate(`/itinerary/${trip.id}`)}
                >
                View Trip
        </button>

          <button onClick={() => navigate("/my-trips")}>
                 My Trips
            </button>
        </div>
      ))}
    </div>
  );
}