import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../server/aws/data-api-env";
import { getProductActionDetail } from "../../../../../server/repositories/product-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const { id } = await context.params;

  try {
    const action = await getProductActionDetail(
      { actionIdOrExternalId: decodeURIComponent(id) },
      {
        companyExternalId: url.searchParams.get("companyId") ?? url.searchParams.get("companyExternalId") ?? undefined,
        caseId: url.searchParams.get("caseId") ?? undefined,
      },
    );

    return NextResponse.json({ status: "ok", data: action });
  } catch (error) {
    return productActionErrorResponse(error, "Unable to load product action.");
  }
}

function productActionErrorResponse(error: unknown, fallbackMessage: string) {
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
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: error instanceof Error && /Unable to find/.test(error.message) ? 404 : 500 },
  );
}
