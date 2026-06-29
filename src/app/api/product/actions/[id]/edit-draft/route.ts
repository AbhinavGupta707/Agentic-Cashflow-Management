import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../../server/aws/data-api-env";
import {
  editProductActionDraft,
  ProductActionConflictError,
} from "../../../../../../server/repositories/product-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EditDraftRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  channel?: string;
  subject?: string | null;
  body?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const body = validateEditDraftRequest((await request.json()) as EditDraftRequest);
    const result = await editProductActionDraft(
      {
        actionIdOrExternalId: decodeURIComponent(id),
        channel: body.channel,
        subject: body.subject,
        body: body.body,
        idempotencyKey: body.idempotencyKey,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    return NextResponse.json({ status: "ok", data: result });
  } catch (error) {
    return productActionErrorResponse(error, "Unable to edit product action draft.");
  }
}

function validateEditDraftRequest(
  body: EditDraftRequest,
): EditDraftRequest & { body: string; channel?: "email" | "voice_script" } {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  if (body.channel !== undefined && body.channel !== "email" && body.channel !== "voice_script") {
    throw new Error("channel must be email or voice_script.");
  }

  if (typeof body.body !== "string" || body.body.trim().length === 0) {
    throw new Error("body must be a non-empty string.");
  }

  if (body.subject !== undefined && body.subject !== null && typeof body.subject !== "string") {
    throw new Error("subject must be a string or null.");
  }

  return body as EditDraftRequest & { body: string; channel?: "email" | "voice_script" };
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
