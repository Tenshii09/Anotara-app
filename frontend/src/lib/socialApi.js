import { apiRequest } from "./apiClient";

/* -------------------------------------------------------------------------- */
/* Friends                                                                    */
/* -------------------------------------------------------------------------- */

export function getFriends(token) {
  return apiRequest("/api/friends", { token });
}

export function searchFriends(token, query, limit = 8) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiRequest(`/api/friends/search?${params.toString()}`, { token });
}

export function sendFriendRequest(token, userId) {
  return apiRequest("/api/friends/requests", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}

export function respondToFriendRequest(token, friendshipId, decision) {
  return apiRequest(`/api/friends/requests/${friendshipId}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

export function removeFriend(token, friendId) {
  return apiRequest(`/api/friends/${friendId}`, {
    token,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* Collaborators / The Flock                                                  */
/* -------------------------------------------------------------------------- */

export function getCollaborators(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}/collaborators`, { token });
}

export function addCollaborator(token, itineraryId, userId, role = "editor") {
  return apiRequest(`/api/itineraries/${itineraryId}/collaborators`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, role }),
  });
}

export function removeCollaborator(token, itineraryId, userId) {
  return apiRequest(`/api/itineraries/${itineraryId}/collaborators/${userId}`, {
    token,
    method: "DELETE",
  });
}

export function pingTripPresence(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}/presence`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function getTripActivity(token, itineraryId, sinceId) {
  const params = new URLSearchParams();
  if (sinceId !== undefined && sinceId !== null) params.set("since", String(sinceId));
  const query = params.toString();
  return apiRequest(`/api/itineraries/${itineraryId}/activity${query ? `?${query}` : ""}`, {
    token,
  });
}

export function postTripActivity(token, itineraryId, action, payload = {}) {
  return apiRequest(`/api/itineraries/${itineraryId}/activity`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
}

/* -------------------------------------------------------------------------- */
/* Voting Room (Tara Na!)                                                     */
/* -------------------------------------------------------------------------- */

export function createVoteSession(token) {
  return apiRequest("/api/vote-sessions", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function joinVoteSession(token, sessionCode) {
  return apiRequest("/api/vote-sessions/join", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_code: sessionCode }),
  });
}

export function getVoteSession(token, sessionId) {
  return apiRequest(`/api/vote-sessions/${sessionId}`, { token });
}

export function submitVote(token, sessionId, questionKey, response) {
  return apiRequest(`/api/vote-sessions/${sessionId}/vote`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_key: questionKey, response }),
  });
}

export function advanceVoteSession(token, sessionId, payload) {
  return apiRequest(`/api/vote-sessions/${sessionId}/advance`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export function resolveVoteSession(token, sessionId) {
  return apiRequest(`/api/vote-sessions/${sessionId}/resolve`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

/* -------------------------------------------------------------------------- */
/* Interactive Memory Log                                                     */
/* -------------------------------------------------------------------------- */

export function getItemMemories(token, itineraryId, itemId) {
  return apiRequest(`/api/itineraries/${itineraryId}/items/${itemId}/memories`, { token });
}

export function getAllMemories(token, itineraryId) {
  return apiRequest(`/api/itineraries/${itineraryId}/memories`, { token });
}

export function addMemory(token, itineraryId, itemId, { kind, note, imageData, mimeType } = {}) {
  return apiRequest(`/api/itineraries/${itineraryId}/items/${itemId}/memories`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      note: note || null,
      image_data: imageData || null,
      mime_type: mimeType || null,
    }),
  });
}

export function deleteMemory(token, memoryId) {
  return apiRequest(`/api/memories/${memoryId}`, {
    token,
    method: "DELETE",
  });
}

/* -------------------------------------------------------------------------- */
/* Apex Hotel Recommendation                                                  */
/* -------------------------------------------------------------------------- */

export function getHotelRecommendation(token, itineraryId, dayNumber, { refresh = false, budget } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "1");
  if (budget) params.set("budget", budget);
  const query = params.toString();
  return apiRequest(
    `/api/itineraries/${itineraryId}/hotels/${dayNumber}${query ? `?${query}` : ""}`,
    { token },
  );
}
