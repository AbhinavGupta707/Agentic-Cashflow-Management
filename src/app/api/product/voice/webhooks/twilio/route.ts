import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../../server/aws/data-api-env";
import { ingestTwilioWebhook, type TwilioWebhookInput } from "../../../../../../server/voice/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TwilioWebhookRequest = {
  companyId?: string;
  companyExternalId?: string;
  caseId?: string;
  providerCallId?: string;
  CallSid?: string;
  callStatus?: string;
  CallStatus?: string;
  callDurationSeconds?: number;
  CallDuration?: string;
  summary?: string;
  transcript?: TwilioWebhookInput["transcript"];
};

export async function POST(request: Request) {
  try {
    const body = await parseWebhookBody(request);
    const result = await ingestTwilioWebhook(
      {
        providerCallId: body.providerCallId ?? body.CallSid,
        callStatus: body.callStatus ?? body.CallStatus,
        callDurationSeconds: body.callDurationSeconds ?? parseOptionalInteger(body.CallDuration),
        summary: body.summary,
        transcript: body.transcript,
        rawPayload: body as Record<string, unknown>,
      },
      {
        companyExternalId: body.companyExternalId ?? body.companyId,
        caseId: body.caseId,
      },
    );

    return NextResponse.json({ status: "ok", data: result }, { status: result.state === "accepted" ? 200 : 202 });
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
        message: error instanceof Error ? error.message : "Unable to ingest Twilio webhook.",
      },
      { status: 400 },
    );
  }
}

async function parseWebhookBody(request: Request): Promise<TwilioWebhookRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as TwilioWebhookRequest;
  }

  const formData = await request.formData();
  const body: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      body[key] = value;
    }
  }

  return body;
}

function parseOptionalInteger(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
