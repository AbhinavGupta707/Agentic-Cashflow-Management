import "./load-local-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve("db/migrations/0001_core_cash_management_schema.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const schemaChecks = [
  {
    group: "forecast persistence",
    label: "forecast_runs table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+forecast_runs\s*\(/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_runs event-ledger provenance",
    pattern: /input_event_ledger_id\s+uuid\s+references\s+event_ledger\s*\(id\)/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_runs idempotency",
    pattern: /constraint\s+forecast_runs_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_runs state contract",
    pattern: /constraint\s+forecast_runs_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'running',\s*'completed',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_points table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+forecast_points\s*\(/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_points run foreign key",
    pattern: /forecast_run_id\s+uuid\s+not\s+null\s+references\s+forecast_runs\s*\(id\)\s+on\s+delete\s+cascade/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_points metric contract",
    pattern: /constraint\s+forecast_points_metric_check\s+check\s*\(\s*metric\s+in\s*\('cash_balance',\s*'expected_inflow',\s*'expected_outflow',\s*'net_cashflow',\s*'shortfall'\)\s*\)/i,
  },
  {
    group: "forecast persistence",
    label: "forecast_points replay uniqueness",
    pattern: /constraint\s+forecast_points_run_metric_date_unique\s+unique\s*\(\s*tenant_id\s*,\s*forecast_run_id\s*,\s*point_date\s*,\s*metric\s*,\s*cash_account_id\s*\)/i,
  },
  {
    group: "action planning",
    label: "action_plans table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+action_plans\s*\(/i,
  },
  {
    group: "action planning",
    label: "action_plans forecast link",
    pattern: /forecast_run_id\s+uuid\s+references\s+forecast_runs\s*\(id\)\s+on\s+delete\s+set\s+null/i,
  },
  {
    group: "action planning",
    label: "action_plans idempotency",
    pattern: /constraint\s+action_plans_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "action planning",
    label: "action_plans review states",
    pattern: /constraint\s+action_plans_state_check\s+check\s*\(\s*state\s+in\s*\('draft',\s*'ready_for_review',\s*'approved',\s*'active',\s*'completed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "action planning",
    label: "actions table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+actions\s*\(/i,
  },
  {
    group: "action planning",
    label: "actions plan/customer/invoice/obligation links",
    pattern: /action_plan_id\s+uuid\s+references\s+action_plans\s*\(id\)[\s\S]+customer_id\s+uuid\s+references\s+customers\s*\(id\)[\s\S]+invoice_id\s+uuid\s+references\s+invoices\s*\(id\)[\s\S]+obligation_id\s+uuid\s+references\s+obligations\s*\(id\)/i,
  },
  {
    group: "action planning",
    label: "actions idempotency",
    pattern: /constraint\s+actions_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "action planning",
    label: "actions proposed-to-execution states",
    pattern: /constraint\s+actions_state_check\s+check\s*\(\s*state\s+in\s*\('proposed',\s*'needs_approval',\s*'approved',\s*'rejected',\s*'scheduled',\s*'executing',\s*'completed',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "approval gate",
    label: "approval_records table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+approval_records\s*\(/i,
  },
  {
    group: "approval gate",
    label: "approval_records action link",
    pattern: /action_id\s+uuid\s+not\s+null\s+references\s+actions\s*\(id\)\s+on\s+delete\s+cascade/i,
  },
  {
    group: "approval gate",
    label: "approval_records idempotency",
    pattern: /constraint\s+approval_records_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "approval gate",
    label: "approval_records decision states",
    pattern: /constraint\s+approval_records_state_check\s+check\s*\(\s*state\s+in\s*\('pending',\s*'approved',\s*'rejected',\s*'expired',\s*'revoked'\)\s*\)/i,
  },
  {
    group: "agent graph",
    label: "agent_runs table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+agent_runs\s*\(/i,
  },
  {
    group: "agent graph",
    label: "agent_runs trace URL",
    pattern: /trace_url\s+text/i,
  },
  {
    group: "agent graph",
    label: "agent_runs idempotency",
    pattern: /constraint\s+agent_runs_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "agent graph",
    label: "agent_runs checkpoint-relevant kinds",
    pattern: /constraint\s+agent_runs_kind_check\s+check\s*\(\s*run_kind\s+in\s*\('ingestion',\s*'forecast',\s*'recommendation',\s*'approval',\s*'execution',\s*'learning',\s*'maintenance'\)\s*\)/i,
  },
  {
    group: "agent graph",
    label: "agent_runs waiting-for-approval state",
    pattern: /constraint\s+agent_runs_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'running',\s*'waiting_for_approval',\s*'completed',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
  {
    group: "agent graph",
    label: "agent_checkpoints table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+agent_checkpoints\s*\(/i,
  },
  {
    group: "agent graph",
    label: "agent_checkpoints run link",
    pattern: /agent_run_id\s+uuid\s+not\s+null\s+references\s+agent_runs\s*\(id\)\s+on\s+delete\s+cascade/i,
  },
  {
    group: "agent graph",
    label: "agent_checkpoints replay uniqueness",
    pattern: /constraint\s+agent_checkpoints_run_key_unique\s+unique\s*\(\s*tenant_id\s*,\s*agent_run_id\s*,\s*checkpoint_key\s*\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_drafts table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+communication_drafts\s*\(/i,
  },
  {
    group: "communication handoff",
    label: "communication_drafts action link",
    pattern: /action_id\s+uuid\s+references\s+actions\s*\(id\)\s+on\s+delete\s+set\s+null/i,
  },
  {
    group: "communication handoff",
    label: "communication_drafts agent run foreign key",
    pattern: /constraint\s+communication_drafts_agent_run_fk[\s\S]+foreign\s+key\s*\(\s*generated_by_agent_run_id\s*\)\s+references\s+agent_runs\s*\(id\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_drafts idempotency",
    pattern: /constraint\s+communication_drafts_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_drafts approval-ready states",
    pattern: /constraint\s+communication_drafts_state_check\s+check\s*\(\s*state\s+in\s*\('draft',\s*'needs_approval',\s*'approved',\s*'rejected',\s*'queued',\s*'sent',\s*'archived'\)\s*\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_messages table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+communication_messages\s*\(/i,
  },
  {
    group: "communication handoff",
    label: "communication_messages provider uniqueness",
    pattern: /constraint\s+communication_messages_provider_unique\s+unique\s*\(\s*tenant_id\s*,\s*provider\s*,\s*provider_message_id\s*\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_messages idempotency",
    pattern: /constraint\s+communication_messages_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "communication handoff",
    label: "communication_messages direction/state contract",
    pattern: /constraint\s+communication_messages_direction_check[\s\S]+constraint\s+communication_messages_state_check\s+check\s*\(\s*state\s+in\s*\('created',\s*'queued',\s*'sent',\s*'delivered',\s*'received',\s*'bounced',\s*'failed',\s*'archived'\)\s*\)/i,
  },
  {
    group: "provider handoff",
    label: "provider_executions table",
    pattern: /create\s+table\s+if\s+not\s+exists\s+provider_executions\s*\(/i,
  },
  {
    group: "provider handoff",
    label: "provider_executions action/draft/message links",
    pattern: /action_id\s+uuid\s+references\s+actions\s*\(id\)[\s\S]+draft_id\s+uuid\s+references\s+communication_drafts\s*\(id\)[\s\S]+message_id\s+uuid\s+references\s+communication_messages\s*\(id\)/i,
  },
  {
    group: "provider handoff",
    label: "provider_executions provider uniqueness",
    pattern: /constraint\s+provider_executions_provider_unique\s+unique\s*\(\s*tenant_id\s*,\s*provider\s*,\s*provider_execution_id\s*\)/i,
  },
  {
    group: "provider handoff",
    label: "provider_executions idempotency",
    pattern: /constraint\s+provider_executions_tenant_idempotency_unique\s+unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i,
  },
  {
    group: "provider handoff",
    label: "provider_executions execution states",
    pattern: /constraint\s+provider_executions_state_check\s+check\s*\(\s*state\s+in\s*\('queued',\s*'running',\s*'succeeded',\s*'failed',\s*'cancelled'\)\s*\)/i,
  },
] as const;

const liveAuroraEnvKeys = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
] as const;

const optionalProviderKeys = [
  "FIREWORKS_API_KEY",
  "FIREWORKS_BASE_URL",
  "FIREWORKS_MODEL",
  "FIREWORKS_EMBEDDING_MODEL",
  "FIREWORKS_EMBEDDING_DIMENSIONS",
  "ACM_ENABLE_LIVE_LLM",
  "ACM_ALLOW_CACHED_LLM",
  "LANGSMITH_TRACING",
  "LANGSMITH_API_KEY",
  "LANGSMITH_PROJECT",
] as const;

const downstreamExecutionKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_ENCRYPTION_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
] as const;

let failed = false;

for (const check of schemaChecks) {
  if (!check.pattern.test(migrationSql)) {
    failed = true;
    console.error(`missing CP3 schema contract: ${check.group} - ${check.label}`);
  } else {
    console.log(`ok CP3 schema contract: ${check.group} - ${check.label}`);
  }
}

const missingLiveAuroraEnv = missingKeys(liveAuroraEnvKeys);
if (missingLiveAuroraEnv.length > 0) {
  console.log(`CP3 live Aurora smoke unavailable without env: ${missingLiveAuroraEnv.join(", ")}`);
  console.log("This is the expected offline/no-key posture; no Aurora call was attempted.");
} else {
  console.log("CP3 live Aurora env appears present for deterministic forecast smoke.");
}

const missingOptionalProviders = missingKeys(optionalProviderKeys);
if (missingOptionalProviders.length > 0) {
  console.log(`Optional CP3 provider env not required for this check: ${missingOptionalProviders.join(", ")}`);
}

if (!present(process.env.FIREWORKS_API_KEY)) {
  console.log("Fireworks live smoke unavailable without FIREWORKS_API_KEY; no fake Fireworks call was attempted.");
} else if (!present(process.env.FIREWORKS_MODEL)) {
  console.log("Fireworks key is present, but FIREWORKS_MODEL is missing; live Fireworks smoke should stay disabled.");
} else {
  console.log("Fireworks env appears present; live smoke should use the real provider adapter only.");
}

if (!isTruthy(process.env.LANGSMITH_TRACING) || !present(process.env.LANGSMITH_API_KEY)) {
  console.log("LangSmith tracing unavailable without LANGSMITH_TRACING=true and LANGSMITH_API_KEY; no fake trace was emitted.");
} else {
  console.log("LangSmith tracing env appears present; live smoke should verify real trace metadata.");
}

const configuredDownstreamExecutionKeys = downstreamExecutionKeys.filter((key) => present(process.env[key]));
if (configuredDownstreamExecutionKeys.length > 0) {
  console.log(
    `Downstream execution env is present but out of scope for CP3: ${configuredDownstreamExecutionKeys.join(", ")}`,
  );
  console.log("CP3 checks must not send Gmail, start voice calls, or execute provider actions.");
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 3 offline contract check passed.");
}

function missingKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !present(process.env[key]));
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthy(value: string | undefined): boolean {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
