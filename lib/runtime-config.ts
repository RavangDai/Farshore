export function runtimeConfig() {
  const env = process.env;
  const local = env.NODE_ENV !== "production";
  return {
    mongoUri: env.MONGODB_URI,
    mongoDatabase: env.MONGODB_DATABASE || "farshore",
    authSecret: env.BETTER_AUTH_SECRET,
    appUrl: env.BETTER_AUTH_URL,
    encryptionKey: env.FARSHORE_ENCRYPTION_KEY,
    smtpHost: env.SMTP_HOST,
    smtpPort: Number(env.SMTP_PORT || 587),
    smtpSecure: env.SMTP_SECURE === "true",
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    mailFrom: env.MAIL_FROM,
    localModelUrl: local ? env.FARSHORE_MODEL_URL : undefined,
    localModelName: local ? env.FARSHORE_MODEL_NAME : undefined,
    localModelKey: local ? env.FARSHORE_API_KEY : undefined,
    local,
  };
}
export function accountsConfigured() {
  const c = runtimeConfig();
  return !!(c.mongoUri && c.authSecret && c.authSecret.length >= 32 && c.appUrl && c.smtpHost && c.mailFrom);
}
