// J-65 (map row 65, R1.65: private storage in Canada: firm-prefixed keys, versions, encryption): the join-and-walk for the
// row, written by the qa lane (22 Nov) BEFORE its parts merge, so qa only runs it when they do. Parts (MVP-CHECKLIST row
// 65): PF-F1 (the FilesPort on S3 in ca-central-1, on a recorded fake client; open PR #2955) and PF-F1c (the bucket:
// versioning, the KMS key, the policy; waits on the founder's AWS account). The walk also needs the S3 adapter bound into
// the running app: #2955 binds it nowhere ("Not bound in any feature yet", its MODULE row; its review's m1), and no
// backlog row names that binding (noted in the qa report).
// Done when (CAPABILITIES R1.65): "Files stored in ca-central-1 under the firm's prefix, versioned and encrypted; another
// firm's key refused".
//   W1 (files stored): a firm's staff member attaches a PDF to a support ticket through the API; the database keeps the
//       file's key and the same bytes come back through the signed link (the app's own file route, PF-18b).
//   W2 (another firm's key refused, by the app): firm B's Owner asks for firm A's file through the link and through
//       the ticket: 404 both, nothing leaked.
//   W3 (in ca-central-1, under the firm's prefix, encrypted, by the app): the copy is restarted with PLATFORM_FILES=s3
//       (#2955's setting) and the SDK's standard endpoint setting AWS_ENDPOINT_URL_S3 pointing at this journey's own fake
//       S3 (in memory, on 127.0.0.1; no AWS call, US$0); a new attachment must reach the fake as one PUT signed for
//       ca-central-1, under `<firm id>/<key>`, with SSE-KMS under the configured key, and leave no copy on the server's
//       own disk; it downloads; firm B is refused again.
//   W4 (the adapter itself, PF-F1 #2955's recorded fake client): S3Files puts under `<firm id>/<key>` on the bucket's
//       ca-central-1 host with SSE-KMS; firm B's get of the same key is absent; the bucket policy refuses an unencrypted
//       put; the settings refuse a region outside Canada.
//   W5 (versioned, on the real bucket): PF-F1c's recorded answers from AWS Step 20 (tests/fixtures/pff1c/, byte copies of
//       branch aws/2026-11-22-staging-proof bcc9a6665's r165/ folder; no AWS call here): the files' sha256 match that
//       folder's SHA256SUMS; the bucket the app task writes to (its PLATFORM_FILES_BUCKET) has versioning Enabled, is in
//       ca-central-1, and its default encryption is aws:kms under the task's PLATFORM_FILES_KMS_KEY_ID, with the policy
//       refusing puts without aws:kms.
// Fails on main today (P-606) only on the steps whose parts are not merged; each failing label names the part.
// Sample data only (firms sample-firm and sample-solo, a run tag in every ticket); US$0, no model call, no AWS call,
// no live mail. Run from prototype/:
//   zsh studio/tools/isolated.sh j65 4465 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j65 4465 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_65.ts j65 4465
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Secret } from "../../api/src/platform/config/secret.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j65", Number(process.argv[3] ?? 4465)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const VAR = join(STUDIO, "var", `isolated-${NAME}`), FILES_DIR = join(VAR, "front-office-files");
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; raw: Buffer; headers: Headers };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}${path.startsWith("/api/") ? path : `/api${path}`}`, { method, redirect: "manual", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = Buffer.from(await r.arrayBuffer()); let b: unknown = null; try { b = JSON.parse(raw.toString("utf8")); } catch { /* bytes */ }
  return { status: r.status, body: b, raw, headers: r.headers };
};
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% Sample support attachment ${tag}\n%%EOF\n`);
const raise = async (t: string, words: string, bytes: Buffer): Promise<Ans> => {
  const f = new FormData(); f.append("body", words); f.append("page", "/help");
  f.append("files", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `sample-${run}.pdf`);
  const r = await fetch(`${BASE}/api/platform/support/tickets`, { method: "POST", headers: { authorization: `Bearer ${t}` }, body: f });
  const raw = Buffer.from(await r.arrayBuffer()); let b: unknown = null; try { b = JSON.parse(raw.toString("utf8")); } catch { /* text */ }
  return { status: r.status, body: b, raw, headers: r.headers };
};
const signIn = async (firmKey: string, email: string): Promise<string> => {
  for (let i = 0; i < 20; i++) {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true }).catch(() => null);
    if (r?.body?.token) return r.body.token as string;
    await new Promise((res) => setTimeout(res, 500));
  }
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local)`); process.exit(2);
};
/** The link the app gives for the ticket's file n, then the download through it (the bytes, or a redirect to them). */
const download = async (t: string, ticket: string, n = 1) => {
  const link = await api(t, "POST", `/platform/support/tickets/${ticket}/files/${n}/link`);
  const url = String(link.body?.url ?? "");
  const got = url ? await api(t, "GET", url) : null;
  return { link, url, got };
};
const onDisk = (firm: string, key: string) => existsSync(join(FILES_DIR, firm.toLowerCase(), key));

// ---------------------------------------------------------------- the journey's own fake S3 (W3), in memory, on 127.0.0.1
// It answers the few calls a FilesPort makes (PUT with If-None-Match / If-Match, GET, HEAD, ListObjectsV2) in S3's shapes
// and records each request; it checks no signature. Path style (/<bucket>/<key>, as the SDK sends to an IP endpoint) or
// virtual-host style (<bucket>.<host>) are both read.
type Seen = { method: string; bucket: string; key: string; headers: Record<string, string>; bytes: number };
const S3_PORT = PORT + 1000, BUCKET = `xr-j65-sample-${run}`.slice(0, 63), KMS = `arn:aws:kms:ca-central-1:000000000000:key/${randomUUID()}`;
/** XML text escape for every value the fake echoes back (the request's bucket, prefix and keys; CodeQL js/reflected-xss). */
const xml = (v: string) => v.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const objects = new Map<string, { bytes: Buffer; headers: Record<string, string>; etag: string }>(), seen: Seen[] = [];
const fakeS3 = createServer((req: IncomingMessage, res: ServerResponse) => {
  const parts: Buffer[] = []; req.on("data", (c: Buffer) => parts.push(c));
  req.on("end", () => {
    const u = new URL(req.url ?? "/", "http://fake"), host = String(req.headers.host ?? "");
    let bucket = host.split(".").length > 1 && !/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host) ? host.split(".")[0] : "", path = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!bucket) { bucket = path.split("/")[0]; path = path.split("/").slice(1).join("/"); }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    const body = Buffer.concat(parts);
    seen.push({ method: req.method ?? "", bucket, key: path, headers, bytes: body.length });
    const xmlErr = (status: number, code: string) => { res.writeHead(status, { "content-type": "application/xml" }); res.end(req.method === "HEAD" ? undefined : `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message><RequestId>J65FAKE</RequestId></Error>`); };
    if (req.method === "GET" && u.searchParams.get("list-type") === "2") {
      const prefix = u.searchParams.get("prefix") ?? "", keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${xml(bucket)}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${keys.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${xml(k)}</Key><Size>${objects.get(k)!.bytes.length}</Size><ETag>"${objects.get(k)!.etag}"</ETag></Contents>`).join("")}</ListBucketResult>`);
      return;
    }
    const had = objects.get(path);
    if (req.method === "PUT") {
      if (headers["if-none-match"] === "*" && had) return xmlErr(412, "PreconditionFailed");
      if (headers["if-match"] !== undefined && (!had || headers["if-match"].replace(/"/g, "") !== had.etag)) return xmlErr(had ? 412 : 404, had ? "PreconditionFailed" : "NoSuchKey");
      const etag = createHash("md5").update(body).update(randomUUID()).digest("hex");
      const keep = Object.fromEntries(Object.entries(headers).filter(([k]) => k.startsWith("x-amz-meta-") || k === "content-type" || k.startsWith("x-amz-server-side-encryption")));
      objects.set(path, { bytes: body, headers: keep, etag });
      res.writeHead(200, { etag: `"${etag}"`, ...Object.fromEntries(Object.entries(keep).filter(([k]) => k.startsWith("x-amz-server-side-encryption"))) }); res.end(); return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (!had) return xmlErr(404, "NoSuchKey");
      res.writeHead(200, { ...had.headers, "content-length": String(had.bytes.length), etag: `"${had.etag}"`, "last-modified": new Date().toUTCString() });
      res.end(req.method === "HEAD" ? undefined : had.bytes); return;
    }
    xmlErr(405, "MethodNotAllowed");
  });
});

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const emailA = staff("user-R"), emailB = staff("user-S");
  let TA = await signIn("sample-firm", emailA), TB = await signIn("sample-solo", emailB);
  ok("J-65 setup: both Sample firms, firm A's Owner and firm B's Owner signed in on this copy (local identity)", !!A && !!B && A !== B && !!TA && !!TB);

  // ------------------------------------------------------------------------------------------- W1: files stored
  const bytes1 = pdf(`w1-${run}`);
  const t1 = await raise(TA, `J-65 W1 ${run}: the letter is attached (Sample).`, bytes1);
  const T1: string = t1.body?.id ?? "";
  const key1 = `support/${T1.toLowerCase()}/1`;
  const d1 = T1 ? await download(TA, T1) : null;
  ok("R1.65 W1: firm A's staff member attaches a PDF through the API (201); the database keeps its key support/<ticket>/1 and the same bytes come back through the signed link",
    t1.status === 201 && !!T1 && sql(`select file_keys::text from platform_support_message where ticket_id = '${T1}'`) === `{${key1}}`
    && d1?.link.status === 200 && d1.got?.status === 200 && d1.got.raw.equals(bytes1), { status: t1.status, link: d1?.link.status, dl: d1?.got?.status });

  // ------------------------------------------------------------------------- W2: another firm's key refused (app)
  const bByLink = d1?.url ? await api(TB, "GET", d1.url) : null, bLink = T1 ? await api(TB, "POST", `/platform/support/tickets/${T1}/files/1/link`) : null, bTicket = T1 ? await api(TB, "GET", `/platform/support/tickets/${T1}`) : null;
  ok("R1.65 W2 fail: firm B's Owner is refused firm A's file through A's own link and through the ticket (404 each; the answer carries none of the bytes)",
    !!d1?.url && bByLink?.status === 404 && bLink?.status === 404 && bTicket?.status === 404 && !bByLink.raw.includes(bytes1), { byLink: bByLink?.status, link: bLink?.status, ticket: bTicket?.status });

  // ------------------------------------------------------------- W3: in ca-central-1, firm prefix, encrypted (app)
  await new Promise<void>((res, rej) => { fakeS3.once("error", rej); fakeS3.listen(S3_PORT, "127.0.0.1", () => res()); });
  let restarted = false;
  try {
    execFileSync("zsh", [join(STUDIO, "tools", "isolated.sh"), NAME, String(PORT), "restart", "--ttl", "30", "PLATFORM_IDENTITY=local", "PLATFORM_FILES=s3", `PLATFORM_FILES_BUCKET=${BUCKET}`,
      `PLATFORM_FILES_KMS_KEY_ID=${KMS}`, `PLATFORM_FILES_LINK_KEY=${randomUUID()}${randomUUID()}`, `AWS_ENDPOINT_URL_S3=http://127.0.0.1:${S3_PORT}`, "AWS_ACCESS_KEY_ID=test", "AWS_SECRET_ACCESS_KEY=test"],
      { cwd: join(STUDIO, ".."), stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 240_000 });
    restarted = true;
  } catch (e) { console.log(`  note: the restart with PLATFORM_FILES=s3 failed: ${String((e as { stdout?: string; stderr?: string }).stdout ?? "").split("\n").slice(-4).join(" ")} ${String((e as { stderr?: string }).stderr ?? e).split("\n").slice(-3).join(" ")}`); }
  if (restarted) { TA = await signIn("sample-firm", emailA); TB = await signIn("sample-solo", emailB); }
  const bytes3 = pdf(`w3-${run}`);
  const t3 = restarted ? await raise(TA, `J-65 W3 ${run}: stored on S3 in Canada (Sample).`, bytes3) : null;
  const T3: string = t3?.body?.id ?? "", key3 = `support/${T3.toLowerCase()}/1`, objKey3 = `${A.toLowerCase()}/${key3}`;
  const puts3 = seen.filter((s) => s.method === "PUT" && s.key === objKey3);
  const auth3 = puts3[0]?.headers.authorization ?? "";
  ok("R1.65 W3 (PF-F1 #2955 and the S3 adapter's binding into the running app, PF-F1b #3041): on the copy restarted with PLATFORM_FILES=s3, an attachment reaches S3 as one PUT signed for ca-central-1 into the configured bucket",
    restarted && t3?.status === 201 && puts3.length >= 1 && puts3[0].bucket === BUCKET && /\/ca-central-1\/s3\/aws4_request/.test(auth3),
    { restarted, status: t3?.status, putsSeen: seen.filter((s) => s.method === "PUT").length, scope: /Credential=[^,]*/.exec(auth3)?.[0]?.replace(/Credential=[^/]*/, "Credential=…") ?? null });
  ok("R1.65 W3 (PF-F1 #2955, its binding PF-F1b #3041): the object's key is the firm's prefix then the file's key (<firm A id>/support/<ticket>/1), and the database keeps only the file's key",
    puts3.length >= 1 && objects.has(objKey3) && !!T3 && sql(`select file_keys::text from platform_support_message where ticket_id = '${T3}'`) === `{${key3}}`, { want: objKey3, keys: [...objects.keys()].slice(0, 4) });
  ok("R1.65 W3 (PF-F1 #2955, its binding PF-F1b #3041): the PUT asks for server-side encryption with the configured KMS key (aws:kms), and the server keeps no copy on its own disk",
    puts3.length >= 1 && puts3.every((p) => p.headers["x-amz-server-side-encryption"] === "aws:kms" && p.headers["x-amz-server-side-encryption-aws-kms-key-id"] === KMS) && !!T3 && !onDisk(A, key3),
    { sse: puts3[0]?.headers["x-amz-server-side-encryption"] ?? null, kmsKey: puts3[0]?.headers["x-amz-server-side-encryption-aws-kms-key-id"] === KMS, onLocalDisk: T3 ? onDisk(A, key3) : null });
  const d3 = T3 ? await download(TA, T3) : null;
  const viaS3 = d3?.got && (d3.got.raw.equals(bytes3) || (d3.got.status >= 300 && d3.got.status < 400 && /X-Amz-Credential=[^&]*ca-central-1/.test(decodeURIComponent(d3.got.headers.get("location") ?? ""))));
  ok("R1.65 W3 (PF-F1 #2955, its binding PF-F1b #3041): the S3-stored file downloads through the app's link (its bytes, or a redirect signed for ca-central-1)",
    puts3.length >= 1 && d3?.link.status === 200 && !!viaS3, { link: d3?.link.status, dl: d3?.got?.status });
  const b3 = d3?.url ? await api(TB, "GET", d3.url) : null, b3l = T3 ? await api(TB, "POST", `/platform/support/tickets/${T3}/files/1/link`) : null;
  ok(`R1.65 W3 fail: on the copy restarted with PLATFORM_FILES=s3 firm B is refused firm A's new file through the link and the ticket (404 each, none of the bytes)${puts3.length ? "" : " (vacuous for S3 today: the file went to the local folder, the binding is missing)"}`,
    !!d3?.url && b3?.status === 404 && b3l?.status === 404 && !b3.raw.includes(bytes3), { byLink: b3?.status, link: b3l?.status, s3Put: puts3.length });

  // ------------------------------------------------------------------------ W4: the adapter (PF-F1, #2955) itself
  type S3Mod = { S3Files: new (o: Record<string, unknown>) => { put(f: string, k: string, b: Uint8Array, t: string): Promise<unknown>; get(f: string, k: string): Promise<unknown>; exists(f: string, k: string): Promise<boolean> }; DEFAULT_FILES_REGION: string };
  type ChooseMod = { s3SettingsOf(env: Record<string, string | undefined>): { region: string } };
  type FakeMod = { fakeS3(o: Record<string, unknown>): { handler: unknown; seen: { method: string; host: string; key: string; headers: Record<string, string> }[]; object(k: string): { sse: string | null; kmsKeyId: string | null } | null; rawPut(k: string, b: Uint8Array, h: Record<string, string>): Promise<number> } };
  const load = async <T>(p: string): Promise<T | null> => { try { return await import(p) as T; } catch (e) { console.log(`  note: ${p.split("/").slice(-2).join("/")} not loadable: ${String(e).split("\n")[0].slice(0, 160)}`); return null; } };
  const s3m = await load<S3Mod>("../../api/src/platform/files/s3-files.ts"), chm = await load<ChooseMod>("../../api/src/platform/files/choose.ts"), fkm = await load<FakeMod>("../fixtures/pff1-s3/fake-s3.ts");
  const KEY4 = `j65/${run}/letter.pdf`, bytes4 = pdf(`w4-${run}`);
  let w4: { put: boolean; host: string; key: string; sse: string | null; kms: boolean; otherFirm: unknown; otherExists: boolean | null; unencrypted: number } | null = null;
  if (s3m && fkm) {
    try {
      const bucket = `pff1-j65-${run}`.slice(0, 63), kms = `arn:aws:kms:ca-central-1:000000000000:key/${randomUUID()}`;
      const fake = fkm.fakeS3({ bucket, region: "ca-central-1", requireKmsKeyId: kms });
      const files = new s3m.S3Files({ bucket, kmsKeyId: kms, requestHandler: fake.handler,
        // fake keys (never a real one): with none the SDK would look for the task role on the network
        credentials: { accessKeyId: new Secret("J65_FAKE_KEY_ID", "test"), secretAccessKey: new Secret("J65_FAKE_SECRET", "test") } });
      await files.put(A, KEY4, new Uint8Array(bytes4), "application/pdf");
      const put = fake.seen.find((s) => s.method === "PUT");
      const stored = fake.object(`${A.toLowerCase()}/${KEY4}`);
      w4 = { put: !!put, host: put?.host ?? "", key: put?.key ?? "", sse: stored?.sse ?? null, kms: stored?.kmsKeyId === kms,
        otherFirm: await files.get(B, KEY4), otherExists: await files.exists(B, KEY4),
        unencrypted: await fake.rawPut(`${A.toLowerCase()}/j65/${run}/plain.pdf`, new Uint8Array(bytes4), { "content-type": "application/pdf" }) };
    } catch (e) { console.log(`  note: the adapter walk stopped: ${String(e).split("\n")[0]}`); }
  }
  ok("R1.65 W4 (PF-F1, #2955): S3Files puts a firm's file on the bucket's ca-central-1 host (the default region) under <firm id>/<key>",
    !!w4?.put && w4.host.endsWith(".s3.ca-central-1.amazonaws.com") && w4.key === `${A.toLowerCase()}/${KEY4}` && s3m?.DEFAULT_FILES_REGION === "ca-central-1", w4 ? { host: w4.host, key: w4.key } : "adapter not on this tree");
  ok("R1.65 W4 (PF-F1, #2955): the stored object is encrypted with SSE-KMS under the configured key; the bucket's policy refuses an unencrypted put (403)",
    w4?.sse === "aws:kms" && w4.kms && w4.unencrypted === 403, w4 ? { sse: w4.sse, kms: w4.kms, unencrypted: w4.unencrypted } : "adapter not on this tree");
  ok("R1.65 W4 fail (PF-F1, #2955): firm B asking for the same key gets nothing (get null, exists false): another firm's key reads as absent",
    !!w4?.put && w4.otherFirm === null && w4.otherExists === false, w4 ? { otherFirm: w4.otherFirm === null ? null : "bytes", otherExists: w4.otherExists } : "adapter not on this tree");
  const refusesUs = (() => { try { chm?.s3SettingsOf({ PLATFORM_FILES_BUCKET: "pff1-j65-sample", PLATFORM_FILES_KMS_KEY_ID: "alias/j65-sample", PLATFORM_FILES_REGION: "us-east-1" }); return false; } catch (e) { return /Canada/.test(String(e)); } })();
  const unsetIsCanada = (() => { try { return chm?.s3SettingsOf({ PLATFORM_FILES_BUCKET: "pff1-j65-sample", PLATFORM_FILES_KMS_KEY_ID: "alias/j65-sample" }).region === "ca-central-1"; } catch { return false; } })();
  ok("R1.65 W4 fail (PF-F1, #2955): the settings refuse a bucket region outside Canada (us-east-1) in words, and an unset region is ca-central-1",
    !!chm && refusesUs && unsetIsCanada, { loaded: !!chm, refusesUs, unsetIsCanada });

  // ----------------------------------------------------------------------------------------------- W5: versioned
  // No AWS call here (US$0): PF-F1c's recorded answers of the real staging bucket, AWS Step 20 (24 Nov 2026), copied byte
  // for byte from branch aws/2026-11-22-staging-proof bcc9a6665, product/reports/aws-evidence/2026-11-24/r165/ (README).
  const FIX = join(STUDIO, "tests", "fixtures", "pff1c");
  const read = (f: string) => { try { return readFileSync(join(FIX, f), "utf8"); } catch { return ""; } };
  const STEP20: Record<string, string> = {   // bcc9a6665's r165/SHA256SUMS lines for the two files W5 reads
    "07-r165-read.txt": "91693f22d5de79be91348117f6fb5a76d4695a7ddc7685ea3f973685cf3f04ae",
    "11-xfirm-2.txt": "d6db80052afe88e57fc5157104d4bd31b0e8ecab29ac056506658529348ed4c8",
  };
  const sums = read("SHA256SUMS");
  const intact = Object.entries(STEP20).every(([f, h]) => {
    const bytes = (() => { try { return readFileSync(join(FIX, f)); } catch { return null; } })();
    return !!bytes && createHash("sha256").update(bytes).digest("hex") === h && sums.includes(`${h}  ${f}`);
  });
  const task = read("11-xfirm-2.txt");
  const env = (n: string) => (task.match(new RegExp(`'name': '${n}', 'value': '([^']+)'`)) ?? [])[1] ?? "";
  const bucket = env("PLATFORM_FILES_BUCKET"), taskKey = env("PLATFORM_FILES_KMS_KEY_ID");
  const block = (() => { const all = read("07-r165-read.txt"); const at = bucket ? all.indexOf(`== ${bucket}\n`) : -1; if (at < 0) return ""; const next = all.indexOf("\n== ", at + 3); return all.slice(at, next < 0 ? undefined : next); })();
  const field = (n: string) => (block.match(new RegExp(`^${n}: (.*)$`, "m")) ?? [])[1] ?? "";
  const [sseAlg, sseKey, bucketKey] = field("encryption").split("\t");
  const w5 = { intact, s3: env("PLATFORM_FILES") === "s3", bucket: bucket || null, region: field("region"), versioning: field("versioning"), sse: sseAlg ?? "", keyIsTasks: !!taskKey && sseKey === taskKey, bucketKey: bucketKey === "True",
    denyNotKms: field("policy").includes("('Deny', 's3:PutObject', {'StringNotEquals': {'s3:x-amz-server-side-encryption': 'aws:kms'}})"),
    denyNoHeader: field("policy").includes("('Deny', 's3:PutObject', {'Null': {'s3:x-amz-server-side-encryption': 'true'}})") };
  ok("R1.65 W5 (PF-F1c, the real staging bucket: AWS Step 20's recorded answers in tests/fixtures/pff1c/, from aws/2026-11-22-staging-proof bcc9a6665): the files match Step 20's sha256; the bucket the app task writes to (PLATFORM_FILES=s3, its PLATFORM_FILES_BUCKET) has versioning Enabled, is in ca-central-1, and its default encryption is aws:kms under the task's PLATFORM_FILES_KMS_KEY_ID, the policy refusing puts without aws:kms",
    w5.intact && w5.s3 && !!w5.bucket && w5.region === "ca-central-1" && w5.versioning === "Enabled" && w5.sse === "aws:kms" && w5.keyIsTasks && w5.denyNotKms && w5.denyNoHeader, w5);
} finally {
  await db.$disconnect();
  fakeS3.close();
}
process.exit(summary() ? 1 : 0);
