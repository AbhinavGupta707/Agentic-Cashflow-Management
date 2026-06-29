import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../server/aws/data-api-env";
import { getIngestionStatus } from "../../../server/repositories/ingestion-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;

  try {
    const ingestionStatus = await getIngestionStatus({ companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: ingestionStatus });
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
        message: error instanceof Error ? error.message : "Unable to load ingestion status.",
      },
      { status: 500 },
    );
  }
}
