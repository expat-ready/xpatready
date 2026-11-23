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
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
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
const { uploadWords } = await import("../web/src/lib/resumable-upload.ts");
const feature = (await import("../api/src/features/platform-files.ts")).default;

/** A plain PDF of about n bytes (PF-F4 reads its header and trailer). */
const pdfOf = (n: number) => Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(n - 60, 0x41), Buffer.from("\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")]);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const MB = 1024 * 1024;

// The test page's script: the client library, bundled for the browser as the web app's Vite build takes it (browser entry).
const bundle = (await build({ stdin: { contents: `import { resumableUpload } from "./lib/resumable-upload.ts";
  const w = window as any; w.states = [];
  w.startUpload = (token: string, retryDelays?: number[] | null) => {
    const file = (document.getElementById("f") as HTMLInputElement).files![0];
    w.result = undefined; w.failed = undefined; w.states = [];
    resumableUpload(file, { door: "STAFF", meta: { personId: w.personId }, token: () => token, chunkSize: 256 * 1024, ...(retryDelays !== undefined ? { retryDelays } : {}),
      onState: (s) => { w.states.push(s); document.getElementById("words")!.textContent = s.words; } }).done.then((id) => { w.result = id; }, (e) => { w.failed = String(e.message); });
  };`, resolveDir: join(STUDIO, "web", "src"), loader: "ts" }, bundle: true, format: "iife", platform: "browser", write: false, logLevel: "silent" })).outputFiles[0].text;
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
  const P = randomUUID();
  nest.get(UploadDoors).register("STAFF", { allowedKinds: ["pdf"], authorize: async (_c, m) => (m.personId === P ? { personId: P } : null), keyOf: (t, id) => `uploads/${t.personId}/${id}` });

  ok("PF-F2 DW8d: the words are CS-D2's: paused, resumed with its percent; plain progress; a failure in the server's words",
    uploadWords("paused", 40) === "Upload paused: reconnecting" && uploadWords("resumed", 62) === "Resumed, 62%" && uploadWords("uploading", 7) === "7%" && uploadWords("failed", 3, "This file is empty. Nothing was stored.") === "This file is empty. Nothing was stored.");

  browser = await chromium.launch({ ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
  const doc = pdfOf(5 * MB);
  // The third run spends every retry while offline (none at all): the client must wait for "online" and resume itself.
  for (const [label, ctxOpts, retries] of [["desktop 1440 px", { viewport: { width: 1440, height: 900 } }, undefined], ["phone (Pixel 7)", devices["Pixel 7"], undefined],
    ["desktop, retries spent while offline", { viewport: { width: 1440, height: 900 } }, null]] as const) {
    const ctx: BrowserContext = await browser.newContext(ctxOpts as never);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    // Slow uploads to 1 MB/s so the cut lands mid-file (Chromium's own throttling).
    const net = (offline: boolean) => cdp.send("Network.emulateNetworkConditions", { offline, latency: 20, downloadThroughput: -1, uploadThroughput: MB });
    await net(false);
    const seen: { m: string; offset: string | null; status?: number; respOffset?: string | null }[] = [];
    page.on("requestfinished", async (r) => { if (!r.url().includes("/api/platform/files/uploads")) return; const res = await r.response(); seen.push({ m: r.method(), offset: r.headers()["upload-offset"] ?? null, status: res?.status(), respOffset: res?.headers()["upload-offset"] ?? null }); });
    await page.goto(`${base}/pff2-test/`);
    await page.evaluate((p) => { (window as any).personId = p; }, P);
    await page.setInputFiles("#f", { name: "passport.pdf", mimeType: "application/pdf", buffer: doc });
    await page.evaluate(([t, r]) => (window as any).startUpload(t, r), [await signIn(), retries] as const);
    await page.waitForFunction(() => ((window as any).states.at(-1)?.percent ?? 0) >= 25, null, { timeout: 30_000 });
    await net(true);   // the connection drops mid-file
    await page.waitForFunction(() => document.getElementById("words")!.textContent === "Upload paused: reconnecting", null, { timeout: 30_000 });
    const whileCut = await page.evaluate(() => ({ result: (window as any).result, failed: (window as any).failed, words: document.getElementById("words")!.textContent }));
    const rowsCut = sql(`select count(*) from plat_file`);
    await page.waitForTimeout(1500);
    await net(false);   // the connection comes back
    await page.waitForFunction(() => (window as any).result !== undefined || (window as any).failed !== undefined, null, { timeout: 60_000 });
    const end = await page.evaluate(() => ({ result: (window as any).result as string, failed: (window as any).failed, words: (window as any).states.map((s: { words: string }) => s.words) as string[] }));
    const firstPatchAfterHead = (() => { const h = seen.findIndex((x, i) => x.m === "HEAD" && i > 0); return h >= 0 ? { head: seen[h], next: seen.slice(h + 1).find((x) => x.m === "PATCH") } : null; })();
    const stored = await files.get(A, `uploads/${P}/${end.result ? sql(`select replace(key, 'uploads/${P}/', '') from plat_file where id = '${end.result}'`) : "none"}`);
    ok(`PF-F2 DW8b fail (${label}): while the network is cut the page says "Upload paused: reconnecting", has no file and no error, and nothing is stored`,
      whileCut.words === "Upload paused: reconnecting" && whileCut.result === undefined && whileCut.failed === undefined && rowsCut === String(Number(sql(`select count(*) from plat_file`)) - (end.result ? 1 : 0)), { whileCut, rowsCut });
    ok(`PF-F2 DW8 pass (${label}): after the cut the file completes; the stored bytes' sha256 is the original's, and plat_file says SCANNING`,
      !!end.result && !end.failed && stored?.sha256 === sha(doc) && sql(`select sha256 || '|' || scan_state from plat_file where id = '${end.result}'`) === `${sha(doc)}|SCANNING`, { end: { ...end, words: end.words.slice(-4) } });
    ok(`PF-F2 DW8 pass (${label}): it resumed from the server's offset: a HEAD after the cut, then a PATCH at exactly that offset (above 0), never the file again from 0`,
      !!firstPatchAfterHead?.next && Number(firstPatchAfterHead.head.respOffset) > 0 && firstPatchAfterHead.next.offset === firstPatchAfterHead.head.respOffset && seen.filter((x) => x.m === "PATCH" && x.offset === "0").length === 1, { seen: seen.map((x) => `${x.m}:${x.offset}>${x.status}:${x.respOffset}`) });
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
  await page.evaluate((t) => (window as any).startUpload(t), await signIn());
  await page.waitForFunction(() => (window as any).failed !== undefined || (window as any).result !== undefined, null, { timeout: 30_000 });
  const refused = await page.evaluate(() => ({ failed: (window as any).failed, words: document.getElementById("words")!.textContent }));
  ok("PF-F2 DW8c fail: a refused file ends in PF-F4's own words on the page (\"… Nothing was stored.\"), after one PATCH (no retry), and nothing is stored",
    /Nothing was stored\./.test(refused.words ?? "") && refused.failed === refused.words && patches === 1 && sql(`select count(*) from plat_file`) === rows, { refused, patches });
  await ctx.close();
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
