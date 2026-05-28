import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { persistSession } from "../lib/authSession";
import { apiRequest } from "../lib/apiClient";
import { enableTotp, generateTotpSetup, verifyTotp } from "../lib/totpApi";
import BottomSheet from "./common/BottomSheet";
import BrandLogo from "./common/BrandLogo";
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
      "Ano-Tara! provides itinerary planning support, saved trips, collaboration, notifications, and recommendations. You are responsible for verifying routes, prices, safety advisories, availability, and local rules before traveling. Do not misuse the service, attempt unauthorized access, or upload content you do not have rights to share.",
  },
  privacy: {
    title: "Privacy Policy",
    body:
      "Ano-Tara! collects account details, consent records, trip preferences, saved itineraries, collaboration activity, device notification tokens, and operational logs to provide the app, protect accounts, send requested notifications, troubleshoot errors, and improve recommendations. We do not intentionally expose passwords, tokens, or backup data to the frontend. You can update preferences or delete your account from Profile.",
  },
  notice: {
    title: "Privacy Notice and Consent",
    body:
      "By creating an account, you consent to Ano-Tara! processing your account and trip-planning data for authentication, itinerary generation, saved trips, collaboration, notifications, security auditing, backups, and service reliability. You can withdraw from optional notifications in your browser or profile settings, and account deletion removes your user record and related cascaded data where supported.",
  },
};

const passwordRequirements = [
  {
    label: "At least 8 characters",
    test: (value) => value.length >= 8,
  },
  {
    label: "One uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    label: "One lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    label: "One number",
    test: (value) => /\d/.test(value),
  },
  {
    label: "One special character",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

export default function AuthPage({ initialMode = "login" }) {
  // Keep one component for both login and registration so the UI stays compact
  // while the backend still receives separate API requests.
  const [isRegistering, setIsRegistering] = useState(
    initialMode === "register",
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpChallenge, setOtpChallenge] = useState(null);
  const [registrationOtpCode, setRegistrationOtpCode] = useState("");
  const [registrationChallenge, setRegistrationChallenge] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpChallenge, setTotpChallenge] = useState(null);
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [totpSetupError, setTotpSetupError] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [activeLegalModal, setActiveLegalModal] = useState(null);
  const [privacyNoticeSeen, setPrivacyNoticeSeen] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const selectedLegalCopy = activeLegalModal ? legalCopy[activeLegalModal] : null;
  const isOtpStep = Boolean(otpChallenge);
  const isRegistrationOtpStep = Boolean(registrationChallenge);
  const isTotpStep = Boolean(totpChallenge);
  const passwordChecklist = passwordRequirements.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
  const isRegistrationPasswordStrong = passwordChecklist.every((item) => item.met);

  useEffect(() => {
    if (!totpChallenge || totpSetup) return;

    let active = true;
    async function loadTotpSetup() {
      try {
        setTotpSetupLoading(true);
        setTotpSetupError("");
        setMessage("");
        const setup = await generateTotpSetup(totpChallenge);
        if (active) setTotpSetup(setup);
      } catch (requestError) {
        console.error("TOTP setup generation failed:", requestError);
        if (active) {
          const errorMessage =
            requestError.message || "Could not start authenticator setup.";
          setTotpSetupError(`Failed to load QR code: ${errorMessage}`);
          setMessage(errorMessage);
        }
      } finally {
        if (active) setTotpSetupLoading(false);
      }
    }

    loadTotpSetup();
    return () => {
      active = false;
    };
  }, [totpChallenge, totpSetup]);

  function getDiagnosticAuthErrorMessage(requestError) {
    const firebaseCode =
      requestError?.code ||
      requestError?.payload?.code ||
      requestError?.payload?.error?.code;
    const firebaseMessage =
      requestError?.message ||
      requestError?.payload?.error ||
      requestError?.payload?.message ||
      requestError?.payload?.detail;

    const parts = [];
    if (firebaseCode) parts.push(`[${firebaseCode}]`);
    if (firebaseMessage) parts.push(String(firebaseMessage));
    if (requestError?.status) parts.push(`(HTTP ${requestError.status})`);

    return parts.join(" ").trim() || "Unknown authentication error.";
  }

  // Send the form data to the Flask API and branch the result depending on
  // whether the user is creating an account or logging in.
  const handleAuth = async (event) => {
    event.preventDefault();
    if (isRegistering && !legalConsent) {
      setMessage("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (isRegistering && !isRegistrationPasswordStrong) {
      const missingRequirements = passwordChecklist
        .filter((item) => !item.met)
        .map((item) => item.label.toLowerCase())
        .join(", ");
      setMessage(`Password must include ${missingRequirements}.`);
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
        setRegistrationChallenge({
          challengeId: data.challenge_id,
          email: data.email || email,
          maskedEmail: data.masked_email,
          expiresInSeconds: data.expires_in_seconds,
        });
        setRegistrationOtpCode("");
        setMessage(data.message || "Verification code sent to your email.");
        return;
      }

      if (data?.requires_otp) {
        setOtpChallenge({
          userId: data.user_id,
          challengeId: data.challenge_id,
          maskedEmail: data.masked_email,
          expiresInSeconds: data.expires_in_seconds,
        });
        setOtpCode("");
        setMessage(data.message || "Verification code sent to your email.");
        return;
      }

      if (data?.requires_totp || data?.requires_totp_setup) {
        setTotpChallenge({
          userId: data.user_id,
          challengeId: data.challenge_id,
          role: data.role,
          needsSetup: Boolean(data.requires_totp_setup),
        });
        setTotpCode("");
        setTotpSetup(null);
        setTotpSetupError("");
        setMessage(data.message || "Authenticator verification required.");
        return;
      }

      persistSession(data);
      navigate(["admin", "super_admin"].includes(data.role) ? "/admin" : "/dashboard");
    } catch (requestError) {
      setMessage(getDiagnosticAuthErrorMessage(requestError));
    }
  };

  const handleRegistrationOtpSubmit = async (event) => {
    event.preventDefault();
    const cleanedCode = registrationOtpCode.replace(/\D/g, "").slice(0, 6);
    if (cleanedCode.length !== 6) {
      setMessage("Enter the 6-digit email verification code.");
      return;
    }

    try {
      const data = await apiRequest("/api/register/verify", {
        method: "POST",
        skipAuthRefresh: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: registrationChallenge.challengeId,
          email: registrationChallenge.email,
          code: cleanedCode,
        }),
      });
      setMessage(data.message || "Account created. Please log in.");
      setRegistrationChallenge(null);
      setRegistrationOtpCode("");
      setIsRegistering(false);
      setLegalConsent(false);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setMessage(requestError?.message || "Invalid verification code.");
    }
  };

  function resetRegistrationOtpFlow() {
    setRegistrationChallenge(null);
    setRegistrationOtpCode("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
  }

  const handleTotpSubmit = async (event) => {
    event.preventDefault();
    const cleanedCode = totpCode.replace(/\D/g, "").slice(0, 6);
    if (cleanedCode.length !== 6) {
      setMessage("Enter the 6-digit authenticator code.");
      return;
    }

    try {
      const data = totpChallenge.needsSetup
        ? await enableTotp(totpChallenge, totpSetup?.secret, cleanedCode)
        : await verifyTotp(totpChallenge, cleanedCode);
      persistSession(data);
      navigate(["admin", "super_admin"].includes(data.role) ? "/admin" : "/dashboard");
    } catch (requestError) {
      setMessage(requestError?.message || "Invalid authenticator code.");
    }
  };

  function resetTotpFlow() {
    setTotpChallenge(null);
    setTotpCode("");
    setTotpSetup(null);
    setTotpSetupError("");
    setPassword("");
    setMessage("");
  }

  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    const cleanedCode = otpCode.replace(/\D/g, "").slice(0, 6);
    if (cleanedCode.length !== 6) {
      setMessage("Enter the 6-digit verification code.");
      return;
    }

    try {
      const data = await apiRequest("/api/verify-otp", {
        method: "POST",
        skipAuthRefresh: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: otpChallenge.userId,
          challenge_id: otpChallenge.challengeId,
          code: cleanedCode,
        }),
      });
      persistSession(data);
      navigate(["admin", "super_admin"].includes(data.role) ? "/admin" : "/dashboard");
    } catch (requestError) {
      const errorMessage = requestError?.message || "Invalid Code";
      setMessage(errorMessage);
      if (errorMessage.toLowerCase().includes("expired")) {
        setOtpChallenge(null);
        setOtpCode("");
      }
    }
  };

  return (
    <main className="app-page auth-page">
      <div className="auth-shell auth-grid">
        <section className="auth-intro">
          <button
            className="hero-chip auth-landing-chip"
            type="button"
            onClick={() => navigate("/landing")}
          >
            Ano-Tara! Travel Planner
          </button>
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
            <div className="auth-logo-mark" aria-hidden="true">
              <BrandLogo size={156} showWordmark={false} />
            </div>
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

          {isRegistrationOtpStep ? (
            <form onSubmit={handleRegistrationOtpSubmit}>
              <div className="admin-notice" style={{ marginBottom: "18px" }}>
                A 6-digit verification code was sent to{" "}
                <strong>{registrationChallenge.maskedEmail || registrationChallenge.email}</strong>.
                Enter it below to finish creating your account.
              </div>
              <div style={{ marginBottom: "18px" }}>
                <label className="field-label" htmlFor="registration-otp-code">
                  Email verification code
                </label>
                <input
                  id="registration-otp-code"
                  className="auth-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={registrationOtpCode}
                  onChange={(event) =>
                    setRegistrationOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  style={{ textAlign: "center", letterSpacing: "0.35em" }}
                />
              </div>
              <button className="btn-luxury" type="submit" style={{ width: "100%" }}>
                Verify Email & Create Account
              </button>
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={resetRegistrationOtpFlow}
                >
                  Back to registration
                </button>
              </div>
            </form>
          ) : isTotpStep ? (
            <form onSubmit={handleTotpSubmit}>
              <div className="admin-notice" style={{ marginBottom: "18px" }}>
                {totpChallenge.needsSetup
                  ? "Admin accounts require Google Authenticator. Scan this QR code, then enter the 6-digit code from your app."
                  : "Scan this QR code in Google Authenticator if this device is not enrolled yet, then enter the current 6-digit code to continue."}
              </div>
              {totpSetupLoading ? (
                <p className="muted" style={{ textAlign: "center" }}>
                  Preparing authenticator QR code...
                </p>
              ) : totpSetupError ? (
                <div className="error-banner" style={{ marginBottom: 18 }}>
                  {totpSetupError}
                </div>
              ) : totpSetup?.qr_code ? (
                <div style={{ display: "grid", gap: 12, marginBottom: 18, textAlign: "center" }}>
                  <img
                    alt="Google Authenticator QR code"
                    src={totpSetup.qr_code}
                    style={{ width: 180, height: 180, margin: "0 auto", borderRadius: 18 }}
                  />
                  <p className="muted" style={{ margin: 0, wordBreak: "break-all" }}>
                    Manual key: <strong>{totpSetup.secret}</strong>
                  </p>
                </div>
              ) : null}
              <div style={{ marginBottom: "18px" }}>
                <label className="field-label" htmlFor="totp-code">
                  Authenticator Code
                </label>
                <input
                  id="totp-code"
                  className="auth-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(event) =>
                    setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  style={{ textAlign: "center", letterSpacing: "0.35em" }}
                />
              </div>
              <button
                className="btn-luxury"
                type="submit"
                disabled={totpChallenge.needsSetup && !totpSetup?.secret}
                style={{ width: "100%" }}
              >
                {totpChallenge.needsSetup ? "Enable Authenticator" : "Verify & Continue"}
              </button>
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <button type="button" className="auth-switch" onClick={resetTotpFlow}>
                  Back to login
                </button>
              </div>
            </form>
          ) : isOtpStep ? (
            <form onSubmit={handleOtpSubmit}>
              <div className="admin-notice" style={{ marginBottom: "18px" }}>
                A 6-digit verification code was sent to{" "}
                <strong>{otpChallenge.maskedEmail || "your email"}</strong>.
                It expires in 5 minutes.
              </div>
              <div style={{ marginBottom: "18px" }}>
                <label className="field-label" htmlFor="otp-code">
                  Verification code
                </label>
                <input
                  id="otp-code"
                  className="auth-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(event) =>
                    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  style={{ textAlign: "center", letterSpacing: "0.35em" }}
                />
              </div>
              <button className="btn-luxury" type="submit" style={{ width: "100%" }}>
                Verify & Continue
              </button>
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => {
                    setOtpChallenge(null);
                    setOtpCode("");
                    setPassword("");
                    setMessage("");
                  }}
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
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
              {isRegistering && (
                <div
                  className="muted"
                  style={{
                    display: "grid",
                    gap: 6,
                    marginTop: 10,
                    fontSize: "0.84rem",
                  }}
                >
                  {passwordChecklist.map((item) => (
                    <span
                      key={item.label}
                      style={{ color: item.met ? "#2f7d4f" : "inherit" }}
                    >
                      {item.met ? "✓" : "•"} {item.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {isRegistering && (
              <div style={{ marginBottom: "18px" }}>
                <label className="field-label" htmlFor="confirm-password">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  className="auth-input"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            )}

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
              <div className="admin-notice" style={{ marginBottom: "18px" }}>
                <strong>Privacy Notice:</strong>{" "}
                We use account, trip, collaboration, notification, and audit
                data to operate and secure Ano-Tara!.{" "}
                <button
                  type="button"
                  className="auth-switch"
                  style={{ display: "inline", padding: 0 }}
                  onClick={() => {
                    setPrivacyNoticeSeen(true);
                    setActiveLegalModal("notice");
                  }}
                >
                  Review details
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
                  onChange={(event) => {
                    setLegalConsent(event.target.checked);
                    if (event.target.checked) setPrivacyNoticeSeen(true);
                  }}
                  required
                  style={{ marginTop: "4px" }}
                />
                <span className="muted">
                  I have reviewed the privacy notice and agree to the{" "}
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
          )}

          {!isRegistrationOtpStep && !isOtpStep && !isTotpStep ? (
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              {/* Toggle the form mode without navigating away from the page. */}
              <button
                type="button"
                className="auth-switch"
                onClick={() => {
                  setMessage("");
                  setLegalConsent(false);
                  setPrivacyNoticeSeen(false);
                  setRegistrationChallenge(null);
                  setRegistrationOtpCode("");
                  setIsRegistering((current) => !current);
                }}
              >
                {isRegistering
                  ? "Already have an account? Login"
                  : "Don't have an account? Register"}
              </button>
            </div>
          ) : null}

          {message && <div className="error-banner">{message}</div>}
          {isRegistering && !isRegistrationOtpStep && !privacyNoticeSeen ? (
            <p className="muted" style={{ marginTop: "12px", fontSize: "0.86rem" }}>
              Review the privacy notice before creating an account.
            </p>
          ) : null}
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
