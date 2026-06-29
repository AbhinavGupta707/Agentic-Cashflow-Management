import { buildCashflowVoiceTwiML } from "../../../../../server/voice/twiml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return twimlResponse(request);
}

export async function POST(request: Request) {
  return twimlResponse(request);
}

function twimlResponse(request: Request): Response {
  const url = new URL(request.url);
  const twiml = buildCashflowVoiceTwiML({
    opening: url.searchParams.get("opening"),
    summary: url.searchParams.get("summary"),
    close: url.searchParams.get("close"),
  });

  return new Response(twiml, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/xml; charset=utf-8",
    },
  });
}
