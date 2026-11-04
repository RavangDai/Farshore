import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { createIndexes } from "../server/lib/mongodb.ts";
import { progressRepository } from "../server/lib/progress-repository.ts";
import { consumeLimit } from "../server/lib/rate-limit.ts";
import { createAuth } from "../server/lib/auth.ts";
import { createAuthApi } from "../server/auth-api.ts";
import { accountsConfigured, authMethods } from "../server/lib/runtime-config.ts";
import { readAiRow, safeSettings } from "../server/lib/ai-account.ts";
import { newArcade } from "../src/lib/arcade/arcade.ts";
import { defaultPreferences } from "../src/lib/online/online.ts";
import { encryptSecret, decryptSecret } from "../server/lib/secrets.ts";
import { RevisionConflict, RequestConflict } from "../server/progress-api.ts";

let server, client, db, auth, googleAuth;
const mail = [];
const origin = "https://farshore.test";
const secret = "integration-only-secret-with-at-least-32-characters";
const google = { clientId: "farshore-test.apps.googleusercontent.com", clientSecret: "google-test-secret" };
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { downloadDir: ".tmp/mongodb-binaries" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  client = await new MongoClient(server.getUri()).connect();
  db = client.db("farshore_integration");
  await createIndexes(db);
  const sendMail = async message => { mail.push(message); };
  auth = createAuth({ db, client, secret, baseURL: origin, sendMail });
  googleAuth = createAuth({ db, client, secret, baseURL: origin, sendMail, google });
});
after(async () => { await client?.close(); await server?.stop(); });

const repository = userId => progressRepository(db, client, userId);
const update = (revision = 0, requestId = crypto.randomUUID(), payloadHash = "a".repeat(64)) => ({
  requestId, expectedRevision: revision, payloadHash, save: { ...newArcade(), started: true }, preferences: defaultPreferences(),
});
async function request(path, body, cookie, ip = "192.0.2.1") {
  return auth.handler(new Request(origin + "/api/auth/" + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: { origin, "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
  }));
}
function cookieOf(response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }
async function startGoogle(instance, ip) {
  const response = await createAuthApi(instance, origin)(new Request(origin + "/api/auth", { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ action: "google" }) }));
  const data = await response.json();
  return { response, data, cookie: cookieOf(response), state: data.url && new URL(data.url).searchParams.get("state") };
}
function googleCallback(instance, state, cookie, ip) {
  return instance.handler(new Request(`${origin}/api/auth/callback/google?code=test-code&state=${state}`, { headers: { cookie, "x-forwarded-for": ip } }));
}
// Stands in for Google's token endpoint. The code flow reads the ID token it
// returns over TLS without checking a signature, so an unsigned one suffices.
async function withGoogleTokens(profile, run) {
  const realFetch = globalThis.fetch, exchanges = [];
  const now = Math.floor(Date.now() / 1000);
  const idToken = [{ alg: "RS256", kid: "test" }, { iss: "https://accounts.google.com", aud: google.clientId, iat: now, exp: now + 3600, email_verified: true, ...profile }]
    .map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".unsigned";
  globalThis.fetch = async (input, init) => {
    if (!String(input?.url ?? input).startsWith("https://oauth2.googleapis.com/token")) return realFetch(input, init);
    exchanges.push(new URLSearchParams(String(init.body)));
    return Response.json({ access_token: "google-access-token", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: idToken });
  };
  try { return await run(exchanges); } finally { globalThis.fetch = realFetch; }
}
const errorOf = response => new URL(response.headers.get("location")).searchParams.get("error");

test("MongoDB indexes enforce one campaign per player and durable per-player request IDs", async () => {
  const campaigns = await db.collection("campaigns").indexes();
  assert.ok(campaigns.some(index => index.unique && index.key.userId === 1));
  const receipts = await db.collection("saveRequests").indexes();
  assert.ok(receipts.some(index => index.unique && index.key.userId === 1 && index.key.requestId === 1));
  const limits = await db.collection("requestLimits").indexes();
  assert.ok(limits.some(index => index.expireAfterSeconds === 0));
});
test("MongoDB repositories isolate players and retrying a save cannot apply it twice", async () => {
  const alice = repository("alice"), bob = repository("bob");
  await alice.load(); await bob.load();
  const input = update();
  assert.equal((await alice.commit(input)).revision, 1);
  assert.equal((await alice.commit(input)).revision, 1);
  assert.equal((await bob.load()).save.started, false);
  assert.equal(await bob.previous(input.requestId), null);
  await assert.rejects(() => alice.commit({ ...input, payloadHash: "b".repeat(64) }), RequestConflict);
  await assert.rejects(() => alice.commit(update()), RevisionConflict);
});
test("MongoDB transactions serialize simultaneous saves and roll back invalid changes", async () => {
  const repo = repository("concurrent"); await repo.load();
  const results = await Promise.allSettled([repo.commit(update()), repo.commit(update())]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await repo.load()).revision, 1);
  assert.equal(await db.collection("saveRequests").countDocuments({ userId: "concurrent" }), 1);
  await assert.rejects(() => repo.commit({ ...update(1), preferences: { revision: 900 } }));
  assert.equal((await repo.load()).revision, 1);
  assert.equal(await db.collection("saveRequests").countDocuments({ userId: "concurrent" }), 1);
});
test("simultaneous duplicate MongoDB commands produce one revision and one receipt", async () => {
  const repo = repository("duplicate"); await repo.load(); const input = update();
  const results = await Promise.all([repo.commit(input), repo.commit(input)]);
  assert.ok(results.every(result => result.revision === 1));
  assert.equal(await db.collection("saveRequests").countDocuments({ userId: "duplicate" }), 1);
});
test("MongoDB rate limits hold under concurrent requests and expire by bucket", async () => {
  const now = 1800000000000;
  const results = await Promise.all(Array.from({ length: 30 }, () => consumeLimit(db, "test:limit", 6, 60, now)));
  assert.equal(results.filter(Boolean).length, 6);
  assert.equal(await consumeLimit(db, "test:limit", 6, 60, now + 60000), true);
});
test("encrypted AI rows remain private and public metadata never includes credentials", async () => {
  const master = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const key = "provider-key-only-for-this-test";
  const encryptedKey = await encryptSecret(key, "alice", master);
  await db.collection("aiSettings").insertOne({ userId: "alice", provider: "groq", model: "test-model", encryptedKey, keySuffix: key.slice(-4), enabled: true, updatedAt: new Date().toISOString() });
  assert.equal(await readAiRow(db, "bob"), null);
  const stored = await readAiRow(db, "alice");
  assert.ok(!JSON.stringify(stored).includes(key));
  assert.ok(!JSON.stringify(safeSettings(stored)).includes(encryptedKey));
  assert.equal(await decryptSecret(stored.encryptedKey, "alice", master), key);
  await assert.rejects(() => decryptSecret(stored.encryptedKey, "bob", master));
});
test("Better Auth verifies email, hashes passwords, validates sessions, and revokes logout", async () => {
  const email = "captain@example.test", password = "a-long-test-password-123";
  const signup = await request("sign-up/email", { name: "Captain", email, password, callbackURL: origin }, null, "192.0.2.10");
  assert.equal(signup.status, 200);
  assert.equal(cookieOf(signup), "");
  const user = await db.collection("user").findOne({ email });
  assert.equal(user.emailVerified, false);
  const credential = await db.collection("account").findOne({ providerId: "credential", userId: user._id });
  assert.ok(credential.password && !credential.password.includes(password));
  assert.equal((await request("sign-in/email", { email, password }, null, "192.0.2.11")).status, 403);
  const verification = mail.find(message => message.to === email && message.subject.includes("Confirm"));
  assert.ok(verification);
  const url = verification.text.match(/https:\/\/\S+/)[0];
  const verified = await auth.handler(new Request(url));
  assert.ok(verified.status === 302 || verified.status === 200);
  assert.equal((await db.collection("user").findOne({ email })).emailVerified, true);
  const login = await request("sign-in/email", { email, password }, null, "192.0.2.12");
  assert.equal(login.status, 200);
  assert.ok(login.headers.getSetCookie().every(value => /httponly/i.test(value) && /secure/i.test(value) && /samesite=lax/i.test(value)));
  const cookie = cookieOf(login);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session.user.email, email);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: "__Secure-farshore.session_token=forged" }) }), null);
  assert.equal((await request("sign-out", {}, cookie)).status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
});
test("Better Auth reset links are single-use, change the password, and revoke old sessions", async () => {
  const email = "captain@example.test";
  const login = await request("sign-in/email", { email, password: "a-long-test-password-123" }, null, "192.0.2.20");
  const cookie = cookieOf(login);
  const reset = await request("request-password-reset", { email, redirectTo: origin + "/account/reset-password" }, null, "192.0.2.21");
  assert.equal(reset.status, 200);
  const message = mail.find(message => message.subject.includes("Reset"));
  const link = new URL(message.text.match(/https:\/\/\S+/)[0]);
  const redirect = await auth.handler(new Request(link));
  assert.equal(redirect.status, 302);
  const token = new URL(redirect.headers.get("location")).searchParams.get("token");
  const body = { token, newPassword: "another-long-test-password-123" };
  assert.equal((await request("reset-password", body, null, "192.0.2.22")).status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  assert.equal((await request("reset-password", body, null, "192.0.2.23")).status, 400);
  assert.equal((await request("sign-in/email", { email, password: body.newPassword }, null, "192.0.2.24")).status, 200);
});
test("Better Auth rejects cross-origin signup and rate-limits repeated sign-ins in MongoDB", async () => {
  const cross = new Request(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: JSON.stringify({ name: "Attacker", email: "attacker@example.test", password: "long-test-password" }) });
  assert.equal((await auth.handler(cross)).status, 403);
  const results = [];
  for (let i = 0; i < 6; i++) results.push((await request("sign-in/email", { email: "missing@example.test", password: "wrong-long-password" }, null, "192.0.2.30")).status);
  assert.equal(results[5], 429);
});
test("Farshore's auth facade forwards session cookies without exposing tokens and validates reset inputs", async () => {
  const api = createAuthApi(auth, origin);
  const call = body => api(new Request(origin + "/api/auth", { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": "192.0.2.40" }, body: JSON.stringify(body) }));
  const login = await call({ action: "login", email: "captain@example.test", password: "another-long-test-password-123" });
  assert.equal(login.status, 200);
  const data = await login.json();
  assert.deepEqual(Object.keys(data), ["player"]);
  assert.equal(data.player.email, "captain@example.test");
  assert.equal("token" in data, false);
  const cookie = cookieOf(login);
  assert.ok(cookie.includes("farshore.session_token"));
  assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
  assert.equal((await call({ action: "password", password: "new-long-test-password" })).status, 400);
  assert.equal((await call({ action: "login", email: "captain@example.test", password: "another-long-test-password-123", userId: "someone-else" })).status, 400);
  const logout = await api(new Request(origin + "/api/auth", { method: "POST", headers: { origin, cookie, "content-type": "application/json", "x-forwarded-for": "192.0.2.40" }, body: JSON.stringify({ action: "logout" }) }));
  assert.equal(logout.status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
});
test("Google sign-in starts at Google with PKCE and a signed state cookie, and returns no tokens", async () => {
  const { response, data, cookie, state } = await startGoogle(googleAuth, "192.0.2.50");
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(data), ["url"]);
  const url = new URL(data.url);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), google.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), origin + "/api/auth/callback/google");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(state);
  assert.ok(cookie.includes("farshore.state="));
  assert.ok(response.headers.getSetCookie().every(value => /httponly/i.test(value) && /secure/i.test(value) && /samesite=lax/i.test(value)));
  const extra = await createAuthApi(googleAuth, origin)(new Request(origin + "/api/auth", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ action: "google", provider: "github" }) }));
  assert.equal(extra.status, 400);
  assert.equal((await startGoogle(auth, "192.0.2.50")).response.status, 400);
});
test("Google callback signs in a verified player only in the browser that started it", async () => {
  const profile = { sub: "google-sailor-1", email: "sailor@gmail.test", name: "Penelope of Ithaca" };
  await withGoogleTokens(profile, async exchanges => {
    const elsewhere = await startGoogle(googleAuth, "192.0.2.51");
    const replay = await googleCallback(googleAuth, elsewhere.state, "", "192.0.2.51");
    assert.equal(replay.status, 302);
    assert.equal(new URL(replay.headers.get("location")).searchParams.get("auth"), "google");
    assert.equal(errorOf(replay), "state_mismatch");
    assert.equal(cookieOf(replay).includes("session_token"), false);
    assert.equal(exchanges.length, 0);
    const start = await startGoogle(googleAuth, "192.0.2.51");
    const done = await googleCallback(googleAuth, start.state, start.cookie, "192.0.2.51");
    assert.equal(done.status, 302);
    assert.equal(done.headers.get("location"), origin + "/");
    assert.equal(exchanges.length, 1);
    assert.ok(exchanges[0].get("code_verifier"));
    assert.equal(exchanges[0].get("redirect_uri"), origin + "/api/auth/callback/google");
    const session = await googleAuth.api.getSession({ headers: new Headers({ cookie: cookieOf(done) }) });
    assert.equal(session.user.email, profile.email);
    assert.equal(session.user.emailVerified, true);
    assert.equal(session.user.name, "Penelope of Ithaca");
    const again = await googleCallback(googleAuth, start.state, start.cookie, "192.0.2.51");
    assert.equal(cookieOf(again).includes("session_token"), false);
  });
});
test("Google sign-in joins a confirmed password account instead of creating a second player", async () => {
  const email = "captain@example.test", existing = await db.collection("user").findOne({ email });
  assert.equal(existing.emailVerified, true);
  await withGoogleTokens({ sub: "google-captain-1", email, name: "Someone Else" }, async () => {
    const start = await startGoogle(googleAuth, "192.0.2.52");
    const done = await googleCallback(googleAuth, start.state, start.cookie, "192.0.2.52");
    assert.equal(done.headers.get("location"), origin + "/");
    const session = await googleAuth.api.getSession({ headers: new Headers({ cookie: cookieOf(done) }) });
    assert.equal(session.user.id, existing._id.toString());
    assert.equal(session.user.name, "Captain");
  });
  assert.equal(await db.collection("user").countDocuments({ email }), 1);
  assert.equal(await db.collection("account").countDocuments({ userId: existing._id, providerId: "google" }), 1);
});
test("Google sign-in cannot take over an unconfirmed password account with the same email", async () => {
  const email = "squatted@gmail.test";
  assert.equal((await request("sign-up/email", { name: "Squatter", email, password: "squatter-long-password-1", callbackURL: origin }, null, "192.0.2.53")).status, 200);
  await withGoogleTokens({ sub: "google-owner-1", email, name: "Real Owner" }, async () => {
    const start = await startGoogle(googleAuth, "192.0.2.54");
    const result = await googleCallback(googleAuth, start.state, start.cookie, "192.0.2.54");
    assert.equal(errorOf(result), "account_not_linked");
    assert.equal(cookieOf(result).includes("session_token"), false);
  });
  const user = await db.collection("user").findOne({ email });
  assert.equal(user.emailVerified, false);
  assert.equal(await db.collection("account").countDocuments({ userId: user._id, providerId: "google" }), 0);
});
test("accounts turn on with Google alone, while email accounts still need mail delivery", () => {
  const keys = ["MONGODB_URI", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "SMTP_HOST", "MAIL_FROM", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, { MONGODB_URI: "mongodb://db.test", BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: google.clientId, GOOGLE_CLIENT_SECRET: google.clientSecret });
    assert.deepEqual(authMethods(), { email: false, google: true });
    assert.equal(accountsConfigured(), true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(accountsConfigured(), false);
    Object.assign(process.env, { SMTP_HOST: "smtp.test", MAIL_FROM: "Farshore <voyage@farshore.test>" });
    assert.deepEqual(authMethods(), { email: true, google: false });
    assert.equal(accountsConfigured(), true);
  } finally {
    for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
test("Google-only accounts need no email delivery and keep display names short and printable", async () => {
  const googleOnly = createAuth({ db, client, secret, baseURL: origin, google });
  const signup = await googleOnly.handler(new Request(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": "192.0.2.55" }, body: JSON.stringify({ name: "Nobody", email: "nobody@example.test", password: "a-long-test-password-123" }) }));
  assert.notEqual(signup.status, 200);
  assert.equal(await db.collection("user").countDocuments({ email: "nobody@example.test" }), 0);
  await withGoogleTokens({ sub: "google-sailor-2", email: "long-name@gmail.test", name: "\u0007" + "A".repeat(60) }, async () => {
    const start = await startGoogle(googleOnly, "192.0.2.56");
    const done = await googleCallback(googleOnly, start.state, start.cookie, "192.0.2.56");
    const session = await googleOnly.api.getSession({ headers: new Headers({ cookie: cookieOf(done) }) });
    assert.equal(session.user.name, "A".repeat(40));
  });
});
