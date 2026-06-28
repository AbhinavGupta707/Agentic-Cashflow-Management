import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../server/aws/data-api-env";
import { getCurrentCaseState } from "../../../server/repositories/case-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;

  try {
    const caseState = await getCurrentCaseState({ companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: caseState });
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
        message: error instanceof Error ? error.message : "Unable to load current case state.",
      },
      { status: 500 },
    );
  }
}
