import assert from "node:assert/strict";

import "./load-local-env";

import type { AuroraDataApiClient } from "../src/server/aws/rds-data-api";
import { getGmailRuntimeStatus, type GmailProviderAdapter } from "../src/server/communication/gmail-runtime";
import { Cp4ApprovalGateError, sendApprovedCommunicationDraft } from "../src/server/repositories/cp4-communication";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const ACTION_ID = "00000000-0000-4000-8000-000000000003";
const DRAFT_ID = "00000000-0000-4000-8000-000000000004";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000005";
const PROVIDER_EXECUTION_ID = "00000000-0000-4000-8000-000000000006";
const CONTACT_ID = "00000000-0000-4000-8000-000000000007";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000008";
const APPROVAL_ID = "00000000-0000-4000-8000-000000000009";

async function main() {
  const noKeyEnv: NodeJS.ProcessEnv = { ...process.env };
  delete noKeyEnv.GOOGLE_CLIENT_ID;
  delete noKeyEnv.GOOGLE_CLIENT_SECRET;
  delete noKeyEnv.GOOGLE_REDIRECT_URI;
  delete noKeyEnv.GMAIL_ENCRYPTION_KEY;

  const noKeyStatus = getGmailRuntimeStatus(noKeyEnv);
  assert.equal(noKeyStatus.status, "unavailable");
  assert.equal(noKeyStatus.reason, "no-key");
  assert.deepEqual(noKeyStatus.missingEnv, [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GMAIL_ENCRYPTION_KEY",
  ]);

  const approvedNoKeyDb = new FakeCp4DataApi("approved");
  const noKeyResult = await sendApprovedCommunicationDraft(
    {
      draftId: DRAFT_ID,
      idempotencyKey: "cp4:no-key-smoke",
    },
    {
      dataApi: approvedNoKeyDb.client,
      companyExternalId: "cmp_marlow_finch",
      caseId: "case_payroll_2026_05_08",
      env: noKeyEnv,
    },
  );

  assert.equal(noKeyResult.state, "provider_unavailable");
  assert.equal(noKeyResult.communicationMessage, null);
  assert.equal(noKeyResult.providerExecution?.state, "failed");
  assert.equal(noKeyResult.providerExecution?.providerExecutionId, null);
  assert.equal(approvedNoKeyDb.providerExecutionWrites, 1);
  assert.equal(approvedNoKeyDb.messageWrites, 0);

  const pendingDb = new FakeCp4DataApi("pending");
  await assert.rejects(
    () =>
      sendApprovedCommunicationDraft(
        {
          draftId: DRAFT_ID,
          idempotencyKey: "cp4:pending-gate-smoke",
        },
        {
          dataApi: pendingDb.client,
          companyExternalId: "cmp_marlow_finch",
          caseId: "case_payroll_2026_05_08",
          env: noKeyEnv,
        },
      ),
    (error) => {
      assert.ok(error instanceof Cp4ApprovalGateError);
      assert.equal(error.code, "approval_pending");
      assert.equal(error.result.communicationMessage, null);
      assert.equal(error.result.providerExecution, null);
      return true;
    },
  );
  assert.equal(pendingDb.providerExecutionWrites, 0);
  assert.equal(pendingDb.messageWrites, 0);

  const adapterEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GOOGLE_CLIENT_ID: "fake-client-id",
    GOOGLE_CLIENT_SECRET: "fake-client-secret",
    GOOGLE_REDIRECT_URI: "https://example.test/oauth",
    GMAIL_ENCRYPTION_KEY: "fake-encryption-key",
  };
  const adapterDb = new FakeCp4DataApi("approved");
  const adapter: GmailProviderAdapter = {
    async sendEmail() {
      return {
        state: "succeeded",
        providerMessageId: "gmail-message-123",
        providerExecutionId: "gmail-execution-123",
        metadata: {
          label: "adapter-smoke",
        },
      };
    },
  };
  const adapterResult = await sendApprovedCommunicationDraft(
    {
      draftId: DRAFT_ID,
      idempotencyKey: "cp4:adapter-smoke",
    },
    {
      dataApi: adapterDb.client,
      companyExternalId: "cmp_marlow_finch",
      caseId: "case_payroll_2026_05_08",
      env: adapterEnv,
      gmailAdapter: adapter,
    },
  );

  assert.equal(adapterResult.state, "sent");
  assert.equal(adapterResult.communicationMessage?.state, "sent");
  assert.equal(adapterResult.communicationMessage?.providerMessageId, "gmail-message-123");
  assert.equal(adapterResult.providerExecution?.state, "succeeded");
  assert.equal(adapterDb.messageWrites, 1);
  assert.equal(adapterDb.providerExecutionWrites, 1);

  console.log("Gmail no-key/runtime smoke passed.");
  console.log(`No-key status: ${noKeyStatus.status} (${noKeyStatus.reason})`);
  console.log("Approval gate blocked pending approval before provider execution.");
  console.log("Approved no-key send wrote failed provider execution without a sent message.");
  console.log("Configured adapter path wrote one sent communication message with a real provider id.");
}

type ApprovalState = "pending" | "approved";

class FakeCp4DataApi {
  readonly client = {
    execute: this.execute.bind(this),
    executeMutation: this.executeMutation.bind(this),
    beginTransaction: this.beginTransaction.bind(this),
    commitTransaction: this.commitTransaction.bind(this),
    rollbackTransaction: this.rollbackTransaction.bind(this),
  } as unknown as AuroraDataApiClient;

  messageWrites = 0;
  providerExecutionWrites = 0;
  auditWrites = 0;

  constructor(private readonly approvalState: ApprovalState) {}

  async execute<T extends Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    if (sql.includes("from companies")) {
      return [companyRow() as unknown as T];
    }

    if (sql.includes("from communication_drafts cd")) {
      return [draftRow() as unknown as T];
    }

    if (sql.includes("from approval_records ar")) {
      return [approvalRow(this.approvalState) as unknown as T];
    }

    if (sql.includes("insert into communication_messages")) {
      this.messageWrites += 1;
      return [messageRow() as unknown as T];
    }

    if (sql.includes("insert into provider_executions")) {
      this.providerExecutionWrites += 1;
      const state = params.state === "succeeded" ? "succeeded" : "failed";
      return [providerExecutionRow(state) as unknown as T];
    }

    if (sql.includes("update communication_drafts")) {
      return [draftRow("sent") as unknown as T];
    }

    return [] as T[];
  }

  async executeMutation(sql: string): Promise<number> {
    if (sql.includes("audit_log")) {
      this.auditWrites += 1;
    }

    return 1;
  }

  async beginTransaction(): Promise<string> {
    return "fake-transaction";
  }

  async commitTransaction(): Promise<void> {}

  async rollbackTransaction(): Promise<void> {}
}

function companyRow() {
  return {
    company_id: COMPANY_ID,
    tenant_id: TENANT_ID,
  };
}

function draftRow(state = "approved") {
  return {
    id: DRAFT_ID,
    action_id: ACTION_ID,
    action_external_id: "act_collect_invoice",
    customer_id: CUSTOMER_ID,
    customer_external_id: "cust_northwind",
    customer_name: "Northwind Studio",
    contact_id: CONTACT_ID,
    contact_email: "ap@example.test",
    channel: "email",
    provider: "gmail",
    subject: "Payment follow-up",
    body: "Hello,\n\nChecking in on the approved payment action.\n\nThanks.",
    state,
    generated_by_agent_run_id: null,
    idempotency_key: "cp4:draft:fake",
    created_at: "2026-06-29 10:00:00",
    updated_at: "2026-06-29 10:00:00",
  };
}

function approvalRow(state: ApprovalState) {
  return {
    id: APPROVAL_ID,
    action_id: ACTION_ID,
    action_external_id: "act_collect_invoice",
    state,
    decision_note: state === "approved" ? "Approved by smoke." : null,
    requested_at: "2026-06-29 10:00:00",
    decided_at: state === "approved" ? "2026-06-29 10:01:00" : null,
    expires_at: "2099-01-01 00:00:00",
  };
}

function messageRow() {
  return {
    id: MESSAGE_ID,
    draft_id: DRAFT_ID,
    action_id: ACTION_ID,
    action_external_id: "act_collect_invoice",
    customer_id: CUSTOMER_ID,
    customer_external_id: "cust_northwind",
    contact_id: CONTACT_ID,
    channel: "email",
    direction: "outbound",
    provider: "gmail",
    provider_message_id: "gmail-message-123",
    subject: "Payment follow-up",
    state: "sent",
    sent_at: "2026-06-29 10:02:00",
    received_at: null,
    idempotency_key: "cp4:adapter-smoke",
    created_at: "2026-06-29 10:02:00",
    updated_at: "2026-06-29 10:02:00",
  };
}

function providerExecutionRow(state: string) {
  return {
    id: PROVIDER_EXECUTION_ID,
    action_id: ACTION_ID,
    draft_id: DRAFT_ID,
    message_id: state === "succeeded" ? MESSAGE_ID : null,
    provider: "gmail",
    operation: "send_email",
    state,
    provider_execution_id: state === "succeeded" ? "gmail-execution-123" : null,
    attempts: 1,
    last_error: state === "succeeded" ? null : "Gmail is not configured.",
    attempted_at: "2026-06-29 10:02:00",
    completed_at: "2026-06-29 10:02:00",
    idempotency_key: state === "succeeded" ? "cp4:adapter-smoke" : "cp4:no-key-smoke",
    created_at: "2026-06-29 10:02:00",
    updated_at: "2026-06-29 10:02:00",
  };
}

main().catch((error) => {
  console.error("Gmail no-key/runtime smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
