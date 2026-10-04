import { Injectable } from "@nestjs/common";
import type {} from "multer";
import { randomUUID, createHash } from "node:crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { storage, bucket } from "../../../packages/runtime/src/storage.js";
import {
  scoped,
  one,
  idempotent,
  event,
} from "../../../packages/runtime/src/database.js";
import {
  DomainError,
  requireRole,
  type Actor,
} from "../../../packages/domain/src/insurance.js";
@Injectable()
export class Documents {
  async upload(
    a: Actor,
    claimId: string,
    file: Express.Multer.File | undefined,
    key: string | undefined,
  ) {
    requireRole(a, "CUSTOMER", "ADJUSTER");
    if (!file || !file.buffer.length)
      throw new DomainError("DOCUMENT_REQUIRED", "Select a document.", 422);
    const b = file.buffer;
    let mime: string | undefined;
    if (b.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
    else if (b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
      mime = "image/png";
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) mime = "image/jpeg";
    else if (
      file.mimetype === "text/plain" &&
      !b.includes(0) &&
      !b.toString("utf8").includes("\uFFFD")
    )
      mime = "text/plain";
    if (!mime)
      throw new DomainError(
        "DOCUMENT_TYPE",
        "Upload a PDF, PNG, JPEG or UTF-8 text document.",
        422,
      );
    const hash = createHash("sha256").update(b).digest("hex"),
      filename =
        file.originalname.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) ||
        "document";
    return scoped(a, "claim.document.upload", (tx) =>
      idempotent(
        tx,
        a,
        `document:${claimId}`,
        key,
        { hash, filename, mime },
        async () => {
          const claim = await one<{ tenant_id: string; party_id: string }>(
            tx,
            "SELECT tenant_id,party_id FROM claims.claims WHERE id=$1",
            [claimId],
          );
          const id = randomUUID(),
            objectKey = `quarantine/${claim.tenant_id}/${id}`;
          const object = await storage.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: b,
              ContentType: mime,
              Metadata: { sha256: hash },
            }),
          );
          await tx.query(
            "INSERT INTO claims.documents(id,tenant_id,party_id,claim_id,object_key,filename,mime,sha256,status,object_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUARANTINED',$9)",
            [
              id,
              claim.tenant_id,
              claim.party_id,
              claimId,
              objectKey,
              filename,
              mime,
              hash,
              object.VersionId ?? null,
            ],
          );
          await event(tx, claim.tenant_id, "document.uploaded", id);
          return { id, filename, mime, status: "QUARANTINED" };
        },
      ),
    );
  }
  async download(a: Actor, id: string) {
    requireRole(a, "CUSTOMER", "ADJUSTER", "FINANCE_APPROVER", "ADMIN");
    return scoped(a, "document.download", async (tx) => {
      const row = await one<{
        object_key: string;
        filename: string;
        mime: string;
        status: string;
        object_version: string | null;
        sha256: string;
      }>(tx, "SELECT * FROM claims.documents WHERE id=$1", [id]);
      if (row.status !== "CLEAN")
        throw new DomainError(
          "DOCUMENT_NOT_CLEAN",
          "This document is not available until scanning succeeds.",
          409,
        );
      const r = await storage.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: row.object_key,
          ...(row.object_version ? { VersionId: row.object_version } : {}),
        }),
      );
      if (!r.Body || (r.ContentLength ?? 0) > 10*1024*1024)
        throw new DomainError(
          "DOCUMENT_UNAVAILABLE",
          "Document unavailable.",
          503,
        );
      const body = Buffer.from(await r.Body.transformToByteArray());
      if (
        body.length > 10 * 1024 * 1024 ||
        createHash("sha256").update(body).digest("hex") !== row.sha256
      )
        throw new DomainError(
          "DOCUMENT_INTEGRITY",
          "Document integrity could not be verified.",
          503,
        );
      return {
        filename: row.filename,
        mime: row.mime,
        body,
      };
    });
  }
}
