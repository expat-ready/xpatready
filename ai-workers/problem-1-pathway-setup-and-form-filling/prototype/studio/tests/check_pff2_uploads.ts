// PF-F2 part 1 (R1.64; map row 64; AG-9-1, AG-9-3, AG-9-4; SA-8-58): the tus upload rail. Named tests, a pass and a fail
// each, one per "Done when" line: DW1 a transfer cut mid-file resumes from the server's offset and the sha256 matches;
// DW2 a repeated chunk is stored once; DW3 finished bytes that contradict the door's kinds are refused, nothing stored;
// DW4 another firm's or person's upload id → 404; DW5 an expired upload cannot be finished; DW6 a held person's expired
// upload is kept (the real LegalHoldPort); DW7 a declared size over the limit is refused at creation, nothing staged;
// DW9 the migration, right after itself (rows rev 16.7). Plus DW0: a staged upload is never served (GET 404, no FilesPort
// file and no plat_file row until the last byte), and plat_file is walled per firm. DW8 (the browser cut) is part 2.
// A scratch database, a Nest app of PF-4's guard, the walls and the feature, as xr_app (the API's role), files and the
// staging folder in a scratch folder, the clock injected. No network, US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pff2_uploads.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261125120000_platform-files__pff2_plat_file";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pff2_${process.pid}`, EMPTY = `xr_studio_pff2_empty_${process.pid}`, WORK = join(STUDIO, "var", `pff2-check-${process.pid}`);
const urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`;
const psqlFile = (d: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(d), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (d: string, q: string) => execFileSync(join(BIN, "psql"), [urlOf(d), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const sql = (q: string) => sqlOn(DB, q);
for (const d of [DB, EMPTY]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { appDatabaseUrl, WalledPool, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { LegalHolds } = await import("../api/src/platform/register/holds/service.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { UploadDoors, UploadDoorTaken } = await import("../api/src/platform/files/uploads/doors.ts");
const { UploadRail, UPLOAD_CLEANUP_QUEUE, UPLOAD_EXPIRY_MS, EXPIRED_WORDS } = await import("../api/src/platform/files/uploads/rail.ts");
const feature = (await import("../api/src/features/platform-files.ts")).default;

// ---------------------------------------------------------------------------------------------- fixtures (built here)
const enc = (s: string) => new TextEncoder().encode(s);
/** A plain PDF of about n bytes (PF-F4 reads its header and trailer; the body is a comment). */
const pdfOf = (n: number) => { const head = enc("%PDF-1.4\n%"), tail = enc("\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"); const pad = new Uint8Array(Math.max(0, n - head.length - tail.length)).fill(0x41); const o = new Uint8Array(head.length + pad.length + tail.length); o.set(head); o.set(pad, head.length); o.set(tail, head.length + pad.length); return o; };
const PNG = new Uint8Array(readFileSync(join(STUDIO, "tests", "fixtures", "file-types", "sample.png")));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const b64 = (s: string) => Buffer.from(s).toString("base64");
const MB = 1024 * 1024;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 4, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pff2-check-signing-key-0123456789abcdef", () => clock.now());
const jobCalls: string[] = [];
const jobsSpy = { handle: async (n: string) => { jobCalls.push(`handle:${n}`); }, recurring: async (n: string, cron: string, zone: string) => { jobCalls.push(`recurring:${n}:${cron}:${zone}`); } };
const files = new LocalFiles(join(WORK, "files"));
let app: { close(): Promise<void> } | null = null;
try {
  process.env.PLATFORM_UPLOADS_DIR = join(WORK, "staging");
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: LocalFiles, useValue: files }, { provide: PlatformJobs, useValue: jobsSpy },
      (await import("../api/src/platform/register/holds/adapter.ts")).PgLegalHolds, ...feature.providers] as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); nest.use(requestMiddleware()); await nest.listen(0, "127.0.0.1"); app = nest;   // an INestApplication has close(); no cast, so the type check keeps app's type in finally (TS2339 on never)
  const port = (nest.getHttpServer().address() as { port: number }).port, base = `http://127.0.0.1:${port}`;
  await seedSampleFirms(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const signIn = async (actorId: string, firmKey = "sample-firm") => (await (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) })).json()).token as string;
  const tOwner = await signIn("user-R"), tManager = await signIn("user-T"), tB = await signIn("user-S", "sample-solo");

  // The test door: PDF and PNG; the target is the person in the metadata (a uuid), else 404.
  const doors = nest.get(UploadDoors), rail = nest.get(UploadRail);
  const completed: string[] = [];
  const P_FAILS = randomUUID();   // the test door's onComplete throws for this person (break F3)
  doors.register("STAFF", {
    allowedKinds: ["pdf", "png"],
    authorize: async (_ctx, meta) => (meta.personId && /^[0-9a-f-]{36}$/.test(meta.personId) ? { personId: meta.personId } : null),
    keyOf: (t, id) => `uploads/${t.personId}/${id}`,
    onComplete: async (_tx, f) => { if (f.target.personId === P_FAILS) throw new Error("door internals: /home/secret/path tx failed"); completed.push(f.id); },
  });
  ok("setup: the feature registers the route, the registry and the rail; the hourly cleanup is on PF-14's runner (UTC)",
    feature.controllers.length === 1 && jobCalls.includes(`handle:${UPLOAD_CLEANUP_QUEUE}`) && jobCalls.includes(`recurring:${UPLOAD_CLEANUP_QUEUE}:17 * * * *:UTC`), jobCalls);
  let taken = false; try { doors.register("STAFF", { allowedKinds: ["pdf"], authorize: async () => null, keyOf: () => "x" }); } catch (e) { taken = e instanceof UploadDoorTaken; }
  ok("setup fail: a door registers once (a second registration is refused)", taken);

  type R = { status: number; headers: Headers; text: string };
  const tus = async (token: string, method: string, path: string, headers: Record<string, string> = {}, body?: Uint8Array): Promise<R> => {
    const r = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, "tus-resumable": "1.0.0", ...headers }, ...(body ? { body: Buffer.from(body) } : {}) });
    return { status: r.status, headers: r.headers, text: await r.text() };
  };
  const meta = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} ${b64(v)}`).join(",");
  const P1 = randomUUID(), P2 = randomUUID();
  const create = (token: string, size: number, m: Record<string, string> = {}) => tus(token, "POST", "/api/platform/files/uploads", { "upload-length": String(size), "upload-metadata": meta({ door: "STAFF", personId: P1, filename: "passport.pdf", filetype: "application/pdf", ...m }) });
  const idOf = (r: R) => (r.headers.get("location") ?? "").split("/").pop() ?? "";
  const patch = (token: string, id: string, offset: number, chunk: Uint8Array) => tus(token, "PATCH", `/api/platform/files/uploads/${id}`, { "upload-offset": String(offset), "content-type": "application/offset+octet-stream" }, chunk);
  const head = (token: string, id: string) => tus(token, "HEAD", `/api/platform/files/uploads/${id}`);
  const fileRows = () => Number(sql(`select count(*) from plat_file`));
  const isStaged = (id: string) => existsSync(join(WORK, "staging", id)) || existsSync(join(WORK, "staging", `${id}.json`));

  // ------------------------------------------------------------------------------------ DW1: a cut transfer resumes
  const doc = pdfOf(3 * MB + 12345);
  const c1 = await create(tOwner, doc.length), id1 = idOf(c1);
  ok("PF-F2 DW1 setup: the upload opens (201) with a server-made 32-hex id", c1.status === 201 && /^[0-9a-f]{32}$/.test(id1), c1);
  // Send the first 2 MB on a raw socket and cut it after 1 MB has gone out: the connection drops mid-chunk.
  await new Promise<void>((done) => {
    const req = request({ host: "127.0.0.1", port, method: "PATCH", path: `/api/platform/files/uploads/${id1}`, headers: { authorization: `Bearer ${tOwner}`, "tus-resumable": "1.0.0", "upload-offset": "0", "content-type": "application/offset+octet-stream", "content-length": String(2 * MB) } });
    req.on("error", () => done()); req.on("response", () => done());
    req.write(Buffer.from(doc.subarray(0, MB)), () => setTimeout(() => { req.destroy(); setTimeout(done, 300); }, 300));
  });
  const h1 = await head(tOwner, id1), offset = Number(h1.headers.get("upload-offset"));
  ok("PF-F2 DW1 pass: after the cut, HEAD gives the server's offset: some bytes kept, fewer than the cut chunk, and no file stored yet",
    h1.status === 200 && offset > 0 && offset <= MB && fileRows() === 0, { status: h1.status, offset });
  const wrong = await patch(tOwner, id1, 0, doc.subarray(0, 1000));
  ok("PF-F2 DW1 fail: resuming from 0 instead of the server's offset answers 409 and changes nothing", wrong.status === 409 && Number((await head(tOwner, id1)).headers.get("upload-offset")) === offset, wrong.status);
  const rest = await patch(tOwner, id1, offset, doc.subarray(offset));
  const row1 = sql(`select sha256 || '|' || size_bytes || '|' || scan_state || '|' || media_type || '|' || door from plat_file where id = '${rest.headers.get("upload-file-id")}'`);
  const stored1 = await files.get(A, `uploads/${P1}/${id1}`);
  ok("PF-F2 DW1 pass: resumed from the server's offset, the file completes (204), is stored and its sha256 matches the original; plat_file says SCANNING",
    rest.status === 204 && row1 === `${sha(doc)}|${doc.length}|SCANNING|application/pdf|STAFF` && stored1?.sha256 === sha(doc) && stored1.bytes.length === doc.length, { status: rest.status, text: rest.text, row1 });
  ok("PF-F2 DW1 pass: the door's onComplete ran once", completed.length === 1 && completed[0] === rest.headers.get("upload-file-id"), completed);
  // Review M3, M2: after a lost answer the client asks HEAD and retries; the upload reads complete and the retry gets the same file.
  const after = await head(tOwner, id1), retry = await patch(tOwner, id1, doc.length, new Uint8Array(0));
  ok("PF-F2 DW1 pass (review M3): after finish, HEAD answers 200 with the offset at the full size (complete), so a client never sends the file again",
    after.status === 200 && after.headers.get("upload-offset") === String(doc.length) && after.headers.get("upload-length") === String(doc.length), after.status);
  ok("PF-F2 DW1 fail (review M2): a retry (an empty PATCH at the end) answers 204 with the same Upload-File-Id; no second plat_file row, no second onComplete",
    retry.status === 204 && retry.headers.get("upload-file-id") === rest.headers.get("upload-file-id") && sql(`select count(*) from plat_file where key = 'uploads/${P1}/${id1}'`) === "1" && completed.length === 1, { status: retry.status, text: retry.text, completed });
  const g1 = await tus(tOwner, "GET", `/api/platform/files/uploads/${id1}`);
  ok("PF-F2 DW0 fail: GET of a finished upload (its staged copy is kept until the cleanup, not yet scanned) is 404 and serves no byte", g1.status === 404 && !g1.text.includes("%PDF"), g1.status);

  // Break F2: tus's creation-with-upload (all bytes in the POST) finishes in one request and answers with the file's id.
  const one = pdfOf(3000);
  const c1b = await tus(tOwner, "POST", "/api/platform/files/uploads", { "upload-length": String(one.length), "upload-metadata": meta({ door: "STAFF", personId: P1, filename: "one.pdf" }), "content-type": "application/offset+octet-stream" }, one);
  const oneId = c1b.headers.get("upload-file-id");
  ok("PF-F2 DW1 pass (break F2): an upload sent whole in its creation request answers 201 with its Upload-File-Id and is stored once",
    c1b.status === 201 && !!oneId && sql(`select sha256 from plat_file where id = '${oneId}'`) === sha(one) && completed.filter((x) => x === oneId).length === 1, { status: c1b.status, text: c1b.text });

  // ------------------------------------------------------------------------------------ DW2: a repeated chunk stored once
  const doc2 = pdfOf(200_000);
  const id2 = idOf(await create(tOwner, doc2.length));
  const first = await patch(tOwner, id2, 0, doc2.subarray(0, 100_000));
  const again = await patch(tOwner, id2, 0, doc2.subarray(0, 100_000));
  ok("PF-F2 DW2 fail: the same chunk sent again at offset 0 is refused (409); the offset stays at the chunk's end",
    first.status === 204 && again.status === 409 && (await head(tOwner, id2)).headers.get("upload-offset") === "100000", [first.status, again.status]);
  const last2 = await patch(tOwner, id2, 100_000, doc2.subarray(100_000));
  const s2 = await files.get(A, `uploads/${P1}/${id2}`);
  ok("PF-F2 DW2 pass: the finished file is exactly the original (size and sha256): the repeated chunk was stored once", last2.status === 204 && s2?.bytes.length === doc2.length && s2.sha256 === sha(doc2), last2);

  // Review M2: the last chunk and ten empty PATCHes at once: one finish, one row, no 500 (nothing internal in any answer).
  const doc2c = pdfOf(50_000), id2c = idOf(await create(tOwner, doc2c.length));
  await patch(tOwner, id2c, 0, doc2c.subarray(0, 40_000));
  const burst = await Promise.all([patch(tOwner, id2c, 40_000, doc2c.subarray(40_000)), ...Array.from({ length: 10 }, () => patch(tOwner, id2c, doc2c.length, new Uint8Array(0)))]);
  ok("PF-F2 DW2 fail (review M2): the last chunk with ten empty PATCHes racing it gives one plat_file row and one onComplete; every answer is 204 or 409, never 500",
    sql(`select count(*) from plat_file where key = 'uploads/${P1}/${id2c}'`) === "1" && burst.every((r) => r.status === 204 || r.status === 409) && !burst.some((r) => /prisma|invocation|\/home\//i.test(r.text)), burst.map((r) => `${r.status}:${r.text.slice(0, 60)}`));

  // ------------------------------------------------------------------------------------ DW3: the bytes decide
  const fake = enc("MZ\x90\x00 this is not a PDF at all ".repeat(50));
  const id3 = idOf(await create(tOwner, fake.length));
  const rows3 = fileRows(), r3 = await patch(tOwner, id3, 0, fake);
  ok("PF-F2 DW3 fail: bytes declared as a PDF that are no allowed kind are refused at the end (415, PF-F4's words); no plat_file row, no stored file, no staging copy",
    r3.status === 415 && /Nothing was stored\./.test(r3.text) && fileRows() === rows3 && !(await files.exists(A, `uploads/${P1}/${id3}`)) && !isStaged(id3), { status: r3.status, text: r3.text });
  const id3b = idOf(await create(tOwner, PNG.length, { filename: "scan.pdf", filetype: "application/pdf" }));
  const r3b = await patch(tOwner, id3b, 0, PNG);
  ok("PF-F2 DW3 pass: a PNG named scan.pdf is stored as image/png (an allowed kind; the bytes correct the claim)",
    r3b.status === 204 && sql(`select media_type from plat_file where id = '${r3b.headers.get("upload-file-id")}'`) === "image/png", r3b);

  // ------------------------------------------------------------------------------------ DW4: another firm's or person's id
  const id4 = idOf(await create(tOwner, 5000));
  const half = pdfOf(5000);
  await patch(tOwner, id4, 0, half.subarray(0, 2000));
  const otherFirm = [await head(tB, id4), await patch(tB, id4, 2000, half.subarray(2000))];
  const otherPerson = [await head(tManager, id4), await patch(tManager, id4, 2000, half.subarray(2000))];
  // Break F1: tus reads an id off the whole URL; firm B names its own upload in the path and firm A's in the query.
  const idB = idOf(await create(tB, 5000));
  const viaQuery = [await tus(tB, "HEAD", `/api/platform/files/uploads/${idB}?x=/${id4}`), await tus(tB, "HEAD", `/api/platform/files/uploads/${idB}?/${id4}`),
    await tus(tB, "PATCH", `/api/platform/files/uploads/${idB}?x=/${id4}`, { "upload-offset": "2000", "content-type": "application/offset+octet-stream" }, half.subarray(2000))];
  ok("PF-F2 DW4 fail (break F1): firm B naming firm A's upload in the query string after its own id gets 404 on HEAD and PATCH; firm A's offset and metadata stay its own",
    viaQuery.every((r) => r.status === 404 && !r.headers.get("upload-metadata")) && (await head(tOwner, id4)).headers.get("upload-offset") === "2000" && !(await files.exists(A, `uploads/${P1}/${id4}`)), viaQuery.map((r) => r.status));
  const madeUp = [await head(tOwner, "0".repeat(32)), await head(tOwner, "..%2F..%2Fetc%2Fpasswd"), await head(tOwner, id4.toUpperCase())];
  ok("PF-F2 DW4 fail: firm B's staff and another person of firm A get 404 on HEAD and PATCH; an unknown, malformed or path-like id is 404 too",
    [...otherFirm, ...otherPerson, ...madeUp].every((r) => r.status === 404) && (await head(tOwner, id4)).headers.get("upload-offset") === "2000", [...otherFirm, ...otherPerson, ...madeUp].map((r) => r.status));
  ok("PF-F2 DW4 pass: the uploader's own HEAD answers 200 with its offset", (await head(tOwner, id4)).status === 200);
  const noSession = await fetch(`${base}/api/platform/files/uploads/${id4}`, { method: "HEAD", headers: { "tus-resumable": "1.0.0" } });
  ok("PF-F2 DW4 fail: no session → 401", noSession.status === 401, noSession.status);

  // ------------------------------------------------------------------------------------ DW0: never served half-finished
  const g = await tus(tOwner, "GET", `/api/platform/files/uploads/${id4}`), del = await tus(tOwner, "DELETE", `/api/platform/files/uploads/${id4}`);
  ok("PF-F2 DW0 fail: GET of a half-finished upload is 404 (tus would stream the staged bytes) and DELETE is 404; the upload is still there",
    g.status === 404 && !g.text.includes("%PDF") && del.status === 404 && (await head(tOwner, id4)).status === 200, [g.status, del.status]);
  ok("PF-F2 DW0 pass: before its last byte no FilesPort file and no plat_file row name the upload; after it, both do",
    !(await files.exists(A, `uploads/${P1}/${id4}`)) && (await patch(tOwner, id4, 2000, half.subarray(2000))).status === 204 && (await files.exists(A, `uploads/${P1}/${id4}`)) && sql(`select count(*) from plat_file where key = 'uploads/${P1}/${id4}'`) === "1");
  const wallA = await withFirm(A, () => walled.platFile.count()), wallB = await withFirm(B, () => walled.platFile.count());
  ok("PF-F2 DW0 pass/fail (PF-12's wall): as xr_app, firm A reads its plat_file rows and firm B reads none", wallA === fileRows() && wallA > 0 && wallB === 0, { wallA, wallB });
  const forged = await create(tOwner, 5000, { xr_firm: B });
  ok("PF-F2 DW0 fail: a client sending xr_* metadata (xr_firm naming another firm) is refused (400), nothing staged", forged.status === 400 && !forged.headers.get("location"), forged);
  const noTarget = await create(tOwner, 5000, { personId: "not-a-person" }), otherDoor = await create(tOwner, 5000, { door: "CLIENT_LINK" });
  ok("PF-F2 DW0 fail: the door's authorize refusing, or a door the session may not use, answers 404", noTarget.status === 404 && otherDoor.status === 404, [noTarget.status, otherDoor.status]);

  // Break F3: a door failing after the bytes are in answers in plain words, never its internals; no plat_file row is kept.
  const docF = pdfOf(3000), idF = idOf(await create(tOwner, docF.length, { personId: P_FAILS })), rowsF = fileRows();
  const rF = await patch(tOwner, idF, 0, docF);
  ok("PF-F2 DW0 fail (break F3): a door's onComplete failing → 500 in plain words (no path, no internal message); the plat_file row rolls back",
    rF.status === 500 && /could not be finished/.test(rF.text) && !/home|secret|tx failed|Error/.test(rF.text) && fileRows() === rowsF, rF);

  // ------------------------------------------------------------------------------------ DW7: the declared size
  const before7 = readdirSync(join(WORK, "staging")).length;
  const big = await create(tOwner, 25 * MB + 1), bigPng = await create(tOwner, 10 * MB + 1, { filename: "x.png", filetype: "image/png" });
  ok("PF-F2 DW7 fail: a declared 25 MB + 1 byte PDF and a 10 MB + 1 byte PNG are refused at creation (413, PF-F4's words); nothing staged",
    big.status === 413 && /limit for documents is 25 MB/.test(big.text) && bigPng.status === 413 && readdirSync(join(WORK, "staging")).length === before7, [big.status, big.text, bigPng.status]);
  const atLimit = await create(tOwner, 25 * MB);
  ok("PF-F2 DW7 pass: exactly 25 MB opens (201)", atLimit.status === 201, atLimit.status);
  const deferred = await tus(tOwner, "POST", "/api/platform/files/uploads", { "upload-defer-length": "1", "upload-metadata": meta({ door: "STAFF", personId: P1 }) });
  ok("PF-F2 DW7 fail: an upload that will not say its size (Upload-Defer-Length) is refused", deferred.status === 400, deferred.status);

  // ------------------------------------------------------------------------------------ DW5: expiry
  const doc5 = pdfOf(4000);
  const id5 = idOf(await create(tOwner, doc5.length)), id5b = idOf(await create(tOwner, doc5.length));
  await patch(tOwner, id5, 0, doc5.subarray(0, 1000)); await patch(tOwner, id5b, 0, doc5.subarray(0, 1000));
  const t0 = clock.t;
  clock.t = t0 + UPLOAD_EXPIRY_MS - 60_000;
  const tLater = await signIn("user-R");   // the session from 24 hours ago has ended: the same person signs in again
  ok("PF-F2 DW5 pass: a minute before 24 hours the same person can still finish the upload", (await patch(tLater, id5b, 1000, doc5.subarray(1000))).status === 204);
  clock.t = t0 + UPLOAD_EXPIRY_MS + 60_000;
  const tLate = await signIn("user-R");
  const late = await patch(tLate, id5, 1000, doc5.subarray(1000));
  ok("PF-F2 DW5 fail: past 24 hours the upload cannot be finished (410, in words) and nothing is stored", late.status === 410 && late.text.trim() === EXPIRED_WORDS && !(await files.exists(A, `uploads/${P1}/${id5}`)), late);

  // ------------------------------------------------------------------------------------ DW6: the cleanup asks holds first
  const holdsSvc = new LegalHolds(walled, auditEvent);
  const t6 = clock.t, tNow = await signIn("user-R");   // the clock only moves forward (sign-in keeps the newest session)
  const id6 = idOf(await create(tNow, 4000, { personId: P2 }));
  await patch(tNow, id6, 0, pdfOf(4000).subarray(0, 500));
  await holdsSvc.placeAs("staff:5b1f3a8e-0000-4000-8000-0000000000a1", { firmId: A, scope: { kind: "PERSON", id: P2 }, reason: "Sample: court order on a person's records" });
  clock.t = t6 + UPLOAD_EXPIRY_MS + 120_000;
  const fresh = idOf(await create(await signIn("user-R"), 4000));
  const swept = await rail.sweep();
  const left = readdirSync(join(WORK, "staging")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, 32));
  ok("PF-F2 DW6 pass: the held person's expired upload is kept, and listed with its hold", left.includes(id6) && swept.kept.some((k) => k.uploadId === id6 && k.firmId === A.toLowerCase() && k.holdIds.length === 1), { swept, left });
  ok("PF-F2 DW6 fail: an expired upload of a person not held is removed (its record and its bytes)", !left.includes(id5) && !left.includes(id4) && swept.removed >= 1 && !existsSync(join(WORK, "staging", id5)), { swept, left });
  ok("PF-F2 DW6 pass: an upload not yet expired is never touched (neither removed nor listed)", left.includes(fresh) && !swept.kept.some((k) => k.uploadId === fresh), { fresh, left });

  // ------------------------------------------------------------------------------------ review M1: off on the deployment
  const offRail = new UploadRail({ db: walled, files, doors, holds: new (await import("../api/src/platform/register/holds/adapter.ts")).PgLegalHolds(), now: () => clock.t, dir: join(WORK, "off"), off: true });
  const offRes = { statusCode: 0, body: "", setHeader() {}, end(b: string) { this.body = b; } };
  await offRail.handle({ firmId: A, door: "STAFF", actorId: randomUUID() }, { method: "POST", url: "/api/platform/files/uploads", headers: {} } as never, offRes as never);
  const featureSrc = readFileSync(join(STUDIO, "api", "src", "features", "platform-files.ts"), "utf8");
  ok("PF-F2 review M1 fail: a rail switched off (the S3 deployment, two API tasks) answers 503 in words and stages nothing; the feature switches it off by PLATFORM_FILES=s3",
    offRes.statusCode === 503 && /not switched on here yet/.test(offRes.body) && (!existsSync(join(WORK, "off")) || readdirSync(join(WORK, "off")).length === 0) && /off: process\.env\.PLATFORM_FILES\?\.trim\(\) === "s3"/.test(featureSrc), offRes);

  // ------------------------------------------------------------------------------------ DW9: the migration, right after itself
  const NEW_AT = all.indexOf(NEW), before = all.filter((d) => d < NEW);
  ok(`PF-F2 DW9: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${before.at(-1)})`, NEW_AT >= 0 && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.length === NEW_AT);
  for (const d of before) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql"));
  const shape = sqlOn(EMPTY, `select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.relname = 'plat_file'`) + "|" + sqlOn(EMPTY, `select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'plat_file'`)
    + "|" + sqlOn(EMPTY, `select has_table_privilege('xr_data', 'plat_file', 'DELETE')`);
  ok("PF-F2 DW9 pass: right after its own migration the table is forced with one firm policy, and xr_data cannot delete", shape === "t|1|f", shape);
  let refused = "";
  try { sqlOn(EMPTY, `set role xr_data; select set_config('app.firm_id', '${A}', false); insert into plat_file (id, firm_id, key, door, sha256, size_bytes, media_type, scan_state) values (gen_random_uuid(), '${A}', 'a/b', 'STAFF', '${"0".repeat(64)}', 10, 'application/pdf', 'SCAN_PENDING')`); } catch (e) { refused = String((e as { stderr?: string }).stderr ?? e); }
  ok("PF-F2 DW9 fail: the database refuses a new row that does not start SCANNING (SCAN_PENDING passes every other check; review m1)", /a new file starts SCANNING/.test(refused), refused.slice(0, 300));
  ok("PF-F2 DW9: every function the migration creates carries the area prefix plat_file (rows rev 15.2)",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("plat_file")));
  for (const d of all.filter((x) => x > NEW)) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-F2 DW9 pass: prisma migrate diff between the fully migrated database and the schema is empty", diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await app?.close().catch(() => undefined);
  await walled.$disconnect().catch(() => undefined); await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  for (const d of [DB, EMPTY]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* the sweep */ } }
}
console.log(`\nPF-F2 part 1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
