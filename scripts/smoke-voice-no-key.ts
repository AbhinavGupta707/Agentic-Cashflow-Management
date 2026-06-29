import "./load-local-env";

import { getElevenLabsProviderStatus } from "../src/server/providers/elevenlabs";
import { createTwilioProvider } from "../src/server/providers/twilio";
import { getVoiceProviderReadiness } from "../src/server/voice/status";

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

  const twilio = createTwilioProvider({ env: noKeyEnv }).getStatus(new Date("2026-06-29T12:00:00.000Z"));
  assert(twilio.status === "unavailable", "Twilio should be unavailable without credentials.");
  assert(twilio.reason === "no-key", "Twilio no-key status should use no-key reason.");
  assert(twilio.missingEnv.includes("TWILIO_ACCOUNT_SID"), "Twilio should report missing account SID.");
  assert(twilio.missingEnv.includes("TWILIO_AUTH_TOKEN"), "Twilio should report missing auth token.");
  console.log(`ok Twilio no-key status reports missing env: ${twilio.missingEnv.join(", ")}`);

  const elevenlabs = await getElevenLabsProviderStatus(
    { env: noKeyEnv },
    new Date("2026-06-29T12:00:00.000Z"),
  );
  assert(elevenlabs.status === "unavailable", "ElevenLabs should be unavailable without a key.");
  assert(elevenlabs.reason === "no-key", "ElevenLabs no-key status should use no-key reason.");
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
    new Date("2026-06-29T12:00:00.000Z"),
  );
  assert(fetchCalled === false, "ElevenLabs default status should not make a network call.");
  assert(unvalidatedElevenLabs.status === "disabled", "Unvalidated ElevenLabs key should remain disabled.");
  console.log("ok ElevenLabs present-but-unvalidated key remains disabled without claiming availability.");

  const readiness = await getVoiceProviderReadiness({ env: noKeyEnv });
  assert(readiness.providers.twilio.status === "unavailable", "Voice readiness should include unavailable Twilio.");
  assert(
    readiness.safeguards.some((guardrail) => guardrail.includes("approved action")),
    "Voice readiness should publish approval-gate guardrails.",
  );
  console.log("ok voice readiness includes provider states and approval/test-target guardrails.");

  console.log("Voice no-key smoke passed without Twilio or ElevenLabs network calls.");
  console.log("No fake call id, transcript id, provider execution id, or successful call outcome was produced.");
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
