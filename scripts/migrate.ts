import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const migrationsDir = resolve(process.env.MIGRATIONS_DIR ?? "db/migrations");
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

const env = {
  region: requireEnv("AWS_REGION"),
  resourceArn: requireEnv("AURORA_CLUSTER_ARN"),
  secretArn: requireEnv("AURORA_SECRET_ARN"),
  database: requireEnv("AURORA_DATABASE"),
};

const client = new RDSDataClient({ region: env.region });

async function main() {
  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => {
      const path = join(migrationsDir, file);
      const sql = readFileSync(path, "utf8");

      return {
        file,
        version: file.replace(/\.sql$/, ""),
        name: basename(file),
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
        statements: splitSqlStatements(sql),
      };
    });

  if (migrations.length === 0) {
    console.log(`No SQL migrations found in ${migrationsDir}`);
    return;
  }

  if (dryRun) {
    for (const migration of migrations) {
      console.log(`${migration.file}: ${migration.statements.length} statements, sha256=${migration.checksum}`);
    }
    return;
  }

  await executeStatement(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await listAppliedMigrations();

  for (const migration of migrations) {
    const current = applied.get(migration.version);

    if (current) {
      if (current !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} was already applied with checksum ${current}, but local checksum is ${migration.checksum}`,
        );
      }

      console.log(`skip ${migration.file}`);
      continue;
    }

    console.log(`apply ${migration.file}`);
    await applyMigration(migration);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

async function listAppliedMigrations(): Promise<Map<string, string>> {
  const result = await executeStatement("select version, checksum from schema_migrations order by version");
  const applied = new Map<string, string>();

  for (const record of result.records ?? []) {
    const version = record[0]?.stringValue;
    const checksum = record[1]?.stringValue;

    if (version && checksum) {
      applied.set(version, checksum);
    }
  }

  return applied;
}

async function applyMigration(migration: {
  version: string;
  name: string;
  checksum: string;
  statements: string[];
}) {
  const transaction = await withResumeRetry(() =>
    client.send(
      new BeginTransactionCommand({
        resourceArn: env.resourceArn,
        secretArn: env.secretArn,
        database: env.database,
      }),
    ),
  );

  if (!transaction.transactionId) {
    throw new Error(`Could not begin transaction for ${migration.version}`);
  }

  try {
    for (const statement of migration.statements) {
      await executeStatement(statement, transaction.transactionId);
    }

    await executeStatement(
      "insert into schema_migrations (version, name, checksum) values (:version, :name, :checksum)",
      transaction.transactionId,
      [
        { name: "version", value: { stringValue: migration.version } },
        { name: "name", value: { stringValue: migration.name } },
        { name: "checksum", value: { stringValue: migration.checksum } },
      ],
    );

    await withResumeRetry(() =>
      client.send(
        new CommitTransactionCommand({
          resourceArn: env.resourceArn,
          secretArn: env.secretArn,
          transactionId: transaction.transactionId,
        }),
      ),
    );
  } catch (error) {
    await client.send(
      new RollbackTransactionCommand({
        resourceArn: env.resourceArn,
        secretArn: env.secretArn,
        transactionId: transaction.transactionId,
      }),
    );
    throw error;
  }
}

async function executeStatement(
  sql: string,
  transactionId?: string,
  parameters?: SqlParameter[],
) {
  return withResumeRetry(() =>
    client.send(
      new ExecuteStatementCommand({
        resourceArn: env.resourceArn,
        secretArn: env.secretArn,
        database: env.database,
        transactionId,
        sql,
        parameters,
      }),
    ),
  );
}

async function withResumeRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDatabaseResumingException(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 10_000);
      console.warn(`Aurora is resuming; retrying Data API call in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }

  throw new Error("unreachable retry state");
}

function isDatabaseResumingException(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "DatabaseResumingException"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let singleQuote = false;
  let doubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      current += char;
      if (char === "\n") {
        lineComment = false;
      }
      i += 1;
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        blockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += char;
        i += 1;
      }
      continue;
    }

    if (!singleQuote && !doubleQuote && char === "-" && next === "-") {
      current += char + next;
      lineComment = true;
      i += 2;
      continue;
    }

    if (!singleQuote && !doubleQuote && char === "/" && next === "*") {
      current += char + next;
      blockComment = true;
      i += 2;
      continue;
    }

    if (!singleQuote && !doubleQuote && char === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);

      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (!doubleQuote && char === "'" && sql[i - 1] !== "\\") {
      singleQuote = !singleQuote;
    } else if (!singleQuote && char === '"') {
      doubleQuote = !doubleQuote;
    }

    if (!singleQuote && !doubleQuote && char === ";") {
      const statement = current.trim();

      if (statement.length > 0) {
        statements.push(statement);
      }

      current = "";
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  const finalStatement = current.trim();

  if (finalStatement.length > 0) {
    statements.push(finalStatement);
  }

  return statements;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
