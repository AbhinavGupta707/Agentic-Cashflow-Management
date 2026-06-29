export const S3_ENV_KEYS = ["AWS_REGION", "AWS_S3_BUCKET"] as const;

export type S3EnvKey = (typeof S3_ENV_KEYS)[number];

export type S3Config = {
  region: string;
  bucket: string;
  roleArn?: string;
};

export type S3Availability =
  | {
      available: true;
      config: S3Config;
    }
  | {
      available: false;
      missing: S3EnvKey[];
      message: string;
    };

export class S3UnavailableError extends Error {
  readonly missing: S3EnvKey[];

  constructor(missing: S3EnvKey[]) {
    super(
      `S3 uploads are unavailable because required environment variables are missing: ${missing.join(
        ", ",
      )}`,
    );
    this.name = "S3UnavailableError";
    this.missing = missing;
  }
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getS3Availability(env: NodeJS.ProcessEnv = process.env): S3Availability {
  const missing = S3_ENV_KEYS.filter((key) => !present(env[key]));

  if (missing.length > 0) {
    return {
      available: false,
      missing,
      message:
        "S3 uploads are not configured for this runtime. Set AWS_REGION and AWS_S3_BUCKET before accepting live source files.",
    };
  }

  return {
    available: true,
    config: {
      region: env.AWS_REGION!,
      bucket: env.AWS_S3_BUCKET!,
      roleArn: present(env.AWS_ROLE_ARN) ? env.AWS_ROLE_ARN : undefined,
    },
  };
}

export function requireS3Config(env: NodeJS.ProcessEnv = process.env): S3Config {
  const availability = getS3Availability(env);

  if (!availability.available) {
    throw new S3UnavailableError(availability.missing);
  }

  return availability.config;
}
