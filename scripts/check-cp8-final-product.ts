import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import "./load-local-env";

type CheckMode = "always" | "final";

type TextCheck = {
  label: string;
  path: string;
  keywords?: readonly string[];
  patterns?: readonly RegExp[];
  mode?: CheckMode;
};

type RouteCheck = {
  label: string;
  path: string;
  method: "GET" | "POST";
  keywords?: readonly string[];
  mode?: CheckMode;
};

const strictFinalProduct = isTruthy(process.env.CP8_REQUIRE_FINAL_PRODUCT);

let failed = false;
let pending = 0;

const docsChecks: readonly TextCheck[] = [
  {
    label: "CP8 orchestration names final live loop and lane ownership",
    path: "docs/checkpoint-8-final-product-orchestration.md",
    keywords: [
      "upload real sample finance data",
      "execute exactly one safe provider action",
      "Outcome Learning",
      "Submission Proof Assets",
      "QA, Submission Package, And Demo Evidence",
    ],
  },
  {
    label: "CP8 status tracks launch, done criteria, and evidence",
    path: "docs/checkpoint-8-final-product-status.md",
    keywords: ["Launch Registry", "Done Criteria", "Final Evidence Template", "Known gated flows"],
  },
  {
    label: "final submission package is Devpost-ready",
    path: "docs/h0-final-submission-package.md",
    keywords: [
      "Elevator Pitch",
      "Built With",
      "How Aurora PostgreSQL Is Used",
      "Published Vercel Project Link",
      "Vercel Team ID",
      "Public Content Draft",
      "#H0Hackathon",
      "Safety, Privacy, And Boundaries",
    ],
  },
  {
    label: "architecture diagram is repo-native and submission-safe",
    path: "docs/h0-architecture-diagram.md",
    keywords: [
      "```mermaid",
      "Vercel Next.js",
      "Aurora PostgreSQL",
      "RDS Data API",
      "S3",
      "LangGraph",
      "Fireworks",
      "LangSmith",
      "Twilio",
      "Gmail",
      "audit",
      "memory",
    ],
  },
  {
    label: "final QA checklist covers browser, provider, proof, and reset",
    path: "docs/checkpoint-8-final-qa-checklist.md",
    keywords: [
      "Production Browser QA",
      "Upload And Event Loop",
      "Approval And Execution",
      "Outcome Memory",
      "Submission Proof",
      "Reset",
    ],
  },
  {
    label: "live demo runbook includes final product walkthrough",
    path: "docs/live-demo-runbook.md",
    keywords: ["Quick Demo Path", "Agent Activity", "Twilio", "TWILIO_TEST_TO_NUMBER"],
  },
  {
    label: "blue-sky demo script stays under the final product story",
    path: "docs/h0-blue-sky-demo-script.md",
    keywords: ["under 3 minutes", "Aurora PostgreSQL", "Fireworks", "human approval", "Agent Activity"],
  },
];

const routeChecks: readonly RouteCheck[] = [
  {
    label: "file upload intake route",
    path: "src/app/api/uploads/route.ts",
    method: "POST",
    keywords: ["uploadSourceFile", "source", "S3", "event"],
  },
  {
    label: "manual event/intake route",
    path: "src/app/api/manual-records/route.ts",
    method: "POST",
    keywords: ["event", "invoice", "obligation", "payment"],
  },
  {
    label: "agent activity proof route",
    path: "src/app/api/product/agent-activity/route.ts",
    method: "GET",
    keywords: ["checkpoints", "provider", "audit"],
  },
  {
    label: "voice status readiness route",
    path: "src/app/api/product/voice/status/route.ts",
    method: "GET",
    keywords: ["twilio", "approval", "unavailable"],
  },
  {
    label: "approval-gated voice execution route",
    path: "src/app/api/product/voice/calls/route.ts",
    method: "POST",
    keywords: ["approval", "twilio", "provider"],
  },
  {
    label: "outcome webhook ingestion route",
    path: "src/app/api/product/voice/webhooks/twilio/route.ts",
    method: "POST",
    keywords: ["CallSid", "transcript", "providerCallId"],
  },
  {
    label: "scenario preview route",
    path: "src/app/api/product/scenarios/preview/route.ts",
    method: "POST",
    keywords: ["assumptions", "optimistic", "conservative"],
  },
];

const finalRuntimeChecks: readonly TextCheck[] = [
  {
    label: "UI exposes upload or sample-pack affordance",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/Upload|sample pack|sample-pack|Load sample|Import/i, /\/api\/uploads|\/api\/manual-records/i],
    mode: "final",
  },
  {
    label: "UI exposes explicit approved test-call execution",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/\/api\/product\/voice\/calls/i, /live=true|TWILIO_TEST_TO_NUMBER|test number|Execute call/i],
    mode: "final",
  },
  {
    label: "UI foregrounds outcome memory in customer or activity surfaces",
    path: "src/components/cashflow-cockpit.tsx",
    patterns: [/learnedFacts|learned facts|Outcome memory|memory/i, /Agent Activity|Customers/i],
    mode: "final",
  },
];

for (const check of docsChecks) {
  runTextCheck(check);
}

for (const check of routeChecks) {
  runRouteCheck(check);
}

for (const check of finalRuntimeChecks) {
  runTextCheck(check);
}

assertSubmissionAssets();
assertNoFakeProviderSuccess();
assertPackageScript();

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 8 final product contract check passed.");
  if (pending > 0) {
    console.log(`CP8 final runtime checks reported as pending: ${pending}.`);
    console.log("Set CP8_REQUIRE_FINAL_PRODUCT=true during master integration to hard-fail pending runtime proof.");
  }
}

function runTextCheck(check: TextCheck): void {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    failOrPending(check, `missing CP8 contract file for ${check.label}: ${check.path}`);
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
    failOrPending(check, `CP8 contract gap in ${check.label}: lacks ${missing}`);
    return;
  }

  console.log(`ok CP8 contract: ${check.label}`);
}

function runRouteCheck(check: RouteCheck): void {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    failOrPending(check, `missing CP8 route for ${check.label}: ${check.path}`);
    return;
  }

  const text = readFileSync(absolutePath, "utf8");
  const supportingText = `${text}\n${readSupportingProductFiles(check.path)}`;
  if (!hasMethodExport(text, check.method)) {
    failOrPending(check, `missing ${check.method} export for CP8 route ${check.path}`);
    return;
  }

  const missingKeywords = (check.keywords ?? []).filter(
    (keyword) => !supportingText.toLowerCase().includes(keyword.toLowerCase()),
  );
  if (missingKeywords.length > 0) {
    failOrPending(check, `CP8 route ${check.label} lacks ${missingKeywords.join(", ")}`);
    return;
  }

  console.log(`ok CP8 route: ${check.method} ${check.path}`);
}

function assertSubmissionAssets(): void {
  const requiredDocs = [
    "docs/h0-final-submission-package.md",
    "docs/h0-architecture-diagram.md",
    "docs/checkpoint-8-final-qa-checklist.md",
    "docs/h0-final-submission-readiness-plan.md",
    "docs/h0-blue-sky-demo-script.md",
  ];

  for (const path of requiredDocs) {
    const absolutePath = resolve(path);
    if (!existsSync(absolutePath) || statSync(absolutePath).size === 0) {
      failed = true;
      console.error(`missing or empty CP8 submission asset: ${path}`);
    } else {
      console.log(`ok CP8 submission asset: ${path}`);
    }
  }
}

function assertNoFakeProviderSuccess(): void {
  const roots = ["src/app/api", "src/server"].map((path) => resolve(path));
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
    ["fake provider id literal", /provider(CallId|ExecutionId|MessageId)\s*:\s*["'](?:fake|mock|demo|test)/i],
    ["fake trace URL", /traceUrl\s*:\s*["']https?:\/\/(?:fake|mock|demo|test)/i],
  ] as const;

  const matches = fakePatterns.filter(([, pattern]) => pattern.test(fileTexts)).map(([label]) => label);
  if (matches.length > 0) {
    failed = true;
    console.error(`fake provider success markers found in runtime/check code: ${matches.join(", ")}`);
  } else {
    console.log("ok CP8 provider scan: no fake provider success markers found.");
  }
}

function assertPackageScript(): void {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  if (packageJson.scripts?.["check:cp8"] !== "tsx scripts/check-cp8-final-product.ts") {
    failed = true;
    console.error("package.json must expose check:cp8 as tsx scripts/check-cp8-final-product.ts");
  } else {
    console.log("ok CP8 package script: check:cp8");
  }
}

function failOrPending(check: { label: string; mode?: CheckMode }, message: string): void {
  if (check.mode === "final" && !strictFinalProduct) {
    pending += 1;
    console.log(`pending CP8 final product check: ${message}`);
    return;
  }

  failed = true;
  console.error(message);
}

function hasMethodExport(text: string, method: "GET" | "POST"): boolean {
  return (
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`).test(text) ||
    new RegExp(`export\\s+const\\s+${method}\\s*=`).test(text)
  );
}

function readSupportingProductFiles(routePath: string): string {
  const routeDirectory = dirname(resolve(routePath));
  const candidateDirectories = [
    routeDirectory,
    resolve("src/server/repositories"),
    resolve("src/server/db"),
    resolve("src/server/ingestion"),
    resolve("src/server/voice"),
    resolve("src/server/providers"),
  ];

  return candidateDirectories
    .filter((directory) => existsSync(directory))
    .flatMap((directory) =>
      readdirSync(directory)
        .filter((fileName) => /product|voice|twiml|scenario|action|customer|agent|ingest|upload|manual|event|fireworks|langsmith|gmail|twilio/i.test(fileName))
        .map((fileName) => resolve(directory, fileName)),
    )
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}
