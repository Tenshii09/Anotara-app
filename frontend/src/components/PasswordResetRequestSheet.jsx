import { useEffect, useState } from "react";

import { requestPasswordReset } from "../lib/passwordResetApi";
import BottomSheet from "./common/BottomSheet";

export default function PasswordResetRequestSheet({
  open,
  onClose,
  initialEmail = "",
  title = "Reset password",
}) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail || "");
      setMessage("");
      setBusy(false);
    }
  }, [initialEmail, open]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setMessage("");
      const response = await requestPasswordReset(email.trim());
      setMessage(
        response?.message ||
          "If that email is registered, a password reset link has been sent.",
      );
    } catch (requestError) {
      setMessage(requestError.message || "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-outline-luxury" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-luxury"
            type="submit"
            form="password-reset-request-form"
            disabled={busy}
          >
            {busy ? "Sending..." : "Send reset link"}
          </button>
        </>
      }
    >
      <form
        id="password-reset-request-form"
        onSubmit={handleSubmit}
        style={{ display: "grid", gap: 14 }}
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Enter the email address registered to your Ano Tara account. We will
          send a secure link that expires in 30 minutes.
        </p>
        <div>
          <label className="field-label" htmlFor="password-reset-email">
            Registered email
          </label>
          <input
            id="password-reset-email"
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        {message ? <div className="error-banner">{message}</div> : null}
      </form>
    </BottomSheet>
  );
}
