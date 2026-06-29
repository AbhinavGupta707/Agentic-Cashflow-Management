export type Cp4ApprovalState = "pending" | "approved" | "rejected" | "expired" | "revoked" | "missing";

export type Cp4DraftState = "draft" | "needs_approval" | "approved" | "rejected" | "queued" | "sent" | "archived";

export type Cp4ProviderExecutionState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Cp4SendState =
  | "sent"
  | "provider_unavailable"
  | "provider_failed"
  | "approval_required"
  | "draft_unavailable";

export type Cp4GmailStatus = {
  provider: "gmail";
  status: "available" | "unavailable";
  reason: "configured" | "missing-config" | "no-key" | "no-token" | "adapter-missing" | "provider-error";
  message: string;
  missingEnv: string[];
  checkedAt: string;
};

export type Cp4CommunicationDraft = {
  id: string;
  actionId: string | null;
  actionExternalId: string | null;
  customerId: string | null;
  customerExternalId: string | null;
  customerName: string | null;
  contactId: string | null;
  contactEmail: string | null;
  channel: "email";
  provider: "gmail";
  subject: string | null;
  body: string;
  state: Cp4DraftState;
  generatedByAgentRunId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type Cp4ApprovalRecord = {
  id: string;
  actionId: string;
  actionExternalId: string | null;
  state: Cp4ApprovalState;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
};

export type Cp4CommunicationMessage = {
  id: string;
  draftId: string | null;
  actionId: string | null;
  actionExternalId: string | null;
  customerId: string | null;
  customerExternalId: string | null;
  contactId: string | null;
  channel: "email";
  direction: "outbound" | "inbound";
  provider: "gmail";
  providerMessageId: string | null;
  subject: string | null;
  state: string;
  sentAt: string | null;
  receivedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type Cp4ProviderExecution = {
  id: string;
  actionId: string | null;
  draftId: string | null;
  messageId: string | null;
  provider: "gmail";
  operation: string;
  state: Cp4ProviderExecutionState;
  providerExecutionId: string | null;
  attempts: number;
  lastError: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type Cp4CommunicationState = {
  companyExternalId: string;
  caseId: string;
  generatedAt: string;
  provider: Cp4GmailStatus;
  drafts: Cp4CommunicationDraft[];
  approvals: Cp4ApprovalRecord[];
  messages: Cp4CommunicationMessage[];
  providerExecutions: Cp4ProviderExecution[];
};

export type Cp4CreateDraftResult = {
  draft: Cp4CommunicationDraft;
  approval: Cp4ApprovalRecord | null;
  provider: Cp4GmailStatus;
};

export type Cp4ApprovalDecisionResult = {
  approval: Cp4ApprovalRecord;
  drafts: Cp4CommunicationDraft[];
};

export type Cp4SendResult = {
  state: Cp4SendState;
  message: string;
  draft: Cp4CommunicationDraft | null;
  approval: Cp4ApprovalRecord | null;
  communicationMessage: Cp4CommunicationMessage | null;
  providerExecution: Cp4ProviderExecution | null;
  provider: Cp4GmailStatus;
};

export type Cp4ApiResponse<T> =
  | {
      status: "ok";
      data: T;
    }
  | {
      status: "unavailable";
      message: string;
      missingEnv: string[];
    }
  | {
      status: "blocked" | "error";
      code?: string;
      message: string;
      data?: T;
    };

export const CP4_COMMUNICATION_CONTRACT_NOTES = [
  "CP4 runtime is email/Gmail-only; SMS and voice remain out of scope.",
  "Internal draft creation reads CP3 actions, contacts, and agent draft output from Aurora and does not require Gmail keys.",
  "Send attempts require an approved, unexpired approval record before any provider execution can be attempted.",
  "Provider execution responses exclude OAuth tokens, hidden env values, raw provider request payloads, and provider response bodies.",
] as const;
