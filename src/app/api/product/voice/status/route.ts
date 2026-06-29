import { NextResponse } from "next/server";

import { getVoiceProviderReadiness } from "../../../../../server/voice/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const validateElevenLabs = url.searchParams.get("validateElevenLabs") === "1";
  const readiness = await getVoiceProviderReadiness({ validateElevenLabs });
  const unavailable = readiness.providers.twilio.status !== "available";

  return NextResponse.json(
    {
      status: unavailable ? "degraded" : "ok",
      data: readiness,
    },
    { status: unavailable ? 503 : 200 },
  );
}
