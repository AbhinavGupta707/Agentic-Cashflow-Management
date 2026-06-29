import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { type S3Config, requireS3Config } from "./s3-env";

export type PutSourceObjectInput = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
  checksumSha256Base64: string;
  metadata: Record<string, string>;
};

export class SourceObjectStorageClient {
  private readonly client: S3Client;
  private readonly config: S3Config;

  constructor(config: S3Config = requireS3Config(), client?: S3Client) {
    this.config = config;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        // The default provider chain covers local AWS profiles and Vercel OIDC.
      });
  }

  get bucket(): string {
    return this.config.bucket;
  }

  async putSourceObject(input: PutSourceObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
        ChecksumSHA256: input.checksumSha256Base64,
        Metadata: input.metadata,
      }),
    );
  }
}

export function createSourceObjectStorageClient(config?: S3Config): SourceObjectStorageClient {
  return new SourceObjectStorageClient(config);
}
