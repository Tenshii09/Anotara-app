import { apiRequest } from "./apiClient";

export function generateTotpSetup(challenge) {
  return apiRequest("/api/totp/generate", {
    method: "POST",
    skipAuthRefresh: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: challenge.userId,
      challenge_id: challenge.challengeId,
    }),
  });
}

export function enableTotp(challenge, secret, code) {
  return apiRequest("/api/totp/enable", {
    method: "POST",
    skipAuthRefresh: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: challenge.userId,
      challenge_id: challenge.challengeId,
      secret,
      code,
    }),
  });
}

export function verifyTotp(challenge, code) {
  return apiRequest("/api/totp/verify", {
    method: "POST",
    skipAuthRefresh: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: challenge.userId,
      challenge_id: challenge.challengeId,
      code,
    }),
  });
}
