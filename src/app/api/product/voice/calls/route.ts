import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../server/aws/data-api-env";
import {
  initiateApprovalGatedVoiceCall,
  previewVoiceCall,
  VoiceApprovalGateError,
  type InitiateVoiceCallInput,
} from "../../../../../server/voice/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoiceCallRequest = InitiateVoiceCallInput & {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyExternalId = url.searchParams.get("companyId") ?? undefined;
  const caseId = url.searchParams.get("caseId") ?? undefined;
  const actionId = url.searchParams.get("actionId") ?? undefined;
  const actionExternalId = url.searchParams.get("actionExternalId") ?? undefined;

  try {
    const preview = await previewVoiceCall({ actionId, actionExternalId }, { companyExternalId, caseId });
    return NextResponse.json({ status: "ok", data: preview });
  } catch (error) {
    return errorResponse(error, "Unable to preview voice call.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = validateVoiceCallRequest((await request.json()) as VoiceCallRequest);
    const result = await initiateApprovalGatedVoiceCall(body, {
      companyExternalId: body.companyExternalId ?? body.companyId,
      caseId: body.caseId,
    });
    const httpStatus = result.state === "queued" ? 200 : 202;

    return NextResponse.json({ status: "ok", data: result }, { status: httpStatus });
  } catch (error) {
    if (error instanceof VoiceApprovalGateError) {
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

    return errorResponse(error, "Unable to initiate voice call.", 400);
  }
}

function validateVoiceCallRequest(body: VoiceCallRequest): VoiceCallRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const identifiers = [body.actionId, body.actionExternalId].filter(Boolean);
  if (identifiers.length > 1) {
    throw new Error("Provide only one of actionId or actionExternalId.");
  }

  if (identifiers.length === 0) {
    throw new Error("Provide actionId or actionExternalId.");
  }

  if (body.approved !== undefined && typeof body.approved !== "boolean") {
    throw new Error("approved must be a boolean when provided.");
  }

  if (body.live !== undefined && typeof body.live !== "boolean") {
    throw new Error("live must be a boolean when provided.");
  }

  if (body.targetPhoneE164 !== undefined && body.targetPhoneE164 !== null && !/^\+[1-9]\d{7,14}$/.test(body.targetPhoneE164)) {
    throw new Error("targetPhoneE164 must be a valid E.164 phone number when provided.");
  }

  if (body.idempotencyKey !== undefined && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length === 0)) {
    throw new Error("idempotencyKey must be a non-empty string when provided.");
  }

  return body;
}

function errorResponse(error: unknown, fallbackMessage: string, status: number) {
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
    { status },
  );
}
