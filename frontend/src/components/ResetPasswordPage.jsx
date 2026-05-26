import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  confirmPasswordReset,
  validatePasswordResetToken,
} from "../lib/passwordResetApi";
import BrandLogo from "./common/BrandLogo";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    console.log("Extracted Token:", token);

    async function validateToken() {
      if (!token) {
        setTokenValid(false);
        setMessage("Password reset token is missing.");
        setValidating(false);
        return;
      }

      try {
        setValidating(true);
        setMessage("");
        await validatePasswordResetToken(token);
        if (!active) return;
        setTokenValid(true);
      } catch (requestError) {
        if (!active) return;
        setTokenValid(false);
        setMessage(requestError.message || "Password reset link is invalid.");
      } finally {
        if (active) {
          setValidating(false);
        }
      }
    }

    validateToken();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password || !confirmPassword) {
      setMessage("Both password fields are required.");
      return;
    }
    if (password.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage("");
      const response = await confirmPasswordReset(token, password);
      setMessage(
        response?.message || "Password updated successfully!",
      );
      window.setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (requestError) {
      setMessage(requestError.message || "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-page auth-page">
      <div className="auth-shell" style={{ maxWidth: 560 }}>
        <section className="auth-card glass-card">
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div className="auth-logo-mark" aria-hidden="true">
              <BrandLogo size={156} showWordmark={false} />
            </div>
            <h1
              className="serif"
              style={{ fontSize: "2.2rem", margin: "10px 0 8px" }}
            >
              Reset your password
            </h1>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Choose a new password for your Ano-Tara! account.
            </p>
          </div>

          {validating ? (
            <p className="muted" style={{ textAlign: "center" }}>
              Checking your secure reset link...
            </p>
          ) : tokenValid ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
              <div>
                <label className="field-label" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>

              <div>
                <label className="field-label" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  className="auth-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>

              <button
                className="btn-luxury"
                type="submit"
                disabled={submitting}
                style={{ width: "100%" }}
              >
                {submitting ? "Saving..." : "Save New Password"}
              </button>
            </form>
          ) : (
            <p className="muted" style={{ textAlign: "center", lineHeight: 1.6 }}>
              Request a new password reset email from the login page.
            </p>
          )}

          {message ? <div className="error-banner">{message}</div> : null}

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link className="auth-switch" to="/login">
              Back to login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
