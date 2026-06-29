import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DataApiUnavailableError } from "../../../../../server/aws/data-api-env";
import {
  getProductScenarioPreviewState,
  scenarioPreviewRequestSchema,
} from "../../../../../server/repositories/product-scenarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = scenarioPreviewRequestSchema.parse(body);
    const preview = await getProductScenarioPreviewState(parsed);

    return NextResponse.json({ status: "ok", data: preview });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          status: "invalid_request",
          message: "Scenario preview assumptions are invalid.",
          issues: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        },
        { status: 400 },
      );
    }

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
        message: error instanceof Error ? error.message : "Unable to preview product scenario.",
      },
      { status: 500 },
    );
  }
}
