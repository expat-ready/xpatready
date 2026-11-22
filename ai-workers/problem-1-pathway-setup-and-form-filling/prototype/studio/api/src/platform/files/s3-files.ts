// PF-F1 (map row 65; AG-9-16 to AG-9-19, SA-8-6, P-559): the FilesPort (ports/files.ts) on Amazon S3 in Canada, through
// @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner (gate: product/design/tech-gate-files-s3-2026-11-22.md). The
// bucket itself (Block Public Access, the policy, versioning, the KMS key) is PF-F1c's. What this adapter keeps:
//  * the firm wall: every object key is `<firm id>/<key>` (the firm id a checked uuid in lower case, the key a checked
//    FileKey), built in one place (objectKey), so another firm's key reads as absent;
//  * write-once: a put is a conditional put (If-None-Match: *), so two writers of one key cannot both win; when the key
//    is taken, the stored sha256 and type are read back: the same ones are a retry, others give FileKeyTaken;
//  * encryption: every put (a file, and a delete's tombstone) asks for server-side encryption with the configured KMS
//    key; an adapter without a KMS key cannot be made;
//  * delete (PF-Fd): the object is replaced, only if it is still the one read (If-Match), by an empty tombstone, so the
//    key stays taken and is never written again. With bucket versioning on (PF-F1c) the replaced bytes remain as an
//    earlier version until the bucket's lifecycle rule removes them: that rule is PF-F1c's;
//  * usedBytes (PF-15): the sizes under the firm's prefix (a tombstone is 0 bytes);
//  * links: S3FileLinks, below.
// An S3 error is rethrown with its name and status only (the SDK's own text can quote a request, PF-23). CI and lanes
// use a recorded fake: the client takes a `requestHandler`, never the network (tests/fixtures/pff1-s3/).
import { createHmac, timingSafeEqual } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type HeadObjectCommandOutput, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FirmId } from "../../../../ports/audit.ts";
import { FileKey, FileKeyTaken, FilePut, sha256Hex, type FilesPort, type StoredFile } from "../../../../ports/files.ts";
import type { Secret } from "../config/secret.ts";

/** AG-9-19: where the bucket is unless the configuration names another region. */
export const DEFAULT_FILES_REGION = "ca-central-1";
/** Sample: how long a download link works (the row's 5 minutes; the same as the local adapter's LINK_SECONDS). */
export const S3_LINK_SECONDS = 5 * 60;
export const S3_TIMEOUT_MS = 20_000;
/** P-559 (data in Canada): the regions the bucket may be in. */
export const CANADA_REGIONS: readonly string[] = Object.freeze(["ca-central-1", "ca-west-1"]);
/** A bucket name S3 accepts and serves on its own host over TLS: no dots (a dotted name breaks the certificate of
 *  `<bucket>.s3.<region>.amazonaws.com`), no IP shape, none of S3's reserved prefixes or suffixes. */
export const BUCKET_NAME = /^(?!xn--|sthree-|amzn-s3-demo-)(?!.*(-s3alias|--ol-s3|--x-s3|--table-s3)$)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
/** A KMS key: its ARN, an alias ARN, an alias, a key id (uuid) or a multi-Region key id. */
export const KMS_KEY = /^(arn:aws:kms:([a-z]{2}-[a-z]+-[0-9]):[0-9]{12}:(key\/([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|mrk-[0-9a-f]{32})|alias\/[A-Za-z0-9/_-]{1,250})|alias\/[A-Za-z0-9/_-]{1,250}|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|mrk-[0-9a-f]{32})$/;
/** How many times a put that S3 answers "a conflicting write is in progress" (409) is asked again. */
const CONFLICT_TRIES = 4;

export type S3FilesOptions = {
  bucket: string;
  /** The KMS key every put is encrypted with (AG-9-18): a key id, alias or ARN. */
  kmsKeyId: string;
  region?: string;
  /** Unset: the task's role (the SDK's default provider chain); no key lives in a setting (PF-24). */
  credentials?: { accessKeyId: Secret; secretAccessKey: Secret };
  /** Recorded answers (tests, lanes): the SDK's request handler. */
  requestHandler?: S3ClientConfig["requestHandler"];
};

const statusOf = (e: unknown): number | null => (e as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode ?? null;
/** The error callers see: the operation, S3's error name and status; never the SDK's own message. */
class S3FilesError extends Error {
  constructor(op: string, e: unknown) {
    super(`files: S3 ${op} failed (${e instanceof Error && /^[A-Za-z0-9]{1,60}$/.test(e.name) ? e.name : "error"}${statusOf(e) ? ` ${statusOf(e)}` : ""})`);
    this.name = "S3FilesError";
  }
}
/** An error of the adapter's own (no S3 answer behind it), named so the caller's message says which. */
const named = (name: string) => Object.assign(new Error(name), { name });
/** The exact type, as object metadata (base64url: ASCII, nothing lost); S3 allows 2 KB of metadata in all. */
const typeOf = (contentType: string): string => {
  const t = Buffer.from(contentType, "utf8").toString("base64url");
  if (t.length > 1024) throw new Error("files: a content type is at most 768 bytes");
  return t;
};
/** The Content-Type header S3 serves: the type itself when a header can carry it unchanged, else a neutral one. */
const headerTypeOf = (contentType: string): string => /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(contentType) ? contentType : "application/octet-stream";
/** The object key: the firm's prefix, then the key. The only place a key is built; both parts are checked here. */
export const objectKey = (firmId: string, key: string): string => `${FirmId.parse(firmId).toLowerCase()}/${FileKey.parse(key)}`;

export class S3Files implements FilesPort {
  readonly region: string;
  readonly bucket: string;
  private readonly kmsKeyId: string;
  private readonly client: S3Client;

  constructor(o: S3FilesOptions) {
    if (!BUCKET_NAME.test(o.bucket ?? "")) throw new Error("files: S3 needs a bucket name");
    const kms = KMS_KEY.exec(o.kmsKeyId ?? "");
    if (!kms) throw new Error("files: S3 needs the KMS key every put is encrypted with");
    this.region = o.region ?? DEFAULT_FILES_REGION;
    if (!CANADA_REGIONS.includes(this.region)) throw new Error("files: S3 stays in Canada (P-559): ca-central-1 or ca-west-1");
    if (kms[2] && kms[2] !== this.region) throw new Error("files: the KMS key must be in the bucket's region");
    this.bucket = o.bucket; this.kmsKeyId = o.kmsKeyId;
    this.client = new S3Client({
      region: this.region,
      ...(o.credentials ? { credentials: async () => ({ accessKeyId: o.credentials!.accessKeyId.reveal(), secretAccessKey: o.credentials!.secretAccessKey.reveal() }) } : {}),
      requestHandler: o.requestHandler ?? { requestTimeout: S3_TIMEOUT_MS, connectionTimeout: 5_000 },
    });
  }

  /** The one place a PutObject is sent: it always carries the encryption header and a condition. */
  private async send(op: string, objKey: string, body: Uint8Array, contentType: string, metadata: Record<string, string>, condition: { IfNoneMatch: "*" } | { IfMatch: string }): Promise<"stored" | "taken" | "absent"> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.client.send(new PutObjectCommand({
          Bucket: this.bucket, Key: objKey, Body: body, ContentLength: body.byteLength, ContentType: contentType, Metadata: metadata,
          ServerSideEncryption: "aws:kms", SSEKMSKeyId: this.kmsKeyId, ...condition,
        }));
        return "stored";
      } catch (e) {
        const status = statusOf(e);
        if (status === 412) return "taken";
        // Only a tombstone's If-Match put may find the key gone (NoSuchKey); any other 404 is a missing bucket: an error,
        // never "absent" (break r2-m1).
        if (status === 404 && "IfMatch" in condition && (e as Error).name === "NoSuchKey") return "absent";
        if (status === 409 && attempt < CONFLICT_TRIES) { await new Promise((r) => setTimeout(r, 50 * attempt)); continue; }
        throw new S3FilesError(op, e);
      }
    }
  }

  private async head(op: string, objKey: string): Promise<HeadObjectCommandOutput | null> {
    try { return await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objKey })); }
    catch (e) { if (statusOf(e) === 404) return null; throw new S3FilesError(op, e); }
  }

  async put(firmId: string, key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; sha256: string }> {
    const f = FilePut.parse({ firmId, key, bytes, contentType });
    // The port keeps the type exactly as put (a retry compares it, get gives it back). An HTTP header carries printable
    // ASCII only and loses spaces at its ends (break m3, r2-m2), so the exact type is kept in the object's metadata,
    // base64url; the Content-Type header S3 serves is a safe copy of it (or application/octet-stream).
    const type = typeOf(f.contentType);
    const body = new Uint8Array(f.bytes), sha256 = await sha256Hex(body), objKey = objectKey(f.firmId, f.key);
    for (let attempt = 1; ; attempt++) {
      if (await this.send("put", objKey, body, headerTypeOf(f.contentType), { sha256, type }, { IfNoneMatch: "*" }) === "stored") return { key: f.key, sha256 };
      const had = await this.head("put", objKey);
      if (had) {
        // The key is taken: a tombstone (PF-Fd), other bytes or another type are refused; the same bytes and type are a retry.
        if (had.Metadata?.retired !== undefined || had.Metadata?.sha256 !== sha256 || had.Metadata?.type !== type) throw new FileKeyTaken(f.key);
        return { key: f.key, sha256 };
      }
      // Taken a moment ago and absent now (only someone working on the bucket itself removes an object): ask once more.
      if (attempt >= 2) throw new S3FilesError("put", named("KeyUnsettled"));
    }
  }

  async get(firmId: string, key: string): Promise<StoredFile | null> {
    const objKey = objectKey(firmId, key);
    let bytes: Uint8Array, contentType: string | undefined, meta: Record<string, string> | undefined;
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objKey }));
      if (r.Metadata?.retired !== undefined) { (r.Body as { destroy?: () => void } | undefined)?.destroy?.(); return null; }
      bytes = r.Body ? new Uint8Array(await r.Body.transformToByteArray()) : new Uint8Array();
      meta = r.Metadata; contentType = meta?.type ? Buffer.from(meta.type, "base64url").toString("utf8") : undefined;
    } catch (e) { if (statusOf(e) === 404 && (e as Error).name === "NoSuchKey") return null; throw new S3FilesError("get", e); }   // a missing bucket is an error, never "no such file" (break m6)
    // An object without our sha256, or whose bytes no longer match it, was not written by this adapter: never served.
    if (!contentType || !meta?.sha256 || meta.sha256 !== await sha256Hex(bytes)) throw new S3FilesError("get", named("IntegrityMismatch"));
    return { key: FileKey.parse(key), bytes, contentType, sha256: meta.sha256 };
  }

  /** PF-F1b (EntitledFiles): the key was ever written for the firm, live or retired (a tombstone is an object too). */
  async known(firmId: string, key: string): Promise<boolean> { return !!await this.head("known", objectKey(firmId, key)); }

  async exists(firmId: string, key: string): Promise<boolean> {
    const h = await this.head("exists", objectKey(firmId, key));
    return !!h && h.Metadata?.retired === undefined;
  }

  async delete(firmId: string, key: string): Promise<{ deleted: boolean }> {
    const objKey = objectKey(firmId, key);
    const h = await this.head("delete", objKey);
    if (!h || h.Metadata?.retired !== undefined || !h.ETag) return { deleted: false };
    // The tombstone replaces exactly the object read above: when another delete (or anything else) got there first, this
    // one changed nothing and answers deleted false.
    const wrote = await this.send("delete", objKey, new Uint8Array(), h.ContentType ?? "application/octet-stream", { retired: "true", sha256: h.Metadata?.sha256 ?? "", type: h.Metadata?.type ?? "" }, { IfMatch: h.ETag });
    return { deleted: wrote === "stored" };
  }

  async usedBytes(firmId: string): Promise<number> {
    const prefix = `${FirmId.parse(firmId).toLowerCase()}/`;
    let total = 0, next: string | undefined;
    do {
      let page;
      try { page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: next })); }
      catch (e) { throw new S3FilesError("usedBytes", e); }
      for (const o of page.Contents ?? []) if (o.Key?.startsWith(prefix)) total += o.Size ?? 0;
      next = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !next) throw new S3FilesError("usedBytes", named("ListWithoutToken"));
    } while (next);
    return total;
  }

  /** A signed GET address for the firm's key, valid for `seconds` from `nowMs`. Only S3FileLinks calls it, after its
   *  checks: whoever holds the address can read the file until it ends. */
  async signedGetUrl(firmId: string, key: string, nowMs: number, seconds: number): Promise<string> {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > S3_LINK_SECONDS) throw new Error("files: a signed address lasts 1 second to 5 minutes");
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: objectKey(firmId, key),
      // A link always downloads, never renders on the bucket's host (break m1; the local route's `attachment`).
      ResponseContentDisposition: "attachment", ResponseCacheControl: "no-store",
    }), { expiresIn: seconds, signingDate: new Date(nowMs) });
  }
}

export type OpenedLink = { status: 200; url: string; expiresAt: string } | { status: 404 };

/**
 * AG-9-16: short-lived download links for one firm and one person. A link is a token naming the firm, the person, the
 * key and when it ends (Sample: 5 minutes after it was made), signed with HMAC-SHA256 under the server's link key.
 * `open` answers 404 and nothing else for a token that is altered or malformed, another firm's, another person's, past
 * its end, or whose file is absent or deleted (404 leaks nothing); otherwise the signed S3 address, which ends at the
 * same moment as the link. (front-office/files.ts FileLinks is the local adapter's link; its check does not answer the
 * end time, which the S3 address needs.)
 */
export class S3FileLinks {
  /** Held as the PF-24 Secret, revealed only inside `mac`: a dump of this object never shows the key (PF-F1b break m3). */
  constructor(private readonly files: Pick<S3Files, "exists" | "signedGetUrl">, private readonly linkKey: Secret, private readonly now: () => number) {
    if (Buffer.byteLength(linkKey.reveal(), "utf8") < 32) throw new Error("files: the link key needs at least 32 characters");
  }

  /** A token for the firm's key, for the person who asked for it. */
  sign(firmId: string, personId: string, key: string): { token: string; expiresAt: string } {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(personId ?? "")) throw new Error("files: a link needs the id of the person it is for");
    const exp = Math.floor(this.now() / 1000) + S3_LINK_SECONDS;
    const body = Buffer.from(JSON.stringify({ f: FirmId.parse(firmId).toLowerCase(), p: personId.toLowerCase(), k: FileKey.parse(key), e: exp })).toString("base64url");
    return { token: `${body}.${this.mac(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async open(token: string, firmId: string, personId: string): Promise<OpenedLink> {
    const m = /^([A-Za-z0-9_-]{1,800})\.([A-Za-z0-9_-]{43})$/.exec(typeof token === "string" ? token : "");
    if (!m || typeof firmId !== "string" || typeof personId !== "string") return { status: 404 };
    const want = Buffer.from(this.mac(m[1]!)), got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { status: 404 };
    let p: { f?: unknown; p?: unknown; k?: unknown; e?: unknown };
    try { p = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")); } catch { return { status: 404 }; }
    if (typeof p.f !== "string" || typeof p.p !== "string" || typeof p.k !== "string" || typeof p.e !== "number") return { status: 404 };
    if (p.f !== firmId.toLowerCase() || p.p !== personId.toLowerCase()) return { status: 404 };
    const nowMs = this.now();
    if (!Number.isFinite(nowMs)) return { status: 404 };
    const left = p.e - Math.floor(nowMs / 1000);
    if (left < 1 || left > S3_LINK_SECONDS) return { status: 404 };
    if (!await this.files.exists(p.f, p.k)) return { status: 404 };
    return { status: 200, url: await this.files.signedGetUrl(p.f, p.k, nowMs, left), expiresAt: new Date(p.e * 1000).toISOString() };
  }

  private mac(body: string) { return createHmac("sha256", Buffer.from(this.linkKey.reveal(), "utf8")).update(`pf-s3-file-link:${body}`).digest("base64url"); }
}
