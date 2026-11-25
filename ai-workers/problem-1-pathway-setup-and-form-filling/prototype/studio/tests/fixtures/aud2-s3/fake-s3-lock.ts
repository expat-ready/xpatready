// AUD-2 part 2: the recorded fake S3 bucket with Object Lock, for tests. Like PF-F1's fake (tests/fixtures/pff1-s3/), it
// is the AWS SDK's own `requestHandler`: the real S3Client builds every request, this keeps it in `seen` and answers from
// memory in S3's shapes (its error document and list XML are PF-F1's fixture files), so nothing reaches the network and
// no AWS account is used (US$0). README.md here says what each answer is based on and what is not verified.
// What it keeps, for one versioned bucket with Object Lock enabled: PutObject with If-None-Match: * (412 when the key is
// taken); a put naming x-amz-object-lock-mode must carry a checksum (400 InvalidRequest otherwise, as S3 asks of every
// Object Lock put); COMPLIANCE mode with a retain-until date in the future is stored and answered on GET and HEAD
// (x-amz-object-lock-mode, x-amz-object-lock-retain-until-date, x-amz-version-id); a DELETE of a locked version before
// its date is refused (403 AccessDenied), after it the version goes; ListObjectsV2 by prefix with pages. `lockless: true`
// makes a bucket that ignores the lock headers (Object Lock not enabled), so the adapter's own check is tested.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

const PFF1 = join(import.meta.dirname, "..", "pff1-s3");
const ERROR_XML = readFileSync(join(PFF1, "error.xml"), "utf8"), LIST_XML = readFileSync(join(PFF1, "list-objects-v2.xml"), "utf8").trim(), CONTENTS_XML = readFileSync(join(PFF1, "list-objects-v2-contents.xml"), "utf8").trim();
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ""));
const ERRORS: Record<string, [number, string]> = { PreconditionFailed: [412, "At least one of the pre-conditions you specified did not hold"], NoSuchKey: [404, "The specified key does not exist."],
  AccessDenied: [403, "Access Denied"], InvalidRequest: [400, "Content-MD5 OR x-amz-checksum- HTTP header is required for Put Object requests with Object Lock parameters"], BadDigest: [400, "The SHA256 you specified did not match the calculated checksum."] };

type Req = { method: string; hostname: string; path: string; query?: Record<string, string | string[] | null>; headers: Record<string, string>; body?: unknown };
type Res = { statusCode: number; headers: Record<string, string>; body?: Readable };
type Stored = { bytes: Uint8Array; version: string; mode: string | null; until: Date | null; written: Date; meta: Record<string, string> };
export type SeenLockRequest = { method: string; key: string; headers: Record<string, string> };

async function bytesOf(body: unknown): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof Readable) { const p: Buffer[] = []; for await (const c of body) p.push(Buffer.from(c as Uint8Array)); return new Uint8Array(Buffer.concat(p)); }
  throw new Error("fake S3 lock: a body of a kind this fake does not read");
}

export function fakeLockedS3(o: { bucket: string; region: string; now: () => Date; lockless?: boolean; pageSize?: number }) {
  const objects = new Map<string, Stored>(), seen: SeenLockRequest[] = [], host = `${o.bucket}.s3.${o.region}.amazonaws.com`;
  let versions = 0;
  const err = (name: string, key: string, head = false): Res => ({ statusCode: ERRORS[name]![0], headers: { "content-type": "application/xml", "x-amz-request-id": "AUD2RECORDED0001" },
    body: head ? undefined : Readable.from([Buffer.from(fill(ERROR_XML, { Code: name, Message: ERRORS[name]![1], Resource: `/${key}`, RequestId: "AUD2RECORDED0001", HostId: "aud2" }))]) });
  const lockHeaders = (s: Stored): Record<string, string> => ({ "x-amz-version-id": s.version, ...(s.mode && s.until ? { "x-amz-object-lock-mode": s.mode, "x-amz-object-lock-retain-until-date": s.until.toISOString() } : {}) });

  async function answer(req: Req): Promise<Res> {
    const h = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
    const q = Object.fromEntries(Object.entries(req.query ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]));
    const key = decodeURIComponent(req.path.replace(/^\//, "")), body = await bytesOf(req.body);
    if (req.hostname !== host) throw new Error(`fake S3 lock: a request to ${req.hostname}, not ${host}`);
    seen.push({ method: req.method, key, headers: h });
    if (req.method === "GET" && q["list-type"] === "2") {
      const prefix = q.prefix ?? "", start = Number(q["continuation-token"] ?? "0"), max = o.pageSize ?? 1000;
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort(), page = keys.slice(start, start + max), more = start + max < keys.length;
      const contents = page.map((k) => fill(CONTENTS_XML, { Key: k, LastModified: objects.get(k)!.written.toISOString(), ETag: "e", Size: objects.get(k)!.bytes.byteLength })).join("");
      return { statusCode: 200, headers: { "content-type": "application/xml" }, body: Readable.from([Buffer.from(fill(LIST_XML, { Bucket: o.bucket, Prefix: prefix, KeyCount: page.length, MaxKeys: max, IsTruncated: String(more), NextContinuationToken: more ? `<NextContinuationToken>${start + max}</NextContinuationToken>` : "", Contents: contents }))]) };
    }
    if (req.method === "PUT") {
      const mode = h["x-amz-object-lock-mode"] ?? null, until = h["x-amz-object-lock-retain-until-date"] ? new Date(h["x-amz-object-lock-retain-until-date"]) : null;
      if (mode && !h["content-md5"] && !Object.keys(h).some((k) => k.startsWith("x-amz-checksum-") && k !== "x-amz-checksum-algorithm")) return err("InvalidRequest", key);
      if (h["x-amz-checksum-sha256"] !== undefined && h["x-amz-checksum-sha256"] !== createHash("sha256").update(body).digest("base64")) return err("BadDigest", key);
      if (h["if-none-match"] === "*" && objects.has(key)) return err("PreconditionFailed", key);
      const meta = Object.fromEntries(Object.entries(h).filter(([k]) => k.startsWith("x-amz-meta-")).map(([k, v]) => [k.slice(11), v]));
      const s: Stored = { bytes: body, version: `v${++versions}`, mode: o.lockless ? null : mode, until: o.lockless ? null : until, written: o.now(), meta };
      objects.set(key, s);
      return { statusCode: 200, headers: { etag: '"e"', "x-amz-version-id": s.version } };
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const s = objects.get(key), head = req.method === "HEAD";
      if (!s) return err("NoSuchKey", key, head);
      return { statusCode: 200, headers: { "content-type": "application/octet-stream", "content-length": String(s.bytes.byteLength), "last-modified": s.written.toUTCString(), etag: '"e"',
        ...Object.fromEntries(Object.entries(s.meta).map(([k, v]) => [`x-amz-meta-${k}`, v])), ...lockHeaders(s) }, body: head ? undefined : Readable.from([Buffer.from(s.bytes)]) };
    }
    if (req.method === "DELETE") {
      const s = objects.get(key);
      if (!s) return { statusCode: 204, headers: {} };
      if (s.mode === "COMPLIANCE" && s.until && o.now().getTime() < s.until.getTime()) return err("AccessDenied", key);   // compliance mode: nobody deletes a locked version early
      objects.delete(key);
      return { statusCode: 204, headers: { "x-amz-version-id": s.version } };
    }
    throw new Error(`fake S3 lock: ${req.method} ${req.path} is not a call this fake answers`);
  }
  return {
    handler: { metadata: { handlerProtocol: "http/1.1" }, async handle(req: Req) { return { response: await answer(req) }; }, updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {} },
    seen,
    object: (key: string) => objects.get(key) ?? null,
    /** A DELETE sent straight to the bucket (no adapter check), as an attacker with the app's role could. */
    rawDelete: async (key: string) => (await answer({ method: "DELETE", hostname: host, path: `/${key}`, headers: { host } })).statusCode,
  };
}
