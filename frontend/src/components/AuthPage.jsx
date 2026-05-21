import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { persistSession } from "../lib/authSession";
import { apiRequest } from "../lib/apiClient";
import BottomSheet from "./common/BottomSheet";
import PasswordResetRequestSheet from "./PasswordResetRequestSheet";

// These cards explain the frontend migration to users and also serve as a
// quick summary of how the new React + REST architecture maps to the old UI.
const introCards = [
  {
    title: "Trip wizard",
    text: "A four-step flow that mirrors the old Jinja dashboard, now inside React.",
  },
  {
    title: "Saved plans",
    text: "The backend still saves generated trips and returns the itinerary ID.",
  },
  {
    title: "Map experience",
    text: "Mapbox terrain, route lines, markers, and the 3D city look all stay intact.",
  },
  {
    title: "API-first",
    text: "React only consumes the Flask REST API, which keeps the UI and server separated.",
  },
];

const legalCopy = {
  terms: {
    title: "Terms of Service",
    body:
      "These placeholder Terms of Service explain that Ano Tara accounts should be used responsibly, travel plans are provided for planning support, and users remain responsible for verifying routes, prices, availability, and local travel advisories before a trip.",
  },
  privacy: {
    title: "Privacy Policy",
    body:
      "This placeholder Privacy Policy explains that Ano Tara collects account and trip-planning information to operate the service, secure user sessions, save itineraries, and improve recommendations. A complete policy will replace this draft before launch.",
  },
};

export default function AuthPage({ initialMode = "login" }) {
  // Keep one component for both login and registration so the UI stays compact
  // while the backend still receives separate API requests.
  const [isRegistering, setIsRegistering] = useState(
    initialMode === "register",
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [activeLegalModal, setActiveLegalModal] = useState(null);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const selectedLegalCopy = activeLegalModal ? legalCopy[activeLegalModal] : null;

  // Send the form data to the Flask API and branch the result depending on
  // whether the user is creating an account or logging in.
  const handleAuth = async (event) => {
    event.preventDefault();
    if (isRegistering && !legalConsent) {
      setMessage("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    const endpoint = isRegistering ? "register" : "login";
    const payload = isRegistering
      ? { username, email, password, legal_consent: true }
      : { identifier, password };

    try {
      const data = await apiRequest(`/api/${endpoint}`, {
        method: "POST",
        skipAuthRefresh: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (isRegistering) {
        // After successful registration, switch back to login so the user can
        // immediately sign in with the new account.
        setMessage("Account created. Please log in.");
        setIsRegistering(false);
        setLegalConsent(false);
        setPassword("");
        return;
      }

      persistSession(data);
      navigate(["admin", "super_admin"].includes(data.role) ? "/admin" : "/dashboard");
    } catch (requestError) {
      // Any network or backend failure ends up here.
      setMessage(requestError.message || "Connection error.");
    }
  };

  return (
    <main className="app-page auth-page">
      <div className="auth-shell auth-grid">
        <section className="auth-intro">
          <span className="hero-chip">🇵🇭 Ano tara? Travel Planner</span>
          <h1 className="auth-title">
            Plan smarter trips across the Philippines.
          </h1>
          <p className="auth-subtitle">
            A clean, guided workspace for building memorable itineraries.
          </p>
          <p className="auth-copy">
            Create polished travel plans with an easy step-by-step flow,
            saved itineraries, and a map-first experience that keeps every
            destination clear and organized.
          </p>

          <div className="auth-highlight-grid">
            {introCards.map((card) => (
              <article key={card.title} className="auth-highlight">
                {/* These small cards explain the new system architecture in plain language. */}
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
                  {card.title}
                </h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
                  {card.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="auth-card glass-card">
          {/* The same form switches between login and register based on state. */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ fontSize: "3rem" }}>🇵🇭</div>
            <h2
              className="serif"
              style={{ fontSize: "2.2rem", margin: "10px 0 8px" }}
            >
              {isRegistering ? "Begin your journey." : "Welcome back."}
            </h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              {isRegistering
                ? "Create an account to generate and save your Philippine itineraries."
                : "Sign in to continue your itinerary flow."}
            </p>
          </div>

          <form onSubmit={handleAuth}>
            {isRegistering && (
              <div style={{ marginBottom: "16px" }}>
                {/* Username is only needed for account creation. */}
                <label className="field-label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  className="auth-input"
                  type="text"
                  placeholder="e.g. juan_dela_cruz"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              {/* Login accepts either username or email, while registration uses email. */}
              <label className="field-label" htmlFor="identifier">
                {isRegistering ? "Email" : "Username or Email"}
              </label>
              <input
                id="identifier"
                className="auth-input"
                type="text"
                placeholder={
                  isRegistering ? "you@example.com" : "Enter username or email"
                }
                value={isRegistering ? email : identifier}
                onChange={(event) =>
                  isRegistering
                    ? setEmail(event.target.value)
                    : setIdentifier(event.target.value)
                }
                required
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              {/* Password handling is shared by both auth modes. */}
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {!isRegistering && (
              <div style={{ textAlign: "right", margin: "-8px 0 18px" }}>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => setPasswordResetOpen(true)}
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {isRegistering && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  marginBottom: "18px",
                  fontSize: "0.92rem",
                  lineHeight: 1.5,
                }}
              >
                <input
                  id="legal-consent"
                  type="checkbox"
                  aria-label="I agree to the Terms of Service and Privacy Policy"
                  checked={legalConsent}
                  onChange={(event) => setLegalConsent(event.target.checked)}
                  required
                  style={{ marginTop: "4px" }}
                />
                <span className="muted">
                  I agree to the{" "}
                  <button
                    type="button"
                    className="auth-switch"
                    style={{ display: "inline", padding: 0 }}
                    onClick={() => setActiveLegalModal("terms")}
                  >
                    Terms of Service
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    className="auth-switch"
                    style={{ display: "inline", padding: 0 }}
                    onClick={() => setActiveLegalModal("privacy")}
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </div>
            )}

            <button
              className="btn-luxury"
              type="submit"
              disabled={isRegistering && !legalConsent}
              style={{ width: "100%" }}
            >
              {isRegistering ? "Create account" : "Login"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "16px" }}>
            {/* Toggle the form mode without navigating away from the page. */}
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setMessage("");
                setLegalConsent(false);
                setIsRegistering((current) => !current);
              }}
            >
              {isRegistering
                ? "Already have an account? Login"
                : "Don't have an account? Register"}
            </button>
          </div>

          {message && <div className="error-banner">{message}</div>}
        </section>
      </div>
      <BottomSheet
        open={Boolean(selectedLegalCopy)}
        onClose={() => setActiveLegalModal(null)}
        title={selectedLegalCopy?.title}
        size="sm"
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          {selectedLegalCopy?.body}
        </p>
      </BottomSheet>
      <PasswordResetRequestSheet
        open={passwordResetOpen}
        onClose={() => setPasswordResetOpen(false)}
        initialEmail={identifier.includes("@") ? identifier : ""}
        title="Forgot your password?"
      />
    </main>
  );
}
