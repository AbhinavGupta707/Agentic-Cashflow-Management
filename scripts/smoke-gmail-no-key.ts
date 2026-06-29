import "./load-local-env";

import { buildGmailRawMessage } from "../src/server/providers/gmail-mime";
import { createGmailAuthorizationUrl } from "../src/server/providers/gmail-oauth";
import { getGmailProviderStatus } from "../src/server/providers/gmail";
import { decryptGmailToken, encryptGmailToken } from "../src/server/providers/gmail-tokens";

async function main() {
  const noKeyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: "",
    GMAIL_ENCRYPTION_KEY: "",
    GOOGLE_GMAIL_SCOPES: "",
  };

  const startNoKey = createGmailAuthorizationUrl({ env: noKeyEnv });
  assert(startNoKey.status === "unavailable", "Gmail OAuth start should be unavailable without keys.");
  assert(
    startNoKey.missingEnv.includes("GOOGLE_CLIENT_ID") &&
      startNoKey.missingEnv.includes("GOOGLE_CLIENT_SECRET") &&
      startNoKey.missingEnv.includes("GOOGLE_REDIRECT_URI") &&
      startNoKey.missingEnv.includes("GMAIL_ENCRYPTION_KEY"),
    "Gmail OAuth start should report all missing required env names.",
  );
  console.log(`ok Gmail no-key OAuth start reports missing env: ${startNoKey.missingEnv.join(", ")}`);

  const noKeyStatus = await getGmailProviderStatus({ env: noKeyEnv });
  assert(noKeyStatus.status === "unavailable", "Gmail status should be unavailable without keys.");
  assert(noKeyStatus.reason === "no-key", "Gmail status should use no-key reason without config.");
  console.log("ok Gmail status reports no-key without OAuth config.");

  const configuredEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "https://example.test/api/gmail/oauth/callback",
    GMAIL_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    GOOGLE_GMAIL_SCOPES: "",
  };
  const startConfigured = createGmailAuthorizationUrl({
    env: configuredEnv,
    tenantId: "00000000-0000-4000-8000-000000000001",
    now: new Date("2026-06-29T12:00:00.000Z"),
  });
  assert(startConfigured.status === "ok", "Gmail OAuth start should create a URL when config is present.");
  assert(
    startConfigured.scopes.includes("https://www.googleapis.com/auth/gmail.compose"),
    "Default Gmail scope should be gmail.compose.",
  );
  assert(
    startConfigured.authorizationUrl.includes("access_type=offline"),
    "Gmail OAuth URL should request offline access.",
  );
  console.log("ok Gmail configured OAuth start builds an offline gmail.compose authorization URL.");

  const noTokenStatus = await getGmailProviderStatus({ env: configuredEnv, tenantId: undefined });
  assert(noTokenStatus.status === "unavailable", "Gmail status without tenant/token should be unavailable.");
  assert(noTokenStatus.reason === "no-token", "Gmail status without token should use no-token reason.");
  console.log("ok Gmail configured status reports no-token without a stored tenant connection.");

  const raw = buildGmailRawMessage({
    from: { email: "sender@example.test", name: "Cashflow Ops" },
    to: [{ email: "recipient@example.test" }],
    subject: "Payment follow-up",
    textBody: "Hello,\n\nThis is an approval-gated test draft.\n",
    date: new Date("2026-06-29T12:00:00.000Z"),
  });
  assert(!/[+/=]/.test(raw), "Gmail raw payload should be base64url encoded without +, /, or =.");
  console.log("ok Gmail MIME adapter returns base64url raw payload.");

  const encrypted = encryptGmailToken("test-token-value", configuredEnv.GMAIL_ENCRYPTION_KEY!);
  const decrypted = decryptGmailToken(encrypted, configuredEnv.GMAIL_ENCRYPTION_KEY!);
  assert(decrypted === "test-token-value", "Gmail token encryption should round-trip.");
  assert(!encrypted.includes("test-token-value"), "Encrypted Gmail token envelope must not contain plaintext token.");
  console.log("ok Gmail token helper encrypts without plaintext token leakage.");

  console.log("Gmail no-key/config smoke passed without Gmail network calls.");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
