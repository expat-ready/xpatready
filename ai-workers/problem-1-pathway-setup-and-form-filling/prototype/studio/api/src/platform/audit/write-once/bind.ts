// AUD-2 part 2: which write-once archive the app uses, from its environment.
//   PLATFORM_AUDIT_ARCHIVE=s3    S3 with Object Lock in compliance mode: PLATFORM_AUDIT_ARCHIVE_BUCKET (required),
//                                PLATFORM_AUDIT_ARCHIVE_REGION (default ca-central-1), PLATFORM_AUDIT_ARCHIVE_KMS_KEY (optional);
//                                credentials from the task role. A recorded client (tests) is honoured only on a local
//                                server, as PF-F1b's files binding.
//   unset or "fake"              the in-memory fake (Sample: it keeps every port rule but forgets on restart), refused when
//                                PLATFORM_ENVIRONMENT=production: production with no S3 archive has none, and the daily
//                                export fails (alarmed as a failed job), never a silent pass.
import type { AuditArchivePort } from "../../../../../ports/audit-archive.ts";
import { fakeAuditArchive } from "./fake.ts";
import { S3AuditArchive, type S3AuditArchiveOptions } from "./s3-archive.ts";

/** A test's recorded S3 client (credentials and requestHandler), honoured only when PLATFORM_ENVIRONMENT is local or unset. */
export const RECORDED_ARCHIVE_S3 = Symbol.for("aud2.recordedArchiveS3");

export function chooseAuditArchive(env: NodeJS.ProcessEnv = process.env): { archive: AuditArchivePort | null; kind: "s3" | "fake" | "none" } {
  const want = env.PLATFORM_AUDIT_ARCHIVE ?? "", where = env.PLATFORM_ENVIRONMENT ?? "local";
  if (want === "s3") {
    const bucket = env.PLATFORM_AUDIT_ARCHIVE_BUCKET;
    if (!bucket) throw new Error("PLATFORM_AUDIT_ARCHIVE=s3 needs PLATFORM_AUDIT_ARCHIVE_BUCKET");
    const recorded = (globalThis as Record<symbol, unknown>)[RECORDED_ARCHIVE_S3] as Pick<S3AuditArchiveOptions, "credentials" | "requestHandler"> | undefined;
    if (recorded && where !== "local") throw new Error("audit archive: the recorded S3 client is refused outside PLATFORM_ENVIRONMENT=local");
    return { archive: new S3AuditArchive({ bucket, region: env.PLATFORM_AUDIT_ARCHIVE_REGION || undefined, kmsKeyId: env.PLATFORM_AUDIT_ARCHIVE_KMS_KEY || null, ...(recorded ?? {}) }), kind: "s3" };
  }
  if (want !== "" && want !== "fake") throw new Error(`PLATFORM_AUDIT_ARCHIVE=${want}: s3 or fake`);
  if (where === "production") return { archive: null, kind: "none" };
  return { archive: fakeAuditArchive(() => new Date()), kind: "fake" };
}
