export type GmailMimeAddress = {
  email: string;
  name?: string;
};

export type GmailMimeMessageInput = {
  from: GmailMimeAddress;
  to: GmailMimeAddress[];
  cc?: GmailMimeAddress[];
  bcc?: GmailMimeAddress[];
  replyTo?: GmailMimeAddress;
  subject: string;
  textBody: string;
  messageId?: string;
  date?: Date;
  headers?: Record<string, string>;
};

export function buildGmailRawMessage(input: GmailMimeMessageInput): string {
  return base64urlEncode(buildRfc2822Message(input));
}

export function buildRfc2822Message(input: GmailMimeMessageInput): string {
  if (input.to.length === 0) {
    throw new Error("Gmail MIME message requires at least one recipient.");
  }

  const headers: Array<[string, string]> = [
    ["From", formatAddress(input.from)],
    ["To", input.to.map(formatAddress).join(", ")],
    ["Subject", encodeHeaderValue(input.subject)],
    ["Date", (input.date ?? new Date()).toUTCString()],
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "8bit"],
  ];

  if (input.cc?.length) {
    headers.splice(2, 0, ["Cc", input.cc.map(formatAddress).join(", ")]);
  }

  if (input.bcc?.length) {
    headers.splice(2, 0, ["Bcc", input.bcc.map(formatAddress).join(", ")]);
  }

  if (input.replyTo) {
    headers.splice(2, 0, ["Reply-To", formatAddress(input.replyTo)]);
  }

  if (input.messageId) {
    headers.push(["Message-ID", sanitizeHeaderValue(input.messageId)]);
  }

  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers.push([sanitizeHeaderName(name), sanitizeHeaderValue(value)]);
  }

  return `${headers.map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n${normalizeBody(
    input.textBody,
  )}`;
}

export function base64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function formatAddress(address: GmailMimeAddress): string {
  const email = sanitizeEmail(address.email);

  if (!address.name?.trim()) {
    return email;
  }

  return `${encodeHeaderValue(address.name)} <${email}>`;
}

function encodeHeaderValue(value: string): string {
  const sanitized = sanitizeHeaderValue(value);

  if (/^[\x20-\x7e]*$/.test(sanitized)) {
    return sanitized;
  }

  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function sanitizeHeaderName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9-]/g, "");

  if (!sanitized) {
    throw new Error("Gmail MIME header name cannot be empty.");
  }

  return sanitized;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sanitizeEmail(value: string): string {
  const sanitized = sanitizeHeaderValue(value);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sanitized)) {
    throw new Error(`Invalid email address for Gmail MIME message: ${sanitized}`);
  }

  return sanitized;
}

function normalizeBody(value: string): string {
  return value.replace(/\r?\n/g, "\r\n");
}
