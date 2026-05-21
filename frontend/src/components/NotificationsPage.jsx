import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NOTIFICATION_EVENTS, getUnreadNotifications } from "../data/notifications";
import {
  loadNotificationReadState,
  saveNotificationReadState,
} from "../lib/storage";
import { successHaptic, tapHaptic } from "../lib/haptics";
import BrandLogo from "./common/BrandLogo";
import Icon from "./common/Icon";

function buildAllReadState() {
  return NOTIFICATION_EVENTS.reduce((nextState, event) => {
    nextState[event.id] = true;
    return nextState;
  }, {});
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [readState, setReadState] = useState(() => loadNotificationReadState());

  const unreadNotifications = useMemo(
    () => getUnreadNotifications(readState),
    [readState],
  );
  const unreadCount = unreadNotifications.length;

  function updateReadState(nextState) {
    setReadState(nextState);
    saveNotificationReadState(nextState);
  }

  function markAllAsRead() {
    if (unreadCount === 0) return;
    successHaptic();
    updateReadState(buildAllReadState());
  }

  function markNotificationAsRead(notification) {
    if (readState[notification.id]) return;
    updateReadState({ ...readState, [notification.id]: true });
  }

  function openNotification(notification) {
    tapHaptic();
    markNotificationAsRead(notification);
    if (notification.actionPath) {
      navigate(notification.actionPath);
    }
  }

  return (
    <main className="app-page">
      <section className="dashboard-shell notifications-shell">
        <header className="notifications-hero glass-card">
          <div className="notifications-hero__topline">
            <button
              type="button"
              className="notifications-back"
              onClick={() => {
                tapHaptic();
                navigate(-1);
              }}
              aria-label="Go back"
            >
              <Icon name="arrowLeft" size={18} />
            </button>
            <BrandLogo size={52} />
            <span className="badge-pill notifications-count-pill">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
          </div>

          <div>
            <p className="dashboard-kicker">Notification center</p>
            <h1 className="serif notifications-title">Your latest travel signals</h1>
            <p className="muted notifications-subtitle">
              Invitations, exports, weather alerts, and system updates stay here
              instead of sending you back to My Trips.
            </p>
          </div>

          <button
            type="button"
            className="top-action-link notifications-mark-all"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </button>
        </header>

        <section className="notifications-feed" aria-label="System notifications">
          {NOTIFICATION_EVENTS.map((notification) => {
            const isUnread = !readState[notification.id];

            return (
              <article
                key={notification.id}
                className={`notification-card glass-card notification-card--${notification.tone}${
                  isUnread ? " is-unread" : ""
                }`}
              >
                <div className="notification-card__icon" aria-hidden="true">
                  <Icon name={notification.icon} size={20} />
                </div>
                <div className="notification-card__content">
                  <div className="notification-card__meta">
                    <span>{notification.source}</span>
                    <span>{notification.timestamp}</span>
                  </div>
                  <h2>{notification.title}</h2>
                  <p>{notification.message}</p>
                  <div className="notification-card__actions">
                    <button
                      type="button"
                      className="top-action-link notification-card__button"
                      onClick={() => openNotification(notification)}
                    >
                      {notification.actionLabel}
                    </button>
                    {isUnread ? (
                      <button
                        type="button"
                        className="notification-card__text-button"
                        onClick={() => {
                          tapHaptic();
                          markNotificationAsRead(notification);
                        }}
                      >
                        Mark as read
                      </button>
                    ) : (
                      <span className="notification-card__read-label">
                        Read
                      </span>
                    )}
                  </div>
                </div>
                {isUnread ? (
                  <span className="notification-card__unread-dot">
                    <span className="sr-only">Unread</span>
                  </span>
                ) : null}
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
