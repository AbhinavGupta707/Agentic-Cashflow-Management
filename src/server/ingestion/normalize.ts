import { scopedIdempotencyKey, slugifyIdentifier } from "./idempotency";

export type ImportKind = "customers" | "contacts" | "invoices" | "obligations" | "payments";

export type SourceKind =
  | "invoice_csv"
  | "invoice_pdf"
  | "bank_csv"
  | "customer_csv"
  | "obligation_csv"
  | "manual_upload"
  | "api";

export type NormalizedRecord =
  | {
      kind: "customer";
      externalId: string;
      name: string;
      legalName: string | null;
      billingEmail: string | null;
      paymentTermsDays: number;
      riskTier: "low" | "standard" | "elevated" | "high";
      metadata: Record<string, unknown>;
    }
  | {
      kind: "contact";
      externalId: string;
      customerExternalId: string | null;
      customerName: string | null;
      fullName: string;
      roleTitle: string | null;
      email: string | null;
      phoneE164: string | null;
      isPrimary: boolean;
      consentState: "unknown" | "opted_in" | "opted_out";
      metadata: Record<string, unknown>;
    }
  | {
      kind: "invoice";
      externalId: string;
      invoiceNumber: string;
      customerExternalId: string | null;
      customerName: string | null;
      issueDate: string;
      dueDate: string;
      currencyCode: string;
      amountTotal: string;
      amountPaid: string;
      state: "draft" | "open" | "partially_paid" | "paid" | "disputed" | "void" | "written_off";
      metadata: Record<string, unknown>;
    }
  | {
      kind: "obligation";
      externalId: string;
      counterpartyName: string;
      category: string;
      obligationType: "payroll" | "tax" | "rent" | "supplier" | "loan" | "subscription" | "other";
      dueDate: string;
      currencyCode: string;
      amount: string;
      state: "scheduled" | "paid" | "deferred" | "cancelled" | "overdue";
      metadata: Record<string, unknown>;
    }
  | {
      kind: "payment";
      externalId: string;
      provider: string | null;
      customerExternalId: string | null;
      customerName: string | null;
      invoiceExternalId: string | null;
      invoiceNumber: string | null;
      obligationExternalId: string | null;
      paymentDate: string;
      postedAt: string | null;
      direction: "inflow" | "outflow";
      currencyCode: string;
      amount: string;
      state: "pending" | "posted" | "reconciled" | "reversed" | "failed";
      metadata: Record<string, unknown>;
    };

export type NormalizationResult =
  | { ok: true; record: NormalizedRecord }
  | { ok: false; errors: string[] };

export const EXPECTED_CSV_HEADERS: Record<ImportKind, string[]> = {
  customers: [
    "external_id",
    "name",
    "legal_name",
    "billing_email",
    "payment_terms_days",
    "risk_tier",
    "segment",
  ],
  contacts: [
    "external_id",
    "customer_external_id",
    "customer_name",
    "full_name",
    "role_title",
    "email",
    "phone_e164",
    "is_primary",
  ],
  invoices: [
    "external_id",
    "invoice_number",
    "customer_external_id",
    "customer_name",
    "issue_date",
    "due_date",
    "currency",
    "amount_total",
    "amount_paid",
    "state",
  ],
  obligations: [
    "external_id",
    "counterparty_name",
    "category",
    "obligation_type",
    "due_date",
    "currency",
    "amount",
    "state",
  ],
  payments: [
    "external_id",
    "provider",
    "customer_external_id",
    "invoice_external_id",
    "invoice_number",
    "payment_date",
    "direction",
    "currency",
    "amount",
    "state",
  ],
};

type RawRow = Record<string, unknown>;

export function normalizeRow(importKind: ImportKind, rawRow: RawRow): NormalizationResult {
  try {
    switch (importKind) {
      case "customers":
        return ok(normalizeCustomer(rawRow));
      case "contacts":
        return ok(normalizeContact(rawRow));
      case "invoices":
        return ok(normalizeInvoice(rawRow));
      case "obligations":
        return ok(normalizeObligation(rawRow));
      case "payments":
        return ok(normalizePayment(rawRow));
    }
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Unknown normalization error."],
    };
  }
}

export function importKindFromInput(kind: string): ImportKind {
  const normalized = kind.trim().toLowerCase();
  const singularToPlural: Record<string, ImportKind> = {
    customer: "customers",
    customers: "customers",
    contact: "contacts",
    contacts: "contacts",
    invoice: "invoices",
    invoices: "invoices",
    obligation: "obligations",
    obligations: "obligations",
    payment: "payments",
    payments: "payments",
  };
  const importKind = singularToPlural[normalized];

  if (!importKind) {
    throw new Error(`Unsupported import kind "${kind}".`);
  }

  return importKind;
}

function normalizeCustomer(row: RawRow): NormalizedRecord {
  const name = requiredText(row, ["name", "customer_name", "customer", "company_name"]);
  const externalId = optionalText(row, ["external_id", "externalid", "customer_id", "customerid", "id"]) ??
    `customer:${slugifyIdentifier(name)}`;
  const billingEmail = optionalEmail(row, ["billing_email", "billingemail", "email", "accounts_email"]);

  return {
    kind: "customer",
    externalId,
    name,
    legalName: optionalText(row, ["legal_name", "legalname"]) ?? name,
    billingEmail,
    paymentTermsDays: optionalInteger(row, ["payment_terms_days", "paymenttermsdays", "terms", "terms_days"]) ?? 30,
    riskTier: normalizeRiskTier(optionalText(row, ["risk_tier", "risktier", "risk"])),
    metadata: compactMetadata({
      segment: optionalText(row, ["segment", "customer_segment"]),
      sourceName: name,
    }),
  };
}

function normalizeContact(row: RawRow): NormalizedRecord {
  const fullName = requiredText(row, ["full_name", "fullname", "contact_name", "name"]);
  const email = optionalEmail(row, ["email", "email_address", "contact_email"]);
  const phoneE164 = optionalText(row, ["phone_e164", "phone", "phone_number", "mobile"]);

  if (!email && !phoneE164) {
    throw new Error("Contact requires at least one of email or phone_e164.");
  }

  const customerExternalId = optionalText(row, [
    "customer_external_id",
    "customerexternalid",
    "customer_id",
    "customerid",
  ]);
  const customerName = optionalText(row, ["customer_name", "customer", "company_name"]);

  return {
    kind: "contact",
    externalId:
      optionalText(row, ["external_id", "externalid", "contact_id", "contactid", "id"]) ??
      scopedIdempotencyKey(["contact", customerExternalId ?? customerName, email ?? phoneE164 ?? fullName]),
    customerExternalId,
    customerName,
    fullName,
    roleTitle: optionalText(row, ["role_title", "roletitle", "role", "title"]),
    email,
    phoneE164,
    isPrimary: optionalBoolean(row, ["is_primary", "isprimary", "primary"]) ?? false,
    consentState: normalizeConsentState(optionalText(row, ["consent_state", "consentstate", "consent"])),
    metadata: compactMetadata({ sourceName: fullName }),
  };
}

function normalizeInvoice(row: RawRow): NormalizedRecord {
  const invoiceNumber = requiredText(row, ["invoice_number", "invoicenumber", "number", "invoice"]);
  const issueDate = requiredDate(row, ["issue_date", "issuedate", "invoice_date", "invoicedate", "date"]);
  const dueDate = requiredDate(row, ["due_date", "duedate"]);
  const amountTotal = requiredAmount(row, ["amount_total", "amounttotal", "total", "amount"]);
  const amountPaid = optionalAmount(row, ["amount_paid", "amountpaid", "paid"]) ?? "0.00";

  return {
    kind: "invoice",
    externalId:
      optionalText(row, ["external_id", "externalid", "invoice_id", "invoiceid", "id"]) ??
      `invoice:${slugifyIdentifier(invoiceNumber)}`,
    invoiceNumber,
    customerExternalId: optionalText(row, [
      "customer_external_id",
      "customerexternalid",
      "customer_id",
      "customerid",
    ]),
    customerName: optionalText(row, ["customer_name", "customer", "company_name"]),
    issueDate,
    dueDate,
    currencyCode: optionalCurrency(row, ["currency", "currency_code", "currencycode"]) ?? "GBP",
    amountTotal,
    amountPaid,
    state: normalizeInvoiceState(optionalText(row, ["state", "status"])),
    metadata: compactMetadata({
      description: optionalText(row, ["description", "memo", "notes"]),
    }),
  };
}

function normalizeObligation(row: RawRow): NormalizedRecord {
  const counterpartyName = requiredText(row, [
    "counterparty_name",
    "counterparty",
    "vendor_name",
    "vendor",
    "supplier",
  ]);
  const category = optionalText(row, ["category"]) ?? "supplier";
  const dueDate = requiredDate(row, ["due_date", "duedate", "payment_date", "paymentdate"]);
  const title = optionalText(row, ["title", "description", "memo"]);

  return {
    kind: "obligation",
    externalId:
      optionalText(row, ["external_id", "externalid", "obligation_id", "obligationid", "id"]) ??
      scopedIdempotencyKey(["obligation", counterpartyName, dueDate, title]),
    counterpartyName,
    category,
    obligationType: normalizeObligationType(optionalText(row, ["obligation_type", "obligationtype", "type"]) ?? category),
    dueDate,
    currencyCode: optionalCurrency(row, ["currency", "currency_code", "currencycode"]) ?? "GBP",
    amount: requiredAmount(row, ["amount", "amount_due", "amountdue", "total"]),
    state: normalizeObligationState(optionalText(row, ["state", "status"])),
    metadata: compactMetadata({ title }),
  };
}

function normalizePayment(row: RawRow): NormalizedRecord {
  const paymentDate = requiredDate(row, ["payment_date", "paymentdate", "date", "posted_date", "posteddate"]);
  const provider = optionalText(row, ["provider", "source", "bank"]);
  const amount = requiredAmount(row, ["amount", "amount_total", "amounttotal"]);

  return {
    kind: "payment",
    externalId:
      optionalText(row, ["external_id", "externalid", "payment_id", "paymentid", "transaction_id", "id"]) ??
      scopedIdempotencyKey([
        "payment",
        provider,
        paymentDate,
        optionalText(row, ["invoice_external_id", "invoiceexternalid", "invoice_id"]),
        amount,
      ]),
    provider,
    customerExternalId: optionalText(row, [
      "customer_external_id",
      "customerexternalid",
      "customer_id",
      "customerid",
    ]),
    customerName: optionalText(row, ["customer_name", "customer", "company_name"]),
    invoiceExternalId: optionalText(row, ["invoice_external_id", "invoiceexternalid", "invoice_id", "invoiceid"]),
    invoiceNumber: optionalText(row, ["invoice_number", "invoicenumber", "invoice"]),
    obligationExternalId: optionalText(row, [
      "obligation_external_id",
      "obligationexternalid",
      "obligation_id",
      "obligationid",
    ]),
    paymentDate,
    postedAt: optionalText(row, ["posted_at", "postedat"]),
    direction: normalizePaymentDirection(optionalText(row, ["direction", "type"])),
    currencyCode: optionalCurrency(row, ["currency", "currency_code", "currencycode"]) ?? "GBP",
    amount,
    state: normalizePaymentState(optionalText(row, ["state", "status"])),
    metadata: compactMetadata({
      reference: optionalText(row, ["reference", "memo", "notes", "description"]),
    }),
  };
}

function ok(record: NormalizedRecord): NormalizationResult {
  return { ok: true, record };
}

function getValue(row: RawRow, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalizeKey(key))) {
      return value;
    }
  }

  return undefined;
}

function optionalText(row: RawRow, aliases: string[]): string | null {
  const value = getValue(row, aliases);

  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function requiredText(row: RawRow, aliases: string[]): string {
  const value = optionalText(row, aliases);

  if (!value) {
    throw new Error(`Missing required field: ${aliases[0]}.`);
  }

  return value;
}

function optionalEmail(row: RawRow, aliases: string[]): string | null {
  const email = optionalText(row, aliases)?.toLowerCase() ?? null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email address: ${email}.`);
  }

  return email;
}

function optionalInteger(row: RawRow, aliases: string[]): number | null {
  const text = optionalText(row, aliases);

  if (!text) {
    return null;
  }

  const value = Number.parseInt(text, 10);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid integer for ${aliases[0]}: ${text}.`);
  }

  return value;
}

function optionalBoolean(row: RawRow, aliases: string[]): boolean | null {
  const text = optionalText(row, aliases)?.toLowerCase();

  if (!text) {
    return null;
  }

  if (["true", "t", "yes", "y", "1"].includes(text)) {
    return true;
  }

  if (["false", "f", "no", "n", "0"].includes(text)) {
    return false;
  }

  throw new Error(`Invalid boolean for ${aliases[0]}: ${text}.`);
}

function requiredDate(row: RawRow, aliases: string[]): string {
  const text = requiredText(row, aliases);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date for ${aliases[0]}: ${text}.`);
  }

  return parsed.toISOString().slice(0, 10);
}

function optionalCurrency(row: RawRow, aliases: string[]): string | null {
  const text = optionalText(row, aliases)?.toUpperCase() ?? null;

  if (text && !/^[A-Z]{3}$/.test(text)) {
    throw new Error(`Invalid currency code: ${text}.`);
  }

  return text;
}

function requiredAmount(row: RawRow, aliases: string[]): string {
  const amount = optionalAmount(row, aliases);

  if (!amount) {
    throw new Error(`Missing required amount: ${aliases[0]}.`);
  }

  return amount;
}

function optionalAmount(row: RawRow, aliases: string[]): string | null {
  const text = optionalText(row, aliases);

  if (!text) {
    return null;
  }

  const normalized = text.replace(/[£$€,\s]/g, "");
  const amount = Number.parseFloat(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid non-negative amount for ${aliases[0]}: ${text}.`);
  }

  return amount.toFixed(2);
}

function normalizeRiskTier(value: string | null): "low" | "standard" | "elevated" | "high" {
  if (!value) {
    return "standard";
  }

  const normalized = value.toLowerCase();
  if (["low", "standard", "elevated", "high"].includes(normalized)) {
    return normalized as "low" | "standard" | "elevated" | "high";
  }

  if (normalized === "medium") {
    return "standard";
  }

  throw new Error(`Invalid risk tier: ${value}.`);
}

function normalizeConsentState(value: string | null): "unknown" | "opted_in" | "opted_out" {
  if (!value) {
    return "unknown";
  }

  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");
  if (["unknown", "opted_in", "opted_out"].includes(normalized)) {
    return normalized as "unknown" | "opted_in" | "opted_out";
  }

  throw new Error(`Invalid consent state: ${value}.`);
}

function normalizeInvoiceState(
  value: string | null,
): "draft" | "open" | "partially_paid" | "paid" | "disputed" | "void" | "written_off" {
  if (!value) {
    return "open";
  }

  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");
  const allowed = ["draft", "open", "partially_paid", "paid", "disputed", "void", "written_off"];
  const mapped = normalized === "partial" ? "partially_paid" : normalized;

  if (allowed.includes(mapped)) {
    return mapped as "draft" | "open" | "partially_paid" | "paid" | "disputed" | "void" | "written_off";
  }

  throw new Error(`Invalid invoice state: ${value}.`);
}

function normalizeObligationType(
  value: string,
): "payroll" | "tax" | "rent" | "supplier" | "loan" | "subscription" | "other" {
  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");

  if (["payroll", "tax", "rent", "supplier", "loan", "subscription", "other"].includes(normalized)) {
    return normalized as "payroll" | "tax" | "rent" | "supplier" | "loan" | "subscription" | "other";
  }

  if (normalized.includes("payroll")) {
    return "payroll";
  }
  if (normalized.includes("tax")) {
    return "tax";
  }
  if (normalized.includes("rent")) {
    return "rent";
  }
  if (normalized.includes("loan")) {
    return "loan";
  }
  if (normalized.includes("subscription") || normalized.includes("software")) {
    return "subscription";
  }

  return "supplier";
}

function normalizeObligationState(value: string | null): "scheduled" | "paid" | "deferred" | "cancelled" | "overdue" {
  if (!value) {
    return "scheduled";
  }

  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");
  if (["scheduled", "paid", "deferred", "cancelled", "overdue"].includes(normalized)) {
    return normalized as "scheduled" | "paid" | "deferred" | "cancelled" | "overdue";
  }

  if (normalized === "canceled") {
    return "cancelled";
  }

  throw new Error(`Invalid obligation state: ${value}.`);
}

function normalizePaymentDirection(value: string | null): "inflow" | "outflow" {
  if (!value) {
    return "inflow";
  }

  const normalized = value.toLowerCase();
  if (["inflow", "in", "credit", "receipt", "received"].includes(normalized)) {
    return "inflow";
  }
  if (["outflow", "out", "debit", "payment", "paid"].includes(normalized)) {
    return "outflow";
  }

  throw new Error(`Invalid payment direction: ${value}.`);
}

function normalizePaymentState(value: string | null): "pending" | "posted" | "reconciled" | "reversed" | "failed" {
  if (!value) {
    return "posted";
  }

  const normalized = value.toLowerCase().replace(/[-\s]+/g, "_");
  if (["pending", "posted", "reconciled", "reversed", "failed"].includes(normalized)) {
    return normalized as "pending" | "posted" | "reconciled" | "reversed" | "failed";
  }

  throw new Error(`Invalid payment state: ${value}.`);
}

function compactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}
