export type IngestionStatusCounts = {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
};

export type IngestionStatusState = {
  companyExternalId: string;
  caseId: string;
  sourceFiles: {
    total: number;
    byState: Record<string, number>;
    recent: Array<{
      externalId: string | null;
      filename: string;
      sourceKind: string;
      uploadState: string;
      byteSize: number;
      createdAt: string;
    }>;
  };
  imports: {
    counts: IngestionStatusCounts;
    rows: {
      total: number;
      succeeded: number;
      failed: number;
      pending: number;
    };
    recent: Array<{
      externalId: string | null;
      importKind: string;
      state: string;
      rowsTotal: number;
      rowsSucceeded: number;
      rowsFailed: number;
      pendingRows: number;
      sourceFilename: string | null;
      sourceKind: string | null;
      uploadState: string | null;
      errorMessage: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  events: {
    counts: IngestionStatusCounts & {
      deadLetter: number;
    };
    recent: Array<{
      source: string;
      eventType: string;
      state: string;
      attempts: number;
      errorMessage: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
};

export type IngestionStatusApiResponse =
  | {
      status: "ok";
      data: IngestionStatusState;
    }
  | {
      status: "unavailable";
      message: string;
      missingEnv: string[];
    }
  | {
      status: "error";
      message: string;
    };
