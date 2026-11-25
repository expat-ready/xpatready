// AUD-2 part 2: the recorded fake S3 bucket with Object Lock, for tests. Like PF-F1's fake (tests/fixtures/pff1-s3/), it
// is the AWS SDK's own `requestHandler`: the real S3Client builds every request, this keeps it in `seen` and answers from
// memory in S3's shapes (its error document and list XML are PF-F1's fixture files), so nothing reaches the network and
// no AWS account is used (US$0). README.md here says what each answer is based on and what is not verified.
// It models one VERSIONED bucket with Object Lock enabled (Object Lock requires versioning; review M1):
//  * PutObject adds a new version (If-None-Match: * is refused with 412 only while the key's current version is an
//    object, not a delete marker, as S3 does); a put naming x-amz-object-lock-mode must carry a checksum (400);
//    COMPLIANCE with a retain-until date is kept on that version;
//  * GET and HEAD without a version id answer the current version, 404 when it is a delete marker (with
//    x-amz-delete-marker: true); with ?versionId= they answer that version;
//  * DELETE without a version id adds a delete marker (204), whatever the lock: it hides the object, never removes a
//    version; DELETE with a version id of a COMPLIANCE version before its date is refused (403), after it the version goes;
//  * ListObjectsV2 lists keys whose current version is an object; ListObjectVersions (?versions) lists every version and
//    delete marker under a prefix.
// `lockless: true` makes a bucket that ignores the lock headers (Object Lock not enabled), so the adapter's own check is
// tested.
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
type Version = { id: string; marker: boolean; bytes: Uint8Array; mode: string | null; until: Date | null; written: Date; meta: Record<string, string> };
export type SeenLockRequest = { method: string; key: string; query: Record<string, string>; headers: Record<string, string> };

async function bytesOf(body: unknown): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof Readable) { const p: Buffer[] = []; for await (const c of body) p.push(Buffer.from(c as Uint8Array)); return new Uint8Array(Buffer.concat(p)); }
  throw new Error("fake S3 lock: a body of a kind this fake does not read");
}
const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fakeLockedS3(o: { bucket: string; region: string; now: () => Date; lockless?: boolean; pageSize?: number }) {
  const keys = new Map<string, Version[]>(), seen: SeenLockRequest[] = [], host = `${o.bucket}.s3.${o.region}.amazonaws.com`;
  let versions = 0;
  const current = (k: string) => keys.get(k)?.at(-1) ?? null;
  const err = (name: string, key: string, head = false, extra: Record<string, string> = {}): Res => ({ statusCode: ERRORS[name]![0], headers: { "content-type": "application/xml", "x-amz-request-id": "AUD2RECORDED0001", ...extra },
    body: head ? undefined : Readable.from([Buffer.from(fill(ERROR_XML, { Code: name, Message: ERRORS[name]![1], Resource: `/${key}` }))]) });
  const lockHeaders = (v: Version): Record<string, string> => ({ "x-amz-version-id": v.id, ...(v.mode && v.until ? { "x-amz-object-lock-mode": v.mode, "x-amz-object-lock-retain-until-date": v.until.toISOString() } : {}) });

  async function answer(req: Req): Promise<Res> {
    const h = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
    const q = Object.fromEntries(Object.entries(req.query ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]));
    const key = decodeURIComponent(req.path.replace(/^\//, "")), body = await bytesOf(req.body);
    if (req.hostname !== host) throw new Error(`fake S3 lock: a request to ${req.hostname}, not ${host}`);
    seen.push({ method: req.method, key, query: q, headers: h });
    if (req.method === "GET" && "versions" in q) {
      const prefix = q.prefix ?? "", all = [...keys.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1));
      const items = all.flatMap(([k, vs]) => [...vs].reverse().map((v, i) => v.marker
        ? `<DeleteMarker><Key>${x(k)}</Key><VersionId>${v.id}</VersionId><IsLatest>${i === 0}</IsLatest><LastModified>${v.written.toISOString()}</LastModified></DeleteMarker>`
        : `<Version><Key>${x(k)}</Key><VersionId>${v.id}</VersionId><IsLatest>${i === 0}</IsLatest><LastModified>${v.written.toISOString()}</LastModified><ETag>"e"</ETag><Size>${v.bytes.byteLength}</Size><StorageClass>STANDARD</StorageClass></Version>`)).join("");
      const text = `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${o.bucket}</Name><Prefix>${x(prefix)}</Prefix><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${items}</ListVersionsResult>`;
      return { statusCode: 200, headers: { "content-type": "application/xml" }, body: Readable.from([Buffer.from(text)]) };
    }
    if (req.method === "GET" && q["list-type"] === "2") {
      const prefix = q.prefix ?? "", start = Number(q["continuation-token"] ?? "0"), max = o.pageSize ?? 1000;
      const live = [...keys.keys()].filter((k) => k.startsWith(prefix) && current(k) && !current(k)!.marker).sort(), page = live.slice(start, start + max), more = start + max < live.length;
      const contents = page.map((k) => fill(CONTENTS_XML, { Key: x(k), LastModified: current(k)!.written.toISOString(), ETag: "e", Size: current(k)!.bytes.byteLength })).join("");
      return { statusCode: 200, headers: { "content-type": "application/xml" }, body: Readable.from([Buffer.from(fill(LIST_XML, { Bucket: o.bucket, Prefix: x(prefix), KeyCount: page.length, MaxKeys: max, IsTruncated: String(more), NextContinuationToken: more ? `<NextContinuationToken>${start + max}</NextContinuationToken>` : "", Contents: contents }))]) };
    }
    if (req.method === "PUT") {
      const mode = h["x-amz-object-lock-mode"] ?? null, until = h["x-amz-object-lock-retain-until-date"] ? new Date(h["x-amz-object-lock-retain-until-date"]) : null;
      if (mode && !h["content-md5"] && !Object.keys(h).some((k) => k.startsWith("x-amz-checksum-") && k !== "x-amz-checksum-algorithm")) return err("InvalidRequest", key);
      if (h["x-amz-checksum-sha256"] !== undefined && h["x-amz-checksum-sha256"] !== createHash("sha256").update(body).digest("base64")) return err("BadDigest", key);
      const cur = current(key);
      if (h["if-none-match"] === "*" && cur && !cur.marker) return err("PreconditionFailed", key);
      const meta = Object.fromEntries(Object.entries(h).filter(([k]) => k.startsWith("x-amz-meta-")).map(([k, v]) => [k.slice(11), v]));
      const v: Version = { id: `v${++versions}`, marker: false, bytes: body, mode: o.lockless ? null : mode, until: o.lockless ? null : until, written: o.now(), meta };
      keys.set(key, [...(keys.get(key) ?? []), v]);
      return { statusCode: 200, headers: { etag: '"e"', "x-amz-version-id": v.id } };
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const head = req.method === "HEAD", v = q.versionId ? (keys.get(key) ?? []).find((y) => y.id === q.versionId) ?? null : current(key);
      if (!v || v.marker) return err("NoSuchKey", key, head, v?.marker ? { "x-amz-delete-marker": "true", "x-amz-version-id": v.id } : {});
      return { statusCode: 200, headers: { "content-type": "application/octet-stream", "content-length": String(v.bytes.byteLength), "last-modified": v.written.toUTCString(), etag: '"e"',
        ...Object.fromEntries(Object.entries(v.meta).map(([k, val]) => [`x-amz-meta-${k}`, val])), ...lockHeaders(v) }, body: head ? undefined : Readable.from([Buffer.from(v.bytes)]) };
    }
    if (req.method === "DELETE") {
      const vs = keys.get(key) ?? [];
      if (!q.versionId) {   // a versioned bucket: a delete marker, whatever the lock (it hides; it removes nothing)
        const m: Version = { id: `v${++versions}`, marker: true, bytes: new Uint8Array(), mode: null, until: null, written: o.now(), meta: {} };
        keys.set(key, [...vs, m]);
        return { statusCode: 204, headers: { "x-amz-delete-marker": "true", "x-amz-version-id": m.id } };
      }
      const v = vs.find((y) => y.id === q.versionId);
      if (!v) return { statusCode: 204, headers: {} };
      if (v.mode === "COMPLIANCE" && v.until && o.now().getTime() < v.until.getTime()) return err("AccessDenied", key);   // compliance mode: nobody removes a locked version early
      const left = vs.filter((y) => y !== v);
      if (left.length) keys.set(key, left); else keys.delete(key);
      return { statusCode: 204, headers: { "x-amz-version-id": v.id } };
    }
    throw new Error(`fake S3 lock: ${req.method} ${req.path} is not a call this fake answers`);
  }
  const raw = async (method: string, key: string, query: Record<string, string> = {}, headers: Record<string, string> = {}, body?: Uint8Array) =>
    (await answer({ method, hostname: host, path: `/${key}`, query, headers: { host, ...headers }, body })).statusCode;
  return {
    handler: { metadata: { handlerProtocol: "http/1.1" }, async handle(req: Req) { return { response: await answer(req) }; }, updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {} },
    seen,
    /** The first version of a key (what was written first), for a test to look underneath the adapter. */
    object: (key: string) => keys.get(key)?.find((v) => !v.marker) ?? null,
    versions: (key: string) => keys.get(key) ?? [],
    /** Requests sent straight to the bucket (no adapter), as anyone with the app's role could. */
    rawDelete: (key: string, versionId?: string) => raw("DELETE", key, versionId ? { versionId } : {}),
    rawPut: (key: string, bytes: Uint8Array) => raw("PUT", key, {}, { "x-amz-checksum-sha256": createHash("sha256").update(bytes).digest("base64") }, bytes),
  };
}
