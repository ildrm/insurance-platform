import { S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";
export const storage = new S3Client({
  region: config("S3_REGION", "us-east-1"),
  endpoint: config("S3_ENDPOINT"),
  forcePathStyle: true,
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 5000, requestTimeout: 45000 },
  credentials: {
    accessKeyId: config("S3_ACCESS_KEY"),
    secretAccessKey: config("S3_SECRET_KEY"),
  },
});
export const bucket = config("S3_BUCKET", "insurance-private");
