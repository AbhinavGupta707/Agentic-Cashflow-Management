import type { ProviderStatus } from "../db/provider-status-contract";

export type VoiceProviderReadiness = {
  generatedAt: string;
  providers: {
    twilio: ProviderStatus;
    elevenlabs: ProviderStatus;
  };
  safeguards: string[];
};

export type VoiceApprovalState = "pending" | "approved" | "rejected" | "expired" | "revoked" | "missing";
export type VoiceCallState = "queued" | "ringing" | "in_progress" | "completed" | "no_answer" | "failed" | "cancelled";
export type VoiceProviderExecutionState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type VoiceCallScript = {
  source: "deterministic_fallback" | "fireworks" | "draft";
  opening: string;
  talkingPoints: string[];
  objectionHandling: string[];
  close: string;
  body: string;
};

export type VoiceCallPreview = {
  actionId: string | null;
  actionExternalId: string | null;
  customerId: string | null;
  customerExternalId: string | null;
  customerName: string | null;
  contactId: string | null;
  contactName: string | null;
  phoneE164: string | null;
  approval: {
    id: string | null;
    state: VoiceApprovalState;
    requestedAt: string | null;
    decidedAt: string | null;
    expiresAt: string | null;
  };
  script: VoiceCallScript;
  guardrails: string[];
};

export type VoiceProviderExecution = {
  id: string;
  actionId: string | null;
  provider: "twilio";
  operation: string;
  state: VoiceProviderExecutionState;
  providerExecutionId: string | null;
  attempts: number;
  lastError: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceCallRecord = {
  id: string;
  actionId: string | null;
  customerId: string | null;
  contactId: string | null;
  providerExecutionId: string | null;
  provider: "twilio" | "elevenlabs";
  providerCallId: string | null;
  phoneE164: string;
  direction: "outbound" | "inbound";
  state: VoiceCallState;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceTranscriptTurn = {
  id: string;
  voiceCallId: string;
  sequenceNumber: number;
  speaker: "agent" | "customer" | "system" | "unknown";
  utterance: string;
  startsAtSeconds: number | null;
  endsAtSeconds: number | null;
  confidence: number | null;
  createdAt: string;
};

export type VoiceCallInitiationResult = {
  state:
    | "preview_only"
    | "approval_required"
    | "provider_unavailable"
    | "provider_failed"
    | "target_not_allowed"
    | "missing_phone"
    | "queued";
  message: string;
  preview: VoiceCallPreview | null;
  provider: ProviderStatus;
  providerExecution: VoiceProviderExecution | null;
  voiceCall: VoiceCallRecord | null;
};

export type VoiceWebhookIngestionResult = {
  state: "accepted" | "ignored" | "failed";
  message: string;
  voiceCall: VoiceCallRecord | null;
  transcripts: VoiceTranscriptTurn[];
  memoryFactsPrepared: number;
};
