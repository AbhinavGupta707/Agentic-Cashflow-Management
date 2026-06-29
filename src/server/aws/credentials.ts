import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

type AwsCredentialConfig = {
  region: string;
  roleArn?: string;
};

export function resolveAwsCredentials(
  config: AwsCredentialConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.VERCEL !== "1" || !config.roleArn) {
    return undefined;
  }

  return awsCredentialsProvider({
    audience: "sts.amazonaws.com",
    clientConfig: { region: config.region },
    roleArn: config.roleArn,
    roleSessionName: `h0-agentic-cashflow-${env.VERCEL_ENV ?? "runtime"}`,
  });
}

export function awsCredentialUnavailableMessage(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL === "1") {
    return "Aurora Data API is unavailable because Vercel AWS OIDC credentials could not be loaded. Verify the Vercel OIDC provider, AWS_ROLE_ARN trust policy, and production environment.";
  }

  return "Aurora Data API is unavailable because the local AWS session has expired. Reauthenticate before running live database operations.";
}
