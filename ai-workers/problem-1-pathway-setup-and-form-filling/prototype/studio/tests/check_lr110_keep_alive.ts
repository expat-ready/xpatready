// LR-110 (nightly 46108614143, part 15, job 140866925974): check_c42_marking_browser failed with "apiRequestContext.fetch:
// read ECONNRESET" on a GET to the studio API. Cause (api/src/platform/http/keep-alive.ts): Playwright's request client
// keeps idle keep-alive sockets with no limit (Node's agent ignores the server's Keep-Alive hint when the agent has no
// timeout), the server closes an idle one after Node's 5 s (+1 s buffer on Node 24), and a request sent on it just before
// that, while the server's event loop is busy, is never read: the socket is closed and the kernel answers RST.
// This check reproduces it with the suite's own client against a server process on Node's defaults (the request fails
// with ECONNRESET), then runs the same sequence against the studio's keepAlive() settings (no request fails).
// A pass and a fail: the fail half proves the case still reproduces, so the pass half is not a pass by luck.
// No database, no studio copy, no model call (US$0). About 30 s.
//   tsx studio/tests/check_lr110_keep_alive.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import http from "node:http";
import { request } from "playwright";
import { HEADERS_TIMEOUT_MS, KEEP_ALIVE_MS, keepAlive } from "../api/src/platform/http/keep-alive.ts";

let pass = 0, fail = 0;
const step = (name: string, ok: boolean, detail?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${String(detail).slice(0, 220)}` : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The server runs on its own thread (its own event loop), so holding its loop busy never holds the client's.
// "/busy" holds the server's loop for BUSY_MS, as the studio is held while it answers a page reload after an Undo.
const BUSY_MS = 3000;
const SERVER = `
const http = require("node:http"); const { parentPort, workerData } = require("node:worker_threads");
const srv = http.createServer((q, r) => { if (q.url === "/busy") { const t = Date.now() + workerData.busy; while (Date.now() < t); } r.setHeader("content-type", "application/json"); r.end("{}"); });
if (workerData.keepAliveTimeout !== undefined) { srv.keepAliveTimeout = workerData.keepAliveTimeout; srv.headersTimeout = workerData.headersTimeout; }
srv.listen(0, "127.0.0.1", () => parentPort.postMessage({ port: srv.address().port, keepAliveTimeout: srv.keepAliveTimeout, buffer: srv.keepAliveTimeoutBuffer ?? 0 }));`;

type Up = { port: number; keepAliveTimeout: number; buffer: number };
async function serve(settings: { keepAliveTimeout?: number; headersTimeout?: number }): Promise<{ up: Up; stop: () => Promise<number> }> {
  const w = new Worker(SERVER, { eval: true, workerData: { busy: BUSY_MS, ...settings } });
  const up = await new Promise<Up>((ok, no) => { w.once("message", ok); w.once("error", no); });
  return { up, stop: () => w.terminate() };
}

// The suite's sequence: an API call, the socket idles until just before the server's close, the server's loop is held
// across the close, the next API call reuses the socket.
async function sequence(up: Up, rounds: number): Promise<string[]> {
  const ctx = await request.newContext(), other = await request.newContext(); const errors: string[] = [];
  const closeAt = up.keepAliveTimeout + up.buffer;   // when Node's defaults close the idle socket (5 s + 1 s on Node 24)
  for (let i = 0; i < rounds; i++) {
    await ctx.fetch(`http://127.0.0.1:${up.port}/a`);
    await sleep(Math.max(closeAt - 2000, 0));
    const busy = other.fetch(`http://127.0.0.1:${up.port}/busy`);   // held from closeAt-2 s to closeAt+1 s
    await sleep(700);
    try { const r = await ctx.fetch(`http://127.0.0.1:${up.port}/b`); if (r.status() !== 200) errors.push(`status ${r.status()}`); }
    catch (e) { errors.push(String((e as Error).message).split("\n")[0]); }
    await busy;
  }
  await ctx.dispose(); await other.dispose();
  return errors;
}

// ---- the fail half: Node's defaults reproduce the nightly's error
const node = await serve({});
step("LR-110 fail: the server on Node's defaults closes an idle connection after 5 s", node.up.keepAliveTimeout === 5000, `${node.up.keepAliveTimeout} ms (+${node.up.buffer} ms buffer)`);
const before = await sequence(node.up, 2);
await node.stop();
step("LR-110 fail: a reused idle socket closed while the server is busy reproduces the nightly's ECONNRESET", before.length > 0 && before.every((e) => /read ECONNRESET|socket hang up/.test(e)), before.join(" | ") || "no request failed: the case no longer reproduces");

// ---- the pass half: the studio's settings
const fake = { keepAliveTimeout: 0, headersTimeout: 0 }; keepAlive(fake);
step("LR-110: keepAlive() keeps an idle connection 65 s and headers above it", fake.keepAliveTimeout === KEEP_ALIVE_MS && KEEP_ALIVE_MS === 65_000 && fake.headersTimeout === HEADERS_TIMEOUT_MS && HEADERS_TIMEOUT_MS > KEEP_ALIVE_MS, JSON.stringify(fake));
const studio = await serve(fake);
// The same timings as above (the old close moment), now against the studio's settings: nothing is closed under the request.
const after = await sequence({ ...studio.up, keepAliveTimeout: node.up.keepAliveTimeout, buffer: node.up.buffer }, 2);
await studio.stop();
step("LR-110 pass: with the studio's settings the same sequence loses no request", after.length === 0, after.join(" | ") || "0 failed");

// ---- the studio server applies it (the one http server, api/src/main.ts)
const main = readFileSync(join(import.meta.dirname, "..", "api", "src", "main.ts"), "utf8");
step("LR-110: the studio's server applies keepAlive() before it listens", /keepAlive\(app\.getHttpServer\(\)\)[^\n]*\n\s*await app\.listen\(/.test(main));
// A real server object takes the values (types and Node's own setter checks).
const real = http.createServer(); keepAlive(real);
step("LR-110: a Node http server takes the values", real.keepAliveTimeout === KEEP_ALIVE_MS && real.headersTimeout === HEADERS_TIMEOUT_MS, `${real.keepAliveTimeout}/${real.headersTimeout}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
