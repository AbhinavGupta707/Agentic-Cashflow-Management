import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { listProductActions } from "../../../../server/repositories/product-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const state = await listProductActions({
      companyExternalId: url.searchParams.get("companyId") ?? url.searchParams.get("companyExternalId") ?? undefined,
      caseId: url.searchParams.get("caseId") ?? undefined,
    });

    return NextResponse.json({ status: "ok", data: state });
  } catch (error) {
    return productActionErrorResponse(error, "Unable to load product actions.");
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
    { status: 500 },
  );
}
