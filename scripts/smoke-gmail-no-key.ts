import "./load-local-env";

const gmailEnvKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_GMAIL_SCOPES",
  "GMAIL_ENCRYPTION_KEY",
  "GMAIL_SENDER_EMAIL",
] as const;

const tokenEnvNamePattern = /^(GMAIL|GOOGLE).*(_ACCESS_TOKEN|_REFRESH_TOKEN|_OAUTH_TOKEN|_TOKEN)$/i;

const missingGmailEnv = gmailEnvKeys.filter((key) => !present(process.env[key]));
const tokenLikeEnvNames = Object.keys(process.env)
  .filter((key) => tokenEnvNamePattern.test(key))
  .sort();

if (missingGmailEnv.length === 0) {
  console.log("Gmail client env is present; this no-key smoke did not attempt OAuth, draft creation, or send.");
} else {
  console.log(`Gmail provider unavailable without env: ${missingGmailEnv.join(", ")}`);
}

if (tokenLikeEnvNames.length > 0) {
  console.error(`Plaintext Gmail/Google OAuth token env names detected: ${tokenLikeEnvNames.join(", ")}`);
  console.error("OAuth access/refresh tokens must be encrypted at rest and never committed, logged, or exposed.");
  process.exitCode = 1;
} else {
  console.log("No plaintext Gmail/Google OAuth token env names detected.");
}

console.log("No Gmail API call was attempted.");
console.log("No fake Gmail draft id, message id, provider execution id, reply, or delivery outcome was produced.");
console.log("Approved live smoke remains opt-in: create exactly one draft or send exactly one approved test message only after explicit credentials and recipient are configured.");

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
