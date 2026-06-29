import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import {
  Cp4ApprovalGateError,
  sendApprovedCommunicationDraft,
} from "../../../../server/repositories/cp4-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  draftId?: string;
  actionId?: string;
  actionExternalId?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  try {
    const body = validateSendRequest((await request.json()) as SendRequest);
    const result = await sendApprovedCommunicationDraft(
      {
        draftId: body.draftId,
        actionId: body.actionId,
        actionExternalId: body.actionExternalId,
        idempotencyKey: body.idempotencyKey,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    const httpStatus = result.state === "sent" ? 200 : 202;
    return NextResponse.json({ status: "ok", data: result }, { status: httpStatus });
  } catch (error) {
    if (error instanceof Cp4ApprovalGateError) {
      return NextResponse.json(
        {
          status: "blocked",
          code: error.code,
          message: error.message,
          data: error.result,
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
        message: error instanceof Error ? error.message : "Unable to attempt CP4 send.",
      },
      { status: 400 },
    );
  }
}

function validateSendRequest(body: SendRequest): SendRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const identifiers = [body.draftId, body.actionId, body.actionExternalId].filter(Boolean);

  if (identifiers.length > 1) {
    throw new Error("Provide only one of draftId, actionId, or actionExternalId.");
  }

  return body;
}
