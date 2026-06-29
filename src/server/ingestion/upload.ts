import { createHash } from "node:crypto";

import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { createSourceObjectStorageClient, type SourceObjectStorageClient } from "../aws/s3-client";
import { S3UnavailableError, getS3Availability } from "../aws/s3-env";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";

export const SOURCE_KINDS = [
  "invoice_csv",
  "invoice_pdf",
  "bank_csv",
  "customer_csv",
  "obligation_csv",
  "manual_upload",
] as const;

export const IMPORT_KINDS = ["invoices", "customers", "contacts", "obligations", "payments", "mixed"] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type SourceKind = (typeof SOURCE_KINDS)[number];
export type ImportKind = (typeof IMPORT_KINDS)[number];
export type UploadState = "ready";

export type UploadSourceInput = {
  bytes: Uint8Array;
  originalFilename: string;
  contentType: string;
  sourceKind: SourceKind;
  importKind: ImportKind;
  companyExternalId?: string;
  caseId?: string;
};

export type UploadSourceResult = {
  status: "ok";
  sourceFileId: string;
  importBatchId: string;
  eventId: string;
  uploadState: UploadState;
  objectKey: string;
  checksum: string;
  message: string;
};

type UploadSourceOptions = {
  dataApi?: AuroraDataApiClient;
  storage?: SourceObjectStorageClient;
  now?: Date;
};

type CompanyRow = {
  id: string;
  tenant_id: string;
  external_id: string;
};

type UploadRows = {
  source_file_id: string;
  import_batch_id: string;
  event_id: string;
};

export class UploadValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UploadValidationError";
    this.code = code;
  }
}

export class UploadStorageError extends Error {
  constructor() {
    super("The source file could not be written to S3.");
    this.name = "UploadStorageError";
  }
}

export class UploadWriteError extends Error {
  constructor() {
    super("The uploaded source file could not be recorded in Aurora.");
    this.name = "UploadWriteError";
  }
}

export async function uploadSourceFile(
  input: UploadSourceInput,
  options: UploadSourceOptions = {},
): Promise<UploadSourceResult> {
  validateUploadInput(input);

  const dataApiAvailability = getDataApiAvailability();
  if (!dataApiAvailability.available) {
    throw new DataApiUnavailableError(dataApiAvailability.missing);
  }

  const s3Availability = getS3Availability();
  if (!s3Availability.available) {
    throw new S3UnavailableError(s3Availability.missing);
  }

  const dataApi = options.dataApi ?? createAuroraDataApiClient(dataApiAvailability.config);
  const storage = options.storage ?? createSourceObjectStorageClient(s3Availability.config);
  const now = options.now ?? new Date();
  const companyExternalId = input.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = input.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const checksumDigest = createHash("sha256").update(input.bytes).digest();
  const checksum = checksumDigest.toString("hex");
  const checksumSha256Base64 = checksumDigest.toString("base64");
  const importDate = toImportDate(now);
  const objectKey = buildSourceObjectKey({
    companyExternalId,
    importDate,
    checksum,
    sourceKind: input.sourceKind,
    originalFilename: input.originalFilename,
  });

  let company: CompanyRow;
  try {
    company = await findCompany(dataApi, companyExternalId);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      throw error;
    }
    throw new UploadWriteError();
  }

  try {
    await storage.putSourceObject({
      key: objectKey,
      bytes: input.bytes,
      contentType: input.contentType,
      checksumSha256Base64,
      metadata: {
        checksum,
        sourcekind: input.sourceKind,
        importkind: input.importKind,
        company: companyExternalId,
        caseid: caseId,
      },
    });
  } catch {
    throw new UploadStorageError();
  }

  try {
    const rows = await writeUploadProvenance(dataApi, {
      tenantId: company.tenant_id,
      companyId: company.id,
      companyExternalId,
      caseId,
      bucket: storage.bucket,
      objectKey,
      checksum,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
      sourceKind: input.sourceKind,
      importKind: input.importKind,
      importDate,
    });

    return {
      status: "ok",
      sourceFileId: rows.source_file_id,
      importBatchId: rows.import_batch_id,
      eventId: rows.event_id,
      uploadState: "ready",
      objectKey,
      checksum,
      message: "Source file uploaded to S3 and queued for ingestion.",
    };
  } catch {
    throw new UploadWriteError();
  }
}

export function parseSourceKind(value: FormDataEntryValue | null): SourceKind {
  if (typeof value !== "string" || !SOURCE_KINDS.includes(value as SourceKind)) {
    throw new UploadValidationError(
      "unsupported_source_kind",
      `sourceKind must be one of: ${SOURCE_KINDS.join(", ")}.`,
    );
  }

  return value as SourceKind;
}

export function parseImportKind(value: FormDataEntryValue | null): ImportKind {
  if (typeof value !== "string" || !IMPORT_KINDS.includes(value as ImportKind)) {
    throw new UploadValidationError(
      "unsupported_import_kind",
      `importKind must be one of: ${IMPORT_KINDS.join(", ")}.`,
    );
  }

  return value as ImportKind;
}

export function optionalText(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateUploadInput(input: UploadSourceInput): void {
  if (input.bytes.byteLength <= 0) {
    throw new UploadValidationError("invalid_file", "file must not be empty.");
  }

  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      "file_too_large",
      `file must be ${formatBytes(MAX_UPLOAD_BYTES)} or smaller.`,
    );
  }

  if (!input.originalFilename.trim()) {
    throw new UploadValidationError("invalid_file", "file must include an original filename.");
  }
}

async function findCompany(dataApi: AuroraDataApiClient, companyExternalId: string): Promise<CompanyRow> {
  const [company] = await dataApi.execute<CompanyRow>(
    `
      select id, tenant_id, external_id
      from companies
      where external_id = :companyExternalId
        and state = 'active'
      order by created_at asc
      limit 1
    `,
    { companyExternalId },
  );

  if (!company) {
    throw new UploadValidationError(
      "unknown_company",
      `No active company was found for companyExternalId ${companyExternalId}.`,
    );
  }

  return company;
}

type WriteUploadParams = {
  tenantId: string;
  companyId: string;
  companyExternalId: string;
  caseId: string;
  bucket: string;
  objectKey: string;
  checksum: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  sourceKind: SourceKind;
  importKind: ImportKind;
  importDate: string;
};

async function writeUploadProvenance(
  dataApi: AuroraDataApiClient,
  params: WriteUploadParams,
): Promise<UploadRows> {
  const stableToken = stableIdToken(
    [
      params.companyExternalId,
      params.caseId,
      params.importDate,
      params.sourceKind,
      params.importKind,
      params.checksum,
    ].join(":"),
  );
  const sourceIdempotencyKey = `source-upload:${params.companyExternalId}:${params.sourceKind}:${params.importKind}:${params.checksum}`;
  const batchIdempotencyKey = `import-batch:${params.companyExternalId}:${params.sourceKind}:${params.importKind}:${params.checksum}`;
  const eventIdempotencyKey = `event-inbox:source-file-uploaded:${params.companyExternalId}:${params.sourceKind}:${params.importKind}:${params.checksum}`;

  return dataApi.transaction(async (transactionId) => {
    const [sourceFile] = await dataApi.execute<{ id: string }>(
      `
        insert into source_files (
          tenant_id,
          external_id,
          company_id,
          source_kind,
          storage_provider,
          bucket,
          object_key,
          sha256,
          original_filename,
          content_type,
          byte_size,
          upload_state,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :sourceExternalId,
          :companyId,
          :sourceKind,
          's3',
          :bucket,
          :objectKey,
          :checksum,
          :originalFilename,
          :contentType,
          :byteSize,
          'ready',
          :sourceIdempotencyKey,
          :sourceMetadata
        )
        on conflict (tenant_id, idempotency_key) do update set
          company_id = excluded.company_id,
          source_kind = excluded.source_kind,
          bucket = excluded.bucket,
          object_key = excluded.object_key,
          sha256 = excluded.sha256,
          original_filename = excluded.original_filename,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          upload_state = excluded.upload_state,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      {
        tenantId: params.tenantId,
        sourceExternalId: `source_${stableToken}`,
        companyId: params.companyId,
        sourceKind: params.sourceKind,
        bucket: params.bucket,
        objectKey: params.objectKey,
        checksum: params.checksum,
        originalFilename: params.originalFilename,
        contentType: params.contentType,
        byteSize: params.byteSize,
        sourceIdempotencyKey,
        sourceMetadata: jsonParam({
          caseId: params.caseId,
          importDate: params.importDate,
          companyExternalId: params.companyExternalId,
          uploadSource: "api",
        }),
      },
      { transactionId },
    );

    const sourceFileId = requireReturnedId(sourceFile, "source file");
    const [importBatch] = await dataApi.execute<{ id: string }>(
      `
        insert into import_batches (
          tenant_id,
          external_id,
          source_file_id,
          company_id,
          import_kind,
          state,
          idempotency_key,
          rows_total,
          rows_succeeded,
          rows_failed,
          summary
        )
        values (
          :tenantId,
          :batchExternalId,
          :sourceFileId,
          :companyId,
          :importKind,
          'queued',
          :batchIdempotencyKey,
          0,
          0,
          0,
          :summary
        )
        on conflict (tenant_id, idempotency_key) do update set
          source_file_id = excluded.source_file_id,
          company_id = excluded.company_id,
          import_kind = excluded.import_kind,
          summary = excluded.summary,
          updated_at = now()
        returning id
      `,
      {
        tenantId: params.tenantId,
        batchExternalId: `batch_${stableToken}`,
        sourceFileId,
        companyId: params.companyId,
        importKind: params.importKind,
        batchIdempotencyKey,
        summary: jsonParam({
          caseId: params.caseId,
          sourceKind: params.sourceKind,
          objectKey: params.objectKey,
          checksum: params.checksum,
        }),
      },
      { transactionId },
    );

    const importBatchId = requireReturnedId(importBatch, "import batch");
    const eventPayload = {
      sourceFileId,
      importBatchId,
      sourceKind: params.sourceKind,
      importKind: params.importKind,
      objectKey: params.objectKey,
      checksum: params.checksum,
      companyExternalId: params.companyExternalId,
      caseId: params.caseId,
    };
    const [event] = await dataApi.execute<{ id: string }>(
      `
        insert into event_inbox (
          tenant_id,
          source,
          event_type,
          payload,
          idempotency_key,
          state,
          available_at
        )
        values (
          :tenantId,
          'uploads-api',
          'source_file.uploaded',
          :payload,
          :eventIdempotencyKey,
          'queued',
          now()
        )
        on conflict (tenant_id, idempotency_key) do update set
          payload = excluded.payload,
          updated_at = now()
        returning id
      `,
      {
        tenantId: params.tenantId,
        payload: jsonParam(eventPayload),
        eventIdempotencyKey,
      },
      { transactionId },
    );

    return {
      source_file_id: sourceFileId,
      import_batch_id: importBatchId,
      event_id: requireReturnedId(event, "event inbox item"),
    };
  });
}

function buildSourceObjectKey(input: {
  companyExternalId: string;
  importDate: string;
  checksum: string;
  sourceKind: SourceKind;
  originalFilename: string;
}): string {
  const company = slugPart(input.companyExternalId);
  const filename = slugPart(input.originalFilename);
  const checksumPrefix = input.checksum.slice(0, 16);

  return `companies/${company}/imports/${input.importDate}/${input.checksum}/${input.sourceKind}-${checksumPrefix}-${filename}`;
}

function stableIdToken(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function slugPart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return slug || "unnamed";
}

function toImportDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function jsonParam(value: unknown) {
  return {
    value: JSON.stringify(value),
    typeHint: "JSON" as const,
  };
}

function requireReturnedId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) {
    throw new Error(`Aurora did not return a ${label} id.`);
  }

  return row.id;
}

function formatBytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))}MB`;
}
