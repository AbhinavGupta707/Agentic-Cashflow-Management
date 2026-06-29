import { randomBytes } from "node:crypto";

import { GMAIL_AUTH_URL, GMAIL_TOKEN_URL, getGmailConfigAvailability, type GmailConfig } from "./gmail-config";
import { signGmailState, verifyGmailState, type GmailTokenSet } from "./gmail-tokens";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type GmailOAuthStatePayload = {
  issuedAt: string;
  nonce: string;
  tenantId?: string;
  returnTo?: string;
  accountEmail?: string;
};

export type GmailAuthorizationUrlInput = {
  tenantId?: string;
  returnTo?: string;
  accountEmail?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
};

export type GmailAuthorizationUrlResult =
  | {
      status: "ok";
      authorizationUrl: string;
      scopes: string[];
      expiresAt: string;
    }
  | {
      status: "unavailable";
      message: string;
      missingEnv: string[];
    };

export type GmailTokenExchangeResult = GmailTokenSet & {
  rawScope?: string;
};

export function createGmailAuthorizationUrl(input: GmailAuthorizationUrlInput = {}): GmailAuthorizationUrlResult {
  const now = input.now ?? new Date();
  const availability = getGmailConfigAvailability(input.env, now);

  if (!availability.available) {
    return {
      status: "unavailable",
      message: availability.status.message,
      missingEnv: availability.status.missingEnv,
    };
  }

  const payload: GmailOAuthStatePayload = {
    issuedAt: now.toISOString(),
    nonce: randomBytes(16).toString("base64url"),
    tenantId: input.tenantId,
    returnTo: input.returnTo,
    accountEmail: input.accountEmail,
  };
  const state = signGmailState(payload, availability.config.encryptionKey);
  const url = new URL(GMAIL_AUTH_URL);

  url.searchParams.set("client_id", availability.config.clientId);
  url.searchParams.set("redirect_uri", availability.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", availability.config.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return {
    status: "ok",
    authorizationUrl: url.toString(),
    scopes: availability.config.scopes,
    expiresAt: new Date(now.getTime() + STATE_MAX_AGE_MS).toISOString(),
  };
}

export function validateGmailOAuthState(
  state: string,
  config: GmailConfig,
  now: Date = new Date(),
): GmailOAuthStatePayload {
  return verifyGmailState<GmailOAuthStatePayload>(state, config.encryptionKey, STATE_MAX_AGE_MS, now);
}

export async function exchangeGmailAuthorizationCode(
  input: {
    code: string;
    config: GmailConfig;
    fetchImpl?: typeof fetch;
  },
): Promise<GmailTokenExchangeResult> {
  const response = await (input.fetchImpl ?? fetch)(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  if (!payload.access_token && !payload.refresh_token) {
    throw new Error("Google OAuth token exchange did not return usable tokens.");
  }

  const now = Date.now();

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresAt:
      typeof payload.expires_in === "number" ? new Date(now + payload.expires_in * 1000).toISOString() : undefined,
    scope: payload.scope,
    rawScope: payload.scope,
  };
}

export async function refreshGmailAccessToken(
  input: {
    refreshToken: string;
    config: GmailConfig;
    fetchImpl?: typeof fetch;
  },
): Promise<GmailTokenExchangeResult> {
  const response = await (input.fetchImpl ?? fetch)(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  if (!payload.access_token) {
    throw new Error("Google OAuth refresh did not return an access token.");
  }

  const now = Date.now();

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    expiresAt:
      typeof payload.expires_in === "number" ? new Date(now + payload.expires_in * 1000).toISOString() : undefined,
    scope: payload.scope,
    rawScope: payload.scope,
  };
}
