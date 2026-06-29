import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { createInternalCommunicationDraft } from "../../../../server/repositories/cp4-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateDraftRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  actionId?: string;
  actionExternalId?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  try {
    const body = validateCreateDraftRequest((await request.json()) as CreateDraftRequest);
    const result = await createInternalCommunicationDraft(
      {
        actionId: body.actionId,
        actionExternalId: body.actionExternalId,
        idempotencyKey: body.idempotencyKey,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    return NextResponse.json({ status: "ok", data: result });
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
        message: error instanceof Error ? error.message : "Unable to create CP4 communication draft.",
      },
      { status: 400 },
    );
  }
}

function validateCreateDraftRequest(body: CreateDraftRequest): CreateDraftRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  if (body.actionId && body.actionExternalId) {
    throw new Error("Provide only one of actionId or actionExternalId.");
  }

  return body;
}
