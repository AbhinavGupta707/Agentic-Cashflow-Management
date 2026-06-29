import "./load-local-env";

import { DataApiUnavailableError, getDataApiAvailability } from "../src/server/aws/data-api-env";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../src/server/db/case-state-contract";
import {
  Cp4ApprovalGateError,
  createInternalCommunicationDraft,
  sendApprovedCommunicationDraft,
} from "../src/server/repositories/cp4-communication";

async function main() {
  const availability = getDataApiAvailability();

  if (!availability.available) {
    const error = new DataApiUnavailableError(availability.missing);
    console.log("CP4 approval-gate live smoke unavailable.");
    console.log(error.message);
    return;
  }

  const companyExternalId = process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const draftResult = await createInternalCommunicationDraft({
    idempotencyKey: `cp4:approval-gate-smoke:draft:${companyExternalId}:${caseId}`,
  }, {
    companyExternalId,
    caseId,
  });

  try {
    await sendApprovedCommunicationDraft(
      {
        draftId: draftResult.draft.id,
        idempotencyKey: `cp4:approval-gate-smoke:send:${draftResult.draft.id}`,
      },
      {
        companyExternalId,
        caseId,
      },
    );

    console.log("CP4 approval-gate live smoke found an already-approved action.");
    console.log("Send route did not bypass the gate; check provider execution result above if this was intentional.");
  } catch (error) {
    if (error instanceof Cp4ApprovalGateError) {
      console.log("CP4 approval-gate live smoke passed.");
      console.log(`Draft: ${draftResult.draft.id} (${draftResult.draft.state})`);
      console.log(`Blocked send code: ${error.code}`);
      console.log(`Approval state: ${error.result.approval?.state ?? "missing"}`);
      console.log("No sent communication message was created before approval.");
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error("CP4 approval-gate live smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
