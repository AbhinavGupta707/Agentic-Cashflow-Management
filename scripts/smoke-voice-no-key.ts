import "./load-local-env";

import { getElevenLabsProviderStatus } from "../src/server/providers/elevenlabs";
import { createTwilioProvider } from "../src/server/providers/twilio";
import { getVoiceProviderReadiness } from "../src/server/voice/status";
import { buildCashflowVoiceTwiML } from "../src/server/voice/twiml";

async function main() {
  const noKeyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_NUMBER: "",
    TWILIO_PHONE_NUMBER: "",
    TWILIO_TWIML_URL: "",
    TWILIO_STATUS_CALLBACK_URL: "",
    TWILIO_TEST_TO_NUMBER: "",
    ELEVENLABS_API_KEY: "",
    ELEVENLABS_VALIDATE_STATUS: "",
  };

  const now = new Date("2026-06-29T12:00:00.000Z");
  const twilio = createTwilioProvider({ env: noKeyEnv }).getStatus(now);
  assert(twilio.status === "unavailable", "Twilio should be unavailable without credentials.");
  assert(twilio.reason === "no-key", "Twilio no-key status should use no-key reason.");
  assert(twilio.missingEnv.includes("TWILIO_ACCOUNT_SID"), "Twilio should report missing account SID.");
  assert(twilio.missingEnv.includes("TWILIO_AUTH_TOKEN"), "Twilio should report missing auth token.");
  assert(
    twilio.missingEnv.includes("TWILIO_FROM_NUMBER") && twilio.missingEnv.includes("TWILIO_PHONE_NUMBER"),
    "Twilio should report both supported from-number aliases when neither is configured.",
  );
  console.log(`ok Twilio no-key status reports missing env: ${twilio.missingEnv.join(", ")}`);

  const phoneAliasEnv: NodeJS.ProcessEnv = {
    ...noKeyEnv,
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_PHONE_NUMBER: "+15551234567",
    TWILIO_TWIML_URL: "https://example.com/twiml.xml",
  };
  const aliasStatus = createTwilioProvider({ env: phoneAliasEnv }).getStatus(now);
  assert(aliasStatus.status === "available", "TWILIO_PHONE_NUMBER should satisfy Twilio from-number configuration.");
  assertNoFakeProviderIds(aliasStatus);
  console.log("ok Twilio accepts TWILIO_PHONE_NUMBER as the from-number alias without network calls.");

  const elevenlabs = await getElevenLabsProviderStatus({ env: noKeyEnv }, now);
  assert(elevenlabs.status === "unavailable", "ElevenLabs should be unavailable without a key.");
  assert(elevenlabs.reason === "no-key", "ElevenLabs no-key status should use no-key reason.");
  assert(elevenlabs.missingEnv.includes("ELEVENLABS_API_KEY"), "ElevenLabs should report the missing API key.");
  console.log("ok ElevenLabs no-key status reports unavailable without remote calls.");

  let fetchCalled = false;
  const presentButUnvalidatedEnv: NodeJS.ProcessEnv = {
    ...noKeyEnv,
    ELEVENLABS_API_KEY: "test-invalid-key",
  };
  const unvalidatedElevenLabs = await getElevenLabsProviderStatus(
    {
      env: presentButUnvalidatedEnv,
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called for default ElevenLabs status.");
      },
    },
    now,
  );
  assert(fetchCalled === false, "ElevenLabs default status should not make a network call.");
  assert(unvalidatedElevenLabs.status === "disabled", "Unvalidated ElevenLabs key should remain disabled.");
  assertNoFakeProviderIds(elevenlabs, unvalidatedElevenLabs);
  console.log("ok ElevenLabs present-but-unvalidated key remains disabled without claiming availability.");

  const readiness = await getVoiceProviderReadiness({ env: noKeyEnv });
  assert(readiness.providers.twilio.status === "unavailable", "Voice readiness should include unavailable Twilio.");
  assert(readiness.providers.elevenlabs.status === "unavailable", "Voice readiness should include unavailable ElevenLabs.");
  assert(
    readiness.safeguards.some((guardrail) => guardrail.includes("approved action")),
    "Voice readiness should publish approval-gate guardrails.",
  );
  assertNoFakeProviderIds(readiness);
  console.log("ok voice readiness includes provider states and approval/test-target guardrails.");

  const twiml = buildCashflowVoiceTwiML({
    summary: "Collect & confirm <payment> before payroll.",
  });
  assert(twiml.includes("<Response>"), "TwiML should include a Response root.");
  assert(twiml.includes("<Say>"), "TwiML should include Say instructions.");
  assert(twiml.includes("&amp;"), "TwiML should XML-escape ampersands.");
  assert(twiml.includes("&lt;payment&gt;"), "TwiML should XML-escape angled text.");
  console.log("ok Twilio TwiML callback builder returns escaped Voice XML without network calls.");

  console.log("Voice no-key smoke passed without Twilio or ElevenLabs network calls.");
  console.log("No fake call id, transcript id, provider execution id, or successful call outcome was produced.");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoFakeProviderIds(...values: unknown[]): void {
  const serialized = JSON.stringify(values);
  assert(/\bCA[0-9a-f]{32}\b/i.test(serialized) === false, "No Twilio call SID should be fabricated.");
  assert(/providerExecutionId":"(?:fake|mock|demo|test)/i.test(serialized) === false, "No fake provider execution ID should appear.");
  assert(/providerCallId":"(?:fake|mock|demo|test)/i.test(serialized) === false, "No fake provider call ID should appear.");
}

main().catch((error) => {
  console.error("Voice no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
