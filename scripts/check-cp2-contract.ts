import "./load-local-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve("db/migrations/0001_core_cash_management_schema.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const requiredSnippets = [
  ["source_files table", "create table if not exists source_files"],
  ["source_files idempotency", "constraint source_files_tenant_idempotency_unique"],
  ["source_files S3 object uniqueness", "constraint source_files_tenant_storage_unique"],
  ["source_files sha256 check", "constraint source_files_sha256_check"],
  ["source_files upload states", "constraint source_files_upload_state_check"],
  ["import_batches table", "create table if not exists import_batches"],
  ["import_batches state check", "constraint import_batches_state_check"],
  ["import_batch_rows table", "create table if not exists import_batch_rows"],
  ["event_inbox table", "create table if not exists event_inbox"],
  ["event_inbox idempotency", "constraint event_inbox_tenant_idempotency_unique"],
  ["event_inbox states", "constraint event_inbox_state_check"],
  ["event_inbox ready index", "event_inbox_ready_idx"],
  ["event_ledger table", "create table if not exists event_ledger"],
  ["event_ledger idempotency", "constraint event_ledger_tenant_idempotency_unique"],
] as const;

const liveEnvKeys = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

const optionalProviderKeys = [
  "FIREWORKS_API_KEY",
  "LANGSMITH_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GMAIL_ENCRYPTION_KEY",
  "ELEVENLABS_API_KEY",
  "TWILIO_ACCOUNT_SID",
] as const;

let failed = false;

for (const [label, snippet] of requiredSnippets) {
  if (!migrationSql.includes(snippet)) {
    failed = true;
    console.error(`missing CP2 schema contract: ${label}`);
  } else {
    console.log(`ok CP2 schema contract: ${label}`);
  }
}

const missingLiveEnv = liveEnvKeys.filter((key) => !present(process.env[key]));

if (missingLiveEnv.length > 0) {
  console.log(`CP2 live ingestion unavailable without env: ${missingLiveEnv.join(", ")}`);
  console.log("This is the expected no-key posture for local/offline smoke.");
} else {
  console.log("CP2 live ingestion env appears present for Aurora/S3 smoke.");
}

const missingOptionalProviders = optionalProviderKeys.filter((key) => !present(process.env[key]));

if (missingOptionalProviders.length > 0) {
  console.log(`Optional post-CP2 provider keys not required: ${missingOptionalProviders.join(", ")}`);
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 2 offline contract check passed.");
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
