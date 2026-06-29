import "./load-local-env";

import { DataApiUnavailableError } from "../src/server/aws/data-api-env";
import { getCurrentCaseState } from "../src/server/repositories/case-state";

async function main() {
  const caseState = await getCurrentCaseState();

  assert(caseState.company.externalId.length > 0, "company external id is present");
  assert(caseState.customers.length > 0, "customers are present");
  assert(caseState.invoices.length > 0, "invoices are present");
  assert(caseState.obligations.length > 0, "obligations are present");
  assert(caseState.forecast !== null, "forecast is present");
  assert((caseState.forecast?.points.length ?? 0) > 0, "forecast points are present");
  assert(caseState.recommendedActions.length > 0, "recommended actions are present");
  assert(caseState.memoryFacts.length > 0, "memory facts are present");

  console.log("Current case smoke check passed.");
  console.log(`Company: ${caseState.company.name} (${caseState.company.externalId})`);
  console.log(`Case: ${caseState.caseId}`);
  console.log(`Customers: ${caseState.customers.length}`);
  console.log(`Invoices: ${caseState.invoices.length}`);
  console.log(`Obligations: ${caseState.obligations.length}`);
  console.log(`Forecast points: ${caseState.forecast?.points.length ?? 0}`);
  console.log(`Recommended actions: ${caseState.recommendedActions.length}`);
  console.log(`Memory facts: ${caseState.memoryFacts.length}`);
}

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`Smoke check failed: ${label}`);
  }
}

main().catch((error) => {
  if (error instanceof DataApiUnavailableError) {
    console.log("Current case smoke check unavailable.");
    console.log(`Missing environment variables: ${error.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.error("Current case smoke check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
