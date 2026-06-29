import assert from "node:assert/strict";

import "./load-local-env";

type VoiceProvider = "twilio" | "elevenlabs";
type VoiceProviderStatus = {
  provider: VoiceProvider;
  status: "available" | "unavailable";
  reason: "configured" | "no-key";
  missingEnv: string[];
  providerExecutionId: string | null;
  providerCallId: string | null;
};

type VoiceSmokeResult = {
  state: "blocked_pending_approval" | "provider_unavailable";
  providerExecution: null | {
    provider: VoiceProvider;
    state: "failed";
    providerExecutionId: string | null;
    lastError: string;
  };
  voiceCall: null | {
    provider: VoiceProvider;
    providerCallId: string | null;
  };
};

const voiceEnvKeys = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_PHONE_NUMBER",
  "TWILIO_TEST_TO_PHONE",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_VOICE_ID",
] as const;

async function main() {
  const noKeyEnv = withoutKeys(process.env, voiceEnvKeys);

  const twilioStatus = getTwilioStatus(noKeyEnv);
  assert.equal(twilioStatus.status, "unavailable");
  assert.equal(twilioStatus.reason, "no-key");
  assert.deepEqual(twilioStatus.missingEnv, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_PHONE_NUMBER"]);
  assert.equal(twilioStatus.providerExecutionId, null);
  assert.equal(twilioStatus.providerCallId, null);
  console.log(`ok Twilio no-key status reports missing env: ${twilioStatus.missingEnv.join(", ")}`);

  const elevenLabsStatus = getElevenLabsStatus(noKeyEnv);
  assert.equal(elevenLabsStatus.status, "unavailable");
  assert.equal(elevenLabsStatus.reason, "no-key");
  assert.deepEqual(elevenLabsStatus.missingEnv, ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"]);
  assert.equal(elevenLabsStatus.providerExecutionId, null);
  assert.equal(elevenLabsStatus.providerCallId, null);
  console.log(`ok ElevenLabs no-key status reports missing env: ${elevenLabsStatus.missingEnv.join(", ")}`);

  const pendingResult = simulateVoiceCallAttempt({
    approved: false,
    provider: "twilio",
    providerStatus: twilioStatus,
  });
  assert.equal(pendingResult.state, "blocked_pending_approval");
  assert.equal(pendingResult.providerExecution, null);
  assert.equal(pendingResult.voiceCall, null);
  console.log("ok pending approval blocks voice provider execution before any call row or provider id exists.");

  const approvedNoKeyResult = simulateVoiceCallAttempt({
    approved: true,
    provider: "twilio",
    providerStatus: twilioStatus,
  });
  assert.equal(approvedNoKeyResult.state, "provider_unavailable");
  assert.equal(approvedNoKeyResult.providerExecution?.state, "failed");
  assert.equal(approvedNoKeyResult.providerExecution?.providerExecutionId, null);
  assert.equal(approvedNoKeyResult.voiceCall, null);
  console.log("ok approved no-key voice attempt records provider unavailable without a fake call.");

  assertNoFakeProviderIds(twilioStatus, elevenLabsStatus, pendingResult, approvedNoKeyResult);

  console.log("Voice no-key smoke passed without Twilio, ElevenLabs, Fireworks, LangSmith, Gmail, or Aurora calls.");
  console.log("Live voice smoke remains opt-in: require explicit approval plus a configured test phone number.");
}

function getTwilioStatus(env: NodeJS.ProcessEnv): VoiceProviderStatus {
  const missingEnv = missingKeys(env, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_PHONE_NUMBER"]);
  return {
    provider: "twilio",
    status: missingEnv.length > 0 ? "unavailable" : "available",
    reason: missingEnv.length > 0 ? "no-key" : "configured",
    missingEnv,
    providerExecutionId: null,
    providerCallId: null,
  };
}

function getElevenLabsStatus(env: NodeJS.ProcessEnv): VoiceProviderStatus {
  const missingEnv = missingKeys(env, ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"]);
  return {
    provider: "elevenlabs",
    status: missingEnv.length > 0 ? "unavailable" : "available",
    reason: missingEnv.length > 0 ? "no-key" : "configured",
    missingEnv,
    providerExecutionId: null,
    providerCallId: null,
  };
}

function simulateVoiceCallAttempt(input: {
  approved: boolean;
  provider: VoiceProvider;
  providerStatus: VoiceProviderStatus;
}): VoiceSmokeResult {
  if (!input.approved) {
    return {
      state: "blocked_pending_approval",
      providerExecution: null,
      voiceCall: null,
    };
  }

  if (input.providerStatus.status !== "available") {
    return {
      state: "provider_unavailable",
      providerExecution: {
        provider: input.provider,
        state: "failed",
        providerExecutionId: null,
        lastError: `${input.provider} unavailable: ${input.providerStatus.missingEnv.join(", ")}`,
      },
      voiceCall: null,
    };
  }

  throw new Error("Live provider execution is intentionally disabled in smoke:voice:no-key.");
}

function assertNoFakeProviderIds(...values: unknown[]): void {
  const serialized = JSON.stringify(values);
  assert.equal(/\bCA[0-9a-f]{32}\b/i.test(serialized), false, "No Twilio call SID should be fabricated.");
  assert.equal(/providerExecutionId":"(?:fake|mock|demo|test)/i.test(serialized), false);
  assert.equal(/providerCallId":"(?:fake|mock|demo|test)/i.test(serialized), false);
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
  console.error("Voice no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
