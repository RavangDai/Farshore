# Farshore security model

Better Auth manages password hashing, verification tokens, password resets, and MongoDB-backed sessions. Private routes validate the session and require a verified email. Browser-supplied user IDs and identity headers never authorize operations. Session tokens stay in HttpOnly cookies; the Farshore auth facade returns player metadata rather than the token.

Passwords require 12 to 128 characters and are hashed by Better Auth's scrypt implementation. Email confirmation is required before login. Password resets require a valid single-use token and revoke existing sessions. No guest request can read or modify another player's account settings.

Every MongoDB account query includes the user ID derived from the validated session. No caller can provide MongoDB filters or operators. Unique indexes enforce account email, session token, per-player campaign, and per-player request IDs. MongoDB is a server-only dependency. Database access is limited through the deployment's credentials and network settings.

Writes require an exact same-origin Origin header and JSON content, reject cross-site and same-site fetches, and bound body sizes. Strict schemas allow only supported account and game commands. Better Auth also checks trusted origins for verification and recovery redirects. Authentication and application rate limits use atomic MongoDB counters, with TTL cleanup. The public host must supply trusted client IP headers through its reverse proxy.

Provider keys are encrypted server-side with AES-256-GCM, a fresh IV, and the account ID as authenticated context. Only ciphertext and a suffix are stored; responses contain safe metadata. The encryption master key remains a stable server secret. Error responses do not contain credentials.

Model endpoints are fixed provider URLs. The player cannot choose an arbitrary server-fetch target. Loopback Ollama and the existing machine-wide local model configuration are allowed only in development. Each model request receives its own connection object so simultaneous players cannot exchange credentials through process-wide settings.

Responses use a nonce-based script CSP, nosniff, no-referrer, restricted browser permissions, and production HSTS. Private/API responses are not cached. The existing game uses inline styles; inline scripts require the per-request nonce.

Progress uses optimistic revisions and durable request receipts. MongoDB transactions commit each save and receipt together. Retries are idempotent and stale updates are rejected. Pending browser commands are scoped to the account and contain no provider keys or passwords.

Personal progress is client-reported. Competitive rankings and multiplayer need server-verified game results. The app has no such leaderboard or multiplayer system yet.

Production requires MongoDB configured as a replica set, HTTPS, real SMTP delivery, stable secrets, protected network access, and backups. Local tests use a temporary replica set and captured emails. They do not establish that a public deployment or external account services are configured.

References: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit), [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).
