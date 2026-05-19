import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  clearStoredToken,
  clearTripData,
  clearUserProfile,
  clearWizardDraft,
  getStoredToken,
  saveUserProfile,
} from "../lib/storage";
import {
  deleteAccount,
  getProfile,
  updateProfile,
  updateProfilePreferences,
} from "../lib/profileApi";
import { getDashboardSummary, getSavedItineraries } from "../lib/tripsApi";
import {
  getFriends,
  removeFriend,
  respondToFriendRequest,
  searchFriends,
  sendFriendRequest,
} from "../lib/socialApi";
import { logoutSession } from "../lib/authSession";
import { tapHaptic, successHaptic, warningHaptic } from "../lib/haptics";
import { applyTheme, getInitialTheme, persistTheme, THEMES } from "../lib/theme";
import Avatar from "./common/Avatar";
import BottomSheet from "./common/BottomSheet";
import Icon from "./common/Icon";
import InviteCompanionSheet from "./common/InviteCompanionSheet";
import PageSkeleton from "./common/PageSkeleton";

const BUDGET_OPTIONS = [
  { value: "low", label: "Backpacker" },
  { value: "comfort", label: "Comfort" },
  { value: "high", label: "Luxury" },
];

const COMPANION_OPTIONS = [
  { value: "Solo", label: "Solo" },
  { value: "Couple", label: "Couple" },
  { value: "Family_Kids", label: "Family / Kids" },
  { value: "Friends", label: "Friends" },
  { value: "Seniors", label: "Seniors" },
  { value: "Corporate", label: "Corporate" },
];

const VIBE_DIMENSIONS = [
  { id: "food", label: "Culinary exploration" },
  { id: "beach", label: "Beach & water" },
  { id: "nature", label: "Nature & adventure" },
  { id: "museums", label: "Heritage & culture" },
  { id: "nightlife", label: "Vibrant nightlife" },
];

const DEFAULT_VIBE_WEIGHTS = {
  food: 0.5,
  beach: 0.5,
  nature: 0.5,
  museums: 0.5,
  nightlife: 0.5,
};

function deriveExplorerLevel(totalTrips) {
  if (totalTrips >= 20) return { level: 6, label: "Elite Wanderer", progress: 100 };
  if (totalTrips >= 12) return { level: 5, label: "Master Voyager", progress: 90 };
  if (totalTrips >= 8) return { level: 4, label: "Seasoned Flier", progress: 75 };
  if (totalTrips >= 5) return { level: 3, label: "Wayfinder", progress: 60 };
  if (totalTrips >= 2) return { level: 2, label: "Trailblazer", progress: 40 };
  if (totalTrips >= 1) return { level: 1, label: "Fresh Flier", progress: 22 };
  return { level: 1, label: "Novice Flier", progress: 8 };
}

async function estimateStorageUsage() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trips, setTrips] = useState([]);
  const [serverStats, setServerStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [defaultBudget, setDefaultBudget] = useState("comfort");
  const [companionVector, setCompanionVector] = useState(["Solo"]);
  const [vibeWeights, setVibeWeights] = useState(DEFAULT_VIBE_WEIGHTS);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [forceSyncBusy, setForceSyncBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [friendsState, setFriendsState] = useState({ friends: [], incoming: [], outgoing: [] });
  const [findFriendsOpen, setFindFriendsOpen] = useState(false);
  const [theme, setTheme] = useState(() => getInitialTheme());

  useEffect(() => {
    async function loadProfile() {
      const token = getStoredToken();
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        setError("");
        const [profileData, tripData] = await Promise.all([
          getProfile(token),
          getSavedItineraries(token),
        ]);
        setProfile(profileData || null);
        const safeName = profileData?.username || "Traveler";
        setDraftName(safeName);
        saveUserProfile({ name: safeName });
        setTrips(Array.isArray(tripData) ? tripData : []);
        setDefaultBudget(profileData?.default_budget || "comfort");
        setCompanionVector(
          Array.isArray(profileData?.companion_vector) && profileData.companion_vector.length
            ? profileData.companion_vector
            : ["Solo"],
        );
        setVibeWeights({
          ...DEFAULT_VIBE_WEIGHTS,
          ...(profileData?.vibe_weights || {}),
        });
        setBiometricEnabled(Boolean(profileData?.biometric_enabled));

        try {
          const summary = await getDashboardSummary(token);
          setServerStats(summary || null);
        } catch {
          setServerStats(null);
        }

        const estimate = await estimateStorageUsage();
        setStorage(estimate);

        try {
          const friends = await getFriends(token);
          setFriendsState({
            friends: friends?.friends || [],
            incoming: friends?.incoming || [],
            outgoing: friends?.outgoing || [],
          });
        } catch {
          /* friends list is optional */
        }
      } catch (requestError) {
        if (requestError.status === 401 || requestError.status === 422) {
          clearStoredToken();
          clearUserProfile();
          navigate("/login");
          return;
        }
        setError(requestError.message || "Could not load profile details.");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [navigate]);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const stats = useMemo(() => {
    if (serverStats) {
      return {
        totalTrips: Number(serverStats.total_trips || 0),
        totalDays: Number(serverStats.total_days || 0),
        uniqueDestinations: Number(serverStats.unique_destinations || 0),
        topDestination: serverStats.top_destination || "—",
      };
    }
    const totalTrips = trips.length;
    const totalDays = trips.reduce((acc, trip) => acc + Number(trip.days || trip.num_days || 0), 0);
    const uniqueDestinations = new Set(
      trips.map((trip) => String(trip.destination || "").toLowerCase()).filter(Boolean),
    ).size;
    return { totalTrips, totalDays, uniqueDestinations, topDestination: "—" };
  }, [serverStats, trips]);

  const explorerRank = useMemo(() => deriveExplorerLevel(stats.totalTrips), [stats.totalTrips]);
  const storagePercent = useMemo(() => {
    if (!storage.quota) return 12;
    return Math.max(2, Math.min(100, Math.round((storage.usage / storage.quota) * 100)));
  }, [storage]);

  async function persistPreferences(payload) {
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const updated = await updateProfilePreferences(token, payload);
      setProfile(updated || profile);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 422) {
        clearStoredToken();
        clearUserProfile();
        navigate("/login");
        return;
      }
      setError(requestError.message || "Could not update preferences.");
    }
  }

  function handleBudgetChange(value) {
    tapHaptic();
    setDefaultBudget(value);
    persistPreferences({ default_budget: value });
  }

  function toggleCompanion(value) {
    setCompanionVector((current) => {
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      tapHaptic();
      persistPreferences({ companion_vector: next.length ? next : ["Solo"] });
      return next.length ? next : ["Solo"];
    });
  }

  // Debounce slider changes so we don't hammer the API while the user drags.
  function handleVibeWeightChange(dimensionId, rawValue) {
    setVibeWeights((current) => {
      const next = { ...current, [dimensionId]: Number(rawValue) };
      window.clearTimeout(handleVibeWeightChange._timer);
      handleVibeWeightChange._timer = window.setTimeout(() => {
        persistPreferences({ vibe_weights: next });
      }, 600);
      return next;
    });
  }

  function handleBiometricToggle() {
    const next = !biometricEnabled;
    tapHaptic();
    setBiometricEnabled(next);
    persistPreferences({ biometric_enabled: next });
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      setSavingName(true);
      setSaveMessage("");
      const updated = await updateProfile(token, { username: draftName.trim() });
      const nextName = updated?.username || draftName.trim();
      setProfile((current) => ({ ...(current || {}), username: nextName }));
      saveUserProfile({ name: nextName });
      successHaptic();
      setSaveMessage("Profile updated.");
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 422) {
        clearStoredToken();
        clearUserProfile();
        navigate("/login");
        return;
      }
      setSaveMessage(requestError.message || "Could not update profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function handlePurgeCache() {
    if (typeof caches === "undefined") {
      setError("Local cache API isn't available in this browser.");
      return;
    }
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const estimate = await estimateStorageUsage();
      setStorage(estimate);
      successHaptic();
      setSaveMessage("Local map and image cache cleared.");
    } catch {
      setError("Could not clear local cache.");
    }
  }

  async function handleForceSync() {
    setForceSyncBusy(true);
    try {
      const token = getStoredToken();
      if (!token) {
        navigate("/login");
        return;
      }
      await getSavedItineraries(token);
      await getDashboardSummary(token).catch(() => null);
      successHaptic();
      setSaveMessage("Cloud sync refreshed.");
    } catch (requestError) {
      setError(requestError.message || "Sync failed. Please try again.");
    } finally {
      setForceSyncBusy(false);
    }
  }

  async function handleLogout() {
    tapHaptic();
    clearTripData();
    clearWizardDraft();
    await logoutSession();
    navigate("/login");
  }

  async function handleConfirmDelete() {
    const token = getStoredToken();
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      setDeleteBusy(true);
      warningHaptic();
      await deleteAccount(token, deleteConfirmation);
      clearTripData();
      clearWizardDraft();
      await logoutSession();
      navigate("/login");
    } catch (requestError) {
      setError(requestError.message || "Could not delete account.");
      setDeleteBusy(false);
    }
  }

  async function refreshFriends() {
    const token = getStoredToken();
    if (!token) return;
    try {
      const friends = await getFriends(token);
      setFriendsState({
        friends: friends?.friends || [],
        incoming: friends?.incoming || [],
        outgoing: friends?.outgoing || [],
      });
    } catch {
      /* swallow */
    }
  }

  async function handleAcceptFriendRequest(friendship_id) {
    const token = getStoredToken();
    if (!token) return;
    try {
      await respondToFriendRequest(token, friendship_id, "accepted");
      successHaptic();
      refreshFriends();
    } catch (requestError) {
      setError(requestError?.message || "Could not accept request.");
    }
  }

  async function handleDeclineFriendRequest(friendship_id) {
    const token = getStoredToken();
    if (!token) return;
    try {
      await respondToFriendRequest(token, friendship_id, "declined");
      tapHaptic();
      refreshFriends();
    } catch (requestError) {
      setError(requestError?.message || "Could not decline request.");
    }
  }

  async function handleRemoveFriend(friendId) {
    const token = getStoredToken();
    if (!token) return;
    try {
      await removeFriend(token, friendId);
      warningHaptic();
      refreshFriends();
    } catch (requestError) {
      setError(requestError?.message || "Could not remove friend.");
    }
  }

  async function handleSendFriendRequestFromSheet(user) {
    const token = getStoredToken();
    await sendFriendRequest(token, user.id);
    refreshFriends();
  }

  function handleThemeChange(nextTheme) {
    tapHaptic();
    setTheme(nextTheme);
  }

  if (loading) {
    return (
      <PageSkeleton
        variant="profile"
        title="Loading profile"
        subtitle="Preparing your account, preferences, and travel stats."
      />
    );
  }

  const displayName = profile?.username || "Traveler";
  const email = profile?.email || "";
  const memberSince = profile?.member_since;

  return (
    <main className="app-page">
      <section className="dashboard-shell">
        {/* Identity, Account Maturity, Gamification Engine */}
        <article className="glass-card profile-identity">
          <Avatar
            name={displayName}
            level={explorerRank.level}
            progress={explorerRank.progress}
            ariaLabel={`${displayName}, Explorer level ${explorerRank.level}`}
            size={72}
          />
          <div className="profile-identity__text">
            <p className="dashboard-kicker">Digital twin · {explorerRank.label}</p>
            <h1 className="profile-identity__name">{displayName}</h1>
            <p className="profile-identity__meta">{email || "Verified explorer"}</p>
            {memberSince ? (
              <p className="profile-identity__meta">Member since · {memberSince}</p>
            ) : null}
          </div>
        </article>

        {error ? <article className="error-banner">{error}</article> : null}
        {saveMessage ? (
          <article className="glass-card" style={{ padding: 12, color: "var(--accent)" }}>
            {saveMessage}
          </article>
        ) : null}

        {/* Editable name inline form */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">Identity</p>
          <h3 className="serif" style={{ margin: "4px 0 12px" }}>Edit display name</h3>
          <form onSubmit={handleSaveProfile} style={{ display: "grid", gap: 10 }}>
            <input
              className="auth-input"
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              minLength={3}
              required
              aria-label="Display name"
            />
            <button className="btn-luxury" type="submit" disabled={savingName}>
              {savingName ? "Saving..." : "Save profile"}
            </button>
          </form>
        </article>

        {/* Algorithmic Preference Tuning Matrix */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">ML Tuning · Algorithmic preference matrix</p>
          <h3 className="serif" style={{ margin: "4px 0 12px" }}>Reshape the recommendation engine</h3>

          <div className="profile-tuner">
            <div className="profile-tuner__row">
              <div className="profile-tuner__label">
                <span>Default budget tier</span>
                <span className="profile-tuner__value">
                  {BUDGET_OPTIONS.find((option) => option.value === defaultBudget)?.label || ""}
                </span>
              </div>
              <div className="profile-tuner__chips">
                {BUDGET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`profile-tuner__chip${defaultBudget === option.value ? " is-active" : ""}`}
                    onClick={() => handleBudgetChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-tuner__row">
              <div className="profile-tuner__label">
                <span>Companion persona vector (the flock)</span>
                <span className="profile-tuner__value">{companionVector.length} active</span>
              </div>
              <div className="profile-tuner__chips">
                {COMPANION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`profile-tuner__chip${companionVector.includes(option.value) ? " is-active" : ""}`}
                    onClick={() => toggleCompanion(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {VIBE_DIMENSIONS.map((dimension) => (
              <div key={dimension.id} className="profile-tuner__row">
                <div className="profile-tuner__label">
                  <span>{dimension.label}</span>
                  <span className="profile-tuner__value">
                    {Math.round((vibeWeights[dimension.id] ?? 0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vibeWeights[dimension.id] ?? 0}
                  onChange={(event) => handleVibeWeightChange(dimension.id, event.target.value)}
                  className="profile-tuner__slider"
                  aria-label={`${dimension.label} weight`}
                />
              </div>
            ))}
          </div>
        </article>

        {/* Security & hardware integration */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">Security · Hardware integration</p>
          <h3 className="serif" style={{ margin: "4px 0 12px" }}>Authentication matrix</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>Biometric authentication</p>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Bind log-in approvals to your device's fingerprint or Face ID where available.
              </p>
            </div>
            <button
              type="button"
              className={`profile-tuner__chip${biometricEnabled ? " is-active" : ""}`}
              onClick={handleBiometricToggle}
            >
              {biometricEnabled ? "On" : "Off"}
            </button>
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Active sessions: <strong>This device</strong>
            </p>
          </div>
        </article>

        {/* Appearance */}
        <article className="glass-card theme-toggle-card">
          <div className="theme-toggle-card__row">
            <div className="theme-toggle-card__copy">
              <p className="dashboard-kicker">Appearance</p>
              <h3 className="serif">Color mode</h3>
              <p className="muted" style={{ margin: 0 }}>
                Switch between bright pastel glass and a calmer night palette.
              </p>
            </div>
            <div className="theme-toggle" aria-label="Choose color mode">
              <button
                type="button"
                className={theme === THEMES.light ? "is-active" : ""}
                onClick={() => handleThemeChange(THEMES.light)}
                aria-pressed={theme === THEMES.light}
              >
                Light
              </button>
              <button
                type="button"
                className={theme === THEMES.dark ? "is-active" : ""}
                onClick={() => handleThemeChange(THEMES.dark)}
                aria-pressed={theme === THEMES.dark}
              >
                Dark
              </button>
            </div>
          </div>
        </article>

        {/* PWA Memory & Cloud Sync Hub */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">PWA storage · Cloud sync</p>
          <h3 className="serif" style={{ margin: "4px 0 8px" }}>Local data footprint</h3>
          <p className="muted" style={{ margin: 0 }}>
            Cached map tiles, offline itineraries, and images stored on this device.
          </p>
          <div className="profile-storage-bar">
            <span style={{ width: `${storagePercent}%` }} />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {formatBytes(storage.usage)} {storage.quota ? `of ${formatBytes(storage.quota)} quota` : "cached locally"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <button className="btn-outline-luxury" type="button" onClick={handlePurgeCache}>
              Purge local cache
            </button>
            <button className="btn-luxury" type="button" onClick={handleForceSync} disabled={forceSyncBusy}>
              {forceSyncBusy ? "Syncing..." : "Force cloud sync"}
            </button>
          </div>
        </article>

        {/* Quick navigation */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">Quick navigation</p>
          <h3 className="serif" style={{ margin: "4px 0 12px" }}>Jump anywhere</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="top-action-link" type="button" onClick={() => navigate("/dashboard")}>
              Dashboard
            </button>
            <button className="top-action-link" type="button" onClick={() => navigate("/my-trips")}>
              My Trips
            </button>
            <button className="top-action-link" type="button" onClick={() => navigate("/discover")}>
              Discover
            </button>
            <button className="top-action-link" type="button" onClick={() => navigate("/generate")}>
              Trip Generator
            </button>
          </div>
        </article>

        {/* The Flock — Friends & companions */}
        <article className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="dashboard-kicker">The Flock · Travel companions</p>
              <h3 className="serif" style={{ margin: "4px 0 0" }}>Friends &amp; collaborators</h3>
            </div>
            <button
              type="button"
              className="btn-luxury"
              onClick={() => {
                tapHaptic();
                setFindFriendsOpen(true);
              }}
            >
              <Icon name="userPlus" size={16} /> Find friends
            </button>
          </div>

          {friendsState.incoming.length > 0 ? (
            <section style={{ marginTop: 16, display: "grid", gap: 8 }}>
              <p className="dashboard-kicker">Pending requests</p>
              {friendsState.incoming.map((friend) => (
                <div key={friend.friendship_id} className="profile-friends__row">
                  <span className="invite-sheet__avatar" aria-hidden="true">
                    {String(friend.username || "T").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="invite-sheet__name">{friend.username}</p>
                    <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                      Wants to add you to their flock.
                    </p>
                  </div>
                  <div className="profile-friends__actions">
                    <button
                      type="button"
                      className="profile-friends__cta"
                      onClick={() => handleAcceptFriendRequest(friend.friendship_id)}
                    >
                      <Icon name="check" size={14} /> Accept
                    </button>
                    <button
                      type="button"
                      className="profile-friends__cta profile-friends__cta--danger"
                      onClick={() => handleDeclineFriendRequest(friend.friendship_id)}
                    >
                      <Icon name="close" size={14} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {friendsState.outgoing.length > 0 ? (
            <section style={{ marginTop: 16, display: "grid", gap: 8 }}>
              <p className="dashboard-kicker">Sent requests</p>
              {friendsState.outgoing.map((friend) => (
                <div key={friend.friendship_id} className="profile-friends__row">
                  <span className="invite-sheet__avatar" aria-hidden="true">
                    {String(friend.username || "T").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="invite-sheet__name">{friend.username}</p>
                    <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>Waiting for them to respond.</p>
                  </div>
                  <button
                    type="button"
                    className="profile-friends__cta profile-friends__cta--danger"
                    onClick={() => handleRemoveFriend(friend.id)}
                  >
                    <Icon name="close" size={14} /> Cancel
                  </button>
                </div>
              ))}
            </section>
          ) : null}

          <section style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <p className="dashboard-kicker">
              Friends · {friendsState.friends.length}
            </p>
            {friendsState.friends.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No friends yet — tap <strong>Find friends</strong> to start your flock.
              </p>
            ) : (
              friendsState.friends.map((friend) => (
                <div key={friend.friendship_id} className="profile-friends__row">
                  <span className="invite-sheet__avatar" aria-hidden="true">
                    {String(friend.username || "T").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="invite-sheet__name">{friend.username}</p>
                    {friend.email ? (
                      <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>{friend.email}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="profile-friends__cta profile-friends__cta--danger"
                    onClick={() => handleRemoveFriend(friend.id)}
                  >
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              ))
            )}
          </section>
        </article>

        {/* Travel stats summary */}
        <article className="glass-card dashboard-stats">
          <p className="dashboard-kicker">Travel summary</p>
          <div className="dashboard-stat-grid">
            <div>
              <span className="dashboard-stat-value">{stats.totalTrips}</span>
              <span className="muted">Saved trips</span>
            </div>
            <div>
              <span className="dashboard-stat-value">{stats.totalDays}</span>
              <span className="muted">Planned days</span>
            </div>
            <div>
              <span className="dashboard-stat-value">{stats.uniqueDestinations}/82</span>
              <span className="muted">Provinces explored</span>
            </div>
            <div>
              <span className="dashboard-stat-value" style={{ fontSize: "1rem" }}>
                {stats.topDestination}
              </span>
              <span className="muted">Top destination</span>
            </div>
          </div>
        </article>

        {/* Support / Legal */}
        <article className="glass-card" style={{ padding: 20 }}>
          <p className="dashboard-kicker">Support & legal</p>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <button className="top-action-link" type="button" onClick={() => window.open("mailto:support@anotara.app")}>
              Help center & bug reporter
            </button>
            <button className="top-action-link" type="button" onClick={() => window.open("/privacy", "_blank")}>
              Privacy Policy
            </button>
            <button className="top-action-link" type="button" onClick={() => window.open("/terms", "_blank")}>
              Terms of Service
            </button>
            <button className="top-action-link" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </article>

        {/* Destructive protocol */}
        <article className="profile-danger">
          <p className="dashboard-kicker">Destructive protocol</p>
          <h3 className="serif" style={{ margin: 0 }}>Delete account</h3>
          <p className="muted" style={{ margin: 0, color: "#8a1f3a" }}>
            Permanently expunges your itineraries, feedback, and account. Cannot be undone.
          </p>
          <button type="button" onClick={() => setPendingDelete(true)}>
            Begin delete protocol
          </button>
        </article>
      </section>

      <BottomSheet
        open={pendingDelete}
        onClose={() => {
          setPendingDelete(false);
          setDeleteConfirmation("");
        }}
        title="Delete account?"
        size="md"
        footer={
          <>
            <button
              className="btn-outline-luxury"
              type="button"
              onClick={() => {
                setPendingDelete(false);
                setDeleteConfirmation("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn-luxury"
              type="button"
              style={{ background: "linear-gradient(135deg, #c44f5a 0%, #ff8a72 100%)" }}
              onClick={handleConfirmDelete}
              disabled={deleteBusy || deleteConfirmation.trim().toLowerCase() !== "delete my account"}
            >
              {deleteBusy ? "Deleting..." : "Confirm permanent delete"}
            </button>
          </>
        }
      >
        <p className="muted">
          To proceed, type <strong>delete my account</strong> exactly (case-insensitive) in the box
          below. This action permanently removes your data and cannot be undone.
        </p>
        <input
          className="auth-input"
          type="text"
          placeholder="delete my account"
          value={deleteConfirmation}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
          autoCapitalize="off"
          autoComplete="off"
        />
      </BottomSheet>

      <InviteCompanionSheet
        open={findFriendsOpen}
        onClose={() => setFindFriendsOpen(false)}
        title="Find &amp; add friends"
        flock={[]}
        showCollaboratorList={false}
        currentUserId={profile?.id}
        searchEndpoint={async (query) => {
          const token = getStoredToken();
          return searchFriends(token, query);
        }}
        onSendFriendRequest={handleSendFriendRequestFromSheet}
        emptyState="Search for any explorer by username or email — friend requests sent instantly."
      />
    </main>
  );
}
