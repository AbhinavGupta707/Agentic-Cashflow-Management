import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { getGmailProviderStatus } from "../../../../server/providers/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") ?? undefined;

  try {
    const providerStatus = await getGmailProviderStatus({ tenantId });
    const status = providerStatus.status === "available" ? 200 : 503;

    return NextResponse.json({ status: providerStatus.status, provider: providerStatus }, { status });
  } catch (error) {
    if (error instanceof DataApiUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          provider: "gmail",
          reason: "missing-config",
          message: error.message,
          missingEnv: error.missing,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "error",
        provider: "gmail",
        message: error instanceof Error ? error.message : "Unable to load Gmail provider status.",
      },
      { status: 500 },
    );
  }
}
