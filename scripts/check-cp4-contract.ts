import "./load-local-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve("db/migrations/0001_core_cash_management_schema.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const schemaChecks = [
  {
    group: "approval gate",
    label: "approval_records table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+approval_records\s*\(/i,
  },
  {
    group: "approval gate",
    label: "approval_records action cascade",
    pattern: /action_id\s+uuid\s+not\s+null\s+references\s+actions\s*\(id\)\s+on\s+delete\s+cascade/i,
  },
  {
    group: "approval gate",
    label: "approval_records pending/approved/rejected states",
    pattern:
      /constraint\s+approval_records_state_check\s+check\s*\(\s*state\s+in\s*\('pending',\s*'approved',\s*'rejected',\s*'expired',\s*'revoked'\)\s*\)/i,
  },
  {
    group: "approval gate",
    label: "approval_records decided_at consistency",
    pattern: /constraint\s+approval_records_decision_consistency_check\s+check\s*\([\s\S]+decided_at\s+is\s+not\s+null[\s\S]+pending[\s\S]+expired/i,
  },
  {
    group: "approval gate",
    label: "approval_records idempotency",
    pattern: /constraint\s+approval_records_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+communication_drafts\s*\(/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts action/customer/contact links",
    pattern:
      /action_id\s+uuid\s+references\s+actions\s*\(id\)[\s\S]+customer_id\s+uuid\s+references\s+customers\s*\(id\)[\s\S]+contact_id\s+uuid\s+references\s+contacts\s*\(id\)/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts channel includes email",
    pattern: /constraint\s+communication_drafts_channel_check\s+check\s*\(\s*channel\s+in\s*\('email',\s*'sms',\s*'voice_script',\s*'in_app'\)\s*\)/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts approval/send states",
    pattern:
      /constraint\s+communication_drafts_state_check\s+check\s*\(\s*state\s+in\s*\('draft',\s*'needs_approval',\s*'approved',\s*'rejected',\s*'queued',\s*'sent',\s*'archived'\)\s*\)/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts provider metadata",
    pattern: /provider\s+text[\s\S]+subject\s+text[\s\S]+body\s+text\s+not\s+null[\s\S]+metadata\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i,
  },
  {
    group: "email drafts",
    label: "communication_drafts idempotency",
    pattern: /constraint\s+communication_drafts_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "email messages",
    label: "communication_messages table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+communication_messages\s*\(/i,
  },
  {
    group: "email messages",
    label: "communication_messages draft/action/customer/contact links",
    pattern:
      /draft_id\s+uuid\s+references\s+communication_drafts\s*\(id\)[\s\S]+action_id\s+uuid\s+references\s+actions\s*\(id\)[\s\S]+customer_id\s+uuid\s+references\s+customers\s*\(id\)[\s\S]+contact_id\s+uuid\s+references\s+contacts\s*\(id\)/i,
  },
  {
    group: "email messages",
    label: "communication_messages email channel and outbound/inbound direction",
    pattern:
      /constraint\s+communication_messages_channel_check\s+check\s*\(\s*channel\s+in\s*\('email',\s*'sms',\s*'voice',\s*'in_app'\)\s*\)[\s\S]+constraint\s+communication_messages_direction_check\s+check\s*\(\s*direction\s+in\s*\('outbound',\s*'inbound'\)\s*\)/i,
  },
  {
    group: "email messages",
    label: "communication_messages send/reply/outcome states",
    pattern:
      /constraint\s+communication_messages_state_check\s+check\s*\(\s*state\s+in\s*\('created',\s*'queued',\s*'sent',\s*'delivered',\s*'received',\s*'bounced',\s*'failed',\s*'archived'\)\s*\)/i,
  },
  {
    group: "email messages",
    label: "communication_messages provider id uniqueness",
    pattern: /constraint\s+communication_messages_provider_unique\s+unique\s*\(\s*tenant_id\s*,\s*provider\s*,\s*provider_message_id\s*\)/i,
  },
  {
    group: "email messages",
    label: "communication_messages idempotency",
    pattern: /constraint\s+communication_messages_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "provider executions",
    label: "provider_executions table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+provider_executions\s*\(/i,
  },
  {
    group: "provider executions",
    label: "provider_executions action/draft/message links",
    pattern:
      /action_id\s+uuid\s+references\s+actions\s*\(id\)[\s\S]+draft_id\s+uuid\s+references\s+communication_drafts\s*\(id\)[\s\S]+message_id\s+uuid\s+references\s+communication_messages\s*\(id\)/i,
  },
  {
    group: "provider executions",
    label: "provider_executions operation payloads",
    pattern:
      /provider\s+text\s+not\s+null[\s\S]+operation\s+text\s+not\s+null[\s\S]+request_payload\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb[\s\S]+response_payload\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i,
  },
  {
    group: "provider executions",
    label: "provider_executions provider id uniqueness",
    pattern: /constraint\s+provider_executions_provider_unique\s+unique\s*\(\s*tenant_id\s*,\s*provider\s*,\s*provider_execution_id\s*\)/i,
  },
  {
    group: "provider executions",
    label: "provider_executions retry/error fields",
    pattern: /attempts\s+integer\s+not\s+null\s+default\s+0[\s\S]+last_error\s+text[\s\S]+constraint\s+provider_executions_attempts_check\s+check\s*\(\s*attempts\s+>=\s+0\s*\)/i,
  },
  {
    group: "provider executions",
    label: "provider_executions execution states",
    pattern: /constraint\s+provider_executions_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'running',\s*'succeeded',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "provider executions",
    label: "provider_executions idempotency",
    pattern: /constraint\s+provider_executions_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
] as const;

const providerConnectionChecks = [
  {
    label: "provider_connections table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+provider_connections\s*\(/i,
  },
  {
    label: "provider_connections provider identity",
    pattern: /provider\s+text\s+not\s+null[\s\S]+provider_account_id\s+text/i,
  },
  {
    label: "provider_connections encrypted token posture",
    pattern: /(encrypted_token|access_token_ciphertext|refresh_token_ciphertext|token_ciphertext)/i,
  },
  {
    label: "provider_connections state/status contract",
    pattern: /(state|status)\s+text\s+not\s+null/i,
  },
] as const;

const liveAuroraEnvKeys = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
] as const;

const gmailEnvKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_GMAIL_SCOPES",
  "GMAIL_ENCRYPTION_KEY",
  "GMAIL_SENDER_EMAIL",
] as const;

const allowedGmailScopes = new Set([
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
]);

const forbiddenBroadScopes = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.insert",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
] as const;

let failed = false;

for (const check of schemaChecks) {
  if (!check.pattern.test(migrationSql)) {
    failed = true;
    console.error(`missing CP4 schema contract: ${check.group} - ${check.label}`);
  } else {
    console.log(`ok CP4 schema contract: ${check.group} - ${check.label}`);
  }
}

if (/provider_connections/i.test(migrationSql)) {
  for (const check of providerConnectionChecks) {
    if (!check.pattern.test(migrationSql)) {
      failed = true;
      console.error(`missing CP4 provider connection schema contract: ${check.label}`);
    } else {
      console.log(`ok CP4 provider connection schema contract: ${check.label}`);
    }
  }
} else {
  console.log("No provider_connections schema found; CP4 provider backend lane may add it later.");
}

const missingLiveAuroraEnv = missingKeys(liveAuroraEnvKeys);
if (missingLiveAuroraEnv.length > 0) {
  console.log(`CP4 live Aurora smoke unavailable without env: ${missingLiveAuroraEnv.join(", ")}`);
  console.log("This offline contract check did not call Aurora.");
}

const missingGmailEnv = missingKeys(gmailEnvKeys);
if (missingGmailEnv.length > 0) {
  console.log(`Gmail live smoke unavailable without env: ${missingGmailEnv.join(", ")}`);
  console.log("Missing Gmail env is expected in no-key mode; no Gmail call was attempted.");
}

const configuredScopes = parseScopes(process.env.GOOGLE_GMAIL_SCOPES);
for (const scope of configuredScopes) {
  if (!allowedGmailScopes.has(scope)) {
    failed = true;
    console.error(`disallowed GOOGLE_GMAIL_SCOPES value for CP4: ${scope}`);
  }
}

const configuredForbiddenScopes = forbiddenBroadScopes.filter((scope) => configuredScopes.includes(scope));
if (configuredForbiddenScopes.length > 0) {
  failed = true;
  console.error(`broad Gmail scopes are forbidden for CP4: ${configuredForbiddenScopes.join(", ")}`);
}

if (configuredScopes.length > 0) {
  console.log(`CP4 Gmail scopes configured narrowly: ${configuredScopes.join(", ")}`);
} else {
  console.log("GOOGLE_GMAIL_SCOPES is not configured; live Gmail smoke remains disabled.");
}

if (hasLikelyPlaintextTokenEnv()) {
  failed = true;
  console.error("Plaintext OAuth token-like env names are present. Store Gmail OAuth tokens encrypted, not in env/logs/Git.");
} else {
  console.log("No plaintext Gmail OAuth token env names detected in this process.");
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 4 offline contract check passed.");
}

function missingKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !present(process.env[key]));
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseScopes(value: string | undefined): string[] {
  if (!present(value)) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function hasLikelyPlaintextTokenEnv(): boolean {
  const tokenEnvNamePattern = /^(GMAIL|GOOGLE).*(_ACCESS_TOKEN|_REFRESH_TOKEN|_OAUTH_TOKEN|_TOKEN)$/i;
  return Object.keys(process.env).some((key) => tokenEnvNamePattern.test(key));
}
