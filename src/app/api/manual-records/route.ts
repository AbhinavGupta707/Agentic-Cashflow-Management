import { NextResponse } from "next/server";

import { DataApiUnavailableError, getDataApiAvailability } from "../../../server/aws/data-api-env";
import { createAuroraDataApiClient } from "../../../server/aws/rds-data-api";
import { processEventInbox } from "../../../server/ingestion/processor";
import { importKindFromInput } from "../../../server/ingestion/normalize";
import {
  enqueueEventInboxEvent,
  resolveTenantId,
} from "../../../server/repositories/event-inbox";
import { scopedIdempotencyKey, stableHash } from "../../../server/ingestion/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ManualRecordRequest = {
  tenantId?: string;
  tenantSlug?: string;
  companyId?: string;
  companyExternalId?: string;
  kind?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  process?: boolean;
};

export async function POST(request: Request) {
  const availability = getDataApiAvailability();

  if (!availability.available) {
    const error = new DataApiUnavailableError(availability.missing);
    return NextResponse.json(
      {
        status: "unavailable",
        message: error.message,
        missingEnv: error.missing,
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as ManualRecordRequest;
    const payload = validateManualRequest(body);
    const dataApi = createAuroraDataApiClient(availability.config);
    const tenantId = await resolveTenantId(dataApi, {
      tenantId: body.tenantId,
      tenantSlug: body.tenantSlug,
    });
    const importKind = importKindFromInput(payload.kind);
    const event = await enqueueEventInboxEvent(
      {
        tenantId,
        source: "manual-records",
        eventType: "manual_record.queued",
        payload: {
          kind: importKind,
          importKind,
          payload: body.payload,
          companyId: body.companyId,
          companyExternalId: body.companyExternalId,
        },
        idempotencyKey:
          body.idempotencyKey ??
          scopedIdempotencyKey(["manual-record", tenantId, importKind, stableHash(body.payload)]),
      },
      dataApi,
    );

    const shouldProcess = body.process ?? new URL(request.url).searchParams.get("process") === "true";
    const processSummary = shouldProcess
      ? await processEventInbox({
          dataApi,
          eventId: event.id,
          limit: 1,
          workerId: "manual-records-api",
        })
      : null;

    return NextResponse.json({
      status: shouldProcess ? "processed" : "queued",
      eventId: event.id,
      importKind,
      processSummary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to queue manual record.",
      },
      { status: 400 },
    );
  }
}

function validateManualRequest(body: ManualRecordRequest): { kind: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  if (!body.tenantId && !body.tenantSlug) {
    throw new Error("tenantId or tenantSlug is required.");
  }

  if (!body.companyId && !body.companyExternalId) {
    throw new Error("companyId or companyExternalId is required.");
  }

  if (!body.kind) {
    throw new Error("kind is required: customer, contact, invoice, obligation, or payment.");
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    throw new Error("payload must be a JSON object.");
  }

  return { kind: body.kind };
}
