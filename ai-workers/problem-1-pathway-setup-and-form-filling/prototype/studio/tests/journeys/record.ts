// P-700 (#224): the recording of a journey, loaded before it (tsx --import), so a journey file stays as it is. Every
// browser context the journey opens gets a video (its viewport scaled to fit 800 x 800, P-729: video-size.ts) and a Playwright trace; every PASS, FAIL or HELD line gets
// a screenshot of each open page; every fetch the journey makes is logged (method, address, status). A journey with no
// screens yet (WALK_BOARD=1, set by walk.mjs when its file never starts a browser) gets a recorded step board instead:
// a page listing its steps and the requests behind each, so its video and trace show the walk honestly as an API walk.
// Everything goes to $WALK_OUT (video/, trace-*.zip, steps/, requests.jsonl, steps.jsonl); run by walk.mjs, never alone.
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { videoSize } from "./video-size.ts";

const OUT = process.env.WALK_OUT;
if (!OUT) throw new Error("record.ts: WALK_OUT is not set (run the journey through tests/journeys/walk.mjs)");
for (const d of ["video", "steps"]) mkdirSync(join(OUT, d), { recursive: true });
// As j_6 does: Chrome on the Mac, a cloud session's pre-installed Chromium, else Playwright's own (CI installs it).
const exe = process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {};
const live = new Set<BrowserContext>(), pending: Promise<unknown>[] = [];
let traces = 0, shots = 0;
const realLog = console.log.bind(console), realExit = process.exit.bind(process), realFetch = globalThis.fetch.bind(globalThis);

// One finishing per context: a second close at the same time (the journey's own while finish() closes it) waits for
// the first, so the context never closes while its trace is still being written.
const finishing = new Map<BrowserContext, Promise<void>>();
function finishContext(ctx: BrowserContext): Promise<void> {
  if (!live.has(ctx)) return finishing.get(ctx) ?? Promise.resolve();
  if (!finishing.has(ctx)) finishing.set(ctx, (async () => {
    await Promise.allSettled(pending.splice(0));   // queued step screenshots first, while the context is still open
    live.delete(ctx);
    await ctx.tracing.stop({ path: join(OUT!, `trace-${++traces}.zip`) }).catch((e) => realLog(`record: trace ${traces} not saved: ${e.message}`));
  })());
  return finishing.get(ctx)!;
}
function record(browser: Browser): Browser {
  const close = browser.close.bind(browser), newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts = {}) => {
    const ctx = await newContext({ ...opts, recordVideo: { dir: join(OUT!, "video"), size: videoSize(opts.viewport ?? { width: 1440, height: 900 }) } });
    await ctx.tracing.start({ screenshots: true, snapshots: true, title: process.argv[1] });
    live.add(ctx);
    const ctxClose = ctx.close.bind(ctx);
    ctx.close = async (o) => { await finishContext(ctx); return ctxClose(o); };
    return ctx;
  };
  browser.newPage = async (opts) => (await browser.newContext(opts)).newPage();
  browser.close = async (o) => { for (const c of [...live]) if (c.browser() === browser) await c.close(); return close(o); };
  return browser;
}
const launch = chromium.launch.bind(chromium);
chromium.launch = async (opts = {}) => record(await launch(opts.executablePath || opts.channel ? opts : { ...exe, ...opts }));

// The step board, for a journey without screens.
let board: Promise<Page> | null = null, boardBrowser: Browser | null = null;
const rows: string[] = [];
if (process.env.WALK_BOARD === "1") board = (async () => {
  boardBrowser = await chromium.launch(exe);
  const p = await (await boardBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.setContent(`<title>${process.argv[1]}</title><body style="font:15px system-ui;margin:24px"><h1 style="font-size:20px">Recorded walk (API only: this journey has no screens yet)</h1><ol id="s"></ol></body>`);
  return p;
})();
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
let calls: string[] = [];

// After the journey's first exit (process.exit, a crash, SIGTERM) nothing more counts: no step is printed or recorded,
// and a fetch never settles, so code still running after process.exit cannot add steps or change the exit code.
let exiting: number | null = null;
globalThis.fetch = async (input, init) => {
  if (exiting !== null) return new Promise<Response>(() => undefined);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url, method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const r = await realFetch(input, init).catch((e) => { calls.push(`${method} ${url} → ${e.message}`); throw e; });
  appendFileSync(join(OUT, "requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), method, url, status: r.status }) + "\n");
  calls.push(`${method} ${url} → ${r.status}`);
  return r;
};

let queue: Promise<unknown> = Promise.resolve();
console.log = (...args: unknown[]) => {
  if (exiting !== null) return;
  realLog(...args);
  const line = args.map(String).join(" "), m = line.match(/^(PASS|FAIL|HELD)\s+(.*)$/);
  if (!m) return;
  const n = ++shots, slug = m[2].slice(0, 60).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, ""), base = `${String(n).padStart(3, "0")}-${m[1].toLowerCase()}-${slug}`;
  const shotsOf: string[] = [], made = calls; calls = [];
  // One step after another, so a step's screenshot is taken before the next step's (the journey itself runs on: a
  // shot shows the page a moment after its line, never a later step's work done in this queue).
  const step = queue = queue.then(async () => {
    if (board) {
      const p = await board;
      rows.push(`<li style="margin:6px 0;color:${m[1] === "PASS" ? "#14532d" : "#991b1b"}"><b>${m[1]}</b> ${esc(m[2].slice(0, 400))}${made.length ? `<ul style="color:#444;font-size:13px">${made.map((c) => `<li>${esc(c.slice(0, 200))}</li>`).join("")}</ul>` : ""}</li>`);
      await p.evaluate((h) => { document.getElementById("s")!.innerHTML = h; window.scrollTo(0, document.body.scrollHeight); }, rows.join(""));
      await p.waitForTimeout(400);   // so the video holds each step
    }
    const pages = [...live].flatMap((c) => c.pages()).filter((p) => !p.isClosed());
    for (const [i, p] of pages.entries()) {
      const f = `${base}${pages.length > 1 ? `-p${i + 1}` : ""}.png`;
      await p.screenshot({ path: join(OUT!, "steps", f) }).then(() => shotsOf.push(f), (e) => realLog(`record: no screenshot for step ${n}: ${e.message}`));
    }
    appendFileSync(join(OUT!, "steps.jsonl"), JSON.stringify({ n, verdict: m[1], step: m[2].slice(0, 400), screenshots: shotsOf, requests: made }) + "\n");
  }).catch((e) => realLog(`record: step ${n} not recorded: ${e.message}`));   // a recorder fault never blocks later steps
  pending.push(step);
};

let done: Promise<void> | null = null;
const finish = () => done ??= (async () => {
  const stop = setTimeout(() => { realLog("record: recording not finished in 90 s; exiting"); realExit(3); }, 90_000);
  await Promise.allSettled(pending.splice(0));
  for (const c of [...live]) await c.close().catch(() => undefined);
  await boardBrowser?.close().catch(() => undefined);
  clearTimeout(stop);
})();
// Every way out finishes the recording first (review of #2133, M1, M2): process.exit, an uncaught error or rejection
// (a Playwright timeout, a rethrow from finally), SIGTERM (walk.mjs's timeout), and the natural end. The first one wins.
const leave = (code: number) => {
  if (exiting !== null) return;
  exiting = code;
  finish().then(() => realExit(code));
};
process.exit = ((code?: number | string | null) => { leave(Number(code ?? process.exitCode ?? 0) || 0); }) as typeof process.exit;
const crash = (e: unknown) => { if (exiting === null) { console.error("record: the journey crashed:", e); leave(1); } };
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);
process.on("SIGTERM", () => { if (exiting === null) { console.error("record: stopped (SIGTERM)"); leave(143); } });
process.on("beforeExit", () => leave(Number(process.exitCode ?? 0) || 0));
