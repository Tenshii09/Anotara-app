/**
 * The Invite Companion bottom sheet from Feature 5 in the planning doc.
 *
 * Implements the entire frictionless decision-tree:
 *   1. Search users by name/email (debounced).
 *   2. If target is already a friend → "Invite to Trip" CTA.
 *   3. If not a friend → "Add Friend" CTA (and once accepted, the user can
 *      come back and invite — the trip never leaves the screen).
 *   4. List current trip collaborators with a "Remove" affordance for the
 *      host.
 *
 * Wiring (API calls) is handled by the parent through callbacks so the sheet
 * stays pure and reusable on the Profile screen as a plain Friends manager.
 */
import { useEffect, useMemo, useState } from "react";

import BottomSheet from "./BottomSheet";
import Icon from "./Icon";
import { tapHaptic } from "../../lib/haptics";

const DEBOUNCE_MS = 280;

function relationLabel(relation) {
  switch (relation) {
    case "friend":
      return "Friend";
    case "request_sent":
      return "Request sent";
    case "request_received":
      return "Wants to add you";
    case "blocked":
      return "Blocked";
    default:
      return "New explorer";
  }
}

export default function InviteCompanionSheet({
  open,
  onClose,
  title = "Invite to your flock",
  flock = [],
  ownerId,
  currentUserId,
  searchEndpoint,
  onSendFriendRequest,
  onAddCollaborator,
  onRemoveCollaborator,
  showCollaboratorList = true,
  emptyState = "Search by username or email above.",
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    async function resetForm() {
      setQuery("");
      setResults([]);
      setSearchError("");
      setStatusMessage("");
    }
    resetForm();
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      async function clearResults() {
        setResults([]);
      }
      clearResults();
      return undefined;
    }
    if (typeof searchEndpoint !== "function") return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchError("");
      try {
        const data = await searchEndpoint(trimmed);
        if (!cancelled) {
          setResults(Array.isArray(data?.results) ? data.results : []);
        }
      } catch (error) {
        if (!cancelled) {
          setSearchError(error?.message || "Could not search at this time.");
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, searchEndpoint]);

  const ownerCollaborators = useMemo(
    () => (Array.isArray(flock) ? flock : []),
    [flock],
  );

  const userIsHost =
    ownerId !== undefined &&
    currentUserId !== undefined &&
    Number(ownerId) === Number(currentUserId);

  async function handleAddFriend(user) {
    if (!user?.id) return;
    setBusyId(user.id);
    setStatusMessage("");
    try {
      await onSendFriendRequest?.(user);
      setResults((current) =>
        current.map((entry) =>
          entry.id === user.id ? { ...entry, relation: "request_sent" } : entry,
        ),
      );
      setStatusMessage(`Friend request sent to ${user.username}.`);
    } catch (error) {
      setSearchError(error?.message || "Could not send friend request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleInviteToTrip(user) {
    if (!user?.id) return;
    setBusyId(user.id);
    setStatusMessage("");
    try {
      await onAddCollaborator?.(user);
      setStatusMessage(`${user.username} added to the flock.`);
    } catch (error) {
      setSearchError(error?.message || "Could not add collaborator.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(user) {
    if (!user?.user_id) return;
    setBusyId(user.user_id);
    setStatusMessage("");
    try {
      await onRemoveCollaborator?.(user);
      setStatusMessage(`${user.username} removed from this trip.`);
    } catch (error) {
      setSearchError(error?.message || "Could not remove collaborator.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="lg">
      <div className="invite-sheet">
        <label className="invite-sheet__search">
          <Icon name="search" size={18} tone="muted" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search username or email…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </label>

        {searchError ? <p className="invite-sheet__error">{searchError}</p> : null}
        {statusMessage ? <p className="invite-sheet__status">{statusMessage}</p> : null}

        {query.trim().length < 2 ? (
          <p className="invite-sheet__empty">{emptyState}</p>
        ) : null}

        {results.length > 0 ? (
          <ul className="invite-sheet__results">
            {results.map((user) => {
              const isFriend = user.relation === "friend";
              const isPending = user.relation === "request_sent";
              const isBusy = busyId === user.id;
              const alreadyOnTrip = ownerCollaborators.some(
                (member) => Number(member.user_id) === Number(user.id),
              );
              const initial = String(user.username || "T")
                .trim()
                .charAt(0)
                .toUpperCase();

              return (
                <li key={user.id} className="invite-sheet__row">
                  <span className="invite-sheet__avatar" aria-hidden="true">{initial}</span>
                  <div className="invite-sheet__meta">
                    <p className="invite-sheet__name">{user.username}</p>
                    <p className="invite-sheet__sub">
                      {user.email ? <span>{user.email}</span> : null}
                      <span className={`invite-sheet__chip invite-sheet__chip--${user.relation}`}>
                        {relationLabel(user.relation)}
                      </span>
                    </p>
                  </div>
                  <div className="invite-sheet__actions">
                    {alreadyOnTrip ? (
                      <span className="invite-sheet__chip invite-sheet__chip--friend">In flock</span>
                    ) : isFriend ? (
                      onAddCollaborator ? (
                        <button
                          type="button"
                          className="btn-luxury invite-sheet__cta"
                          disabled={isBusy}
                          onClick={() => {
                            tapHaptic();
                            handleInviteToTrip(user);
                          }}
                        >
                          {isBusy ? "Adding…" : "Invite to trip"}
                        </button>
                      ) : (
                        <span className="invite-sheet__chip invite-sheet__chip--friend">Friend</span>
                      )
                    ) : isPending ? (
                      <span className="invite-sheet__chip invite-sheet__chip--request_sent">Pending</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-outline-luxury invite-sheet__cta"
                        disabled={isBusy}
                        onClick={() => {
                          tapHaptic();
                          handleAddFriend(user);
                        }}
                      >
                        <Icon name="userPlus" size={16} />
                        <span>{isBusy ? "Sending…" : "Add friend"}</span>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {showCollaboratorList && ownerCollaborators.length > 0 ? (
          <section className="invite-sheet__flock">
            <p className="dashboard-kicker">Currently in this flock</p>
            <ul className="invite-sheet__flock-list">
              {ownerCollaborators.map((member) => {
                const initial = String(member.username || "T")
                  .trim()
                  .charAt(0)
                  .toUpperCase();
                const isOwner = member.role === "owner";
                const isSelf = Number(member.user_id) === Number(currentUserId);
                return (
                  <li key={member.user_id} className="invite-sheet__flock-row">
                    <span className="invite-sheet__avatar" aria-hidden="true">{initial}</span>
                    <div className="invite-sheet__meta">
                      <p className="invite-sheet__name">{member.username}</p>
                      <p className="invite-sheet__sub">
                        <span className={`invite-sheet__chip invite-sheet__chip--${isOwner ? "host" : "friend"}`}>
                          {isOwner ? "Host" : "Editor"}
                        </span>
                        {member.is_online ? (
                          <span className="invite-sheet__chip invite-sheet__chip--live">
                            <span className="invite-sheet__live-dot" />
                            Live now
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {userIsHost && !isOwner && !isSelf ? (
                      <button
                        type="button"
                        className="invite-sheet__remove"
                        onClick={() => {
                          tapHaptic();
                          handleRemove(member);
                        }}
                        aria-label={`Remove ${member.username}`}
                        disabled={busyId === member.user_id}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
