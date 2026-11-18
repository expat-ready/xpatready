// P-700 (#224): a recorded gate A walk fails when its journey fails and still leaves its recording. It walks the fixture
// tests/journeys/fixtures/j_0_fails.ts (one PASS, then a deliberate FAIL; no app, no copy) through tests/journeys/walk.mjs
// and checks the exit code, walk.json, the trace and a screenshot per step (and the video where this machine's
// Chromium records one: CI's Playwright Chromium does; a cloud session's pre-installed one records none, even with plain
// Playwright, 18 Nov). Then it checks .github/workflows/walks.yml keeps the shape that makes the upload unconditional.
// No server, no database; US$0. Run from prototype/:
//   tsx studio/tests/check_journey_recording.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const J = join(import.meta.dirname, "journeys"), ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// R1: the failing fixture's walk fails and keeps its recording.
const out = mkdtempSync(join(tmpdir(), "walk-check-"));
const r = spawnSync("node", [join(J, "walk.mjs"), join(J, "fixtures", "j_0_fails.ts"), out], { encoding: "utf8", timeout: 180_000 });
ok("P-700 R1: a failing journey makes the walk exit non-zero (1, the journey's own code)", r.status === 1, { status: r.status, tail: (r.stdout + r.stderr).slice(-600) });
const v = existsSync(join(out, "walk.json")) ? JSON.parse(readFileSync(join(out, "walk.json"), "utf8")) : null;
ok("P-700 R1: walk.json records the verdict (exit 1, 1 PASS, 1 FAIL, the failed step named)", v?.exit === 1 && v.pass === 1 && v.fail === 1 && /J-0 W2/.test(v.failed?.[0] ?? ""), v);
const trace = join(out, "trace-1.zip");
ok("P-700 R1: the trace is kept (trace-1.zip, not empty)", existsSync(trace) && statSync(trace).size > 1000, v?.traces);
const steps = existsSync(join(out, "steps")) ? readdirSync(join(out, "steps")) : [];
ok("P-700 R1: a screenshot per step, the failed one included", steps.length === 2 && steps.some((f) => /^001-pass-/.test(f)) && steps.some((f) => /^002-fail-/.test(f)), steps);
const lines = existsSync(join(out, "steps.jsonl")) ? readFileSync(join(out, "steps.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
ok("P-700 R1: steps.jsonl ties each step to its verdict and screenshot", lines.length === 2 && lines[1].verdict === "FAIL" && lines[1].screenshots.length === 1, lines);
const videos = existsSync(join(out, "video")) ? readdirSync(join(out, "video")).filter((f) => f.endsWith(".webm")) : [];
if (existsSync("/opt/pw-browsers/chromium")) console.log(`note  P-700 R1: video not judged on this machine (pre-installed Chromium records none); ${videos.length} written; CI judges it`);
else ok("P-700 R1: the video is kept (video/*.webm)", videos.length === 1, videos);
ok("P-700 R1: README.md says how to replay the trace", /show-trace/.test(existsSync(join(out, "README.md")) ? readFileSync(join(out, "README.md"), "utf8") : ""));

// R2: walks.yml uploads whatever the verdict; only the fixture's walk step may fail without failing its job.
const y = readFileSync(join(ROOT, ".github", "workflows", "walks.yml"), "utf8");
const block = (name: string) => { const i = y.indexOf(`name: ${name}`); return i < 0 ? "" : y.slice(i, y.indexOf("\n      - ", i + 1) > 0 ? y.indexOf("\n      - ", i + 1) : undefined); };
const up = block("upload the recording"), walk = block("walk ${{ matrix.j.name }} on its own copy");
ok("P-700 R2: the upload step runs always (if: always()), uses upload-artifact and is named by journey and head sha",
  /if: always\(\)/.test(up) && /actions\/upload-artifact@v4/.test(up) && /name: walk-\$\{\{ matrix\.j\.name \}\}-\$\{\{ needs\.plan\.outputs\.sha \}\}/.test(up), up);
ok("P-700 R2: the walk step comes before the upload and fails its job except for the fixture", walk !== "" && y.indexOf(walk) < y.indexOf(up) && /continue-on-error: \$\{\{ matrix\.j\.expect == 'fail' \}\}/.test(walk), walk);
ok("P-700 R2: the self-test step fails its job unless the fixture's walk failed and its recording was uploaded",
  /steps\.w\.outcome/.test(y) && /steps\.up\.outputs\.artifact-id/.test(y) && /expect\\?":\\?"fail/.test(y) && /fail-fast: false/.test(y));
ok("P-700 R2: the app starts only through the journey's isolated.sh line (walk.mjs), never :4400 or a second way",
  !/start\.sh|:4400|npm run (dev|start)/.test(y.replace(/^#.*$/gm, "")) && /isolated\.sh/.test(readFileSync(join(J, "walk.mjs"), "utf8")));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
