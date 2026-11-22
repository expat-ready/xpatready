// PF-F1: the recorded fake S3 client for tests. It is the AWS SDK's own `requestHandler` (the same seam the SES adapter's
// test uses, check_pf19b2_ses.ts): the real S3Client builds each HTTP request (method, host, path, headers, body), this
// handler keeps it in `seen` and answers from memory in S3's response shapes, so nothing ever reaches the network and no
// AWS account is used (US$0). The answers' shapes (status codes, error codes, headers, XML) are in this folder's fixture
// files; README.md says where each was taken from and what is not verified.
// What it keeps of S3's behaviour, for one bucket: PutObject with If-None-Match: * (412 when the key is taken) and
// If-Match: <etag> (412 when it differs, 404 when absent); GetObject; HeadObject; ListObjectsV2 by prefix with pages;
// a bucket policy that refuses a put without KMS encryption under the configured key (PF-F1c's policy; 403); a
// presigned GET whose X-Amz-Date + X-Amz-Expires has passed on the injected clock is refused (403). It does NOT check
// request signatures.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

const HERE = import.meta.dirname;
const ERRORS = JSON.parse(readFileSync(join(HERE, "errors.json"), "utf8")) as Record<string, { status: number; code?: string; message: string }>;
const ERROR_XML = readFileSync(join(HERE, "error.xml"), "utf8"), LIST_XML = readFileSync(join(HERE, "list-objects-v2.xml"), "utf8").trim(), CONTENTS_XML = readFileSync(join(HERE, "list-objects-v2-contents.xml"), "utf8").trim();
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ""));
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type SeenRequest = { method: string; host: string; path: string; key: string; query: Record<string, string>; headers: Record<string, string>; bodyBytes: number };
type Stored = { bytes: Uint8Array; contentType: string; meta: Record<string, string>; etag: string; sse: string | null; kmsKeyId: string | null; lastModified: Date };
type HttpRequest = { method: string; hostname: string; path: string; query?: Record<string, string | string[] | null>; headers: Record<string, string>; body?: unknown };
type HttpResponse = { statusCode: number; headers: Record<string, string>; body?: Readable };
export type FakeS3Options = {
  bucket: string; region: string;
  /** The KMS key the bucket policy demands on every put; null = a bucket with no such policy. */
  requireKmsKeyId: string | null;
  now?: () => number;
  /** ListObjectsV2's page size (S3's is 1000), small so the adapter's paging is exercised. */
  pageSize?: number;
};

async function bytesOf(body: unknown): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof Readable) { const parts: Buffer[] = []; for await (const c of body) parts.push(Buffer.from(c as Uint8Array)); return new Uint8Array(Buffer.concat(parts)); }
  throw new Error("fake S3: a request body of a kind this fake does not read");
}

export function fakeS3(o: FakeS3Options) {
  const objects = new Map<string, Stored>(), seen: SeenRequest[] = [];
  /** An SSE-KMS object's ETag is not the MD5 of its bytes (break m5): each such put gets its own. */
  let kmsPuts = 0;
  const now = o.now ?? (() => Date.now()), pageSize = o.pageSize ?? 1000, host = `${o.bucket}.s3.${o.region}.amazonaws.com`;
  /** One-shot failures the test queues: the next request whose method matches is answered with this error instead. */
  const failNext: { method: string; error: keyof typeof ERRORS & string }[] = [];
  /** A hook run after a request is read and before it is answered (a writer that gets in between a check and a put). */
  let before: ((r: SeenRequest) => void | Promise<void>) | null = null;

  const error = (name: string, resource: string, head = false): HttpResponse => {
    const e = ERRORS[name]!, code = e.code ?? name;
    return { statusCode: e.status, headers: { "content-type": "application/xml", "x-amz-request-id": "PFF1RECORDED0001" }, body: head ? undefined : Readable.from([Buffer.from(fill(ERROR_XML, { Code: code, Message: e.message, Resource: xml(resource) }))]) };
  };
  const objectHeaders = (s: Stored): Record<string, string> => ({
    "content-type": s.contentType, "content-length": String(s.bytes.byteLength), etag: `"${s.etag}"`, "last-modified": s.lastModified.toUTCString(),
    ...(s.sse ? { "x-amz-server-side-encryption": s.sse, "x-amz-server-side-encryption-aws-kms-key-id": s.kmsKeyId ?? "" } : {}),
    ...Object.fromEntries(Object.entries(s.meta).map(([k, v]) => [`x-amz-meta-${k}`, v])),
  });

  async function answer(req: HttpRequest): Promise<HttpResponse> {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));   // header values lose spaces at their ends on the way
    const query = Object.fromEntries(Object.entries(req.query ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]));
    const key = decodeURIComponent(req.path.replace(/^\//, "")), body = await bytesOf(req.body);
    const rec: SeenRequest = { method: req.method, host: req.hostname, path: req.path, key, query, headers, bodyBytes: body.byteLength };
    seen.push(rec);
    if (req.hostname !== host) throw new Error(`fake S3: a request to ${req.hostname}, not to the bucket's own host ${host}`);
    await before?.(rec);
    const queued = failNext.findIndex((f) => f.method === req.method);
    if (queued >= 0) return error(failNext.splice(queued, 1)[0]!.error, `/${key}`, req.method === "HEAD");

    if (req.method === "GET" && query["list-type"] === "2") {
      const prefix = query.prefix ?? "", start = Number(query["continuation-token"] ?? "0"), max = Math.min(Number(query["max-keys"] ?? pageSize), pageSize);
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort(), page = keys.slice(start, start + max), more = start + max < keys.length;
      const contents = page.map((k) => { const s = objects.get(k)!; return fill(CONTENTS_XML, { Key: xml(k), LastModified: s.lastModified.toISOString(), ETag: s.etag, Size: s.bytes.byteLength }); }).join("");
      const text = fill(LIST_XML, { Bucket: o.bucket, Prefix: xml(prefix), KeyCount: page.length, MaxKeys: max, IsTruncated: String(more), NextContinuationToken: more ? `<NextContinuationToken>${start + max}</NextContinuationToken>` : "", Contents: contents });
      return { statusCode: 200, headers: { "content-type": "application/xml" }, body: Readable.from([Buffer.from(text)]) };
    }
    if (req.method === "PUT") {
      const sse = headers["x-amz-server-side-encryption"] ?? null, kmsKeyId = headers["x-amz-server-side-encryption-aws-kms-key-id"] ?? null;
      if (o.requireKmsKeyId !== null && (sse !== "aws:kms" || kmsKeyId !== o.requireKmsKeyId)) return error("AccessDenied", `/${key}`);
      const had = objects.get(key);
      if (headers["if-none-match"] === "*" && had) return error("PreconditionFailed", `/${key}`);
      if (headers["if-match"] !== undefined) {
        if (!had) return error("NoSuchKey", `/${key}`);
        if (headers["if-match"].replace(/"/g, "") !== had.etag) return error("PreconditionFailed", `/${key}`);
      }
      const want = headers["x-amz-checksum-sha256"];
      if (want !== undefined && want !== createHash("sha256").update(body).digest("base64")) return error("InternalError", `/${key}`);   // S3 answers 400 BadDigest; any refusal serves here
      const meta = Object.fromEntries(Object.entries(headers).filter(([k]) => k.startsWith("x-amz-meta-")).map(([k, v]) => [k.slice("x-amz-meta-".length), v]));
      const s: Stored = { bytes: body, contentType: headers["content-type"] ?? "binary/octet-stream", meta, etag: createHash("md5").update(body).update(sse === "aws:kms" ? `kms-${++kmsPuts}` : "").digest("hex"), sse, kmsKeyId, lastModified: new Date(now()) };
      objects.set(key, s);
      return { statusCode: 200, headers: { etag: `"${s.etag}"`, ...(sse ? { "x-amz-server-side-encryption": sse, "x-amz-server-side-encryption-aws-kms-key-id": kmsKeyId ?? "" } : {}) } };
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const head = req.method === "HEAD";
      if (query["X-Amz-Signature"] !== undefined) {   // a presigned link: refused once its time has passed
        const d = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(query["X-Amz-Date"] ?? ""), life = Number(query["X-Amz-Expires"]);
        if (!d || !Number.isFinite(life) || now() >= Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +d[4]!, +d[5]!, +d[6]!) + life * 1000) return error("ExpiredRequest", `/${key}`, head);
      }
      const s = objects.get(key);
      if (!s) return error("NoSuchKey", `/${key}`, head);
      const override = Object.fromEntries([["response-content-disposition", "content-disposition"], ["response-cache-control", "cache-control"]].filter(([q]) => query[q!] !== undefined).map(([q, h]) => [h!, query[q!]!]));
      return { statusCode: 200, headers: { ...objectHeaders(s), ...override }, body: head ? undefined : Readable.from([Buffer.from(s.bytes)]) };
    }
    throw new Error(`fake S3: ${req.method} ${req.path} is not a call this fake answers`);
  }

  return {
    /** The SDK's `requestHandler`. */
    handler: {
      metadata: { handlerProtocol: "http/1.1" },
      async handle(req: HttpRequest) { return { response: await answer(req) }; },
      updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {},
    },
    /** Every request the SDK sent, in order. */
    seen,
    /** The stored object under a full key (firm prefix included), for a test to look underneath the adapter. */
    object: (key: string) => objects.get(key) ?? null,
    keys: () => [...objects.keys()].sort(),
    failNext: (method: string, error: keyof typeof ERRORS & string) => { failNext.push({ method, error }); },
    before: (hook: ((r: SeenRequest) => void | Promise<void>) | null) => { before = hook; },
    /** A presigned URL fetched as a browser would (through the same answers; no network). */
    async fetchUrl(url: string): Promise<{ status: number; bytes: Uint8Array; headers: Record<string, string> }> {
      const u = new URL(url), r = await answer({ method: "GET", hostname: u.hostname, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: { host: u.hostname } });
      return { status: r.statusCode, bytes: r.statusCode === 200 ? await bytesOf(r.body) : new Uint8Array(), headers: r.headers };
    },
    /** Puts raw bytes under a full key without the adapter (another writer, or an unencrypted put). */
    async rawPut(key: string, bytes: Uint8Array, headers: Record<string, string>): Promise<number> {
      return (await answer({ method: "PUT", hostname: host, path: `/${key}`, headers: { host, ...headers }, body: bytes })).statusCode;
    },
  };
}
export type FakeS3 = ReturnType<typeof fakeS3>;
