import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../server/aws/data-api-env";
import { getProductCustomerDetail } from "../../../../../server/repositories/product-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;
  const { id } = await context.params;

  try {
    const customer = await getProductCustomerDetail(id, { companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: customer });
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
        message: error instanceof Error ? error.message : "Unable to load product customer detail.",
      },
      { status: 500 },
    );
  }
}
