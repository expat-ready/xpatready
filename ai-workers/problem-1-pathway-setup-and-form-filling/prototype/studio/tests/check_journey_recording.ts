// P-700 (#224): a recorded gate A walk fails when its journey fails and still leaves its recording. It walks the fixture
// tests/journeys/fixtures/j_0_fails.ts (one PASS, then a deliberate FAIL; no app, no copy) through tests/journeys/walk.mjs
// and checks the exit code, walk.json, the trace and a screenshot per step (and the video where this machine's
// Chromium records one: CI's Playwright Chromium does; a cloud session's pre-installed one records none, even with plain
// Playwright, 18 Nov). Also a crashing journey (R3), process.exit mid-walk (R4), an out-dir that is not a walk's (R5) and a journey with no
// copy line (R6). Then it checks .github/workflows/walks.yml keeps the shape that makes the upload unconditional.
// No server, no database; US$0. Run from prototype/:
//   tsx studio/tests/check_journey_recording.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

// R3 (review of #2133, M1): a journey that crashes (an uncaught Playwright timeout) still keeps its recording.
const walkTo = (fixture: string, dir: string) => spawnSync("node", [join(J, "walk.mjs"), fixture, dir], { encoding: "utf8", timeout: 180_000 });
const read = (dir: string) => existsSync(join(dir, "walk.json")) ? JSON.parse(readFileSync(join(dir, "walk.json"), "utf8")) : null;
const outT = mkdtempSync(join(tmpdir(), "walk-check-t-")), rt = walkTo(join(J, "fixtures", "j_0_throws.ts"), outT), vt = read(outT);
ok("P-700 R3: a crashing journey makes the walk exit 1, and its trace and step screenshot are kept",
  rt.status === 1 && vt?.exit === 1 && vt.pass === 1 && existsSync(join(outT, "trace-1.zip")) && statSync(join(outT, "trace-1.zip")).size > 1000 && vt.steps === 1,
  { status: rt.status, vt, tail: (rt.stdout + rt.stderr).slice(-400) });
// R4 (M2): process.exit(2) mid-walk keeps code 2; nothing after it counts.
const outX = mkdtempSync(join(tmpdir(), "walk-check-x-")), rx = walkTo(join(J, "fixtures", "j_0_exit_mid.ts"), outX), vx = read(outX);
ok("P-700 R4: process.exit(2) mid-walk exits 2, keeps the trace, and no later line counts as a step",
  rx.status === 2 && vx?.exit === 2 && vx.pass === 1 && !/must not be counted/.test(rx.stdout) && existsSync(join(outX, "trace-1.zip")), { status: rx.status, vx });
// R5 (M3): a non-empty folder that holds no earlier walk is never emptied.
const keep = mkdtempSync(join(tmpdir(), "walk-check-k-")); writeFileSync(join(keep, "precious.txt"), "keep me");
const rk = walkTo(join(J, "fixtures", "j_0_fails.ts"), keep);
ok("P-700 R5: an out-dir with other files and no walk.json is refused (exit 2) and left as it was", rk.status === 2 && existsSync(join(keep, "precious.txt")) && readdirSync(keep).length === 1, { status: rk.status, files: readdirSync(keep) });
ok("P-700 R5: an earlier walk's folder is cleared and reused (R1's folder, walked again)", walkTo(join(J, "fixtures", "j_0_fails.ts"), out).status === 1 && read(out)?.fail === 1);
// R6 (review m5): a journey of tests/journeys/ whose header has no start line walk.mjs can read is refused, not run bare.
const bare = join(J, "j_999.ts");   // in the journeys folder (the rule is about it); a leftover from a killed run is removed first
rmSync(bare, { force: true });
try {
  writeFileSync(bare, "// a journey with no copy line\nconsole.log('PASS  J-999 W1: must not run');\n");
  const rb = walkTo(bare, mkdtempSync(join(tmpdir(), "walk-check-b-")));
  ok("P-700 R6: a j_<n>.ts with no readable isolated.sh start line is refused (exit 2) and never run", rb.status === 2 && !/must not run/.test(rb.stdout), { status: rb.status, out: rb.stdout + rb.stderr });
} finally { rmSync(bare, { force: true }); }
for (const d of [out, outT, outX, keep]) rmSync(d, { recursive: true, force: true });

// R2: walks.yml uploads whatever the verdict; only the fixture's walk step may fail without failing its job.
const y = readFileSync(join(ROOT, ".github", "workflows", "walks.yml"), "utf8");
// The matrix, fixtures included, is built by tools/walk-plan.mjs since A274 (tests/check_walk_plan.ts).
const wp = readFileSync(join(import.meta.dirname, "..", "tools", "walk-plan.mjs"), "utf8");
const block = (name: string) => { const i = y.indexOf(`name: ${name}`); return i < 0 ? "" : y.slice(i, y.indexOf("\n      - ", i + 1) > 0 ? y.indexOf("\n      - ", i + 1) : undefined); };
const up = block("upload the recording"), walk = block("walk ${{ matrix.j.name }} on its own copy");
ok("P-700 R2: the upload step runs always (if: always()), uses upload-artifact and is named by journey and head sha",
  /if: always\(\)/.test(up) && /actions\/upload-artifact@v4/.test(up) && /name: walk-\$\{\{ matrix\.j\.name \}\}-\$\{\{ needs\.plan\.outputs\.sha \}\}/.test(up), up);
ok("P-700 R2: the walk step comes before the upload and fails its job except for the fixture and on a push to main (ENF-733: the verdict goes to the merged PR's comment)", walk !== "" && y.indexOf(walk) < y.indexOf(up) && /continue-on-error: \$\{\{ matrix\.j\.expect == 'fail' \|\| github\.event_name == 'push' \}\}/.test(walk), walk);
ok("P-700 R2: continue-on-error appears once (the walk step), the self-test step runs always and fails on either miss, both fixtures are in every matrix walk-plan.mjs builds",
  (y.match(/continue-on-error:/g) ?? []).length === 1 && /if: always\(\) && matrix\.j\.expect == 'fail'/.test(y) && /= failure \] \|\| \{[^}]*exit 1; \}/.test(y) && /-n "\$ART" \] \|\| \{[^}]*exit 1; \}/.test(y) && /for \(const f of \["j_0_fails", "j_0_throws"\]\) matrix\.push\(\{[^\n]*expect: "fail" \}\)/.test(wp) && /walk-plan\.mjs" --event/.test(y));
ok("P-700 R2: the self-test step fails its job unless the fixture's walk failed and its recording was uploaded",
  /steps\.w\.outcome/.test(y) && /steps\.up\.outputs\.artifact-id/.test(y) && /expect: "fail"/.test(wp) && /fail-fast: false/.test(y));
ok("P-700 R2: the app starts only through the journey's isolated.sh line (walk.mjs), never :4400 or a second way",
  !/start\.sh|:4400|npm run (dev|start)/.test(y.replace(/^#.*$/gm, "")) && /isolated\.sh/.test(readFileSync(join(J, "walk.mjs"), "utf8")));
ok("P-700 R2: never on a draft or a mergify/* batch (Lead 81, m9); a PR made ready is walked (a push to main: ENF-733, check_walk_plan.ts W11)",
  /if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'push' \|\| \(!github\.event\.pull_request\.draft && !startsWith\(github\.event\.pull_request\.head\.ref, 'mergify\/'\)\) \}\}/.test(y) && /types: \[[^\]]*ready_for_review/.test(y));
ok("P-700 R2: no npm or actions cache (a dispatch on any ref must not write a cache the default branch reads; CodeQL, #2133)",
  !/^\s*(cache|cache-dependency-path):|actions\/cache@/m.test(y.replace(/^\s*#.*$/gm, "")));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
