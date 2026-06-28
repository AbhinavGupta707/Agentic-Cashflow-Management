import { getDataApiAvailability } from "../src/server/aws/data-api-env";
import { createAuroraDataApiClient } from "../src/server/aws/rds-data-api";

type ProbeRow = {
  database_name: string;
  server_time: string;
};

async function main() {
  const availability = getDataApiAvailability();

  if (!availability.available) {
    console.log("Aurora Data API unavailable for this runtime.");
    console.log(`Missing environment variables: ${availability.missing.join(", ")}`);
    process.exitCode = 0;
    return;
  }

  const dataApi = createAuroraDataApiClient(availability.config);
  const [probe] = await dataApi.execute<ProbeRow>(
    `
      select
        current_database() as database_name,
        now()::text as server_time
    `,
  );

  console.log("Aurora Data API reachable.");
  console.log(`Database: ${probe.database_name}`);
  console.log(`Server time: ${probe.server_time}`);
}

main().catch((error) => {
  console.error("Aurora Data API check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
