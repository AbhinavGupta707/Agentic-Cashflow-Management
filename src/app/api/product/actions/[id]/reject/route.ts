import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../../server/aws/data-api-env";
import {
  ProductActionConflictError,
  rejectProductAction,
} from "../../../../../../server/repositories/product-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DecisionRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  decisionNote?: string;
  decidedByUserId?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const body = validateDecisionRequest(await readOptionalJsonObject(request));
    const result = await rejectProductAction(
      {
        actionIdOrExternalId: decodeURIComponent(id),
        decisionNote: body.decisionNote,
        decidedByUserId: body.decidedByUserId,
        idempotencyKey: body.idempotencyKey,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    return NextResponse.json({ status: "ok", data: result });
  } catch (error) {
    return productActionErrorResponse(error, "Unable to reject product action.");
  }
}

async function readOptionalJsonObject(request: Request): Promise<DecisionRequest> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as DecisionRequest;
}

function validateDecisionRequest(body: DecisionRequest): DecisionRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  return body;
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
