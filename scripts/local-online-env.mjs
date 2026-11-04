import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
// The development env files, later ones winning; the real environment wins over all.
export function readLocalEnvironment() {
  const local = {};
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"])
    if (fs.existsSync(file)) Object.assign(local, parseEnv(fs.readFileSync(file, "utf8")));
  return { ...local, ...process.env };
}
export function prepareLocalEnvironment() {
  // Reuse the ignored local secret created by the earlier preview.
  const current = {};
  if (fs.existsSync(".dev.vars")) {
    for (const line of fs.readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
      const match = /^(FARSHORE_[A-Z_]+|BETTER_AUTH_SECRET)=(.*)$/.exec(line);
      if (!match) continue;
      try { current[match[1]] = JSON.parse(match[2]); } catch { current[match[1]] = match[2]; }
    }
  }
  const local = { ...current, ...readLocalEnvironment() };
  local.FARSHORE_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
  local.BETTER_AUTH_SECRET ||= randomBytes(48).toString("base64");
  fs.writeFileSync(".dev.vars", ["FARSHORE_ENCRYPTION_KEY", "BETTER_AUTH_SECRET"].map(key => `${key}=${JSON.stringify(local[key])}`).join("\n") + "\n", { mode: 0o600 });
  for (const [key, value] of Object.entries(local)) if (process.env[key] === undefined) process.env[key] = value;
}
