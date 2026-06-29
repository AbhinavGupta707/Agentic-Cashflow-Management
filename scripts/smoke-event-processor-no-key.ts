import "./load-local-env";

import { getDataApiAvailability } from "../src/server/aws/data-api-env";
import { EXPECTED_CSV_HEADERS } from "../src/server/ingestion/normalize";

async function main() {
  const availability = getDataApiAvailability();

  if (availability.available) {
    console.log("Aurora Data API env is configured; no-key smoke intentionally did not use fixture fallback.");
    console.log("Run `tsx scripts/process-event-inbox.ts --limit 10` for a live processor check.");
    return;
  }

  console.log("Event processor no-key smoke passed.");
  console.log(`Missing live env: ${availability.missing.join(", ")}`);
  console.log(`Customer CSV headers: ${EXPECTED_CSV_HEADERS.customers.join(", ")}`);
  console.log(`Invoice CSV headers: ${EXPECTED_CSV_HEADERS.invoices.join(", ")}`);
  console.log("Live processing is unavailable until Aurora Data API env is configured.");
}

main().catch((error) => {
  console.error("Event processor no-key smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
