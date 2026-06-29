import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { getCp4CommunicationState } from "../../../../server/repositories/cp4-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;

  try {
    const state = await getCp4CommunicationState({ companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: state });
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
        message: error instanceof Error ? error.message : "Unable to load CP4 communication state.",
      },
      { status: 500 },
    );
  }
}
