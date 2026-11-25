// PF-F2 part 2 (R1.64; map row 64; AG-9-1, AG-9-3, AG-9-4): the browser client resumes after a dropped connection.
// Named tests, a pass and a fail each: DW8 a browser cuts the network mid-upload and the file completes (from the server's
// offset, not from the start; the stored sha256 is the original's), on a desktop and on a phone (AG-9-4 the same path);
// (and a third run with no retries left: the client waits for the browser's "online" and resumes); DW8b while the network is cut the page says "Upload paused: reconnecting", has no file and nothing is stored, then
// "Resumed, N%"; DW8c a refusal (bytes no allowed kind) is final: PF-F4's words, one try, nothing stored; DW8d the words.
// A scratch database, a Nest app of PF-4's guard, the walls and PF-F2's feature with a test STAFF door, as xr_app; a test
// page served by the same app (same origin) runs web/src/lib/resumable-upload.ts bundled by esbuild; Chromium (Playwright)
// slows the upload and cuts the network through its own emulation. No network beyond localhost, US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pff2_resume_browser.ts
import "reflect-metadata";
import { HttpException, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, devices, type Browser, type BrowserContext } from "playwright";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pff2b_${process.pid}`, WORK = join(STUDIO, "var", `pff2b-check-${process.pid}`);
const urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
process.env.PLATFORM_UPLOADS_DIR = join(WORK, "staging");
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "PLATFORM_FILES"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
const { UploadDoors } = await import("../api/src/platform/files/uploads/doors.ts");
const { UploadRail } = await import("../api/src/platform/files/uploads/rail.ts");
const { uploadWords } = await import("../web/src/lib/resumable-upload.ts");
const feature = (await import("../api/src/features/platform-files.ts")).default;

/** A plain PDF of about n bytes (PF-F4 reads its header and trailer). */
const pdfOf = (n: number) => Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(n - 60, 0x41), Buffer.from("\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")]);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const MB = 1024 * 1024;

// The test page's script: the client library, bundled for the browser as the web app's Vite build takes it (browser entry).
const bundle = (await build({ stdin: { contents: `import { resumableUpload } from "./lib/resumable-upload.ts";
  const w = window as any; w.states = [];
  const settle = (p: Promise<string>) => p.then((id) => { w.result = id; }, (e) => { w.failed = String(e.message); });
  w.startUpload = (token: string, o: { retryDelays?: number[]; stallMs?: number } = {}) => {
    const file = (document.getElementById("f") as HTMLInputElement).files![0];
    w.result = undefined; w.failed = undefined; w.states = []; w.token = token;
    w.handle = resumableUpload(file, { door: "STAFF", meta: { personId: w.personId }, token: () => w.token, chunkSize: 256 * 1024, ...o,
      onState: (s) => { w.states.push(s); document.getElementById("words")!.textContent = s.words; } });
    settle(w.handle.done);
  };
  w.retryUpload = () => { w.result = undefined; w.failed = undefined; settle(w.handle.retry()); };`, resolveDir: join(STUDIO, "web", "src"), loader: "ts" }, bundle: true, format: "iife", platform: "browser", write: false, logLevel: "silent" })).outputFiles[0].text;
const PAGE = `<!doctype html><meta charset="utf-8"><title>PF-F2 upload</title><input type="file" id="f"><p id="words" role="status"></p><script src="/pff2-test/app.js"></script>`;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new PlatformClock();
const local = new LocalIdentity("pff2b-check-signing-key-0123456789abcdef", () => clock.now());
const files = new LocalFiles(join(WORK, "files"));
let app: { close(): Promise<void> } | null = null, browser: Browser | null = null;
try {
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: LocalFiles, useValue: files }, { provide: PlatformJobs, useValue: { handle: async () => undefined, recurring: async () => undefined } },
      PgLegalHolds, ...feature.providers] as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  nest.use(requestMiddleware());
  nest.use("/pff2-test", (req: { url: string }, res: { setHeader(k: string, v: string): void; end(b: string): void }) => { res.setHeader("content-type", req.url.startsWith("/app.js") ? "text/javascript" : "text/html"); res.end(req.url.startsWith("/app.js") ? bundle : PAGE); });
  await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const signIn = async () => (await (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token as string;
  const P = randomUUID(), P_FAIL_ONCE = randomUUID(), P_REFUSE = randomUUID(), P_ALWAYS = randomUUID(), P_WRITEFAIL = randomUUID(), people = new Set([P, P_FAIL_ONCE, P_REFUSE, P_ALWAYS, P_WRITEFAIL]);
  let failedOnce = false, storeBack = false;
  nest.get(UploadDoors).register("STAFF", { allowedKinds: ["pdf"], authorize: async (_c, m) => (m.personId && people.has(m.personId) ? { personId: m.personId } : null), keyOf: (t, id) => `uploads/${t.personId}/${id}`,
    onComplete: async (_tx, f) => {
      if (f.target.personId === P_FAIL_ONCE && !failedOnce) { failedOnce = true; throw new Error("the door's store is down for a moment"); }
      if (f.target.personId === P_ALWAYS && !storeBack) throw new Error("the door's store stays down");
      if (f.target.personId === P_REFUSE) throw new HttpException({ title: "Not stored", status: 409, detail: "Your plan's storage is full. Nothing was stored." }, 409);
    } });

  ok("PF-F2 DW8d: the words are CS-D2's: paused, resumed with its percent; plain progress; a failure in the server's words",
    uploadWords("paused", 40) === "Upload paused: reconnecting" && uploadWords("resumed", 62) === "Resumed, 62%" && uploadWords("uploading", 7) === "7%" && uploadWords("failed", 3, "This file is empty. Nothing was stored.") === "This file is empty. Nothing was stored.");

  browser = await chromium.launch({ ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
  const doc = pdfOf(5 * MB);
  // The third run spends every retry while offline (none at all): the client must wait for "online" and resume itself.
  for (const [label, ctxOpts, retries] of [["desktop 1440 px", { viewport: { width: 1440, height: 900 } }, undefined], ["phone (Pixel 7)", devices["Pixel 7"], undefined],
    ["desktop, every retry delay spent while offline", { viewport: { width: 1440, height: 900 } }, [0, 200]]] as const) {
    const ctx: BrowserContext = await browser.newContext(ctxOpts as never);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    // Slow uploads to 1 MB/s so the cut lands mid-file (Chromium's own throttling).
    const net = (offline: boolean) => cdp.send("Network.emulateNetworkConditions", { offline, latency: 20, downloadThroughput: -1, uploadThroughput: MB });
    await net(false);
    const seen: { m: string; offset: string | null; status?: number; respOffset?: string | null }[] = [];
    page.on("requestfinished", async (r) => { if (!r.url().includes("/api/platform/files/uploads")) return; const res = await r.response(); seen.push({ m: r.method(), offset: r.headers()["upload-offset"] ?? null, status: res?.status(), respOffset: res?.headers()["upload-offset"] ?? null }); });
    let inFlightCut = 0; page.on("requestfailed", (r) => { if (r.method() === "PATCH" && r.url().includes("/api/platform/files/uploads")) inFlightCut++; });
    await page.goto(`${base}/pff2-test/`);
    await page.evaluate((p) => { (window as any).personId = p; }, P);
    await page.setInputFiles("#f", { name: "passport.pdf", mimeType: "application/pdf", buffer: doc });
    await page.evaluate(([t, r]) => (window as any).startUpload(t, r ? { retryDelays: r } : {}), [await signIn(), retries] as const);
    await page.waitForFunction(() => ((window as any).states.at(-1)?.percent ?? 0) >= 25, null, { timeout: 30_000 });
    await net(true);   // the connection drops mid-file
    await page.waitForFunction(() => document.getElementById("words")!.textContent === "Upload paused: reconnecting", null, { timeout: 30_000 });
    const whileCut = await page.evaluate(() => ({ result: (window as any).result, failed: (window as any).failed, words: document.getElementById("words")!.textContent }));
    const rowsCut = sql(`select count(*) from plat_file`);
    await page.waitForTimeout(retries ? 5000 : 1500);   // the third run's cut outlasts every delay in its list
    await net(false);   // the connection comes back
    await page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 60_000 });
    const end = await page.evaluate(() => ({ result: (window as any).result as string, failed: (window as any).failed, words: (window as any).states.map((s: { words: string }) => s.words) as string[] }));
    const firstPatchAfterHead = (() => { const h = seen.findIndex((x, i) => x.m === "HEAD" && i > 0); return h >= 0 ? { head: seen[h], next: seen.slice(h + 1).find((x) => x.m === "PATCH") } : null; })();
    const stored = await files.get(A, `uploads/${P}/${end.result ? sql(`select replace(key, 'uploads/${P}/', '') from plat_file where id = '${end.result}'`) : "none"}`);
    ok(`PF-F2 DW8b fail (${label}): while the network is cut the page says "Upload paused: reconnecting", has no file and no error, and nothing is stored`,
      whileCut.words === "Upload paused: reconnecting" && whileCut.result === undefined && whileCut.failed === undefined && rowsCut === String(Number(sql(`select count(*) from plat_file`)) - (end.result ? 1 : 0)), { whileCut, rowsCut });
    ok(`PF-F2 DW8 pass (${label}): after the cut the file completes; the stored bytes' sha256 is the original's, and plat_file says SCANNING`,
      !!end.result && !end.failed && stored?.sha256 === sha(doc) && sql(`select sha256 || '|' || scan_state from plat_file where id = '${end.result}'`) === `${sha(doc)}|SCANNING`, { end: { ...end, words: end.words.slice(-4) } });
    ok(`PF-F2 DW8 pass (${label}): the cut failed a PATCH in flight (review n4), and it resumed from the server's offset: a HEAD after the cut, then a PATCH at exactly that offset (above 0), never the file again from 0`,
      inFlightCut >= 1 && !!firstPatchAfterHead?.next && Number(firstPatchAfterHead.head.respOffset) > 0 && firstPatchAfterHead.next.offset === firstPatchAfterHead.head.respOffset && seen.filter((x) => x.m === "PATCH" && x.offset === "0").length === 1, { seen: seen.map((x) => `${x.m}:${x.offset}>${x.status}:${x.respOffset}`) });
    ok(`PF-F2 DW8b pass (${label}): the words went "Upload paused: reconnecting", then "Resumed, N%" up to the end`,
      end.words.includes("Upload paused: reconnecting") && end.words.some((w) => /^Resumed, \d+%$/.test(w)) && end.words.indexOf("Upload paused: reconnecting") < end.words.findIndex((w) => /^Resumed/.test(w)), end.words.filter((w, i, a) => a[i - 1] !== w));
    await ctx.close();
  }

  // DW8c: a refusal is final (a 4xx is never retried): bytes that are no allowed kind end in PF-F4's words, nothing stored.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let patches = 0; page.on("request", (r) => { if (r.method() === "PATCH") patches++; });
  await page.goto(`${base}/pff2-test/`);
  await page.evaluate((p) => { (window as any).personId = p; }, P);
  const rows = sql(`select count(*) from plat_file`);
  await page.setInputFiles("#f", { name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not a PDF at all ".repeat(100)) });
  await page.evaluate((t) => (window as any).startUpload(t), await signIn());   // DW8c
  await page.waitForFunction(() => (window as any).failed !== undefined || (window as any).result !== undefined, null, { timeout: 30_000 });
  const refused = await page.evaluate(() => ({ failed: (window as any).failed, words: document.getElementById("words")!.textContent }));
  ok("PF-F2 DW8c fail: a refused file ends in PF-F4's own words on the page (\"… Nothing was stored.\"), after one PATCH (no retry), and nothing is stored",
    /Nothing was stored\./.test(refused.words ?? "") && refused.failed === refused.words && patches === 1 && sql(`select count(*) from plat_file`) === rows, { refused, patches });
  await ctx.close();

  // ---------------------------------------------------------------------------------------- review and break round 1
  type Run = { result?: string; failed?: string; words: string[]; phases: string[]; reqs: string[] };
  const small = pdfOf(1200 * 1024), smallSha = sha(small);
  /** One upload on a fresh desktop page; `during` acts on the page mid-upload (once past `at` %). */
  const run = async (person: string, o: { retryDelays?: number[]; stallMs?: number }, during?: (page: import("playwright").Page, ctx: BrowserContext) => Promise<void>, at = 25, slow = true,
    x: { init?: (ctx: BrowserContext) => Promise<void>; filePath?: string } = {}): Promise<Run & { page: import("playwright").Page; ctx: BrowserContext }> => {
    const ctx = await browser!.newContext({ viewport: { width: 1440, height: 900 } });
    await x.init?.(ctx);
    const page = await ctx.newPage(), reqs: string[] = [];
    if (slow) await (await ctx.newCDPSession(page)).send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 256 * 1024 });
    page.on("request", (r) => { if (r.url().includes("/api/platform/files/uploads")) reqs.push(`${r.method()}:${r.headers()["upload-offset"] ?? ""}`); });
    await page.goto(`${base}/pff2-test/`);
    await page.evaluate((p) => { (window as any).personId = p; }, person);
    await page.setInputFiles("#f", x.filePath ?? { name: "statement.pdf", mimeType: "application/pdf", buffer: small });
    await page.evaluate(([t, opts]) => (window as any).startUpload(t, opts), [await signIn(), o] as const);
    if (during) { await page.waitForFunction((n) => ((window as any).states.at(-1)?.percent ?? 0) >= n, at, { timeout: 30_000 }); await during(page, ctx); }
    // A timeout is this run's answer, shown loudly as "TIMED OUT" in its named check (the next checks still run).
    const ended = await page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 30_000 }).then(() => true, () => false);
    if (!ended) await page.evaluate(() => { (window as any).handle?.abort(); (window as any).failed = "TIMED OUT (still running after 30 s)"; });
    const r = await page.evaluate(() => ({ result: (window as any).result, failed: (window as any).failed, words: (window as any).states.map((s: { words: string }) => s.words), phases: (window as any).states.map((s: { phase: string }) => s.phase) as string[] }));
    return { ...r, reqs, page, ctx };
  };
  const rowOf = (id?: string) => (id ? sql(`select sha256 from plat_file where id = '${id}'`) : "");
  const rowsFor = (p: string) => Number(sql(`select count(*) from plat_file where key like 'uploads/${p}/%'`));

  // B1 (both): the final PATCH's answer is lost after the server stored the file: done only with the stored file's id.
  let cutFinal = false;
  const before1 = rowsFor(P);
  const lostAnswer = await run(P, {}, async (page) => {
    await page.route("**/api/platform/files/uploads/*", async (route) => {
      const off = Number(route.request().headers()["upload-offset"] ?? -1);
      if (!cutFinal && route.request().method() === "PATCH" && off + 256 * 1024 >= small.length) { cutFinal = true; await route.fetch(); return route.abort("connectionreset"); }
      return route.continue();
    });
  }, 0, false);
  ok("PF-F2 DW8e fail (review B1, break M1): the last answer lost after the server stored the file → the page still ends done with the stored file's id (never an empty id), one file",
    cutFinal && !!lostAnswer.result && rowOf(lostAnswer.result) === smallSha && rowsFor(P) === before1 + 1, { cutFinal, result: lostAnswer.result, reqs: lostAnswer.reqs });
  await lostAnswer.ctx.close();

  // B1: the finish fails once on the server (500): the client tries again and ends with the stored file's id.
  const failOnce = await run(P_FAIL_ONCE, { retryDelays: [0, 200] }, undefined, 25, false);
  ok("PF-F2 DW8e fail (review B1, break B1): the server's finish failing once (500) → tried again, done with the stored file's id; one file",
    failedOnce && !!failOnce.result && rowOf(failOnce.result) === smallSha && rowsFor(P_FAIL_ONCE) === 1, { result: failOnce.result, failed: failOnce.failed, reqs: failOnce.reqs });
  await failOnce.ctx.close();

  // B1: the finish refused (409, PF-15's plan limit's shape): final, in the server's words, never done.
  const refusedFinish = await run(P_REFUSE, { retryDelays: [0, 200] }, undefined, 25, false);
  ok("PF-F2 DW8e fail (break B1, M4): a refused finish (409 problem+json) ends failed in its detail words, never done, nothing stored",
    refusedFinish.result === undefined && refusedFinish.failed === "Your plan's storage is full. Nothing was stored." && !refusedFinish.phases.includes("done") && rowsFor(P_REFUSE) === 0, { failed: refusedFinish.failed, words: refusedFinish.words.slice(-3) });
  // Review n2 of #3640: the rail's refusals are text/plain, so a 409 that is not tus's "Upload-Offset conflict" is final at
  // its first answer: no HEAD, no second try (before, it was tried again through every delay).
  ok("PF-F2 DW8e fail (review n2 of #3640): the refused finish is said at its first answer, never tried again (no HEAD, no offset sent twice)",
    refusedFinish.reqs.filter((r) => r.startsWith("HEAD")).length === 0 && new Set(refusedFinish.reqs).size === refusedFinish.reqs.length, refusedFinish.reqs);
  await refusedFinish.ctx.close();

  // Break M2: a cut the browser never notices (navigator.onLine stays true) longer than every retry delay.
  let blocked = true;
  const before4 = rowsFor(P);
  const unseen = await run(P, { retryDelays: [0, 200, 500] }, async (page) => {
    await page.route("**/api/platform/files/uploads/*", (route) => (blocked ? route.abort("connectionreset") : route.continue()));
    await page.waitForTimeout(6000);
    ok("PF-F2 DW8f fail (break M2): during a 6 s cut the browser does not see (navigator.onLine true), the page says paused and has not given up",
      await page.evaluate(() => navigator.onLine === true && (window as any).failed === undefined && document.getElementById("words")!.textContent === "Upload paused: reconnecting"));
    blocked = false;
  });
  ok("PF-F2 DW8f pass (break M2, M3): when the path comes back the same upload completes from its offset (one POST), sha256 the original's",
    !!unseen.result && rowOf(unseen.result) === smallSha && rowsFor(P) === before4 + 1 && unseen.reqs.filter((r) => r.startsWith("POST")).length === 1, { result: unseen.result, failed: unseen.failed, posts: unseen.reqs.filter((r) => r.startsWith("POST")).length });
  await unseen.ctx.close();

  // Review M2, break M4: the token ends during a cut: plain words (not the problem JSON), the upload kept; a new sign-in resumes it.
  let cut5 = false;
  const before5 = rowsFor(P);
  const expired = await run(P, { retryDelays: [0, 200] }, async (page) => {
    cut5 = true;
    await page.route("**/api/platform/files/uploads/*", (route) => (cut5 ? route.abort("connectionreset") : route.continue()));
    await page.evaluate(() => { const w = window as any; w.token = w.personId; });   // a uuid: no session's bearer
    await page.waitForTimeout(800); cut5 = false;
  });
  ok("PF-F2 DW8g fail (review M2, break M4): a refused token on resume says the server's words in plain text (no JSON, no markup); nothing stored yet",
    expired.result === undefined && !!expired.failed && !/[{}<>]/.test(expired.failed) && rowsFor(P) === before5, expired.failed);
  const postsBefore = expired.reqs.filter((r) => r.startsWith("POST")).length;
  await expired.page.evaluate((t) => { (window as any).token = t; (window as any).retryUpload(); }, await signIn());
  await expired.page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 60_000 });
  const again = await expired.page.evaluate(() => (window as any).result as string | undefined);
  const afterRetry = expired.reqs.slice(expired.reqs.length - 3);
  ok("PF-F2 DW8g pass (break M4): signed in again, retry() resumes the same upload from its offset (no new POST, no PATCH from 0 again) and completes",
    !!again && rowOf(again) === smallSha && expired.reqs.filter((r) => r.startsWith("POST")).length === postsBefore && expired.reqs.filter((r) => r === "PATCH:0").length === 1, { again, reqs: expired.reqs, afterRetry });
  await expired.ctx.close();

  // Break m2: the upload is gone from the server on resume (404): said in words, never a silent new upload from 0.
  const gone = await run(P, { retryDelays: [0, 200] }, async (page) => {
    await page.route("**/api/platform/files/uploads/*", (route) => route.abort("connectionreset"));
    await page.waitForTimeout(300);
    for (const f of readdirSync(join(WORK, "staging"))) rmSync(join(WORK, "staging", f), { force: true });   // the cleanup took it
    await page.unroute("**/api/platform/files/uploads/*");
  });
  ok("PF-F2 DW8h fail (break m2): an upload gone from the server on resume (404) ends in words, with no second POST (never restarted from 0 silently)",
    gone.result === undefined && gone.failed === "This upload is no longer on the server. Start it again." && gone.reqs.filter((r) => r.startsWith("POST")).length === 1, { failed: gone.failed, reqs: gone.reqs });
  await gone.ctx.close();

  // Review n1, break m1: abort while paused: done rejects in words, no request after it, nothing stored.
  const before7 = rowsFor(P);
  const stopped = await run(P, { retryDelays: [0, 200] }, async (page) => {
    await page.route("**/api/platform/files/uploads/*", (route) => route.abort("connectionreset"));
    await page.waitForFunction(() => document.getElementById("words")!.textContent === "Upload paused: reconnecting", null, { timeout: 10_000 });
    await page.evaluate(() => (window as any).handle.abort());
  });
  const n7 = stopped.reqs.length; await stopped.page.waitForTimeout(1500);
  ok("PF-F2 DW8i fail (review n1, break m1): abort() while paused settles the upload as stopped, sends nothing more, stores nothing",
    stopped.failed === "Upload stopped." && stopped.reqs.length === n7 && rowsFor(P) === before7, { failed: stopped.failed, more: stopped.reqs.length - n7 });
  await stopped.ctx.close();

  // Break m4: a request that hangs with no answer is cut after stallMs and tried again; the upload completes.
  let hung = false;
  const before8 = rowsFor(P);
  const stalled = await run(P, { retryDelays: [0, 200], stallMs: 2000 }, async (page) => {
    await page.route("**/api/platform/files/uploads/*", (route) => { if (!hung && route.request().method() === "PATCH") { hung = true; return; } return route.continue(); });   // never answered
  }, 25);
  ok("PF-F2 DW8j fail (break m4): a request left hanging is cut after stallMs, shown paused, and the upload completes from its offset",
    hung && !!stalled.result && rowOf(stalled.result) === smallSha && rowsFor(P) === before8 + 1 && stalled.words.includes("Upload paused: reconnecting"), { result: stalled.result, failed: stalled.failed, reqs: stalled.reqs });
  await stalled.ctx.close();

  // Review round 2 B1: a server that keeps answering with an error gets the delay list, then its words; never a tight loop.
  const t0 = Date.now();
  const down = await run(P_ALWAYS, { retryDelays: [0, 150, 300] }, undefined, 25, false);
  ok("PF-F2 DW8k fail (review round 2 B1): a finish that always fails (500) is tried the delay list's length, then ends in the server's words; requests stay few",
    down.result === undefined && /could not be finished/.test(down.failed ?? "") && down.reqs.length <= 15 && Date.now() - t0 >= 450 && rowsFor(P_ALWAYS) === 0, { failed: down.failed, n: down.reqs.length, reqs: down.reqs });
  storeBack = true;
  const postsDown = down.reqs.filter((r) => r.startsWith("POST")).length;
  await down.page.evaluate(() => (window as any).retryUpload());
  await down.page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 30_000 });
  const back = await down.page.evaluate(() => (window as any).result as string | undefined);
  ok("PF-F2 DW8k pass (review round 2 B1): the upload was kept: once the server is back, retry() finishes it from its offset (no new POST), one file",
    !!back && rowOf(back) === smallSha && rowsFor(P_ALWAYS) === 1 && down.reqs.filter((r) => r.startsWith("POST")).length === postsDown, { back, reqs: down.reqs.slice(-4) });
  await down.ctx.close();
  const busy = await run(P, { retryDelays: [0, 150, 300] }, async (page) => {
    await page.route("**/api/platform/files/uploads/*", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "text/plain", body: "Busy: try again later." }) : route.continue()));
  }, 0, false);
  ok("PF-F2 DW8k fail (review round 2 B1): every PATCH answered 503 → a few tries on the delays, then the server's words (not a loop)",
    busy.failed === "Busy: try again later." && busy.reqs.length <= 15, { failed: busy.failed, n: busy.reqs.length });
  await busy.ctx.close();

  // Review round 3 B1 / break R3-B1: the server reads the whole chunk, then answers 5xx (a staging write failing; a proxy's
  // 502). Bytes sent are not bytes accepted: the delays must not restart, and the upload ends in the server's words.
  const rail = nest.get(UploadRail), realWrite = rail.store.write.bind(rail.store);
  let writeDown = false, patchesWhileDown = 0;
  rail.store.write = (async (readable: AsyncIterable<unknown>, id: string, offset: number) => {
    const up = await rail.store.getUpload(id);
    if (writeDown && (JSON.parse(up.metadata?.xr_target ?? "{}") as { personId?: string }).personId === P_WRITEFAIL) { patchesWhileDown++; for await (const _ of readable) { /* read every byte */ } throw new Error("staging disk full"); }
    return realWrite(readable as never, id, offset);
  }) as typeof rail.store.write;
  let downAt = 0;
  const readThenFail = await run(P_WRITEFAIL, { retryDelays: [0, 150, 300] }, async () => { writeDown = true; downAt = Date.now(); });
  ok("PF-F2 DW8l fail (review round 3 B1, break R3-B1): a server that reads each chunk and then answers 500 gets a few tries on growing delays, then its words; never a tight loop",
    /could not be finished/.test(readThenFail.failed ?? "") && patchesWhileDown >= 2 && patchesWhileDown <= 6 && Date.now() - downAt >= 450 && rowsFor(P_WRITEFAIL) === 0, { failed: readThenFail.failed, patchesWhileDown, reqs: readThenFail.reqs.length });
  writeDown = false;
  const postsW = readThenFail.reqs.filter((r) => r.startsWith("POST")).length;
  await readThenFail.page.evaluate(() => (window as any).retryUpload());
  await readThenFail.page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 60_000 });
  const wBack = await readThenFail.page.evaluate(() => (window as any).result as string | undefined);
  ok("PF-F2 DW8l pass: once the store writes again, retry() resumes from the server's offset (no new POST) and the file is the original",
    !!wBack && rowOf(wBack) === smallSha && readThenFail.reqs.filter((r) => r.startsWith("POST")).length === postsW, { wBack });
  await readThenFail.ctx.close();

  // Break R3-M1: a browser inside the build target without AbortSignal.any (Chrome 111-115, Safari 16.4-17.3), with the last
  // answer lost: the confirm still runs and the page ends done with the stored file's id.
  let cutFinal2 = false;
  const before12 = rowsFor(P);
  const oldBrowser = await run(P, {}, async (page) => {
    await page.route("**/api/platform/files/uploads/*", async (route) => {
      const off = Number(route.request().headers()["upload-offset"] ?? -1);
      if (!cutFinal2 && route.request().method() === "PATCH" && off + 256 * 1024 >= small.length) { cutFinal2 = true; await route.fetch(); return route.abort("connectionreset"); }
      return route.continue();
    });
  }, 0, false, { init: (ctx) => ctx.addInitScript(() => { delete (AbortSignal as unknown as { any?: unknown }).any; }) });
  ok("PF-F2 DW8m fail (break R3-M1): with no AbortSignal.any and the last answer lost, the page still ends done with the stored file's id (never paused for ever)",
    cutFinal2 && !!oldBrowser.result && rowOf(oldBrowser.result) === smallSha && rowsFor(P) === before12 + 1, { result: oldBrowser.result, failed: oldBrowser.failed, words: oldBrowser.words.slice(-3) });
  await oldBrowser.ctx.close();

  // Break R3-m1: the picked file changes on disk mid-upload: said in words at once, never retried for ever as "paused".
  mkdirSync(WORK, { recursive: true });
  const picked = join(WORK, "picked-statement.pdf"); writeFileSync(picked, small);
  const before13 = rowsFor(P);
  const changed = await run(P, { retryDelays: [0, 150, 300] }, async () => { writeFileSync(picked, pdfOf(900 * 1024)); }, 25, true, { filePath: picked });
  ok("PF-F2 DW8n fail (break R3-m1): a file changed on disk mid-upload ends in \"The file could not be read. Choose it again.\" after a few requests; nothing stored",
    changed.failed === "The file could not be read. Choose it again." && changed.reqs.length <= 12 && rowsFor(P) === before13, { failed: changed.failed, n: changed.reqs.length, words: changed.words.slice(-3) });
  await changed.ctx.close();
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await browser?.close().catch(() => undefined);
  await app?.close().catch(() => undefined); await owner.$disconnect().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the sweep */ }
}
console.log(`\nPF-F2 part 2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
