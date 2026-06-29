import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_ENCRYPTION_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export type EncryptedTokenEnvelope = {
  version: typeof TOKEN_ENCRYPTION_VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type GmailTokenSet = {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  scope?: string;
};

export function encryptGmailToken(plaintext: string, keyMaterial: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt an empty Gmail token.");
  }

  const key = deriveEncryptionKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  const envelope: EncryptedTokenEnvelope = {
    version: TOKEN_ENCRYPTION_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };

  return JSON.stringify(envelope);
}

export function decryptGmailToken(encryptedToken: string, keyMaterial: string): string {
  const envelope = JSON.parse(encryptedToken) as EncryptedTokenEnvelope;

  if (envelope.version !== TOKEN_ENCRYPTION_VERSION || envelope.algorithm !== ALGORITHM) {
    throw new Error("Unsupported Gmail token encryption envelope.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveEncryptionKey(keyMaterial),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signGmailState(payload: Record<string, unknown>, keyMaterial: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", deriveSigningKey(keyMaterial)).update(body).digest("base64url");

  return `${body}.${signature}`;
}

export function verifyGmailState<T extends Record<string, unknown>>(
  state: string,
  keyMaterial: string,
  maxAgeMs: number,
  now: Date = new Date(),
): T {
  const [body, signature] = state.split(".");

  if (!body || !signature) {
    throw new Error("OAuth state is malformed.");
  }

  const expected = createHmac("sha256", deriveSigningKey(keyMaterial)).update(body).digest("base64url");

  if (!timingSafeEqualString(signature, expected)) {
    throw new Error("OAuth state signature is invalid.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
    issuedAt?: unknown;
  };

  if (typeof payload.issuedAt !== "string") {
    throw new Error("OAuth state is missing issuedAt.");
  }

  const issuedAtMs = Date.parse(payload.issuedAt);

  if (!Number.isFinite(issuedAtMs) || now.getTime() - issuedAtMs > maxAgeMs) {
    throw new Error("OAuth state has expired.");
  }

  return payload;
}

function deriveEncryptionKey(keyMaterial: string): Buffer {
  if (!keyMaterial.trim()) {
    throw new Error("GMAIL_ENCRYPTION_KEY is required for Gmail token encryption.");
  }

  const decoded = decodeKeyMaterial(keyMaterial.trim());

  if (decoded.length === 32) {
    return decoded;
  }

  return createHash("sha256").update(keyMaterial).digest();
}

function deriveSigningKey(keyMaterial: string): Buffer {
  return createHash("sha256").update(`gmail-oauth-state:${keyMaterial}`).digest();
}

function decodeKeyMaterial(value: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const base64 = Buffer.from(value, "base64");
    if (base64.length > 0) {
      return base64;
    }
  } catch {
    // Fall through to UTF-8 key material.
  }

  return Buffer.from(value, "utf8");
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
