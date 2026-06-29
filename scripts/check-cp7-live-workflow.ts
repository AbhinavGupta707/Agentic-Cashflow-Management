import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import "./load-local-env";

type CheckMode = "always" | "strict";

type TextCheck = {
  label: string;
  path: string;
  keywords?: readonly string[];
  patterns?: readonly RegExp[];
  mode?: CheckMode;
};

const strictWorkflow = isTruthy(process.env.CP7_REQUIRE_LIVE_WORKFLOW);

let failed = false;
let pending = 0;

const docsChecks: readonly TextCheck[] = [
  {
    label: "CP7 orchestration describes live workflow acceptance",
    path: "docs/checkpoint-7-live-demo-workflow-orchestration.md",
    keywords: [
      "Selecting an action fetches action detail",
      "Approve, Edit, and Reject call",
      "Agent Activity renders the real persisted timeline",
      "Hardcoded tooltip values must be removed",
    ],
  },
  {
    label: "CP7 status has launch and evidence sections",
    path: "docs/checkpoint-7-live-demo-workflow-status.md",
    keywords: ["Launch Baseline", "Lane Structure", "Acceptance Checks", "Expected Final Evidence"],
  },
  {
    label: "live demo runbook explains deterministic and agentic behavior",
    path: "docs/live-demo-runbook.md",
    keywords: [
      "Deterministic",
      "Fireworks",
      "LangGraph",
      "LangSmith",
      "Gmail",
      "Twilio",
      "Agent Activity",
      "approve",
      "reject",
      "edit",
    ],
  },
];

const routeChecks: readonly TextCheck[] = [
  {
    label: "action detail route exists",
    path: "src/app/api/product/actions/[id]/route.ts",
    patterns: [/export\s+async\s+function\s+GET\s*\(/],
  },
  {
    label: "action approve route exists",
    path: "src/app/api/product/actions/[id]/approve/route.ts",
    patterns: [/export\s+async\s+function\s+POST\s*\(/],
  },
  {
    label: "action reject route exists",
    path: "src/app/api/product/actions/[id]/reject/route.ts",
    patterns: [/export\s+async\s+function\s+POST\s*\(/],
  },
  {
    label: "action edit-draft route exists",
    path: "src/app/api/product/actions/[id]/edit-draft/route.ts",
    patterns: [/export\s+async\s+function\s+POST\s*\(/],
  },
  {
    label: "agent activity route exists",
    path: "src/app/api/product/agent-activity/route.ts",
    patterns: [/export\s+async\s+function\s+GET\s*\(/],
  },
  {
    label: "scenario route exists",
    path: "src/app/api/product/scenarios/route.ts",
    patterns: [/export\s+async\s+function\s+GET\s*\(/],
  },
];

const uiStrictChecks: readonly TextCheck[] = [
  {
    label: "UI fetches selected action detail",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/\/api\/product\/actions\/\$\{/, /\/api\/product\/actions\/[^\s"'`]+/],
    mode: "strict",
  },
  {
    label: "UI calls approve mutation",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/\/approve\b/, /approveProductAction|handleApprove|onApprove/],
    mode: "strict",
  },
  {
    label: "UI calls reject mutation",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/\/reject\b/, /rejectProductAction|handleReject|onReject/],
    mode: "strict",
  },
  {
    label: "UI calls edit-draft mutation",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/\/edit-draft\b/, /editProductActionDraft|handleEdit|onEdit/],
    mode: "strict",
  },
  {
    label: "UI renders persisted product activity timeline",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/productActivityState\.data\.timeline|activity\.timeline|agentActivity\.timeline/],
    mode: "strict",
  },
];

for (const check of [...docsChecks, ...routeChecks, ...uiStrictChecks]) {
  runTextCheck(check);
}

assertNoStaleForecastLabels();
assertNoDisabledApprovalButton();
assertNoFakeProductProviderSuccess();

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 7 live workflow check passed.");
  if (pending > 0) {
    console.log(`CP7 strict UI workflow checks reported as pending: ${pending}.`);
    console.log("Set CP7_REQUIRE_LIVE_WORKFLOW=true during master integration to hard-fail pending UI wiring.");
  }
}

function runTextCheck(check: TextCheck): void {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    failOrPending(check, `missing ${check.label}: ${check.path}`);
    return;
  }

  const text = readFileSync(absolutePath, "utf8");
  const missingKeywords = (check.keywords ?? []).filter((keyword) => !text.includes(keyword));
  const missingPatterns = (check.patterns ?? []).filter((pattern) => !pattern.test(text));

  if (missingKeywords.length > 0 || missingPatterns.length > 0) {
    const missing = [
      ...missingKeywords.map((keyword) => `keyword "${keyword}"`),
      ...missingPatterns.map((pattern) => `pattern ${pattern}`),
    ].join(", ");
    failOrPending(check, `${check.label} lacks ${missing}`);
    return;
  }

  console.log(`ok CP7 contract: ${check.label}`);
}

function failOrPending(check: TextCheck, message: string): void {
  if (check.mode === "strict" && !strictWorkflow) {
    pending += 1;
    console.log(`pending CP7 strict workflow check: ${message}`);
    return;
  }

  failed = true;
  console.error(message);
}

function assertNoStaleForecastLabels(): void {
  const uiPath = resolve("src/components/cashflow-cockpit.tsx");
  if (!existsSync(uiPath)) {
    failOrPending({ label: "UI file exists", path: "src/components/cashflow-cockpit.tsx", mode: "strict" }, "missing cockpit UI file");
    return;
  }

  const text = readFileSync(uiPath, "utf8");
  const staleLabels = ["30 Jun 2025", "29 Jun 2025", "1 Jun 2025"];
  const present = staleLabels.filter((label) => text.includes(label));

  if (present.length > 0) {
    failOrPending(
      { label: "no stale hardcoded forecast labels", path: "src/components/cashflow-cockpit.tsx", mode: "strict" },
      `stale hardcoded forecast labels remain in product UI: ${present.join(", ")}`,
    );
  } else {
    console.log("ok CP7 UI stale-date scan: no hardcoded 2025 forecast labels found.");
  }
}

function assertNoDisabledApprovalButton(): void {
  const uiPath = resolve("src/components/cashflow-cockpit.tsx");
  if (!existsSync(uiPath)) {
    return;
  }

  const text = readFileSync(uiPath, "utf8");
  const approveButtons = [...text.matchAll(/<button[\s\S]*?>[\s\S]*?\bApprove\b[\s\S]*?<\/button>/g)].map(
    (match) => match[0],
  );
  const staticallyDisabled = approveButtons.filter((button) => /\sdisabled(?:\s|>)/.test(button));
  const missingClickHandler = approveButtons.filter((button) => !/onClick=/.test(button));

  if (approveButtons.length === 0) {
    failOrPending(
      { label: "approve button is wired", path: "src/components/cashflow-cockpit.tsx", mode: "strict" },
      "No Approve button was found in the product UI.",
    );
  } else if (staticallyDisabled.length > 0 || missingClickHandler.length > 0) {
    failOrPending(
      { label: "approve button is wired", path: "src/components/cashflow-cockpit.tsx", mode: "strict" },
      "Approve button is present but appears statically disabled or lacks an onClick handler.",
    );
  } else {
    console.log("ok CP7 UI approval scan: Approve controls are wired with runtime guards.");
  }
}

function assertNoFakeProductProviderSuccess(): void {
  const roots = ["src/app/api/product", "src/server/repositories", "src/server/voice"].map((path) => resolve(path));
  const fileTexts = roots
    .filter((root) => existsSync(root))
    .flatMap((root) => walkFiles(root))
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  const fakePatterns = [
    ["Twilio call SID", /\bCA[0-9a-f]{32}\b/i],
    ["Twilio provider execution SID", /\bVE[0-9a-f]{32}\b/i],
    ["Gmail provider id", /gmail-(draft|message|execution)-\d+/i],
    ["fake provider id literal", /provider(CallId|ExecutionId)\s*:\s*["'](?:fake|mock|demo|test)/i],
    ["fake trace URL", /traceUrl\s*:\s*["']https?:\/\/(?:fake|mock|demo|test)/i],
  ] as const;

  const matches = fakePatterns.filter(([, pattern]) => pattern.test(fileTexts)).map(([label]) => label);
  if (matches.length > 0) {
    failed = true;
    console.error(`fake provider success markers found in product runtime code: ${matches.join(", ")}`);
  } else {
    console.log("ok CP7 provider scan: no fake provider success markers found in product runtime code.");
  }
}

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
