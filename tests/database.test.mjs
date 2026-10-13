import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { createIndexes } from "../lib/mongodb.ts";
import { progressRepository } from "../lib/progress-repository.ts";
import { consumeLimit } from "../lib/rate-limit.ts";
import { createAuth } from "../lib/auth.ts";
import { createAuthApi } from "../server/auth-api.ts";
import { readAiRow, safeSettings } from "../lib/ai-account.ts";
import { newArcade } from "../src/lib/arcade.ts";
import { defaultPreferences } from "../src/lib/online.ts";
import { encryptSecret, decryptSecret } from "../server/secrets.ts";
import { RevisionConflict, RequestConflict } from "../server/progress-api.ts";

let server, client, db, auth;
const mail = [];
const origin = "https://farshore.test";
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { downloadDir: ".tmp/mongodb-binaries" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  client = await new MongoClient(server.getUri()).connect();
  db = client.db("farshore_integration");
  await createIndexes(db);
  auth = createAuth({ db, client, secret: "integration-only-secret-with-at-least-32-characters", baseURL: origin,
    sendMail: async message => { mail.push(message); } });
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
