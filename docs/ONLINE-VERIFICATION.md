# Farshore online verification

Verified locally on October 12, 2026, using Node 22.20.0 on Windows.

| Check | Result |
| --- | --- |
| Full automated suite | 117 tests passed; no failures or skipped tests |
| Production build | Next.js build and TypeScript checks passed |
| Original local build | Vite build passed; existing bundle-size warning remains |
| MongoDB integration | Temporary real replica set verified unique indexes, ownership-scoped records, transactions, concurrency, idempotency, and rate limits |
| Authentication | Better Auth verified email confirmation, scrypt password storage, signed session cookies, forged-cookie rejection, logout, single-use password reset, and session revocation |
| Auth facade | Login forwarded cookies while returning only player metadata; invalid reset and injected owner fields were rejected |
| Provider credentials | Encryption, owner binding, metadata redaction, and simultaneous per-player model connections passed |
| Local model | Ollama availability check passed; an actual Cyclops rival preparation returned HTTP 200 with an AI plan in about 14 seconds |
| Browser | Title screen, ordinary sign-in, and account creation rendered with the existing game styling |
| Production startup | Standalone server started and served game assets |
| Production HTTP policy | Game and password-reset scripts had matching CSP nonces; foreign-origin writes returned 403; an oversized game body returned 413 |
| Reverse proxy | Configured public-origin handling passed without trusting a caller's forwarded host header |

The account preview is saved at [output/online/account-preview.png](output/online/account-preview.png).

The MongoDB tests used temporary data. Verification and reset emails were captured in memory. No user MongoDB cluster, SMTP provider, or public deployment was provisioned. The Dockerfile is included; the Docker image was not built because the local Docker daemon was unavailable.

Configure the database, mail provider, public URL, and server secrets using [ONLINE-SETUP.md](ONLINE-SETUP.md). Then verify email delivery, saving between actual devices, and the selected hosted model provider on the deployed app.
