# Farshore online setup

Farshore uses Next.js on Node, MongoDB for accounts and arcade progress, and Better Auth for email/password authentication. Players can save a private AI provider connection in their account. The five games, artwork, controls, and earlier game modes are retained.

Database setup is deferred as requested. With no database configured, the game works on the device and the account form explains that accounts are being set up. This repository is prepared for deployment; no public deployment or personal MongoDB database has been provisioned.

## Run the app

Use Node 22.13 or newer:

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000, or the address printed by the server. Use `npm.cmd run dev -- --port 53173` for a different port. Set `BETTER_AUTH_URL` to that same origin when enabling accounts.

Your existing `.env` local model configuration is preserved. Development startup generates stable local authentication and encryption secrets in ignored `.dev.vars` if they are absent. It reads `.env` and `.env.local` into server configuration. Production requires explicitly configured secrets and never generates them.

The original Vite edition runs with `npm.cmd run dev:offline` on port 5173. `npm.cmd run build:offline` writes `dist-offline/`; `npm.cmd run preview:offline` serves it on port 4173. Earlier mystery and advice modes remain available from Settings.

## Connect MongoDB later

1. Create a MongoDB Atlas cluster or use another MongoDB replica set. A standalone MongoDB process does not support the transactions this app requires. Atlas provides replica sets.
2. Create a dedicated database user with `readWrite` access to the Farshore database. Limit network access to the app host or development machine.
3. Copy [.env.example](.env.example) to an ignored `.env.local`. Add `MONGODB_URI`, `MONGODB_DATABASE`, and `BETTER_AUTH_URL`. For a hosted app, the URL must use HTTPS.
4. Add a random `BETTER_AUTH_SECRET` and a separate `FARSHORE_ENCRYPTION_KEY` containing 32 random bytes encoded as base64. Generate them locally; never send them in a chat or commit them.
5. Add your email provider's SMTP host, port, credentials, and sender address. Account verification and password recovery require real email delivery. Use port 465 with `SMTP_SECURE=true`, or your provider's STARTTLS settings on port 587.
6. Restart Farshore. The first account request creates the required unique and expiry indexes. Better Auth uses the same MongoDB database as the game.

Preserve the encryption key: replacing it makes existing saved provider keys unreadable. Keep the MongoDB URI, authentication secret, SMTP password, and encryption key in the host's server secret settings.

## Accounts and saving

Players create an account, confirm their email, sign in, reset a forgotten password using a single-use email link, and sign out. Signing in with the correct password also resends confirmation for an unverified email. Better Auth hashes passwords with scrypt and stores sessions in MongoDB. Session cookies are HttpOnly and SameSite=Lax; HTTPS deployments use Secure cookies. The server validates sessions for every private operation.

Signed-in arcade progress and preferences are stored under the verified account ID. A fresh account can import an existing device voyage. Guests keep device saves. The earlier mystery and advice modes currently keep their separate device saves.

Updates include an expected revision and a unique request ID. MongoDB transactions commit the save and receipt together. Retries do not count a completed round twice; a stale tab cannot overwrite another device's newer save. Pending updates are retained in an account-scoped browser queue with retry and conflict controls.

These are personal progress records. Round results come from the browser; they are not verified leaderboard scores. Multiplayer and competitive rankings require a server-owned match system.

## AI settings

Open **Account > AI connection**. Choose OpenAI, Groq, or OpenRouter, add the model ID and API key, save, then check the connection. The current model adapters request strict JSON-schema responses; the chosen model must support that format. A model-list check confirms availability, not a successful game generation.

Keys are encrypted with AES-256-GCM before storage, with the player ID bound to the ciphertext. Account responses contain only metadata and the key's last four characters. A blank replacement field preserves the saved key for the same provider. Changing providers requires a new key. The player can disable or remove the connection.

Local development also offers Ollama at `http://127.0.0.1:11434/v1`. The existing local configuration still works for guest play. A public server's localhost is the server itself, so it cannot access Ollama running on a visitor's laptop. Use a hosted provider for online model requests. Adaptive game rivals work without a provider key.

## Deploy to a Node host

This version needs a Node host with outbound MongoDB access, such as a container host or a Next.js-compatible Node service.

Configure the server environment variables from [.env.example](.env.example), use a public HTTPS origin for `BETTER_AUTH_URL`, and set `NODE_ENV=production`. The reverse proxy must replace client-supplied forwarding headers with the actual client IP, and the origin should only be reachable through that proxy. This lets authentication limits distinguish players without accepting forged IP headers.

For a standard Node service:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd start
```

The app listens on port 3000 by default; the host can set `PORT`. `/api/health` checks that the web process is running. It does not claim the database or mail provider is healthy.

The included [Dockerfile](Dockerfile) produces a standalone Next.js server and runs it as a non-root user. Supply secrets at runtime. Do not copy a local environment file into the image.

After deployment, check signup and email confirmation, login/logout, password reset, saving across two devices, rejected anonymous/private requests, and a real request with the chosen AI provider. Set up database backups and monitor server errors without logging passwords, reset links, or API keys.

## What is tested

The integration suite starts a temporary real MongoDB replica set and exercises the production indexes, transactions, concurrent saves, idempotency, rate limiting, encrypted keys, and Better Auth's email/session/reset behavior. Test emails are captured in memory; they do not prove your SMTP provider delivers email. The first test run may download a MongoDB test binary into ignored `.tmp/mongodb-binaries`.

The tests do not provision your Atlas account or publish the app. Live SMTP delivery and deployment checks remain dependent on your later configuration.

The completed local checks and their limits are recorded in [ONLINE-VERIFICATION.md](ONLINE-VERIFICATION.md).

References: [Better Auth's MongoDB adapter](https://better-auth.com/docs/adapters/mongodb), [email/password authentication](https://better-auth.com/docs/authentication/email-password), [MongoDB transaction requirements](https://www.mongodb.com/docs/manual/core/transactions/), [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).
