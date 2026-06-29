import { NextResponse } from "next/server";

import { createGmailAuthorizationUrl } from "../../../../../server/providers/gmail-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = createGmailAuthorizationUrl({
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    returnTo: url.searchParams.get("returnTo") ?? undefined,
    accountEmail: url.searchParams.get("accountEmail") ?? process.env.GMAIL_SENDER_EMAIL ?? undefined,
  });

  if (result.status !== "ok") {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}
