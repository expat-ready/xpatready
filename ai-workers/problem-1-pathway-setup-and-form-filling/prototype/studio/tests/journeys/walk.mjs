// P-700 (#224): one recorded gate A walk of a journey (tests/journeys/j_<n>.ts), the way its own header says to run it.
// The copy is started and stopped with the header's isolated.sh line (the one way the packs start the app: own
// database, own port, never :4400); the journey runs with record.ts loaded (video, trace, a screenshot per step,
// requests); its exit code is this script's. A header with no isolated.sh line runs with no copy (the fixture).
// Usage, from anywhere:  node studio/tests/journeys/walk.mjs <j_6 | 6 | path/to/journey.ts> [out-dir]
//   out-dir defaults to studio/var/walks/<journey>; it holds walk.json (the verdict), walk.log, README.md (how to
//   replay), video/, trace-*.zip, steps/, journey-shots/ (screenshots the journey itself saved during the run).
// Workflow: .github/workflows/walks.yml (one job a journey, artifacts walk-<journey>-<sha>). Test: tests/check_journey_recording.ts.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const HERE = import.meta.dirname, STUDIO = resolve(HERE, "..", ".."), PROTO = dirname(STUDIO), PRODUCT = join(PROTO, "..", "product");
const arg = process.argv[2];
if (!arg) { console.error("usage: node walk.mjs <j_6 | 6 | path/to/journey.ts> [out-dir]"); process.exit(2); }
const file = /^\d+$/.test(arg) ? join(HERE, `j_${arg}.ts`) : /^j_\d+$/.test(arg) ? join(HERE, `${arg}.ts`) : resolve(arg);
if (!existsSync(file)) { console.error(`walk: no journey file ${file}`); process.exit(2); }
const id = basename(file, ".ts"), OUT = resolve(process.argv[3] ?? join(STUDIO, "var", "walks", id));
// Only an empty folder or an earlier walk's is cleared (review of #2133, M3: "walk.mjs j_6 ." must never empty a folder).
if (existsSync(OUT) && readdirSync(OUT).length && !existsSync(join(OUT, "walk.json"))) { console.error(`walk: ${OUT} is not empty and holds no earlier walk (walk.json); give a new or empty folder`); process.exit(2); }
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

/** The header's copy line: "zsh studio/tools/isolated.sh <name> <port> start [--ttl n] [KEY=VALUE ...] && trap ...". */
function copyOf(text) {
  const head = text.split(/\r?\n/).filter((l) => l.startsWith("//")).join("\n");
  const m = head.match(/isolated\.sh\s+([a-z0-9_]+)\s+(\d+)\s+start((?:\s+(?:--ttl\s+\d+|[A-Z][A-Z0-9_]*=\S+))*)\s*&&/);
  return m ? { name: m[1], port: m[2], extra: m[3].trim().split(/\s+/).filter(Boolean) } : null;
}
const text = readFileSync(file, "utf8"), copy = copyOf(text);
// A journey of this folder must say how its copy starts; only a file elsewhere (the fixtures) may run with none.
if (!copy && dirname(file) === HERE) { console.error(`walk: ${basename(file)} has no isolated.sh start line in its header that walk.mjs can read`); process.exit(2); }
if (copy?.port === "4400") { console.error("walk: port 4400 is the demo; never walked there"); process.exit(2); }
const t0 = Date.now(), log = [];
const say = (s) => { console.log(s); log.push(`${s}\n`); };
const iso = (what, extra = []) => spawnSync("zsh", [join(STUDIO, "tools", "isolated.sh"), copy.name, copy.port, what, ...extra], { cwd: STUDIO, encoding: "utf8", timeout: 300_000 });
let exit = 0, tried = false;
try {
  if (copy) {
    tried = true;
    const up = iso("start", copy.extra);
    say(`copy ${copy.name} on :${copy.port} start ${copy.extra.join(" ")}: exit ${up.status}`);
    if (up.status !== 0) { say((up.stdout + up.stderr).trim().split("\n").slice(-5).join("\n")); exit = 3; throw new Error("copy did not start"); }
  }
  // tsx on PATH, as for a person running the header's "tsx ..." line (j_6 starts PF-6b's check by that name).
  const env = { ...process.env, PATH: `${join(STUDIO, "node_modules", ".bin")}:${process.env.PATH}`, WALK_OUT: OUT, WALK_BOARD: /\bchromium\b/.test(text) ? "0" : "1" };
  const args = ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), "--import", join(HERE, "record.ts"), file, ...(copy ? [copy.name, copy.port] : [])];
  // Streamed (the Actions log shows each step as it happens); at 40 min a TERM, which record.ts answers by saving the
  // recording first, then a KILL 2 min later.
  const r = await new Promise((res) => {
    const c = spawn(join(STUDIO, "node_modules", ".bin", "tsx"), args, { cwd: PROTO, env, stdio: ["ignore", "pipe", "pipe"] });
    let late = null;
    const term = setTimeout(() => { say("walk: 40 min limit; stopping the journey"); c.kill("SIGTERM"); late = setTimeout(() => c.kill("SIGKILL"), 120_000); }, 40 * 60_000);
    c.stdout.on("data", (d) => { process.stdout.write(d); log.push(String(d)); });
    c.stderr.on("data", (d) => { process.stderr.write(d); log.push(String(d)); });
    c.on("error", (e) => { clearTimeout(term); res({ status: 127, error: e }); });
    c.on("close", (code, sig) => { clearTimeout(term); clearTimeout(late); res({ status: code ?? (sig === "SIGKILL" ? 137 : 124) }); });
  });
  exit = r.status;
  say(`journey ${id}: exit ${exit}${r.error ? ` (${r.error.message})` : ""}`);
} catch (e) {
  if (exit === 0) exit = 3;
  say(`walk: ${e.message}`);
} finally {
  if (tried) say(`copy ${copy.name} stop: exit ${iso("stop").status}`);
}

// Screenshots the journey saved itself (product/screens/*/screenshots), newer than this walk's start.
const own = join(OUT, "journey-shots");
for (const d of existsSync(join(PRODUCT, "screens")) ? readdirSync(join(PRODUCT, "screens")) : []) {
  const dir = join(PRODUCT, "screens", d, "screenshots");
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f.endsWith(".png") && statSync(join(dir, f)).mtimeMs >= t0) { mkdirSync(own, { recursive: true }); copyFileSync(join(dir, f), join(own, `${d}-${f}`)); }
}
const lines = log.join("").split("\n"), count = (w) => lines.filter((l) => l.startsWith(`${w} `)).length;
const list = (d) => (existsSync(join(OUT, d)) ? readdirSync(join(OUT, d)).sort() : []);
const verdict = {
  journey: id, file: relative(PROTO, file), sha: process.env.WALK_SHA || spawnSync("git", ["rev-parse", "HEAD"], { cwd: STUDIO, encoding: "utf8" }).stdout.trim(),
  exit, pass: count("PASS"), fail: count("FAIL"), held: count("HELD"), seconds: Math.round((Date.now() - t0) / 1000),
  failed: lines.filter((l) => l.startsWith("FAIL ")).map((l) => l.slice(0, 400)),
  video: list("video"), traces: readdirSync(OUT).filter((f) => /^trace-\d+\.zip$/.test(f)).sort(), steps: list("steps").length, journeyShots: list("journey-shots").length,
};
writeFileSync(join(OUT, "walk.json"), JSON.stringify(verdict, null, 2) + "\n");
writeFileSync(join(OUT, "walk.log"), log.join(""));
writeFileSync(join(OUT, "README.md"), `# Recorded walk ${id} at ${verdict.sha}

Exit ${exit}: ${verdict.pass} PASS, ${verdict.fail} FAIL, ${verdict.held} HELD. Steps and their screenshots: steps.jsonl and steps/.
* Video: video/*.webm (one per browser context; open in any browser).
* Trace: \`npx playwright show-trace trace-1.zip\` (from prototype/studio), or drop the zip on https://trace.playwright.dev
  (it stays in your browser): every action, the page before and after, console and network.
* Requests the journey made itself: requests.jsonl. Full output: walk.log.
`);
say(`walk ${id}: ${verdict.pass} PASS, ${verdict.fail} FAIL; ${verdict.video.length} video, ${verdict.traces.length} trace, ${verdict.steps} step screenshots → ${OUT}`);
process.exit(exit);
