import "./load-local-env";

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationsDir = resolve("db/migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(resolve(migrationsDir, fileName), "utf8"))
  .join("\n\n");

const schemaChecks = [
  {
    group: "approval-gated voice action",
    label: "actions include call_customer",
    pattern: /constraint\s+actions_type_check\s+check\s*\(\s*action_type\s+in\s*\([\s\S]*'call_customer'[\s\S]*\)\s*\)/i,
  },
  {
    group: "approval-gated voice action",
    label: "approval_records gate actions before execution",
    pattern: /create\s+table\s+if\s+not\s+exists\s+approval_records\s*\([\s\S]+action_id\s+uuid\s+not\s+null\s+references\s+actions\s*\(id\)[\s\S]+constraint\s+approval_records_state_check\s+check\s*\([\s\S]*'pending'[\s\S]*'approved'[\s\S]*'rejected'/i,
  },
  {
    group: "voice script handoff",
    label: "communication_drafts include voice_script channel",
    pattern: /constraint\s+communication_drafts_channel_check\s+check\s*\(\s*channel\s+in\s*\([\s\S]*'voice_script'[\s\S]*\)\s*\)/i,
  },
  {
    group: "voice message handoff",
    label: "communication_messages include voice channel",
    pattern: /constraint\s+communication_messages_channel_check\s+check\s*\(\s*channel\s+in\s*\([\s\S]*'voice'[\s\S]*\)\s*\)/i,
  },
  {
    group: "provider execution audit",
    label: "provider_executions track provider operation attempts",
    pattern: /create\s+table\s+if\s+not\s+exists\s+provider_executions\s*\([\s\S]+provider\s+text\s+not\s+null[\s\S]+operation\s+text\s+not\s+null[\s\S]+state\s+text\s+not\s+null[\s\S]+provider_execution_id\s+text/i,
  },
  {
    group: "provider execution audit",
    label: "provider_executions support failed unavailable outcomes",
    pattern: /constraint\s+provider_executions_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'running',\s*'succeeded',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+voice_calls\s*\(/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls action/customer/contact/provider links",
    pattern: /action_id\s+uuid\s+references\s+actions\s*\(id\)[\s\S]+customer_id\s+uuid\s+references\s+customers\s*\(id\)[\s\S]+contact_id\s+uuid\s+references\s+contacts\s*\(id\)[\s\S]+provider_execution_id\s+uuid\s+references\s+provider_executions\s*\(id\)/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls provider call id is nullable until a real provider returns one",
    pattern: /provider_call_id\s+text\s*,/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls tenant idempotency",
    pattern: /constraint\s+voice_calls_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls provider id uniqueness",
    pattern: /constraint\s+voice_calls_provider_unique\s+unique\s*\(\s*tenant_id\s*,\s*provider\s*,\s*provider_call_id\s*\)/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls outbound/inbound direction",
    pattern: /constraint\s+voice_calls_direction_check\s+check\s*\(\s*direction\s+in\s*\('outbound',\s*'inbound'\)\s*\)/i,
  },
  {
    group: "voice call persistence",
    label: "voice_calls lifecycle states",
    pattern: /constraint\s+voice_calls_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'ringing',\s*'in_progress',\s*'completed',\s*'no_answer',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "voice transcript persistence",
    label: "voice_transcripts table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+voice_transcripts\s*\(/i,
  },
  {
    group: "voice transcript persistence",
    label: "voice_transcripts call link and sequence uniqueness",
    pattern: /voice_call_id\s+uuid\s+not\s+null\s+references\s+voice_calls\s*\(id\)\s+on\s+delete\s+cascade[\s\S]+constraint\s+voice_transcripts_call_sequence_unique\s+unique\s*\(\s*tenant_id\s*,\s*voice_call_id\s*,\s*sequence_number\s*\)/i,
  },
  {
    group: "voice transcript persistence",
    label: "voice_transcripts speaker and confidence checks",
    pattern: /constraint\s+voice_transcripts_speaker_check\s+check\s*\(\s*speaker\s+in\s*\('agent',\s*'customer',\s*'system',\s*'unknown'\)\s*\)[\s\S]+constraint\s+voice_transcripts_confidence_check\s+check\s*\(\s*confidence\s+is\s+null\s+or\s+\(confidence\s+>=\s+0\s+and\s+confidence\s+<=\s+1\)\s*\)/i,
  },
  {
    group: "voice memory learning",
    label: "memory_chunks accept voice sources",
    pattern: /constraint\s+memory_chunks_source_check\s+check\s*\(\s*source_type\s+in\s*\([\s\S]*'voice_call'[\s\S]*'voice_transcript'[\s\S]*\)\s*\)/i,
  },
  {
    group: "voice query performance",
    label: "voice call and transcript indexes",
    pattern: /voice_calls_customer_idx[\s\S]+voice_transcripts_call_sequence_idx/i,
  },
] as const;

const liveAuroraEnvKeys = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
] as const;

const fireworksEnvKeys = ["FIREWORKS_API_KEY", "FIREWORKS_MODEL"] as const;
const langSmithEnvKeys = ["LANGSMITH_TRACING", "LANGSMITH_API_KEY", "LANGSMITH_PROJECT"] as const;
const twilioEnvKeys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] as const;
const twilioFromNumberAliases = ["TWILIO_FROM_NUMBER", "TWILIO_PHONE_NUMBER"] as const;
const elevenLabsEnvKeys = ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"] as const;

const providerIdLikePatterns = [
  ["fake Twilio call SID", /\bCA[0-9a-f]{32}\b/i],
  ["fake Twilio provider execution SID", /\bVE[0-9a-f]{32}\b/i],
  ["fake ElevenLabs history id", /\belevenlabs[-_](call|history|execution)[-_]?\d+/i],
  ["fake provider execution id literal", /providerExecutionId\s*:\s*["'](?:fake|mock|demo|test)[^"']*["']/i],
] as const;

let failed = false;

for (const check of schemaChecks) {
  if (!check.pattern.test(migrationSql)) {
    failed = true;
    console.error(`missing CP5 schema contract: ${check.group} - ${check.label}`);
  } else {
    console.log(`ok CP5 schema contract: ${check.group} - ${check.label}`);
  }
}

const missingLiveAuroraEnv = missingKeys(liveAuroraEnvKeys);
if (missingLiveAuroraEnv.length > 0) {
  console.log(`CP5 live Aurora voice persistence smoke unavailable without env: ${missingLiveAuroraEnv.join(", ")}`);
  console.log("This offline contract check did not call Aurora.");
}

reportOptionalProvider("Fireworks call-script generation", fireworksEnvKeys);
reportOptionalProvider("LangSmith tracing", langSmithEnvKeys);
reportTwilioProvider();
reportOptionalProvider("ElevenLabs voice synthesis", elevenLabsEnvKeys);

for (const [label, pattern] of providerIdLikePatterns) {
  if (pattern.test(migrationSql)) {
    failed = true;
    console.error(`forbidden CP5 hard-coded provider id pattern found in schema: ${label}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 5 offline contract check passed.");
  console.log("No live provider call was attempted and no fake voice provider IDs were accepted.");
}

function reportOptionalProvider(label: string, keys: readonly string[]): void {
  const missing = missingKeys(keys);
  if (missing.length > 0) {
    console.log(`${label} unavailable without env: ${missing.join(", ")}`);
    return;
  }

  console.log(`${label} env appears present; live smoke must use real provider adapters and explicit approval.`);
}

function reportTwilioProvider(): void {
  const missing = missingKeys(twilioEnvKeys);
  const hasFromNumber = twilioFromNumberAliases.some((key) => present(process.env[key]));
  const missingWithAlias = hasFromNumber ? missing : [...missing, "TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER"];

  if (missingWithAlias.length > 0) {
    console.log(`Twilio live voice unavailable without env: ${missingWithAlias.join(", ")}`);
    return;
  }

  console.log("Twilio live voice env appears present; live smoke must use explicit approval and TWILIO_TEST_TO_NUMBER.");
}

function missingKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !present(process.env[key]));
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
