/**
 * Tara Na! Pre-Generation Voting Room (Feature 1).
 *
 * A lightweight multiplayer lobby that the trip "Host" can launch instead of
 * solo-planning.  Friends join via a generated session code, every wizard
 * question is presented in a "live poll" form, votes appear in real-time, and
 * once the host resolves the lobby the aggregated answers are written into
 * the wizard draft so the existing single-player generation path runs
 * untouched.
 *
 * The lobby polls /api/vote-sessions/:id every few seconds; it is light
 * enough to feel near-realtime without needing websockets for this iteration.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  advanceVoteSession,
  createVoteSession,
  joinVoteSession,
  resolveVoteSession,
  getVoteSession,
  submitVote,
} from "../../lib/socialApi";
import { getStoredToken } from "../../lib/storage";
import { tapHaptic, successHaptic, warningHaptic } from "../../lib/haptics";
import Icon from "../common/Icon";
import PacingSlider from "./PacingSlider";
import TransportPicker from "./TransportPicker";
import DealbreakersGrid from "./DealbreakersGrid";

const VIBE_OPTIONS = [
  { value: "food", label: "Food trip", icon: "fork" },
  { value: "beach", label: "Beach vibe", icon: "image" },
  { value: "nature", label: "Nature", icon: "leaf" },
  { value: "museums", label: "Heritage", icon: "shield" },
  { value: "nightlife", label: "Nightlife", icon: "vibe" },
];

const QUESTIONS = [
  { key: "destination", title: "Where should the flock fly?", description: "Type a province or city — majority wins." },
  { key: "numDays", title: "How many days are we travelling?" },
  { key: "pacing_style", title: "What's our pacing energy?" },
  { key: "transport_mode", title: "How will we get around?" },
  { key: "budget", title: "Pick a travel tier" },
  { key: "preferences", title: "Top three vibes" },
  { key: "dealbreakers", title: "Any dealbreakers?" },
];

function colorForName(name) {
  const seed = String(name || "T")
    .split("")
    .reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed + 64) % 360;
  return `linear-gradient(135deg, hsl(${hueA}, 70%, 55%) 0%, hsl(${hueB}, 78%, 62%) 100%)`;
}

function VoteAvatar({ username }) {
  const initial = String(username || "T").trim().charAt(0).toUpperCase();
  return (
    <span
      className="voting-lobby__avatar"
      style={{ background: colorForName(username) }}
      title={username || ""}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default function VotingLobby({ onClose, onResolved, currentUserId }) {
  const [mode, setMode] = useState("idle");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [destinationDraft, setDestinationDraft] = useState("");
  const [dealbreakerDraft, setDealbreakerDraft] = useState([]);
  const [vibesDraft, setVibesDraft] = useState([]);
  const pollingRef = useRef(null);

  const token = getStoredToken();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const refresh = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      try {
        const response = await getVoteSession(token, sessionId);
        if (response?.session) setSession(response.session);
      } catch (refreshError) {
        if (refreshError?.status === 401 || refreshError?.status === 422) {
          setError("Session expired. Please log in again.");
        }
      }
    },
    [token],
  );

  useEffect(() => {
    stopPolling();
    if (!session?.id) return undefined;
    pollingRef.current = window.setInterval(() => {
      refresh(session.id);
    }, 4000);
    return stopPolling;
  }, [session?.id, refresh, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const currentQuestion = useMemo(() => {
    if (!session) return null;
    const index = Math.max(0, Math.min(QUESTIONS.length - 1, (session.current_step || 1) - 1));
    return QUESTIONS[index];
  }, [session]);

  const myVote = useMemo(() => {
    if (!session || !currentQuestion) return null;
    const entries = (session.votes || {})[currentQuestion.key] || [];
    return entries.find((entry) => Number(entry.user_id) === Number(currentUserId))?.value ?? null;
  }, [session, currentQuestion, currentUserId]);

  useEffect(() => {
    if (!currentQuestion) return;
    async function syncDrafts() {
      if (currentQuestion.key === "destination") setDestinationDraft(String(myVote || ""));
      if (currentQuestion.key === "dealbreakers") setDealbreakerDraft(Array.isArray(myVote) ? myVote : []);
      if (currentQuestion.key === "preferences") setVibesDraft(Array.isArray(myVote) ? myVote : []);
    }
    syncDrafts();
  }, [currentQuestion, myVote]);

  async function handleCreate() {
    setError("");
    try {
      const response = await createVoteSession(token);
      if (response?.session) {
        successHaptic();
        setSession(response.session);
        setMode("lobby");
      }
    } catch (createError) {
      warningHaptic();
      setError(createError?.message || "Could not start the lobby.");
    }
  }

  async function handleJoin(event) {
    event?.preventDefault();
    setError("");
    try {
      const response = await joinVoteSession(token, joinCode.trim());
      if (response?.session) {
        successHaptic();
        setSession(response.session);
        setMode("lobby");
      }
    } catch (joinError) {
      warningHaptic();
      setError(joinError?.message || "Could not join that lobby.");
    }
  }

  async function castVote(questionKey, value) {
    if (!session?.id) return;
    setError("");
    try {
      const response = await submitVote(token, session.id, questionKey, value);
      if (response?.session) {
        tapHaptic();
        setSession(response.session);
      }
    } catch (voteError) {
      warningHaptic();
      setError(voteError?.message || "Could not record your vote.");
    }
  }

  async function advance(direction = 1) {
    if (!session?.id || !session.requester_is_host) return;
    const nextStep = Math.max(1, Math.min(QUESTIONS.length, (session.current_step || 1) + direction));
    try {
      const response = await advanceVoteSession(token, session.id, { next_step: nextStep });
      if (response?.session) {
        tapHaptic();
        setSession(response.session);
      }
    } catch (advanceError) {
      setError(advanceError?.message || "Could not move the lobby forward.");
    }
  }

  async function resolveLobby() {
    if (!session?.id || !session.requester_is_host) return;
    try {
      const response = await resolveVoteSession(token, session.id);
      if (response?.session?.resolved) {
        successHaptic();
        setSession(response.session);
        onResolved?.(response.session.resolved);
      }
    } catch (resolveError) {
      setError(resolveError?.message || "Could not resolve the lobby.");
    }
  }

  function copyShareLink() {
    if (!session?.session_code) return;
    const url = `${window.location.origin}/generate?lobby=${session.session_code}`;
    navigator.clipboard?.writeText(url).then(() => {
      successHaptic();
      setError("");
    });
  }

  function renderQuestion() {
    if (!currentQuestion) return null;
    const totalVotes = ((session?.votes || {})[currentQuestion.key] || []).length;

    return (
      <section className="voting-lobby__question">
        <header className="voting-lobby__question-header">
          <p className="dashboard-kicker">
            Step {session.current_step} of {QUESTIONS.length}
          </p>
          <h2 className="serif">{currentQuestion.title}</h2>
          {currentQuestion.description ? (
            <p className="muted">{currentQuestion.description}</p>
          ) : null}
          <p className="voting-lobby__tally">
            <Icon name="vote" size={14} /> {totalVotes} of {session.participants.length} voted
          </p>
        </header>

        {currentQuestion.key === "destination" ? (
          <div className="voting-lobby__form">
            <input
              className="auth-input"
              type="text"
              placeholder="e.g. Palawan, Cebu, Siargao…"
              value={destinationDraft}
              onChange={(event) => setDestinationDraft(event.target.value)}
            />
            <button
              className="btn-luxury"
              type="button"
              onClick={() => castVote("destination", destinationDraft.trim())}
              disabled={!destinationDraft.trim()}
            >
              Lock in my vote
            </button>
          </div>
        ) : null}

        {currentQuestion.key === "numDays" ? (
          <div className="voting-lobby__chips">
            {[2, 3, 4, 5, 7, 10].map((day) => (
              <button
                key={day}
                type="button"
                className={`voting-lobby__chip${Number(myVote) === day ? " is-active" : ""}`}
                onClick={() => castVote("numDays", day)}
              >
                {day} days
              </button>
            ))}
          </div>
        ) : null}

        {currentQuestion.key === "pacing_style" ? (
          <PacingSlider value={myVote || "Moderate"} onChange={(value) => castVote("pacing_style", value)} />
        ) : null}

        {currentQuestion.key === "transport_mode" ? (
          <TransportPicker value={myVote || "Public"} onChange={(value) => castVote("transport_mode", value)} />
        ) : null}

        {currentQuestion.key === "budget" ? (
          <div className="voting-lobby__chips">
            {[
              { value: "low", label: "Backpacker" },
              { value: "comfort", label: "Comfort" },
              { value: "high", label: "Luxury" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`voting-lobby__chip${myVote === option.value ? " is-active" : ""}`}
                onClick={() => castVote("budget", option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {currentQuestion.key === "preferences" ? (
          <div className="voting-lobby__vibes">
            {VIBE_OPTIONS.map((option) => {
              const isActive = vibesDraft.includes(option.value);
              const rank = vibesDraft.indexOf(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`voting-lobby__vibe${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    let next;
                    if (isActive) {
                      next = vibesDraft.filter((value) => value !== option.value);
                    } else if (vibesDraft.length >= 3) {
                      warningHaptic();
                      return;
                    } else {
                      next = [...vibesDraft, option.value];
                    }
                    setVibesDraft(next);
                    castVote("preferences", next);
                  }}
                >
                  <Icon name={option.icon} size={16} />
                  <span>{option.label}</span>
                  {rank >= 0 ? <span className="voting-lobby__rank">{rank + 1}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {currentQuestion.key === "dealbreakers" ? (
          <DealbreakersGrid
            value={dealbreakerDraft}
            onChange={(next) => {
              setDealbreakerDraft(next);
              castVote("dealbreakers", next);
            }}
          />
        ) : null}

        <div className="voting-lobby__answers">
          {((session.votes || {})[currentQuestion.key] || []).map((entry) => {
            const participant = session.participants.find(
              (member) => Number(member.user_id) === Number(entry.user_id),
            );
            const label = Array.isArray(entry.value)
              ? entry.value.join(", ") || "—"
              : String(entry.value ?? "—");
            return (
              <article
                key={entry.user_id}
                className="voting-lobby__answer"
                style={{ borderColor: participant?.is_host ? "rgba(196, 79, 138, 0.45)" : undefined }}
              >
                <VoteAvatar username={participant?.username} />
                <div>
                  <strong>{participant?.username || "Flock member"}</strong>
                  <p>{label}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (mode === "idle") {
    return (
      <section className="voting-lobby voting-lobby--landing glass-card">
        <header>
          <p className="dashboard-kicker">Tara Na! · Plan with a flock</p>
          <h2 className="serif">Start or join a voting room</h2>
          <p className="muted">
            Generate trips together — every flock member votes on the destination, pacing, and
            vibes, and the AI builds the itinerary using the majority wins.
          </p>
        </header>

        <div className="voting-lobby__pair">
          <article className="voting-lobby__create">
            <h3 className="serif">Host a new flock</h3>
            <p className="muted">You'll get a short lobby code to share via Messenger or WhatsApp.</p>
            <button type="button" className="btn-luxury" onClick={handleCreate}>
              <Icon name="users" size={16} /> Open lobby
            </button>
          </article>

          <article className="voting-lobby__join">
            <h3 className="serif">Join an existing flock</h3>
            <form onSubmit={handleJoin} className="voting-lobby__form">
              <input
                className="auth-input"
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Lobby code"
                maxLength={12}
                autoCapitalize="characters"
              />
              <button type="submit" className="btn-outline-luxury" disabled={joinCode.length < 4}>
                <Icon name="arrowRight" size={16} /> Join
              </button>
            </form>
          </article>
        </div>

        <button
          type="button"
          className="top-action-link voting-lobby__skip"
          onClick={() => {
            tapHaptic();
            onClose?.();
          }}
        >
          Skip — plan solo
        </button>

        {error ? <p className="error-banner" style={{ marginTop: 18 }}>{error}</p> : null}
      </section>
    );
  }

  if (!session) {
    return (
      <section className="voting-lobby glass-card">
        <p className="muted">Connecting to the lobby…</p>
      </section>
    );
  }

  const resolved = session.resolved;

  return (
    <section className="voting-lobby glass-card">
      <header className="voting-lobby__header">
        <div>
          <p className="dashboard-kicker">Lobby · {session.session_code}</p>
          <h2 className="serif">Hosted by {session.host_username}</h2>
        </div>
        <div className="voting-lobby__participants">
          {session.participants.map((member) => (
            <VoteAvatar key={member.user_id} username={member.username} />
          ))}
        </div>
      </header>

      <div className="voting-lobby__share-row">
        <button
          type="button"
          className="btn-outline-luxury voting-lobby__share"
          onClick={copyShareLink}
        >
          <Icon name="link" size={16} /> Copy invite link
        </button>
        <code className="voting-lobby__code">{session.session_code}</code>
      </div>

      {resolved ? (
        <section className="voting-lobby__resolved">
          <p className="dashboard-kicker">Flock decision ready</p>
          <h3 className="serif">Itinerary blueprint approved</h3>
          <ul>
            {Object.entries(resolved).map(([key, value]) => (
              <li key={key}>
                <strong>{key.replace(/_/g, " ")}</strong>
                <span>{Array.isArray(value) ? value.join(" · ") : String(value)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-luxury"
            onClick={() => {
              onResolved?.(resolved);
              onClose?.();
            }}
          >
            <Icon name="plane" size={16} /> Send to the wizard
          </button>
        </section>
      ) : (
        renderQuestion()
      )}

      <footer className="voting-lobby__footer">
        {session.requester_is_host && !resolved ? (
          <>
            <button type="button" className="btn-outline-luxury" onClick={() => advance(-1)} disabled={session.current_step <= 1}>
              <Icon name="arrowLeft" size={16} /> Previous
            </button>
            {session.current_step < QUESTIONS.length ? (
              <button type="button" className="btn-luxury" onClick={() => advance(1)}>
                Next question <Icon name="arrowRight" size={16} />
              </button>
            ) : (
              <button type="button" className="btn-luxury" onClick={resolveLobby}>
                <Icon name="check" size={16} /> Resolve & generate
              </button>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Waiting for the host to advance the lobby…</p>
        )}
      </footer>

      <button
        type="button"
        className="top-action-link voting-lobby__skip"
        onClick={() => {
          stopPolling();
          onClose?.();
        }}
      >
        <Icon name="close" size={14} /> Leave lobby
      </button>

      {error ? <p className="error-banner" style={{ marginTop: 18 }}>{error}</p> : null}
    </section>
  );
}
