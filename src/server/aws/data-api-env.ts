export const DATA_API_ENV_KEYS = [
  "AWS_ROLE_ARN",
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

export type DataApiEnvKey = (typeof DATA_API_ENV_KEYS)[number];

export type DataApiConfig = {
  roleArn: string;
  region: string;
  clusterArn: string;
  secretArn: string;
  database: string;
  s3Bucket: string;
};

export type DataApiAvailability =
  | {
      available: true;
      config: DataApiConfig;
    }
  | {
      available: false;
      missing: DataApiEnvKey[];
      message: string;
    };

export class DataApiUnavailableError extends Error {
  readonly missing: DataApiEnvKey[];

  constructor(missing: DataApiEnvKey[]) {
    super(
      `Aurora Data API is unavailable because required environment variables are missing: ${missing.join(
        ", ",
      )}`,
    );
    this.name = "DataApiUnavailableError";
    this.missing = missing;
  }
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getDataApiAvailability(env: NodeJS.ProcessEnv = process.env): DataApiAvailability {
  const missing = DATA_API_ENV_KEYS.filter((key) => !present(env[key]));

  if (missing.length > 0) {
    return {
      available: false,
      missing,
      message:
        "Aurora Data API is not configured for this runtime. Set the AWS/Vercel OIDC and Aurora environment variables before running live database operations.",
    };
  }

  return {
    available: true,
    config: {
      roleArn: env.AWS_ROLE_ARN!,
      region: env.AWS_REGION!,
      clusterArn: env.AURORA_CLUSTER_ARN!,
      secretArn: env.AURORA_SECRET_ARN!,
      database: env.AURORA_DATABASE!,
      s3Bucket: env.AWS_S3_BUCKET!,
    },
  };
}

export function requireDataApiConfig(env: NodeJS.ProcessEnv = process.env): DataApiConfig {
  const availability = getDataApiAvailability(env);

  if (!availability.available) {
    throw new DataApiUnavailableError(availability.missing);
  }

  return availability.config;
}
