/**
 * The Flock Avatar Cluster — a horizontally overlapping stack of circular
 * avatars that sits at the top of any collaborative itinerary, plus a single
 * "Invite Companion" affordance.  Live presence is conveyed by a glowing
 * gradient ring drawn behind each online collaborator.
 *
 * The component is intentionally presentational. All wiring (heartbeat,
 * fetch, invite logic) lives in the parent so it composes equally well with
 * the live ItineraryPage and the static dashboard previews.
 */
import { tapHaptic } from "../../lib/haptics";
import Icon from "./Icon";

function colorForName(name) {
  const seed = String(name || "T")
    .split("")
    .reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed + 64) % 360;
  return `linear-gradient(135deg, hsl(${hueA}, 70%, 55%) 0%, hsl(${hueB}, 78%, 62%) 100%)`;
}

export default function FlockCluster({
  members = [],
  currentUserId,
  maxVisible = 4,
  onInvite,
  onMemberClick,
  inviteLabel = "Invite",
  hideInvite = false,
}) {
  const safeMembers = Array.isArray(members) ? members : [];
  const visibleMembers = safeMembers.slice(0, maxVisible);
  const overflowCount = Math.max(0, safeMembers.length - maxVisible);

  return (
    <div className="flock-cluster" role="group" aria-label="Collaborators on this trip">
      <ul className="flock-cluster__stack">
        {visibleMembers.map((member) => {
          const initial = String(member.username || "T")
            .trim()
            .charAt(0)
            .toUpperCase();
          const isSelf =
            currentUserId !== undefined && Number(member.user_id) === Number(currentUserId);
          const handleClick = () => {
            tapHaptic();
            if (typeof onMemberClick === "function") onMemberClick(member);
          };
          return (
            <li
              key={member.user_id}
              className={`flock-cluster__item${member.is_online ? " is-online" : ""}${isSelf ? " is-self" : ""}`}
            >
              <button
                type="button"
                className="flock-cluster__avatar"
                style={{ background: colorForName(member.username) }}
                aria-label={`${member.username || "Traveler"}${member.is_online ? ", currently online" : ""}${member.role === "owner" ? ", host" : ""}`}
                onClick={handleClick}
              >
                <span aria-hidden="true">{initial}</span>
              </button>
              {member.role === "owner" ? (
                <span className="flock-cluster__badge" aria-hidden="true">Host</span>
              ) : null}
            </li>
          );
        })}
        {overflowCount > 0 ? (
          <li className="flock-cluster__item">
            <span className="flock-cluster__avatar flock-cluster__overflow" aria-hidden="true">
              +{overflowCount}
            </span>
          </li>
        ) : null}
      </ul>

      {hideInvite ? null : (
        <button
          type="button"
          className="flock-cluster__invite"
          onClick={() => {
            tapHaptic();
            onInvite?.();
          }}
          aria-label={inviteLabel}
        >
          <Icon name="userPlus" size={18} />
          <span className="flock-cluster__invite-text">{inviteLabel}</span>
        </button>
      )}
    </div>
  );
}
