import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_BASE_URL } from "../lib/config";
import { clearStoredToken, getStoredToken } from "../lib/storage";

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function clampPercent(value) {
  const numericValue = Number(value || 0) * 100;
  return Math.max(8, Math.min(100, numericValue || 0));
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retrainState, setRetrainState] = useState("idle");
  const [retrainMessage, setRetrainMessage] = useState("");
  const [adminForm, setAdminForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [adminFormError, setAdminFormError] = useState("");
  const [adminFormMessage, setAdminFormMessage] = useState("");
  const [passwordDrafts, setPasswordDrafts] = useState({});

  useEffect(() => {
    let isMounted = true;

    // Load the dashboard payload once on mount so the admin sees current state immediately.
    const loadAnalytics = async () => {
      try {
        const token = getStoredToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/analytics`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401 || response.status === 422) {
            clearStoredToken();
            navigate("/login");
            return;
          }

          if (response.status === 403) {
            setError("Admin access required for this page.");
            setLoading(false);
            return;
          }

          throw new Error(data.error || "Could not load analytics.");
        }

        if (isMounted) {
          setAnalytics(data);
          setError("");
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Could not load analytics.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleRetrain = async () => {
    setRetrainState("running");
    setRetrainMessage("");

    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/retrain`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }

        setRetrainState("error");
        setRetrainMessage(data.error || "Retraining failed.");
        return;
      }

      setRetrainState("done");
      setRetrainMessage("Model retrained successfully.");
      setAnalytics((current) =>
        current
          ? {
              ...current,
              model_status: data.model_status,
            }
          : current,
      );
    } catch {
      setRetrainState("error");
      setRetrainMessage("Network error while retraining the model.");
    }
  };

  const handleCreateAdminAccount = async (event) => {
    event.preventDefault();
    setAdminFormError("");
    setAdminFormMessage("");

    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(adminForm),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }

        setAdminFormError(data.error || "Could not create admin account.");
        return;
      }

      setAdminFormMessage("Admin account created successfully.");
      setAdminForm({ username: "", email: "", password: "" });
      setAnalytics((current) =>
        current
          ? {
              ...current,
              admin_accounts: [
                {
                  id: data.admin_account_id,
                  username: adminForm.username,
                  email: adminForm.email,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                ...(current.admin_accounts || []),
              ],
            }
          : current,
      );
    } catch {
      setAdminFormError("Network error while creating admin account.");
    }
  };

  const handleUpdateAdminPassword = async (accountId) => {
    const newPassword = (passwordDrafts[accountId] || "").trim();
    if (!newPassword) {
      setAdminFormError("Enter a new password before saving.");
      return;
    }

    setAdminFormError("");
    setAdminFormMessage("");

    try {
      const token = getStoredToken();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/accounts/${accountId}/password`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ new_password: newPassword }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 422) {
          clearStoredToken();
          navigate("/login");
          return;
        }

        setAdminFormError(data.error || "Could not update admin password.");
        return;
      }

      setAdminFormMessage("Admin password updated successfully.");
      setPasswordDrafts((current) => ({
        ...current,
        [accountId]: "",
      }));
    } catch {
      setAdminFormError("Network error while updating the password.");
    }
  };

  return (
    <main className="app-page" style={{ padding: "32px 20px 48px" }}>
      <div
        className="glass-card"
        style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <span className="hero-chip">Sprint 5</span>
            <h1
              className="serif"
              style={{ margin: "12px 0 8px", fontSize: "2.4rem" }}
            >
              Admin analytics and retraining
            </h1>
            <p
              className="muted"
              style={{ margin: 0, maxWidth: 720, lineHeight: 1.6 }}
            >
              Track feedback quality, inspect model readiness, and retrain the
              reranker from the latest trip interactions.
            </p>
          </div>
          <button
            className="btn-luxury"
            onClick={handleRetrain}
            disabled={retrainState === "running"}
          >
            {retrainState === "running" ? "Retraining..." : "Retrain model"}
          </button>
        </div>

        {(loading || error || retrainMessage) && (
          <div style={{ marginTop: 20 }}>
            {loading && <div className="muted">Loading analytics...</div>}
            {error && <div className="error-banner">{error}</div>}
            {retrainMessage && (
              <div
                className="error-banner"
                style={
                  retrainState === "error"
                    ? undefined
                    : {
                        background: "rgba(119, 228, 200, 0.12)",
                        borderColor: "rgba(119, 228, 200, 0.35)",
                        color: "#dffaf0",
                      }
                }
              >
                {retrainMessage}
              </div>
            )}
          </div>
        )}

        {analytics && (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginTop: 24,
              }}
            >
              {[
                ["Users", analytics.summary.total_users],
                ["Itineraries", analytics.summary.total_itineraries],
                ["Feedback", analytics.summary.total_feedback],
                ["Positive", analytics.summary.positive_feedback],
                ["Negative", analytics.summary.negative_feedback],
                [
                  "Ready to retrain",
                  analytics.summary.retraining_ready ? "Yes" : "No",
                ],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="auth-highlight"
                  style={{ minHeight: 110 }}
                >
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {label}
                  </div>
                  <div
                    className="serif"
                    style={{ fontSize: "2rem", marginTop: 10 }}
                  >
                    {value}
                  </div>
                </article>
              ))}
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr",
                gap: 20,
                marginTop: 24,
              }}
            >
              {/* Keep the trend bars simple so non-technical admins can read them quickly. */}
              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Feedback trends
                </h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {(analytics.feedback_trend || []).map((item) => (
                    <div key={item.feedback_day}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span>{item.feedback_day}</span>
                        <span>{item.total_feedback} feedback</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${clampPercent(item.positive_feedback / Math.max(1, item.total_feedback))}%`,
                            height: "100%",
                            background:
                              "linear-gradient(90deg, #77e4c8, #f7c76b)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {!analytics.feedback_trend?.length && (
                    <div className="muted">No feedback trend data yet.</div>
                  )}
                </div>
              </article>

              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Model status
                </h2>
                <div className="muted" style={{ lineHeight: 1.8 }}>
                  <div>
                    Last trained:{" "}
                    {formatDate(analytics.model_status?.summary?.trained_at)}
                  </div>
                  <div>
                    Dataset rows:{" "}
                    {analytics.model_status?.summary?.dataset_rows ?? 0}
                  </div>
                  <div>
                    Accuracy:{" "}
                    {(
                      Number(analytics.model_status?.summary?.accuracy || 0) *
                      100
                    ).toFixed(2)}
                    %
                  </div>
                </div>
                <div style={{ marginTop: 18 }}>
                  {analytics.model_status?.artifacts?.map((artifact) => (
                    <div key={artifact.path} style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span>{artifact.path.split("\\").pop()}</span>
                        <span className="muted">
                          {artifact.exists
                            ? `${artifact.size_bytes} bytes`
                            : "Missing"}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {formatDate(artifact.updated_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
                marginTop: 24,
              }}
            >
              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Top places
                </h2>
                <div style={{ display: "grid", gap: 14 }}>
                  {(analytics.top_places || []).map((place) => (
                    <div
                      key={place.place_id}
                      style={{
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <strong>{place.name}</strong>
                        <span>
                          {(Number(place.positive_rate || 0) * 100).toFixed(0)}%
                          positive
                        </span>
                      </div>
                      <div className="muted">
                        {place.category} · {place.city}
                      </div>
                      <div className="muted">
                        {place.feedback_count} feedback entries
                      </div>
                    </div>
                  ))}
                  {!analytics.top_places?.length && (
                    <div className="muted">No place feedback yet.</div>
                  )}
                </div>
              </article>

              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Recent feedback
                </h2>
                <div style={{ display: "grid", gap: 14 }}>
                  {(analytics.recent_feedback || []).map((item) => (
                    <div
                      key={item.feedback_id}
                      style={{
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <strong>{item.place_name}</strong>
                        <span>{item.rating_type}</span>
                      </div>
                      <div className="muted">
                        {item.username} · {item.category} · {item.city}
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  ))}
                  {!analytics.recent_feedback?.length && (
                    <div className="muted">No recent feedback yet.</div>
                  )}
                </div>
              </article>
            </section>

            <section style={{ marginTop: 24 }}>
              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Category breakdown
                </h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {(analytics.category_breakdown || []).map((item) => (
                    <div key={item.category}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span>{item.category}</span>
                        <span>{item.feedback_count} feedback</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${clampPercent(item.positive_rate || 0)}%`,
                            height: "100%",
                            background:
                              "linear-gradient(90deg, #7fd6ff, #77e4c8)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {!analytics.category_breakdown?.length && (
                    <div className="muted">No category feedback yet.</div>
                  )}
                </div>
              </article>
            </section>

            <section style={{ marginTop: 24 }}>
              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Admin settings
                </h2>
                <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                  Admin accounts use the same login screen, then open this page
                  when the account is marked as admin. There is no default
                  password; each admin password is set when the account is
                  created or changed here.
                </p>

                <form
                  onSubmit={handleCreateAdminAccount}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop: 18,
                  }}
                >
                  <input
                    className="auth-input"
                    type="text"
                    placeholder="Admin username"
                    value={adminForm.username}
                    onChange={(event) =>
                      setAdminForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                    required
                  />
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="Admin email"
                    value={adminForm.email}
                    onChange={(event) =>
                      setAdminForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    required
                  />
                  <input
                    className="auth-input"
                    type="password"
                    placeholder="Temporary password"
                    value={adminForm.password}
                    onChange={(event) =>
                      setAdminForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    required
                  />
                  <button className="btn-luxury" type="submit">
                    Add admin account
                  </button>
                </form>

                {(adminFormError || adminFormMessage) && (
                  <div style={{ marginTop: 16 }}>
                    {adminFormError && (
                      <div className="error-banner">{adminFormError}</div>
                    )}
                    {adminFormMessage && (
                      <div
                        className="error-banner"
                        style={{
                          background: "rgba(119, 228, 200, 0.12)",
                          borderColor: "rgba(119, 228, 200, 0.35)",
                          color: "#dffaf0",
                        }}
                      >
                        {adminFormMessage}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
                  {/* Each admin can update another admin's password from the same panel. */}
                  {(analytics.admin_accounts || []).map((account) => (
                    <div
                      key={account.id}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{account.username}</strong>
                          <div className="muted">{account.email}</div>
                        </div>
                        <div className="muted">
                          {account.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 12,
                          marginTop: 14,
                        }}
                      >
                        <input
                          className="auth-input"
                          type="password"
                          placeholder="New password"
                          value={passwordDrafts[account.id] || ""}
                          onChange={(event) =>
                            setPasswordDrafts((current) => ({
                              ...current,
                              [account.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn-luxury"
                          type="button"
                          onClick={() => handleUpdateAdminPassword(account.id)}
                        >
                          Update password
                        </button>
                      </div>
                    </div>
                  ))}
                  {!analytics.admin_accounts?.length && (
                    <div className="muted">
                      No admin accounts yet. Use the form above to add one.
                    </div>
                  )}
                </div>
              </article>
            </section>

            <section style={{ marginTop: 24 }}>
              <article className="auth-highlight" style={{ padding: 20 }}>
                <h2 className="serif" style={{ marginTop: 0 }}>
                  Admin activity log
                </h2>
                <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
                  This keeps a small audit trail of admin account changes and
                  retraining runs.
                </p>
                <div style={{ display: "grid", gap: 14 }}>
                  {(analytics.admin_activity || []).map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong>{entry.action}</strong>
                        <span className="muted">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                      <div className="muted">Actor: {entry.actor_identity}</div>
                      <div className="muted">
                        Target: {entry.target_type || "—"}
                        {entry.target_identifier
                          ? ` / ${entry.target_identifier}`
                          : ""}
                      </div>
                      {entry.details && (
                        <pre
                          style={{
                            marginTop: 12,
                            marginBottom: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "inherit",
                            color: "inherit",
                            background: "rgba(0,0,0,0.18)",
                            padding: 12,
                            borderRadius: 12,
                          }}
                        >
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  {!analytics.admin_activity?.length && (
                    <div className="muted">No admin activity recorded yet.</div>
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
