import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  type RDSDataClient,
  RDSDataClient as AwsRdsDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

import { type DataApiConfig, requireDataApiConfig } from "./data-api-env";

export type DataApiScalar = string | number | boolean | Date | null;

export type DataApiParam =
  | DataApiScalar
  | {
      value: DataApiScalar;
      typeHint?: "JSON" | "UUID" | "DECIMAL" | "DATE" | "TIME" | "TIMESTAMP";
    };

export type DataApiParams = Record<string, DataApiParam>;

export type ExecuteSqlOptions = {
  transactionId?: string;
  includeResultMetadata?: boolean;
};

const RESUME_RETRY_DELAYS_MS = [250, 500, 1_000, 1_500, 2_000, 3_000];

export class AuroraDataApiClient {
  private readonly client: RDSDataClient;
  private readonly config: DataApiConfig;

  constructor(config: DataApiConfig = requireDataApiConfig(), client?: RDSDataClient) {
    this.config = config;
    this.client =
      client ??
      new AwsRdsDataClient({
        region: config.region,
        // Intentionally do not pass explicit credentials. The AWS SDK default
        // provider chain handles local AWS profiles and Vercel OIDC web identity.
      });
  }

  async execute<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: DataApiParams = {},
    options: ExecuteSqlOptions = {},
  ): Promise<T[]> {
    const response = await this.withResumeRetry(() =>
      this.client.send(
        new ExecuteStatementCommand({
          resourceArn: this.config.clusterArn,
          secretArn: this.config.secretArn,
          database: this.config.database,
          sql,
          parameters: toSqlParameters(params),
          includeResultMetadata: options.includeResultMetadata ?? true,
          transactionId: options.transactionId,
        }),
      ),
    );

    const columnNames =
      response.columnMetadata?.map((column, index) => column.name ?? `column_${index}`) ?? [];

    return (response.records ?? []).map((record) => recordToObject<T>(record, columnNames));
  }

  async executeMutation(
    sql: string,
    params: DataApiParams = {},
    options: ExecuteSqlOptions = {},
  ): Promise<number> {
    const response = await this.withResumeRetry(() =>
      this.client.send(
        new ExecuteStatementCommand({
          resourceArn: this.config.clusterArn,
          secretArn: this.config.secretArn,
          database: this.config.database,
          sql,
          parameters: toSqlParameters(params),
          includeResultMetadata: false,
          transactionId: options.transactionId,
        }),
      ),
    );

    return response.numberOfRecordsUpdated ?? 0;
  }

  async beginTransaction(): Promise<string> {
    const response = await this.withResumeRetry(() =>
      this.client.send(
        new BeginTransactionCommand({
          resourceArn: this.config.clusterArn,
          secretArn: this.config.secretArn,
          database: this.config.database,
        }),
      ),
    );

    if (!response.transactionId) {
      throw new Error("Aurora Data API did not return a transaction id.");
    }

    return response.transactionId;
  }

  async commitTransaction(transactionId: string): Promise<void> {
    await this.withResumeRetry(() =>
      this.client.send(
        new CommitTransactionCommand({
          resourceArn: this.config.clusterArn,
          secretArn: this.config.secretArn,
          transactionId,
        }),
      ),
    );
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    await this.withResumeRetry(() =>
      this.client.send(
        new RollbackTransactionCommand({
          resourceArn: this.config.clusterArn,
          secretArn: this.config.secretArn,
          transactionId,
        }),
      ),
    );
  }

  async transaction<T>(callback: (transactionId: string) => Promise<T>): Promise<T> {
    const transactionId = await this.beginTransaction();

    try {
      const result = await callback(transactionId);
      await this.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  private async withResumeRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RESUME_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!isDatabaseResumingException(error) || attempt === RESUME_RETRY_DELAYS_MS.length) {
          throw error;
        }

        await delay(RESUME_RETRY_DELAYS_MS[attempt]);
      }
    }

    throw lastError;
  }
}

export function createAuroraDataApiClient(config?: DataApiConfig): AuroraDataApiClient {
  return new AuroraDataApiClient(config);
}

function toSqlParameters(params: DataApiParams): SqlParameter[] {
  return Object.entries(params).map(([name, rawParam]) => {
    const normalized = normalizeParam(rawParam);

    return {
      name,
      value: toField(normalized.value),
      typeHint: normalized.typeHint,
    };
  });
}

function normalizeParam(param: DataApiParam): { value: DataApiScalar; typeHint?: DataApiParamTypeHint } {
  if (param !== null && typeof param === "object" && !(param instanceof Date) && "value" in param) {
    return param as { value: DataApiScalar; typeHint?: DataApiParamTypeHint };
  }

  return { value: param };
}

type DataApiParamTypeHint = Exclude<DataApiParam, DataApiScalar>["typeHint"];

function toField(value: DataApiScalar): Field {
  if (value === null) {
    return { isNull: true };
  }

  if (value instanceof Date) {
    return { stringValue: value.toISOString() };
  }

  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "number":
      if (Number.isInteger(value)) {
        return { longValue: value };
      }
      return { doubleValue: value };
    case "boolean":
      return { booleanValue: value };
    default:
      throw new Error(`Unsupported Aurora Data API parameter type: ${typeof value}`);
  }
}

function recordToObject<T extends Record<string, unknown>>(record: Field[], columnNames: string[]): T {
  return record.reduce<Record<string, unknown>>((row, field, index) => {
    row[columnNames[index] ?? `column_${index}`] = fromField(field);
    return row;
  }, {}) as T;
}

function fromField(field: Field): unknown {
  if ("isNull" in field && field.isNull) {
    return null;
  }

  if ("stringValue" in field) {
    return field.stringValue;
  }

  if ("longValue" in field) {
    return field.longValue;
  }

  if ("doubleValue" in field) {
    return field.doubleValue;
  }

  if ("booleanValue" in field) {
    return field.booleanValue;
  }

  if ("blobValue" in field) {
    return field.blobValue;
  }

  if ("arrayValue" in field) {
    return field.arrayValue;
  }

  return null;
}

function isDatabaseResumingException(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const named = error as { name?: string; Code?: string; code?: string };
  return (
    named.name === "DatabaseResumingException" ||
    named.Code === "DatabaseResumingException" ||
    named.code === "DatabaseResumingException"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
