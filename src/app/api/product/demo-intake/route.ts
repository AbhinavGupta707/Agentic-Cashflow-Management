import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { S3UnavailableError } from "../../../../server/aws/s3-env";
import {
  buildCp8DemoIntakePlan,
  parseCp8DemoIntakeMode,
  runCp8DemoIntake,
  validateCp8DemoIntakePlan,
} from "../../../../server/demo/cp8-live-intake";
import {
  UploadStorageError,
  UploadValidationError,
  UploadWriteError,
} from "../../../../server/ingestion/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const mode = parseCp8DemoIntakeMode(url.searchParams.get("mode"));
    const plan = buildCp8DemoIntakePlan({
      mode,
      companyExternalId:
        url.searchParams.get("companyId") ?? url.searchParams.get("companyExternalId") ?? undefined,
      caseId: url.searchParams.get("caseId") ?? undefined,
    });
    validateCp8DemoIntakePlan(plan);

    return NextResponse.json({
      status: "ok",
      data: {
        plan,
        processed: false,
        message:
          "POST this route to upload the sample pack to S3, queue and process event_inbox rows, refresh forecast state, and persist agent graph evidence.",
      },
    });
  } catch (error) {
    return demoIntakeErrorResponse(error, "Unable to build CP8 demo intake plan.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const mode = parseCp8DemoIntakeMode(body.mode);
    const result = await runCp8DemoIntake({
      mode,
      companyExternalId: optionalString(body.companyExternalId ?? body.companyId),
      caseId: optionalString(body.caseId),
      process: body.process === undefined ? true : Boolean(body.process),
    });

    return NextResponse.json({ status: "ok", data: result });
  } catch (error) {
    return demoIntakeErrorResponse(error, "Unable to run CP8 demo intake.");
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-length") === "0") {
    return {};
  }

  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function demoIntakeErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof DataApiUnavailableError || error instanceof S3UnavailableError) {
    return NextResponse.json(
      {
        status: "unavailable",
        message: error.message,
        missingEnv: error.missing,
      },
      { status: 503 },
    );
  }

  if (error instanceof UploadValidationError) {
    return NextResponse.json(
      {
        status: "error",
        code: error.code,
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof UploadStorageError || error instanceof UploadWriteError) {
    return NextResponse.json(
      {
        status: "error",
        message: error.message,
      },
      { status: 502 },
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
