import assert from "node:assert/strict";

import "./load-local-env";

import {
  buildCp8DemoIntakePlan,
  validateCp8DemoIntakePlan,
} from "../src/server/demo/cp8-live-intake";

async function main() {
  const financePack = buildCp8DemoIntakePlan({
    mode: "finance_pack",
    companyExternalId: "cmp_marlow_finch",
    caseId: "case_payroll_2026_05_08",
  });
  const replayedFinancePack = buildCp8DemoIntakePlan({
    mode: "finance_pack",
    companyExternalId: "cmp_marlow_finch",
    caseId: "case_payroll_2026_05_08",
  });
  const paymentEvent = buildCp8DemoIntakePlan({
    mode: "payment_event",
    companyExternalId: "cmp_marlow_finch",
    caseId: "case_payroll_2026_05_08",
  });

  validateCp8DemoIntakePlan(financePack);
  validateCp8DemoIntakePlan(paymentEvent);

  assert.equal(financePack.mode, "finance_pack");
  assert.equal(financePack.files.length, 4);
  assert.equal(replayedFinancePack.idempotencyKey, financePack.idempotencyKey);
  assert.equal(paymentEvent.files.length, 1);
  assert.equal(paymentEvent.files[0]?.importKind, "payments");
  assert.ok(paymentEvent.files[0]?.csvText.includes("pay_cp8_ns_1048_full"));
  assert.ok(paymentEvent.files[0]?.csvText.includes("inv_ns_1048"));

  const fileKinds = new Set(financePack.files.map((file) => file.importKind));
  assert.deepEqual([...fileKinds].sort(), ["customers", "invoices", "obligations", "payments"]);

  const serialized = JSON.stringify(financePack);
  assert.equal(/twilio|elevenlabs|gmail/i.test(serialized), false);
  assert.equal(/providerExecutionId|providerCallId/i.test(serialized), false);

  console.log("CP8 demo intake no-key smoke passed.");
  console.log(`Finance pack files: ${financePack.files.map((file) => file.originalFilename).join(", ")}`);
  console.log(`Stable idempotency key: ${financePack.idempotencyKey}`);
  console.log("No AWS, Fireworks, Gmail, Twilio, or ElevenLabs calls were attempted.");
}

main().catch((error) => {
  console.error("CP8 demo intake no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
