import { formatNumber } from "./adminUtils";

export function StatusPill({ children, status }) {
  return (
    <span
      className={`admin-pill admin-pill--${String(status || "default")
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
    >
      {children}
    </span>
  );
}

export function MetricCard({ label, value, delta, tone }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small className={`admin-delta admin-delta--${tone || "positive"}`}>
        {delta}
      </small>
    </article>
  );
}

export function ProgressBar({ value, label }) {
  return (
    <div className="admin-progress" aria-label={`${label}: ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ChartBars({ data = [], label }) {
  const maxValue = Math.max(...data.map((item) => Number(item.value || 0)), 1);
  return (
    <div className="admin-chart-list" aria-label={label}>
      {data.length === 0 ? (
        <p className="muted">No data available yet.</p>
      ) : (
        data.map((item) => {
          const value = Number(item.value || 0);
          return (
            <div className="admin-chart-row" key={`${item.label}-${value}`}>
              <span>{item.label || "Unknown"}</span>
              <ProgressBar
                value={(value / maxValue) * 100}
                label={`${item.label} ${value}`}
              />
              <strong>{formatNumber(value)}</strong>
            </div>
          );
        })
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Pager({ pageInfo = {}, onPageChange }) {
  const page = Number(pageInfo.page || 1);
  const pages = Number(pageInfo.pages || 1);
  if (pages <= 1) return null;

  return (
    <div className="admin-pager">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

export function AdminEmptyState({ children }) {
  return <p className="muted">{children}</p>;
}
