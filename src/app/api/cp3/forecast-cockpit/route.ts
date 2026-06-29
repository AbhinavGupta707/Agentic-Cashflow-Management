import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { getCp3ForecastCockpitState } from "../../../../server/repositories/cp3-forecast-cockpit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;

  try {
    const cp3State = await getCp3ForecastCockpitState({ companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: cp3State });
  } catch (error) {
    if (error instanceof DataApiUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          message: error.message,
          missingEnv: error.missing,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to load CP3 forecast cockpit state.",
      },
      { status: 500 },
    );
  }
}
