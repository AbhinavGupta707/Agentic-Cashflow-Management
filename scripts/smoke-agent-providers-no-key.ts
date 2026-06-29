import assert from "node:assert/strict";

import "./load-local-env";

import { runCashflowAgentGraph } from "../src/server/agents/cashflow-graph";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../src/server/db/case-state-contract";
import { demoCaseData } from "../src/server/demo-data/cashflow-demo";
import { createFireworksProvider } from "../src/server/providers/fireworks";
import { getLangSmithTracingStatus } from "../src/server/providers/langsmith";
import type { CompanyCaseState } from "../src/server/repositories/case-state";

async function main() {
  const noKeyEnv: NodeJS.ProcessEnv = { ...process.env };
  delete noKeyEnv.FIREWORKS_API_KEY;
  delete noKeyEnv.LANGSMITH_API_KEY;
  noKeyEnv.LANGSMITH_TRACING = "true";

  const fireworksStatus = createFireworksProvider({ env: noKeyEnv }).getStatus();
  assert.equal(fireworksStatus.status, "unavailable");
  assert.equal(fireworksStatus.reason, "no-key");
  assert.deepEqual(fireworksStatus.missingEnv, ["FIREWORKS_API_KEY"]);

  const langSmithStatus = getLangSmithTracingStatus(noKeyEnv);
  assert.equal(langSmithStatus.status, "unavailable");
  assert.equal(langSmithStatus.reason, "no-key");
  assert.deepEqual(langSmithStatus.missingEnv, ["LANGSMITH_API_KEY"]);

  const output = await runCashflowAgentGraph(
    {
      tenantId: "00000000-0000-4000-8000-000000000001",
      companyExternalId: DEFAULT_DEMO_COMPANY_ID,
      caseId: DEFAULT_DEMO_CASE_ID,
      idempotencyKey: "agent-run:no-key-smoke",
    },
    {
      env: noKeyEnv,
      persist: false,
      caseState: demoCaseState(),
    },
  );

  assert.equal(output.agentRunId, null);
  assert.equal(output.providerStatuses.fireworks.status, "unavailable");
  assert.equal(output.providerStatuses.fireworks.reason, "no-key");
  assert.equal(output.providerStatuses.langsmith.status, "unavailable");
  assert.equal(output.draft.source, "deterministic_fallback");
  assert.ok(output.recommendations.length > 0);
  assert.ok(output.checkpointKeys.includes("forecast.snapshot"));
  assert.ok(output.checkpointKeys.includes("draft.generated"));

  console.log("Agent provider no-key smoke passed.");
  console.log(`Fireworks status: ${output.providerStatuses.fireworks.status} (${output.providerStatuses.fireworks.reason})`);
  console.log(`LangSmith status: ${output.providerStatuses.langsmith.status} (${output.providerStatuses.langsmith.reason})`);
  console.log(`Draft source: ${output.draft.source}`);
  console.log(`Checkpoints exercised: ${output.checkpointKeys.join(", ")}`);
}

function demoCaseState(): CompanyCaseState {
  return {
    company: {
      externalId: demoCaseData.company.externalId,
      name: demoCaseData.company.name,
      industry: demoCaseData.company.industry,
      baseCurrency: demoCaseData.company.baseCurrency,
      cashBalanceCents: demoCaseData.company.cashBalanceCents,
    },
    caseId: demoCaseData.caseId,
    customers: demoCaseData.customers.map((customer) => {
      const [primaryContact] = customer.contacts;

      return {
        externalId: customer.externalId,
        name: customer.name,
        segment: customer.segment,
        paymentTermsDays: customer.paymentTermsDays,
        riskScore: customer.riskScore,
        primaryContact: primaryContact
          ? {
              fullName: primaryContact.fullName,
              email: primaryContact.email,
              role: primaryContact.role,
            }
          : null,
      };
    }),
    invoices: demoCaseData.invoices.map((invoice) => ({
      externalId: invoice.externalId,
      invoiceNumber: invoice.invoiceNumber,
      customerExternalId: invoice.customerExternalId,
      customerName: customerName(invoice.customerExternalId),
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      amountCents: invoice.amountCents,
      amountPaidCents: invoice.amountPaidCents,
      outstandingCents: invoice.amountCents - invoice.amountPaidCents,
      status: invoice.status,
      description: invoice.description,
    })),
    obligations: demoCaseData.obligations.map((obligation) => ({
      externalId: obligation.externalId,
      title: obligation.title,
      vendorName: obligation.vendorName,
      category: obligation.category,
      dueDate: obligation.dueDate,
      currency: obligation.currency,
      amountCents: obligation.amountCents,
      status: obligation.status,
      priority: obligation.priority,
    })),
    forecast: {
      runExternalId: demoCaseData.forecastRun.externalId,
      horizonStartDate: demoCaseData.forecastRun.horizonStartDate,
      horizonEndDate: demoCaseData.forecastRun.horizonEndDate,
      openingCashCents: demoCaseData.forecastRun.openingCashCents,
      minimumCashCents: demoCaseData.forecastRun.minimumCashCents,
      points: demoCaseData.forecastRun.points,
    },
    recommendedActions: demoCaseData.actionPlan.actions.map((action) => ({
      externalId: action.externalId,
      actionType: action.actionType,
      status: action.status,
      priority: action.priority,
      title: action.title,
      customerExternalId: action.customerExternalId,
      customerName: customerName(action.customerExternalId),
      invoiceExternalId: action.invoiceExternalId,
      expectedRecoveryCents: action.expectedRecoveryCents,
      rationale: action.rationale,
      approvalRequired: action.approvalRequired,
      scheduledFor: action.scheduledFor,
    })),
    memoryFacts: demoCaseData.memoryFacts.map((fact) => ({
      externalId: fact.externalId,
      customerExternalId: fact.customerExternalId,
      customerName: customerName(fact.customerExternalId),
      factText: fact.factText,
      confidence: fact.confidence,
      sourceKind: fact.sourceKind,
    })),
  };
}

function customerName(customerExternalId: string): string {
  return (
    demoCaseData.customers.find((customer) => customer.externalId === customerExternalId)?.name ??
    customerExternalId
  );
}

main().catch((error) => {
  console.error("Agent provider no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
