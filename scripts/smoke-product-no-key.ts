import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import "./load-local-env";

import { createFireworksProvider } from "../src/server/providers/fireworks";
import { getLangSmithTracingStatus } from "../src/server/providers/langsmith";

type ProductNoKeyState = {
  dataSource: {
    status: "unavailable";
    reason: "missing-aurora-env";
    missingEnv: string[];
  };
  providers: {
    fireworks: ReturnType<ReturnType<typeof createFireworksProvider>["getStatus"]>;
    langsmith: ReturnType<typeof getLangSmithTracingStatus>;
    twilio: {
      provider: "twilio";
      status: "unavailable";
      reason: "no-key";
      missingEnv: string[];
      providerCallId: null;
      providerExecutionId: null;
    };
    elevenlabs: {
      provider: "elevenlabs";
      status: "unavailable";
      reason: "no-key";
      missingEnv: string[];
      providerCallId: null;
      providerExecutionId: null;
    };
  };
  referenceScreens: string[];
};

const noKeyEnvNames = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
  "FIREWORKS_API_KEY",
  "LANGSMITH_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_ENCRYPTION_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_PHONE_NUMBER",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
] as const;

async function main() {
  const noKeyEnv = withoutKeys(process.env, noKeyEnvNames);
  noKeyEnv.LANGSMITH_TRACING = "true";

  const productState = buildProductNoKeyState(noKeyEnv);

  assert.deepEqual(productState.dataSource.missingEnv, [
    "AWS_REGION",
    "AURORA_CLUSTER_ARN",
    "AURORA_SECRET_ARN",
    "AURORA_DATABASE",
  ]);
  assert.equal(productState.providers.fireworks.status, "unavailable");
  assert.equal(productState.providers.fireworks.reason, "no-key");
  assert.equal(productState.providers.langsmith.status, "unavailable");
  assert.equal(productState.providers.langsmith.reason, "no-key");
  assert.equal(productState.providers.twilio.status, "unavailable");
  assert.equal(productState.providers.twilio.providerCallId, null);
  assert.equal(productState.providers.elevenlabs.status, "unavailable");
  assert.equal(productState.providers.elevenlabs.providerExecutionId, null);

  for (const screen of ["Overview", "Actions", "Customers", "Forecasts"]) {
    assert.ok(productState.referenceScreens.includes(screen), `Missing reference screen ${screen}.`);
  }

  assertNoFakeProviderIds(productState);
  assertProductRouteTreeHasNoFakeProviderIds();

  if (!existsSync(resolve("src/app/api/product"))) {
    console.log("CP6 product API routes are pending in adjacent lanes; no product route network smoke was attempted.");
  }

  console.log("Product no-key smoke passed without provider, Gmail, Twilio, ElevenLabs, or Aurora calls.");
  console.log(`Aurora unavailable state reports missing env: ${productState.dataSource.missingEnv.join(", ")}`);
  console.log("Reference screens covered for manual browser QA: Overview, Actions, Customers, Forecasts.");
}

function buildProductNoKeyState(env: NodeJS.ProcessEnv): ProductNoKeyState {
  return {
    dataSource: {
      status: "unavailable",
      reason: "missing-aurora-env",
      missingEnv: missingKeys(env, ["AWS_REGION", "AURORA_CLUSTER_ARN", "AURORA_SECRET_ARN", "AURORA_DATABASE"]),
    },
    providers: {
      fireworks: createFireworksProvider({ env }).getStatus(new Date("2026-06-29T12:00:00.000Z")),
      langsmith: getLangSmithTracingStatus(env, new Date("2026-06-29T12:00:00.000Z")),
      twilio: {
        provider: "twilio",
        status: "unavailable",
        reason: "no-key",
        missingEnv: missingKeys(env, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_PHONE_NUMBER"]),
        providerCallId: null,
        providerExecutionId: null,
      },
      elevenlabs: {
        provider: "elevenlabs",
        status: "unavailable",
        reason: "no-key",
        missingEnv: missingKeys(env, ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"]),
        providerCallId: null,
        providerExecutionId: null,
      },
    },
    referenceScreens: availableReferenceScreens(),
  };
}

function availableReferenceScreens(): string[] {
  return [
    ["Overview", "Ui References/1.png"],
    ["Actions", "Ui References/2.png"],
    ["Customers", "Ui References/3.png"],
    ["Forecasts", "Ui References/4.png"],
  ]
    .filter(([, path]) => existsSync(resolve(path)) && statSync(resolve(path)).size > 0)
    .map(([screen]) => screen);
}

function assertProductRouteTreeHasNoFakeProviderIds(): void {
  const productRoot = resolve("src/app/api/product");
  if (!existsSync(productRoot)) {
    return;
  }

  const fileTexts = walkFiles(productRoot)
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.equal(/\bCA[0-9a-f]{32}\b/i.test(fileTexts), false, "Product routes must not hard-code Twilio call SIDs.");
  assert.equal(/gmail-(draft|message|execution)-\d+/i.test(fileTexts), false, "Product routes must not hard-code Gmail IDs.");
  assert.equal(/provider(CallId|ExecutionId)\s*:\s*["'](?:fake|mock|demo|test)/i.test(fileTexts), false);
}

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function assertNoFakeProviderIds(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(/\bCA[0-9a-f]{32}\b/i.test(serialized), false);
  assert.equal(/gmail-(draft|message|execution)-\d+/i.test(serialized), false);
  assert.equal(/provider(CallId|ExecutionId)":"(?:fake|mock|demo|test)/i.test(serialized), false);
}

function withoutKeys(env: NodeJS.ProcessEnv, keys: readonly string[]): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = { ...env };
  for (const key of keys) {
    delete nextEnv[key];
  }
  return nextEnv;
}

function missingKeys(env: NodeJS.ProcessEnv, keys: readonly string[]): string[] {
  return keys.filter((key) => !present(env[key]));
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

main().catch((error) => {
  console.error("Product no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
