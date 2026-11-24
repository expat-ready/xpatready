// The API server keeps an idle connection longer than the load balancer's 60 s, so the balancer never sends on one the
// server is closing (a 502; on 24 Nov the same close was ECONNRESET in batch #3401). The container's real entry
// (deploy/container-entry.mjs, then main.ts) runs on a scratch database; plain sockets, so no client pool hides a close.
// Takes about 65 s. No browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_balancer_keep_alive.ts
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { Agent, createServer, get } from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_keepalive_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const VAR = join(STUDIO, "var", `keepalive-check-${process.pid}`);
const IDLE_MS = 62_000;   // past the balancer's 60 s (deploy/cdk/lib/service.ts)

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((res) => { const f = createServer().listen(0, "127.0.0.1", () => { const p = (f.address() as AddressInfo).port; f.close(() => res(p)); }); });

/** One plain connection: ask() sends a GET and gives the status line; closedAt is when the server ended it. */
class Line {
  closedAt = 0; #text = ""; #s: Socket;
  constructor(port: number) {
    this.#s = connect(port, "127.0.0.1");
    this.#s.on("data", (b) => (this.#text += b)); this.#s.on("error", () => { this.closedAt ||= Date.now(); });
    this.#s.on("end", () => { this.closedAt ||= Date.now(); }); this.#s.on("close", () => { this.closedAt ||= Date.now(); });
  }
  send(path: string) { this.#text = ""; this.#s.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\n\r\n`); }
  async ask(path: string): Promise<string> {
    this.send(path);
    for (const t = Date.now(); Date.now() - t < 10_000 && !this.closedAt && !/\r\n\r\n/.test(this.#text);) await pause(20);
    return this.#text.split("\r\n")[0];
  }
  get text() { return this.#text; }
  end() { this.#s.destroy(); }
}

// --- a stop stays prompt: a server that still answers one request when it is stopped, with another connection idle
const keepAlive = await import("../api/src/platform/http/keep-alive.ts").catch(() => null);
ok("keep-alive.ts exists (the old code has none)", keepAlive);
if (keepAlive) {
  const BIG = 60 * 1024 * 1024;
  const server = createServer((q, r) => void setTimeout(() => r.end(q.url === "/big" ? Buffer.alloc(BIG) : "ok"), q.url === "/slow" ? 800 : q.url === "/big" ? 500 : 0));
  keepAlive.outlastBalancer(server);
  ok("the headers limit outlasts the keep-alive, which outlasts the balancer", server.headersTimeout > server.keepAliveTimeout && server.keepAliveTimeout > 60_000, [server.headersTimeout, server.keepAliveTimeout]);
  const port = await new Promise<number>((res) => server.listen(0, "127.0.0.1", () => res((server.address() as AddressInfo).port)));
  const idle = new Line(port), busy = new Line(port);
  let got = 0;   // a client that reads a big answer late: it starts after the stop, while another request finishes
  const bigDone = new Promise<void>((res) => get({ host: "127.0.0.1", port, path: "/big", agent: new Agent({ keepAlive: true }) }, (r) => {
    setTimeout(() => r.on("data", (b: Buffer) => (got += b.length)), 1_000); r.on("close", () => res());
  }).on("error", () => res()));
  await idle.ask("/"); busy.send("/slow"); await pause(200);
  const t0 = Date.now();
  const took = await Promise.race([new Promise<number>((res) => server.close(() => res(Date.now() - t0))), pause(8_000).then(() => Infinity)]);
  ok("server.close() with one idle and two answering connections ends within 3 s", took < 3_000, took);
  ok("the answering request was answered whole, not cut", /^HTTP\/1\.1 200/.test(busy.text) && busy.text.includes("ok"), busy.text);
  await Promise.race([bigDone, pause(5_000)]);
  ok("a big answer still being sent is not cut by another request that finishes during the stop", got === BIG, got);
  idle.end(); busy.end();
}

// --- the real server, as the container runs it
const inner = await freePort(), outer = await freePort();
let log = "", p: ReturnType<typeof spawn> | undefined;
const lines: Line[] = [];
try {
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  p = spawn(process.execPath, ["--import", "tsx", join(STUDIO, "deploy", "container-entry.mjs")], {
    cwd: STUDIO, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TSX_TSCONFIG_PATH: join(STUDIO, "api", "tsconfig.json"), PLATFORM_ENVIRONMENT: "local", DATABASE_URL: URL, STUDIO_PORT: String(inner), STUDIO_PUBLIC_PORT: String(outer), STUDIO_VAR: VAR, PLATFORM_IDENTITY: "local", PLATFORM_SAMPLE_SEED: "on" },
  });
  p.stdout!.on("data", (b: Buffer) => (log += b)); p.stderr!.on("data", (b: Buffer) => (log += b));
  for (const t = Date.now(); !/Product Studio on http/.test(log);) {
    if (Date.now() - t > 180_000 || p.exitCode !== null) throw new Error(`the server did not start: ${log.slice(-800)}`);
    await pause(250);
  }
  for (const [name, port] of [["main.ts's own port", inner], ["the container's port (what the balancer uses)", outer]] as const) {
    const l = new Line(port); lines.push(l);
    const first = await l.ask("/api/health/live");
    ok(`${name}: a first request answers 200`, first.startsWith("HTTP/1.1 200"), first);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < IDLE_MS && !lines.every((l) => l.closedAt)) await pause(200);
  for (const [i, name] of ["main.ts's own port", "the container's port"].entries()) {
    const l = lines[i];
    ok(`${name}: the connection is still open after ${IDLE_MS / 1000} s idle`, !l.closedAt, l.closedAt && `closed after ${l.closedAt - t0} ms`);
    const again = l.closedAt ? "closed" : await l.ask("/api/health/live");
    ok(`${name}: the same connection then answers 200`, again.startsWith("HTTP/1.1 200"), again);
  }
  // --- SIGTERM with those idle connections open
  const s0 = Date.now(), gone = new Promise<number>((res) => p!.once("exit", () => res(Date.now() - s0)));
  p.kill("SIGTERM");
  const took = await Promise.race([gone, pause(10_000).then(() => Infinity)]);
  ok("SIGTERM with idle connections open: the process ends within 5 s", took < 5_000, took);
  const refused = await new Promise<boolean>((res) => get({ host: "127.0.0.1", port: outer, path: "/" }, (r) => { r.resume(); res(false); }).on("error", () => res(true)));
  ok("and nothing answers on its port any more", refused);
} finally {
  for (const l of lines) l.end();
  if (p && p.exitCode === null && p.signalCode === null) p.kill("SIGKILL");
  await pause(300);
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(VAR, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
