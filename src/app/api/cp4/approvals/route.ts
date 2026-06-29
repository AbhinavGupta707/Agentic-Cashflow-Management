import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../server/aws/data-api-env";
import { decideApproval } from "../../../../server/repositories/cp4-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApprovalRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  actionId?: string;
  actionExternalId?: string;
  decision?: string;
  decisionNote?: string;
  decidedByUserId?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  try {
    const body = validateApprovalRequest((await request.json()) as ApprovalRequest);
    const result = await decideApproval(
      {
        actionId: body.actionId,
        actionExternalId: body.actionExternalId,
        decision: body.decision,
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
        message: error instanceof Error ? error.message : "Unable to decide CP4 approval.",
      },
      { status: 400 },
    );
  }
}

function validateApprovalRequest(body: ApprovalRequest): ApprovalRequest & { decision: "approved" | "rejected" } {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  if (body.actionId && body.actionExternalId) {
    throw new Error("Provide only one of actionId or actionExternalId.");
  }

  if (body.decision !== "approved" && body.decision !== "rejected") {
    throw new Error("decision must be approved or rejected.");
  }

  return body as ApprovalRequest & { decision: "approved" | "rejected" };
}
