import { getElevenLabsProviderStatus } from "../providers/elevenlabs";
import { createTwilioProvider } from "../providers/twilio";
import type { VoiceProviderReadiness } from "./contracts";

export async function getVoiceProviderReadiness(input: {
  env?: NodeJS.ProcessEnv;
  validateElevenLabs?: boolean;
} = {}): Promise<VoiceProviderReadiness> {
  const env = input.env ?? process.env;
  const now = new Date();
  const twilio = createTwilioProvider({ env }).getStatus(now);
  const elevenlabs = await getElevenLabsProviderStatus(
    {
      env,
      validateRemote: input.validateElevenLabs,
    },
    now,
  );

  return {
    generatedAt: now.toISOString(),
    providers: {
      twilio,
      elevenlabs,
    },
    safeguards: [
      "Outbound calls require an approved action record before any provider request is attempted.",
      "Live Twilio calls require live=true and a target matching TWILIO_TEST_TO_NUMBER.",
      "Provider IDs are only persisted from real provider responses.",
      "ElevenLabs is reported as unavailable/disabled until its key validates remotely.",
    ],
  };
}
