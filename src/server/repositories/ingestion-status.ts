import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import {
  DEFAULT_DEMO_CASE_ID,
  DEFAULT_DEMO_COMPANY_ID,
} from "../db/case-state-contract";
import {
  type IngestionStatusCounts,
  type IngestionStatusState,
} from "../db/ingestion-status-contract";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
};

type CountRow = {
  state: string;
  count: number;
};

type SourceFileRow = {
  external_id: string | null;
  original_filename: string;
  source_kind: string;
  upload_state: string;
  byte_size: number;
  created_at: string;
};

type ImportBatchRow = {
  external_id: string | null;
  import_kind: string;
  state: string;
  rows_total: number;
  rows_succeeded: number;
  rows_failed: number;
  pending_rows: number;
  source_filename: string | null;
  source_kind: string | null;
  upload_state: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type EventInboxRow = {
  source: string;
  event_type: string;
  state: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ImportRowSummary = {
  total_rows: number;
  succeeded_rows: number;
  failed_rows: number;
  pending_rows: number;
};

export async function getIngestionStatus(
  options: RepositoryOptions = {},
): Promise<IngestionStatusState> {
  const availability = getDataApiAvailability();
  let dataApi = options.dataApi;

  if (!dataApi) {
    if (!availability.available) {
      throw new DataApiUnavailableError(availability.missing);
    }

    dataApi = createAuroraDataApiClient(availability.config);
  }

  const companyExternalId =
    options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;

  const [scope] = await dataApi.execute<CompanyScopeRow>(
    `
      select id as company_id, tenant_id
      from companies
      where external_id = :companyExternalId
      limit 1
    `,
    { companyExternalId },
  );

  if (!scope) {
    throw new Error(`No company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  const [sourceCounts, recentSources, importCounts, recentImports, eventCounts, recentEvents, rowSummaries] =
    await Promise.all([
      dataApi.execute<CountRow>(
        `
          select upload_state as state, count(*)::int as count
          from source_files
          where company_id = :companyId
          group by upload_state
          order by upload_state asc
        `,
        { companyId: scope.company_id },
      ),
      dataApi.execute<SourceFileRow>(
        `
          select
            external_id,
            original_filename,
            source_kind,
            upload_state,
            byte_size::int as byte_size,
            created_at::text as created_at
          from source_files
          where company_id = :companyId
          order by created_at desc
          limit 6
        `,
        { companyId: scope.company_id },
      ),
      dataApi.execute<CountRow>(
        `
          select state, count(*)::int as count
          from import_batches
          where company_id = :companyId
          group by state
          order by state asc
        `,
        { companyId: scope.company_id },
      ),
      dataApi.execute<ImportBatchRow>(
        `
          select
            ib.external_id,
            ib.import_kind,
            ib.state,
            ib.rows_total,
            ib.rows_succeeded,
            ib.rows_failed,
            count(ibr.id) filter (where ibr.state = 'pending')::int as pending_rows,
            sf.original_filename as source_filename,
            sf.source_kind,
            sf.upload_state,
            ib.error_message,
            ib.created_at::text as created_at,
            ib.updated_at::text as updated_at
          from import_batches ib
          left join source_files sf on sf.id = ib.source_file_id
          left join import_batch_rows ibr on ibr.import_batch_id = ib.id
          where ib.company_id = :companyId
          group by ib.id, sf.id
          order by ib.created_at desc
          limit 6
        `,
        { companyId: scope.company_id },
      ),
      dataApi.execute<CountRow>(
        `
          select state, count(*)::int as count
          from event_inbox
          where tenant_id = :tenantId
          group by state
          order by state asc
        `,
        { tenantId: scope.tenant_id },
      ),
      dataApi.execute<EventInboxRow>(
        `
          select
            source,
            event_type,
            state,
            attempts,
            error_message,
            created_at::text as created_at,
            updated_at::text as updated_at
          from event_inbox
          where tenant_id = :tenantId
          order by created_at desc
          limit 6
        `,
        { tenantId: scope.tenant_id },
      ),
      dataApi.execute<ImportRowSummary>(
        `
          select
            count(ibr.id)::int as total_rows,
            count(ibr.id) filter (where ibr.state = 'applied')::int as succeeded_rows,
            count(ibr.id) filter (where ibr.state = 'failed')::int as failed_rows,
            count(ibr.id) filter (where ibr.state = 'pending')::int as pending_rows
          from import_batch_rows ibr
          join import_batches ib on ib.id = ibr.import_batch_id
          where ib.company_id = :companyId
        `,
        { companyId: scope.company_id },
      ),
    ]);

  const [rowSummary] = rowSummaries;
  const importCountMap = toImportCounts(importCounts);
  const eventCountMap = toEventCounts(eventCounts);

  return {
    companyExternalId,
    caseId,
    sourceFiles: {
      total: sumCounts(sourceCounts),
      byState: toCountMap(sourceCounts),
      recent: recentSources.map((source) => ({
        externalId: source.external_id,
        filename: source.original_filename,
        sourceKind: source.source_kind,
        uploadState: source.upload_state,
        byteSize: source.byte_size,
        createdAt: source.created_at,
      })),
    },
    imports: {
      counts: importCountMap,
      rows: {
        total: rowSummary?.total_rows ?? 0,
        succeeded: rowSummary?.succeeded_rows ?? 0,
        failed: rowSummary?.failed_rows ?? 0,
        pending: rowSummary?.pending_rows ?? 0,
      },
      recent: recentImports.map((batch) => ({
        externalId: batch.external_id,
        importKind: batch.import_kind,
        state: batch.state,
        rowsTotal: batch.rows_total,
        rowsSucceeded: batch.rows_succeeded,
        rowsFailed: batch.rows_failed,
        pendingRows: batch.pending_rows,
        sourceFilename: batch.source_filename,
        sourceKind: batch.source_kind,
        uploadState: batch.upload_state,
        errorMessage: batch.error_message,
        createdAt: batch.created_at,
        updatedAt: batch.updated_at,
      })),
    },
    events: {
      counts: eventCountMap,
      recent: recentEvents.map((event) => ({
        source: event.source,
        eventType: event.event_type,
        state: event.state,
        attempts: event.attempts,
        errorMessage: event.error_message,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
      })),
    },
  };
}

function toCountMap(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.state, row.count]));
}

function sumCounts(rows: CountRow[]) {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function toImportCounts(rows: CountRow[]): IngestionStatusCounts {
  const byState = toCountMap(rows);

  return {
    queued: byState.queued ?? 0,
    processing: byState.processing ?? 0,
    completed: (byState.completed ?? 0) + (byState.completed_with_errors ?? 0),
    failed: byState.failed ?? 0,
  };
}

function toEventCounts(rows: CountRow[]): IngestionStatusState["events"]["counts"] {
  const byState = toCountMap(rows);

  return {
    queued: byState.queued ?? 0,
    processing: byState.processing ?? 0,
    completed: byState.processed ?? 0,
    failed: byState.failed ?? 0,
    deadLetter: byState.dead_letter ?? 0,
  };
}
