import { NextResponse } from "next/server";

import { DataApiUnavailableError } from "../../../server/aws/data-api-env";
import { S3UnavailableError } from "../../../server/aws/s3-env";
import {
  MAX_UPLOAD_BYTES,
  UploadStorageError,
  UploadValidationError,
  UploadWriteError,
  optionalText,
  parseImportKind,
  parseSourceKind,
  uploadSourceFile,
} from "../../../server/ingestion/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return errorResponse(
      413,
      "file_too_large",
      `file must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`,
    );
  }

  try {
    const formData = await readMultipartFormData(request);
    const file = formData.get("file");

    if (!isFileLike(file)) {
      return errorResponse(400, "invalid_form_data", "file is required.");
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse(
        413,
        "file_too_large",
        `file must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`,
      );
    }

    const sourceKind = parseSourceKind(formData.get("sourceKind"));
    const importKind = parseImportKind(formData.get("importKind"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadSourceFile({
      bytes,
      originalFilename: file.name,
      contentType: file.type || "application/octet-stream",
      sourceKind,
      importKind,
      companyExternalId: optionalText(formData.get("companyExternalId")),
      caseId: optionalText(formData.get("caseId")),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(400, error.code, error.message);
    }

    if (error instanceof DataApiUnavailableError) {
      return errorResponse(503, "missing_configuration", error.message, { missingEnv: error.missing });
    }

    if (error instanceof S3UnavailableError) {
      return errorResponse(503, "missing_configuration", error.message, { missingEnv: error.missing });
    }

    if (error instanceof UploadStorageError) {
      return errorResponse(502, "upload_failed", error.message);
    }

    if (error instanceof UploadWriteError) {
      return errorResponse(502, "write_failed", error.message);
    }

    console.error(error);
    return errorResponse(500, "upload_error", "The upload request could not be completed.");
  }
}

async function readMultipartFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new UploadValidationError("invalid_form_data", "Request must be multipart FormData.");
  }
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "name" in value &&
    typeof value.name === "string" &&
    "size" in value &&
    typeof value.size === "number"
  );
}

function errorResponse(
  httpStatus: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      status: "error",
      code,
      message,
      ...extra,
    },
    { status: httpStatus },
  );
}
