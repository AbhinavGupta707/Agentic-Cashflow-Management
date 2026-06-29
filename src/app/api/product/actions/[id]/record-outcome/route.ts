import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../../server/aws/data-api-env";
import {
  ProductActionConflictError,
  recordProductActionOutcome,
  type ProductActionOutcomeType,
} from "../../../../../../server/repositories/product-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordOutcomeRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  outcomeType?: ProductActionOutcomeType;
  summary?: string;
  promisedPaymentDate?: string | null;
  confidence?: number | null;
  idempotencyKey?: string;
};

const outcomeTypes = new Set<ProductActionOutcomeType>([
  "manual_note",
  "promise_to_pay",
  "payment_confirmed",
  "no_answer",
  "dispute_raised",
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const body = validateRecordOutcomeRequest((await request.json()) as RecordOutcomeRequest);
    const result = await recordProductActionOutcome(
      {
        actionIdOrExternalId: decodeURIComponent(id),
        outcomeType: body.outcomeType,
        summary: body.summary,
        promisedPaymentDate: body.promisedPaymentDate,
        confidence: body.confidence,
        idempotencyKey: body.idempotencyKey,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    return NextResponse.json({ status: "ok", data: result });
  } catch (error) {
    return productActionErrorResponse(error, "Unable to record product action outcome.");
  }
}

function validateRecordOutcomeRequest(
  body: RecordOutcomeRequest,
): RecordOutcomeRequest & { outcomeType: ProductActionOutcomeType; summary: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  if (!body.outcomeType || !outcomeTypes.has(body.outcomeType)) {
    throw new Error("outcomeType must be one of manual_note, promise_to_pay, payment_confirmed, no_answer, or dispute_raised.");
  }

  if (typeof body.summary !== "string" || body.summary.trim().length < 8) {
    throw new Error("summary must be at least 8 characters.");
  }

  if (
    body.promisedPaymentDate !== undefined &&
    body.promisedPaymentDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.promisedPaymentDate)
  ) {
    throw new Error("promisedPaymentDate must be YYYY-MM-DD when provided.");
  }

  if (
    body.confidence !== undefined &&
    body.confidence !== null &&
    (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1)
  ) {
    throw new Error("confidence must be a number from 0 to 1.");
  }

  return body as RecordOutcomeRequest & { outcomeType: ProductActionOutcomeType; summary: string };
}

function productActionErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ProductActionConflictError) {
    return NextResponse.json(
      {
        status: "blocked",
        code: error.code,
        message: error.message,
      },
      { status: 409 },
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
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 400 },
  );
}
