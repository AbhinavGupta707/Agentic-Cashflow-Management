import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Check = {
  file: string;
  label: string;
  pattern: RegExp;
};

const checks: Check[] = [
  {
    file: "src/server/repositories/product-actions.ts",
    label: "action summaries expose detail fetch contract",
    pattern: /shouldFetchForPreview[\s\S]+mutationRoutes[\s\S]+editDraft/i,
  },
  {
    file: "src/server/repositories/product-actions.ts",
    label: "action decisions return detail, list refresh, and no-provider execution copy",
    pattern: /ProductActionDecisionResult[\s\S]+actions:\s*ProductActionsState[\s\S]+No provider send or call was executed/i,
  },
  {
    file: "src/server/repositories/product-actions.ts",
    label: "approval double-click guard blocks opposite already-decided state",
    pattern: /approval_already_decided[\s\S]+already \${row\.approval_state}/i,
  },
  {
    file: "src/server/repositories/product-actions.ts",
    label: "voice provider state exposes approval/test-number gate",
    pattern: /executionGate[\s\S]+requiresApproval[\s\S]+requiresTestNumber/i,
  },
  {
    file: "src/server/db/product-overview-contract.ts",
    label: "overview exposes judge-facing deterministic narrative",
    pattern: /ProductOverviewNarrative[\s\S]+riskLevel[\s\S]+primaryActionExternalId/i,
  },
  {
    file: "src/server/repositories/product-overview.ts",
    label: "overview narrative is derived from Aurora-backed state",
    pattern: /buildNarrative[\s\S]+Aurora cash, forecast, obligation, and action records/i,
  },
  {
    file: "src/server/db/product-scenarios-contract.ts",
    label: "scenario contract exposes current horizon and ending date",
    pattern: /endingCashDate[\s\S]+horizon:[\s\S]+startDate[\s\S]+endDate/i,
  },
  {
    file: "src/server/repositories/product-scenarios.ts",
    label: "scenario horizon is computed from forecast input",
    pattern: /horizon:[\s\S]+input\.horizonStart[\s\S]+input\.horizonEnd/i,
  },
  {
    file: "src/server/repositories/product-agent-activity.ts",
    label: "agent activity exposes persisted timeline summary",
    pattern: /summary:[\s\S]+runCount[\s\S]+checkpointCount[\s\S]+lastActivityAt/i,
  },
  {
    file: "src/app/api/product/actions/[id]/approve/route.ts",
    label: "approve route remains mutation-only and delegates to product approval",
    pattern: /approveProductAction[\s\S]+NextResponse\.json\(\{\s*status:\s*"ok",\s*data:\s*result\s*\}\)/i,
  },
  {
    file: "src/app/api/product/actions/[id]/edit-draft/route.ts",
    label: "edit route returns product draft edit result",
    pattern: /editProductActionDraft[\s\S]+NextResponse\.json\(\{\s*status:\s*"ok",\s*data:\s*result\s*\}\)/i,
  },
  {
    file: "src/server/repositories/cp4-communication.ts",
    label: "CP4 action context uses current invoice amount_due schema",
    pattern: /round\(i\.amount_due \* 100\)::bigint as outstanding_cents/i,
  },
];

for (const check of checks) {
  const text = readFileSync(check.file, "utf8");
  assert.match(text, check.pattern, `${check.label} failed in ${check.file}`);
  console.log(`ok - ${check.label}`);
}

const productActions = readFileSync("src/server/repositories/product-actions.ts", "utf8");
assert.equal(
  /sendApprovedCommunicationDraft|createVoiceCall|placeCall|twilio\.calls\.create/i.test(productActions),
  false,
  "product action approval must not send email or place voice calls",
);

const cp4Communication = readFileSync("src/server/repositories/cp4-communication.ts", "utf8");
assert.equal(
  /i\.amount\s*-\s*i\.amount_paid/i.test(cp4Communication),
  false,
  "CP4 communication must not use the retired invoice amount column",
);

console.log("CP7 product workflow API contract checks passed.");
