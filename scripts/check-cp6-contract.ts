import "./load-local-env";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

type HttpMethod = "GET" | "POST";

type ProductRouteCheck = {
  label: string;
  path: string;
  method: HttpMethod;
  keywords: readonly string[];
};

const strictProductRoutes = isTruthy(process.env.CP6_REQUIRE_PRODUCT_ROUTES);

const productRouteChecks: readonly ProductRouteCheck[] = [
  {
    label: "overview summary",
    path: "src/app/api/product/overview/route.ts",
    method: "GET",
    keywords: ["company", "case", "cashflow", "actions", "approvals", "agent", "lastUpdated"],
  },
  {
    label: "scenario list",
    path: "src/app/api/product/scenarios/route.ts",
    method: "GET",
    keywords: ["baseline", "optimistic", "conservative", "projection"],
  },
  {
    label: "scenario preview",
    path: "src/app/api/product/scenarios/preview/route.ts",
    method: "POST",
    keywords: ["assumptions", "baseline", "optimistic", "conservative"],
  },
  {
    label: "action list",
    path: "src/app/api/product/actions/route.ts",
    method: "GET",
    keywords: ["approval", "guardrails", "evidence", "provider"],
  },
  {
    label: "action detail",
    path: "src/app/api/product/actions/[id]/route.ts",
    method: "GET",
    keywords: ["rationale", "preview", "evidence", "guardrails"],
  },
  {
    label: "action approval",
    path: "src/app/api/product/actions/[id]/approve/route.ts",
    method: "POST",
    keywords: ["approval", "approved", "provider", "guardrails"],
  },
  {
    label: "action rejection",
    path: "src/app/api/product/actions/[id]/reject/route.ts",
    method: "POST",
    keywords: ["approval", "rejected"],
  },
  {
    label: "action draft edit",
    path: "src/app/api/product/actions/[id]/edit-draft/route.ts",
    method: "POST",
    keywords: ["draft", "approval"],
  },
  {
    label: "customer list",
    path: "src/app/api/product/customers/route.ts",
    method: "GET",
    keywords: ["exposure", "risk", "memory", "evidence"],
  },
  {
    label: "customer detail",
    path: "src/app/api/product/customers/[id]/route.ts",
    method: "GET",
    keywords: ["history", "learned", "outreach", "script", "evidence"],
  },
  {
    label: "voice status",
    path: "src/app/api/product/voice/status/route.ts",
    method: "GET",
    keywords: ["twilio", "elevenlabs", "unavailable", "approval"],
  },
  {
    label: "voice call initiation",
    path: "src/app/api/product/voice/calls/route.ts",
    method: "POST",
    keywords: ["approval", "twilio", "provider", "providerCallId"],
  },
  {
    label: "agent activity",
    path: "src/app/api/product/agent-activity/route.ts",
    method: "GET",
    keywords: ["checkpoints", "provider", "trace", "audit"],
  },
] as const;

const uiReferenceChecks = [
  ["Overview reference", "Ui References/1.png"],
  ["Actions reference", "Ui References/2.png"],
  ["Customers reference", "Ui References/3.png"],
  ["Forecasts reference", "Ui References/4.png"],
] as const;

const docsChecks = [
  {
    label: "CP5/CP6 orchestration names all four reference screens",
    path: "docs/checkpoint-5-6-orchestration.md",
    keywords: ["Overview", "Actions", "Customers", "Forecasts"],
  },
  {
    label: "live product plan documents product API surface",
    path: "docs/live-product-ui-agent-plan.md",
    keywords: ["/api/product/overview", "/api/product/actions", "/api/product/customers", "/api/product/scenarios"],
  },
] as const;

let failed = false;
let pendingRoutes = 0;

for (const [label, path] of uiReferenceChecks) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath) || statSync(absolutePath).size === 0) {
    failed = true;
    console.error(`missing CP6 UI reference: ${label} at ${path}`);
  } else {
    console.log(`ok CP6 UI reference: ${label} at ${path}`);
  }
}

for (const check of docsChecks) {
  if (!existsSync(resolve(check.path))) {
    failed = true;
    console.error(`missing CP6 docs contract: ${check.label}`);
    continue;
  }

  const text = readFileSync(resolve(check.path), "utf8");
  const missingKeywords = check.keywords.filter((keyword) => !text.includes(keyword));
  if (missingKeywords.length > 0) {
    failed = true;
    console.error(`missing CP6 docs contract: ${check.label} lacks ${missingKeywords.join(", ")}`);
  } else {
    console.log(`ok CP6 docs contract: ${check.label}`);
  }
}

for (const check of productRouteChecks) {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    pendingRoutes += 1;
    const message = `pending CP6 product API route: ${check.method} ${routeLabel(check.path)} (${check.label})`;
    if (strictProductRoutes) {
      failed = true;
      console.error(message);
    } else {
      console.log(`${message}; set CP6_REQUIRE_PRODUCT_ROUTES=true during integration to hard-fail.`);
    }
    continue;
  }

  const routeText = readFileSync(absolutePath, "utf8");
  if (!hasMethodExport(routeText, check.method)) {
    failed = true;
    console.error(`missing CP6 product API method export: ${check.method} ${check.path}`);
  } else {
    console.log(`ok CP6 product API method export: ${check.method} ${check.path}`);
  }

  const supportingText = routeText + "\n" + readSupportingProductFiles(check.path);
  const missingKeywords = check.keywords.filter((keyword) => !supportingText.toLowerCase().includes(keyword.toLowerCase()));
  if (missingKeywords.length > 0) {
    failed = true;
    console.error(`missing CP6 product API contract keywords for ${check.label}: ${missingKeywords.join(", ")}`);
  } else {
    console.log(`ok CP6 product API contract keywords: ${check.label}`);
  }
}

if (!existsSync(resolve("src/app/api/product")) && !strictProductRoutes) {
  console.log("No src/app/api/product tree found yet; CP6 product API implementation is still pending in adjacent lanes.");
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Checkpoint 6 contract check passed.");
  if (pendingRoutes > 0) {
    console.log(`CP6 pending product routes reported without failing this isolated QA/docs lane: ${pendingRoutes}.`);
  }
}

function hasMethodExport(text: string, method: HttpMethod): boolean {
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`).test(text)
    || new RegExp(`export\\s+const\\s+${method}\\s*=`).test(text);
}

function readSupportingProductFiles(routePath: string): string {
  const routeDirectory = dirname(resolve(routePath));
  const candidateDirectories = [
    routeDirectory,
    resolve("src/server/repositories"),
    resolve("src/server/db"),
  ];

  return candidateDirectories
    .filter((directory) => existsSync(directory))
    .flatMap((directory) =>
      readdirSync(directory)
        .filter((fileName) => /product|voice|scenario|action|customer|agent/i.test(fileName))
        .map((fileName) => resolve(directory, fileName)),
    )
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function routeLabel(path: string): string {
  return `/${path.replace(/^src\/app\/api\//, "api/").replace(/\/route\.ts$/, "")}`;
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}
