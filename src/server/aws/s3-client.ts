import { Buffer } from "node:buffer";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { type S3Config, requireS3Config } from "./s3-env";

export type PutSourceObjectInput = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
  checksumSha256Base64: string;
  metadata: Record<string, string>;
};

export type GetSourceObjectTextInput = {
  key: string;
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

  async getSourceObjectText(input: GetSourceObjectTextInput): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
      }),
    );

    return bodyToUtf8Text(response.Body);
  }
}

export function createSourceObjectStorageClient(config?: S3Config): SourceObjectStorageClient {
  return new SourceObjectStorageClient(config);
}

async function bodyToUtf8Text(body: unknown): Promise<string> {
  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  const transformable = body as { transformToString?: (encoding?: string) => Promise<string> };
  if (typeof transformable.transformToString === "function") {
    return transformable.transformToString("utf-8");
  }

  const asyncIterable = body as AsyncIterable<Uint8Array | string>;
  if (typeof asyncIterable[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];

    for await (const chunk of asyncIterable) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  throw new Error("S3 response body could not be read as UTF-8 text.");
}
