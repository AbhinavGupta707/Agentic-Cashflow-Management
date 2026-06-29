import "./load-local-env";

import { readFileSync } from "node:fs";

import { getDataApiAvailability } from "../src/server/aws/data-api-env";
import { createAuroraDataApiClient } from "../src/server/aws/rds-data-api";
import { dryRunNormalizeCsv, processEventInbox } from "../src/server/ingestion/processor";
import { EXPECTED_CSV_HEADERS, importKindFromInput } from "../src/server/ingestion/normalize";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.has("dry-run");
  const kind = importKindFromInput(args.get("kind") ?? "invoices");

  if (dryRun) {
    const csvPath = args.get("csv");
    console.log("Event inbox processor dry run.");
    console.log(`Import kind: ${kind}`);
    console.log(`Expected headers: ${EXPECTED_CSV_HEADERS[kind].join(", ")}`);

    if (csvPath) {
      const csvText = readFileSync(csvPath, "utf8");
      const result = dryRunNormalizeCsv(kind, csvText);
      console.log(`Rows total: ${result.rowsTotal}`);
      console.log(`Rows valid: ${result.rowsSucceeded}`);
      console.log(`Rows invalid: ${result.rowsFailed}`);
      for (const error of result.errors) {
        console.log(error);
      }
    }
    return;
  }

  const availability = getDataApiAvailability();

  if (!availability.available) {
    console.error("Event inbox processor cannot run because Aurora Data API env is incomplete.");
    console.error(`Missing environment variables: ${availability.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dataApi = createAuroraDataApiClient(availability.config);
  const summary = await processEventInbox({
    dataApi,
    limit: Number.parseInt(args.get("limit") ?? "10", 10),
    eventId: args.get("event-id") ?? undefined,
    workerId: args.get("worker-id") ?? "script-process-event-inbox",
  });

  console.log("Event inbox processor finished.");
  console.log(`Claimed: ${summary.claimed}`);
  console.log(`Processed: ${summary.processed}`);
  console.log(`Failed events: ${summary.failed}`);
  console.log(`Rows succeeded: ${summary.rowsSucceeded}`);
  console.log(`Rows failed: ${summary.rowsFailed}`);
  for (const message of summary.messages) {
    console.log(message);
  }
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      index += 1;
    }
  }

  return args;
}

main().catch((error) => {
  console.error("Event inbox processor failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
