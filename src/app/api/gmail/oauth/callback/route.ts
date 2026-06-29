import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../../../server/aws/data-api-env";
import { getGmailConfigAvailability } from "../../../../../server/providers/gmail-config";
import { exchangeGmailAuthorizationCode, validateGmailOAuthState } from "../../../../../server/providers/gmail-oauth";
import { upsertGmailProviderConnection } from "../../../../../server/repositories/provider-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      {
        status: "error",
        provider: "gmail",
        message: `Google OAuth returned ${error}.`,
      },
      { status: 400 },
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      {
        status: "error",
        provider: "gmail",
        message: "Google OAuth callback requires code and state parameters.",
      },
      { status: 400 },
    );
  }

  const configAvailability = getGmailConfigAvailability();
  if (!configAvailability.available) {
    return NextResponse.json(
      {
        status: "unavailable",
        provider: configAvailability.status,
      },
      { status: 503 },
    );
  }

  try {
    const statePayload = validateGmailOAuthState(state, configAvailability.config);

    if (!statePayload.tenantId) {
      return NextResponse.json(
        {
          status: "error",
          provider: "gmail",
          message: "OAuth state did not include a tenant id; token exchange was not attempted.",
        },
        { status: 400 },
      );
    }

    const tokenSet = await exchangeGmailAuthorizationCode({
      code,
      config: configAvailability.config,
    });
    const connection = await upsertGmailProviderConnection({
      tenantId: statePayload.tenantId,
      accountEmail: statePayload.accountEmail ?? configAvailability.config.senderEmail ?? null,
      scopes: tokenSet.rawScope?.split(/\s+/).filter(Boolean) ?? configAvailability.config.scopes,
      tokenSet,
      encryptionKey: configAvailability.config.encryptionKey,
      metadata: {
        source: "gmail_oauth_callback",
        scope: tokenSet.rawScope ?? null,
      },
    });

    return NextResponse.json({
      status: "ok",
      provider: "gmail",
      connection: {
        id: connection.id,
        tenantId: connection.tenantId,
        accountEmail: connection.accountEmail,
        scopes: connection.scopes,
        state: connection.state,
        tokenExpiresAt: connection.tokenExpiresAt,
        updatedAt: connection.updatedAt,
      },
      returnTo: statePayload.returnTo ?? null,
    });
  } catch (caught) {
    if (caught instanceof DataApiUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          provider: "gmail",
          reason: "missing-config",
          message: caught.message,
          missingEnv: caught.missing,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "error",
        provider: "gmail",
        message: caught instanceof Error ? caught.message : "Unable to complete Gmail OAuth callback.",
      },
      { status: 400 },
    );
  }
}
