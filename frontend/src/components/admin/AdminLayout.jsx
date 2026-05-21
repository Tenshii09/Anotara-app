import { useEffect } from "react";

import { adminSections } from "./adminConfig";
import { StatusPill } from "./shared";

const groups = ["Overview", "Operations", "Intelligence", "Governance", "Infrastructure"];

export default function AdminLayout({
  activeItem,
  activeNav,
  children,
  error,
  isLoading,
  isMutating,
  onLogout,
  onRefresh,
  onRetrain,
  onNavigate,
  profile,
  sidebarOpen,
  setSidebarOpen,
  overview,
}) {
  const displayName = profile?.name || profile?.role || "Operations admin";
  const modelStatus = overview?.model_status?.status || "healthy";

  useEffect(() => {
    document.body.classList.toggle("admin-nav-open", sidebarOpen);
    return () => document.body.classList.remove("admin-nav-open");
  }, [sidebarOpen]);

  function handleNavigate(path) {
    onNavigate(path);
    setSidebarOpen(false);
  }

  return (
    <main className="admin-page">
      {sidebarOpen ? (
        <button
          aria-label="Close admin navigation"
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}
      <aside
        id="admin-sidebar"
        className={
          sidebarOpen
            ? "admin-sidebar glass-card admin-sidebar--open"
            : "admin-sidebar glass-card"
        }
        aria-label="Admin navigation"
      >
        <div className="admin-sidebar__mobile-header">
          <div>
            <p className="eyebrow">Admin Menu</p>
            <strong>Navigation</strong>
          </div>
          <button
            aria-label="Close admin navigation"
            className="admin-sidebar__close"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
        <div>
          <p className="eyebrow">Ano Tara Admin</p>
          <h1>Operations Console</h1>
          <p className="muted">
            Secure command center for content operations, account management,
            analytics, audit, and ML oversight.
          </p>
        </div>
        <nav className="admin-nav">
          {groups.map((group) => {
            const items = adminSections.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div className="admin-nav__group" key={group}>
                <span className="eyebrow">{group}</span>
                {items.map((item) => (
                  <button
                    className={
                      item.id === activeNav
                        ? "admin-nav__item active"
                        : "admin-nav__item"
                    }
                    key={item.id}
                    onClick={() => handleNavigate(`/admin/${item.path}`)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <span>Signed in as</span>
          <strong>{profile?.name || profile?.role || "Admin"}</strong>
          <StatusPill status={profile?.role}>{profile?.role}</StatusPill>
          <button onClick={onLogout} type="button">
            Log out
          </button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar glass-card">
          <div className="admin-topbar__titleblock">
            <button
              className="admin-topbar__menu-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
              aria-label="Open admin navigation"
              onClick={() => setSidebarOpen((value) => !value)}
              type="button"
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
            <div>
              <p className="eyebrow">{activeItem.label}</p>
              <h2>{activeItem.title}</h2>
              <span>
                Welcome back, {displayName}. Monitor live operations without
                leaving this console.
              </span>
            </div>
          </div>
          <div className="admin-topbar__actions">
            <StatusPill status={modelStatus}>{modelStatus}</StatusPill>
            <button disabled={isMutating} onClick={onRefresh} type="button">
              Refresh data
            </button>
            {activeNav === "ml" || activeNav === "dashboard" ? (
              <button
                className="primary"
                disabled={isMutating}
                onClick={onRetrain}
                type="button"
              >
                Request retraining
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="admin-notice admin-notice--error">{error}</div>
        ) : null}
        {isLoading ? (
          <div className="admin-notice">
            Loading live admin operations data...
          </div>
        ) : null}

        {children}
      </section>
    </main>
  );
}
