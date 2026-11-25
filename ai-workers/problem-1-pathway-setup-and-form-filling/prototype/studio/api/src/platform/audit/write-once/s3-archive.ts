// AUD-2 part 2 (map row 97, R1.97; SA-11-5, NFR5-08; P-571 (3)): the write-once archive (AuditArchivePort) on Amazon S3
// with Object Lock in COMPLIANCE mode, in Canada (ca-central-1 unless configured; P-559). @aws-sdk/client-s3 is already
// gated (product/design/tech-gate-files-s3-2026-11-22.md, PF-F1); no new library. What this adapter keeps:
//  * write once: every put is conditional (If-None-Match: *), so a key already written is refused (ArchiveKeyExists),
//    never replaced, even by two writers at once;
//  * kept until retainUntil: every put names ObjectLockMode COMPLIANCE and ObjectLockRetainUntilDate, which nobody, not
//    even the account's root user, can shorten or remove early (S3's compliance mode); a put whose answer does not show
//    the lock is an error (S3AuditArchiveError LockNotApplied), never a silent unlocked object;
//  * integrity: the put carries its SHA-256 checksum (S3 refuses a body that does not match it) and the hex digest in
//    metadata; get recomputes it;
//  * remove: refused here while the object's own retain-until date (read from S3) is in the future (ArchiveRetained);
//    after it, the exact version is deleted. The bucket (AUD-2c, deploy/cdk) also refuses it: this check only gives the
//    port's typed answer without a request S3 would refuse anyway.
// An S3 error is rethrown with its name and status only (the SDK's text can quote a request, PF-23). CI and lanes use
// the recorded fake (tests/fixtures/aud2-s3/), never the network. Owed (P-821): the real bucket (AUD-2c) and one live
// put and refused delete in the founder's account.
import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { ArchiveKey, ArchiveKeyExists, ArchiveRetained, RetainUntil, type ArchivedObject, type AuditArchivePort } from "../../../../../ports/audit-archive.ts";
import { BUCKET_NAME, CANADA_REGIONS, DEFAULT_FILES_REGION, KMS_KEY } from "../../files/s3-files.ts";

export class S3AuditArchiveError extends Error {
  constructor(readonly code: string, readonly status: number | null) { super(`audit archive (S3): ${code}${status ? ` (${status})` : ""}`); this.name = "S3AuditArchiveError"; }
}
export type S3AuditArchiveOptions = { bucket: string; region?: string; kmsKeyId?: string | null; now?: () => Date } & Pick<S3ClientConfig, "credentials" | "requestHandler">;

const meta = (e: unknown) => e as { name?: string; $metadata?: { httpStatusCode?: number } };
const rethrow = (e: unknown): never => { const m = meta(e); throw new S3AuditArchiveError(m.name ?? "Unknown", m.$metadata?.httpStatusCode ?? null); };

export class S3AuditArchive implements AuditArchivePort {
  readonly bucket: string; readonly region: string;
  private readonly s3: S3Client; private readonly kms: string | null; private readonly now: () => Date;

  constructor(o: S3AuditArchiveOptions) {
    if (!BUCKET_NAME.test(o.bucket)) throw new Error("audit archive (S3): the bucket name is not one S3 serves on its own host");
    this.region = o.region ?? DEFAULT_FILES_REGION;
    if (!CANADA_REGIONS.includes(this.region)) throw new Error(`audit archive (S3): ${this.region} is not a Canadian region (P-559)`);
    if (o.kmsKeyId != null && !KMS_KEY.test(o.kmsKeyId)) throw new Error("audit archive (S3): the KMS key is not a key id, ARN or alias");
    this.bucket = o.bucket; this.kms = o.kmsKeyId ?? null; this.now = o.now ?? (() => new Date());
    this.s3 = new S3Client({ region: this.region, credentials: o.credentials, requestHandler: o.requestHandler, maxAttempts: 3 });
  }

  async put(key: string, bytes: Buffer, retainUntil: Date): Promise<{ sha256: string }> {
    const k = ArchiveKey.parse(key), until = RetainUntil.parse(retainUntil);
    if (!Buffer.isBuffer(bytes)) throw new TypeError("archive: bytes must be a Buffer");
    if (until.getTime() <= this.now().getTime()) throw new RangeError("archive: a keep-until date in the past or now is refused");
    const digest = createHash("sha256").update(bytes), sha256 = digest.copy().digest("hex"), b64 = digest.digest("base64");
    try {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: k, Body: bytes, IfNoneMatch: "*", ContentType: "application/octet-stream",
        ObjectLockMode: "COMPLIANCE", ObjectLockRetainUntilDate: until, ChecksumSHA256: b64, Metadata: { sha256 },
        ...(this.kms ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: this.kms } : {}) }));
    } catch (e) {
      if (meta(e).$metadata?.httpStatusCode === 412 || meta(e).name === "PreconditionFailed") throw new ArchiveKeyExists(k);
      rethrow(e);
    }
    const h = await this.head(k);
    if (!h || h.mode !== "COMPLIANCE" || !h.until || h.until.getTime() < until.getTime()) throw new S3AuditArchiveError("LockNotApplied", null);
    return { sha256 };
  }

  async get(key: string): Promise<ArchivedObject | null> {
    const k = ArchiveKey.parse(key);
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: k }));
      const bytes = Buffer.from(await r.Body!.transformToByteArray());
      return { key: k, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), retainUntil: r.ObjectLockRetainUntilDate ?? new Date(0), writtenAt: r.LastModified ?? new Date(0) };
    } catch (e) { if (meta(e).name === "NoSuchKey" || meta(e).$metadata?.httpStatusCode === 404) return null; return rethrow(e); }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    try {
      for (let page: string | undefined; ;) {
        const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: page }));
        for (const c of r.Contents ?? []) if (c.Key) keys.push(c.Key);
        if (!r.IsTruncated || !r.NextContinuationToken) break;
        page = r.NextContinuationToken;
      }
    } catch (e) { rethrow(e); }
    return keys.sort();
  }

  async remove(key: string): Promise<void> {
    const k = ArchiveKey.parse(key), h = await this.head(k);
    if (!h) return;
    if (h.until && this.now().getTime() < h.until.getTime()) throw new ArchiveRetained(k, h.until);
    try { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: k, ...(h.version ? { VersionId: h.version } : {}) })); } catch (e) { rethrow(e); }
  }

  private async head(k: string): Promise<{ mode: string | null; until: Date | null; version: string | null } | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: k }));
      return { mode: r.ObjectLockMode ?? null, until: r.ObjectLockRetainUntilDate ?? null, version: r.VersionId ?? null };
    } catch (e) { if (meta(e).name === "NotFound" || meta(e).name === "NoSuchKey" || meta(e).$metadata?.httpStatusCode === 404) return null; return rethrow(e); }
  }
}
