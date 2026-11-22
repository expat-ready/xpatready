// P-728 (3), P-729 (1): the automatic proof at an item's last merge (.github/workflows/item-proof.yml, tools/item-proof.mjs).
// Fixture PR bodies (tests/fixtures/item-proof/): one that completes R1.77 (detected), one that does not (an example in
// a fence is no claim), one with unreadable lines (refused, never guessed); the plan read from a fixture row (packs from
// its C ids, suites its Done when names, the journey j_<n>.ts, or the J-row SHARED_JOURNEY names: R1.40 -> j_38.ts); a PASS and a FAIL verdict's shape (a missing journey,
// pack or result line is FAIL, P-405); the comment and the founder's page; the secret scan (a planted key is caught, by
// shape and by an env value, never printed); the video size fitting 800 x 800; and the workflow's shape.
// No server, no database; US$0. Run from prototype/:
//   tsx studio/tests/check_item_proof.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect, plan, verdict, comment, page, scan, scanText, packLine, readVerdicts, journeyOf } from "../tools/item-proof.mjs";
import { videoSize } from "./journeys/video-size.ts";

const F = join(import.meta.dirname, "fixtures", "item-proof"), TOOL = join(import.meta.dirname, "..", "tools", "item-proof.mjs");
const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const body = (f: string) => readFileSync(join(F, f), "utf8");

// D: detection from the PR body.
const d1 = detect(body("body-completes.md")), d2 = detect(body("body-none.md")), d3 = detect(body("body-bad.md"));
ok("D1 a body with \"Completes: R1.77\" completes R1.77", JSON.stringify(d1) === JSON.stringify({ items: ["R1.77"], bad: [] }), d1);
ok("D2 a body with no Completes line (only a fenced example) completes nothing", d2.items.length === 0 && d2.bad.length === 0, d2);
ok("D3 a bold list line with two items is read; a line with other words is refused, not guessed", JSON.stringify(d3.items) === '["R1.77","R1.78"]' && d3.bad.length === 1 && /R1\.80/.test(d3.bad[0]), d3);
ok("D4 \"Completes: R1.77 and R1.6.\" reads both, sorted by number", JSON.stringify(detect("Completes: R1.77 and R1.6.").items) === '["R1.6","R1.77"]');
ok("D5 \"Completes: C8.2\" and \"Completes:\" alone are refused", detect("Completes: C8.2").bad.length === 1 && detect("Completes:").bad.length === 1);
const cli = (args: string[], input?: string) => spawnSync("node", [TOOL, ...args], { encoding: "utf8", input });
const c1 = cli(["detect", "--body-file", join(F, "body-completes.md")]), c3 = cli(["detect"], body("body-bad.md"));
ok("D6 the CLI (pr-rules, the detect job): exit 0 and JSON on a good body; exit 1 naming the line on a bad one", c1.status === 0 && JSON.parse(c1.stdout).items[0] === "R1.77" && c3.status === 1 && /R1\.80/.test(c3.stderr), [c1.status, c3.status, c3.stderr]);

// P: the plan from the item's row.
const caps = body("caps.md"), p77 = plan("R1.77", caps), p6 = plan("R1.6", caps), p3 = plan("R1.3", caps), p9 = plan("R1.9", caps);
ok("P1 R1.77: the C8.2 pack, the suite its Done when names, a named file that is not a suite apart, journey j_77.ts", p77.found && JSON.stringify(p77.packs) === '["C8.2"]' && JSON.stringify(p77.suites) === '["check_item_proof.ts"]' && JSON.stringify(p77.suitesMissing) === '["check_not_a_suite.ts"]' && p77.journey === "tests/journeys/j_77.ts", p77);
ok("P2 R1.6: no pack or suite named; its journey j_6.ts exists on this tree", p6.found && !p6.packs.length && !p6.suites.length && p6.journeyExists, p6);
ok("P3 a C id with no acceptance pack is listed as missing", JSON.stringify(p3.packsMissing) === '["C99.99"]', p3);
ok("P4 an item with no row is not found; a bad id throws", !p9.found && (() => { try { plan("C8.2", caps); return false; } catch { return true; } })());
// P5 (QA-570, tech lead 20 Nov): an item proven by another row's journey resolves to that file, never a copy; R1.40 is J-38.
const p40 = JSON.parse(cli(["plan", "R1.40"]).stdout || "{}"), td = mkdtempSync(join(tmpdir(), "ip-")), v40 = cli(["verdict", "--item", "R1.40", "--plan", join(td, "none.json"), "--results", join(td, "none.jsonl"), "--sha", "abc1234", "--pr", "1", "--run-id", "1", "--run-url", "u"]);
ok("P5 R1.40 (calendar invite files) is proven by J-38: plan from qa/CAPABILITIES.md names tests/journeys/j_38.ts, which exists; no j_40.ts is made", p40.found && p40.journey === "tests/journeys/j_38.ts" && p40.journeyExists && !existsSync(join(import.meta.dirname, "journeys", "j_40.ts")) && journeyOf("R1.77") === "tests/journeys/j_77.ts", p40);
ok("P6 a verdict with no plan (set-up failed) for R1.40 still names j_38.ts", JSON.parse(v40.stdout || "{}").suites?.some((s: { name: string }) => s.name === "tests/journeys/j_38.ts"), v40.stdout.slice(0, 300));

// V: verdict shape, PASS and FAIL.
const base = { sha: "a".repeat(40), pr: 2200, runId: 123, runUrl: "https://example.test/run/123", artifactUrl: "https://example.test/art/9", repo: "o/r", at: "2026-11-19T10:00:00Z" };
const p6ok = { ...p6, journeyExists: true };
const vPass = verdict({ item: "R1.6", plan: p6ok, results: [{ kind: "journey", name: p6.journey, exit: 0 }, { kind: "scan", name: "no key", exit: 0 }], ...base });
const keys = ["item", "name", "pr", "sha", "run_id", "run_url", "at", "overall", "why", "suites", "video", "trace", "file", "repo", "note"];
ok("V1 PASS: every key, the video link, no trace, the verdict file named R1.6-<sha>.json", vPass.overall === "PASS" && keys.every((k) => k in vPass) && vPass.video === base.artifactUrl && vPass.trace === null && vPass.file.endsWith("/verdicts/auto/R1.6-" + base.sha + ".json") && vPass.run_id === "123", vPass);
const p77gone = { ...p77, journeyExists: false }; // j_77.ts landed on main 19 Nov (#2263): V2 tests a missing journey, so it says so itself
const vFail = verdict({ item: "R1.77", plan: p77gone, results: [{ kind: "pack", name: "C8.2", exit: 0 }, { kind: "suite", name: "check_item_proof.ts", exit: 1 }], ...base });
const res = (n: string) => vFail.suites.find((s: { name: string }) => s.name === n)?.result;
ok("V2 FAIL: a red suite, a named non-suite and a missing journey each FAIL; the green pack passes; the link is the trace", vFail.overall === "FAIL" && res("C8.2") === "pass" && res("check_item_proof.ts") === "fail" && res("check_not_a_suite.ts") === "fail" && res("tests/journeys/j_77.ts") === "fail" && vFail.video === null && vFail.trace === base.artifactUrl, vFail);
const vNoRun = verdict({ item: "R1.6", plan: p6ok, results: [], ...base });
ok("V3 a planned run with no result line is \"not run\" and FAIL (P-405)", vNoRun.overall === "FAIL" && vNoRun.suites[0].result === "not run");
const vScan = verdict({ item: "R1.6", plan: p6ok, results: [{ kind: "journey", name: p6.journey, exit: 0 }, { kind: "scan", name: "no key", exit: 1 }], ...base });
ok("V4 a secret found in the recording fails the verdict", vScan.overall === "FAIL" && vScan.video === null);
ok("V5 an item with no row fails; never a Works word in the verdict", verdict({ item: "R1.9", plan: p9, results: [], ...base }).overall === "FAIL" && !/"Works"/.test(JSON.stringify(vPass)));

// H: nothing proved is never a pass (review M2, m4): a held or fixture-only pack, a journey that printed FAIL.
const heldOut = "**C8.2**: every pack is held; nothing to run.\n", fixOut = "**C8.2**: green (C8.2.test.ts fixture only).\n", greenOut = "**C8.2**: green (C8.2.test.ts on the six).\n";
ok("H1 works-set's held and fixture-only exits 0 read as not tested; a green run on the six does not", !!packLine("C8.2", 0, heldOut).untested && !!packLine("C8.2", 0, fixOut).untested && !packLine("C8.2", 0, greenOut).untested);
const p77ok = { ...p77, suites: [], suitesMissing: [], journeyExists: true }, jok = { kind: "journey", name: p77.journey, exit: 0 };
const vHeld = verdict({ item: "R1.77", plan: p77ok, results: [packLine("C8.2", 0, heldOut), jok], ...base });
ok("H2 a held pack makes the verdict FAIL, its row \"not tested\" naming the hold", vHeld.overall === "FAIL" && vHeld.suites[0].result === "not tested" && /REGRESSION-HELD/.test(vHeld.suites[0].note ?? ""), vHeld.suites[0]);
ok("H3 the same item with the pack green on the six passes", verdict({ item: "R1.77", plan: p77ok, results: [packLine("C8.2", 0, greenOut), jok], ...base }).overall === "PASS");
ok("H4 a journey that exits 0 but printed a FAIL line fails", verdict({ item: "R1.77", plan: p77ok, results: [packLine("C8.2", 0, greenOut), { ...jok, fail: 1 }], ...base }).overall === "FAIL");

// M: a crashed prove job still gives a verdict and a comment (review M1).
const vc = cli(["verdict", "--item", "R1.77", "--plan", "/nonexistent/plan.json", "--results", "/nonexistent", "--sha", base.sha]);
const vcj = (() => { try { return JSON.parse(vc.stdout); } catch { return null; } })();
ok("M1 no plan file: the verdict CLI still writes a FAIL verdict saying the job ended before its plan", vc.status === 0 && vcj?.overall === "FAIL" && /before its plan/.test(vcj.why.join(" ")), vc.stdout.slice(0, 300));
const md2 = mkdtempSync(join(tmpdir(), "item-proof-bad-"));
writeFileSync(join(md2, `R1.6-${base.sha}.json`), ""); writeFileSync(join(md2, `R1.77-${base.sha}.json`), JSON.stringify(vFail));
ok("M2 an empty verdict file is skipped, the readable one kept", readVerdicts(md2).length === 1 && cli(["page", "--dir", md2]).status === 0);
const cm2 = cli(["comment", "--dir", md2, "--items", "R1.6 R1.77"]);
ok("M3 the comment names an item with no verdict as \"no verdict\"", cm2.status === 0 && /R1\.6 no verdict/.test(cm2.stdout) && /R1\.77 FAIL/.test(cm2.stdout), cm2.stdout.slice(0, 300));

// C, G: the comment and the founder's page.
const cm = comment([vPass, vFail], "Verdict file(s): saved");
ok("C1 one comment names both items, each run, the video and the trace, and says it never marks Works", /R1\.6 PASS, R1\.77 FAIL/.test(cm) && cm.includes(base.runUrl) && /Video of the journey: https:\/\/example\.test\/art\/9/.test(cm) && /Trace and step screenshots/.test(cm) && /never marks Works/.test(cm), cm);
const older = { ...vFail, item: "R1.6", at: "2026-11-18T00:00:00Z" };
const pg = page([older, vPass, vFail], "2026-11-19T11:00Z");
ok("G1 the page lists the proven journey with its video (newest verdict per item wins) and the latest FAIL", /## Passed \(1\)/.test(pg) && /\| R1\.6 .*\[watch\]\(https:\/\/example\.test\/art\/9\)/.test(pg) && /## Latest verdict FAIL \(1\)/.test(pg) && /\| R1\.77 /.test(pg), pg);
const dir = mkdtempSync(join(tmpdir(), "item-proof-"));
writeFileSync(join(dir, `R1.6-${base.sha}.json`), JSON.stringify(vPass)); writeFileSync(join(dir, `R1.77-${base.sha}.json`), JSON.stringify(vFail));
const pr = cli(["page", "--dir", dir]);
ok("G2 the CLI writes README.md in the verdicts folder", pr.status === 0 && existsSync(join(dir, "README.md")) && /\[watch\]/.test(readFileSync(join(dir, "README.md"), "utf8")), pr.stderr);

// S: the secret scan over what would be uploaded.
const w = mkdtempSync(join(tmpdir(), "item-proof-walk-")); mkdirSync(join(w, "steps"));
writeFileSync(join(w, "walk.log"), "PASS  Sample client Client A saved\n"); writeFileSync(join(w, "steps", "001.png"), "sk-ant-api03-" + "x".repeat(40));
ok("S1 a clean recording passes (pictures are not read as text)", scan(w, {}).length === 0);
writeFileSync(join(w, "requests.jsonl"), `{"url":"http://localhost:4436/api?k=sk-ant-api03-${"Q".repeat(40)}"}\n`);
const hits = scan(w, {});
ok("S2 an Anthropic-shaped key in a request log is found, naming the file, never the value", hits.length === 1 && hits[0].file === "requests.jsonl" && !JSON.stringify(hits).includes("QQQQ"), hits);
const planted = "abcd".repeat(4);   // built here, so no secret-shaped literal is in git (the push guard)
ok("S3 the value of a secret-like variable is found; a short or ordinary one is not", scanText(`v=${planted}`, { MY_API_TOKEN: planted }).length === 1 && scanText("x=abc", { A_TOKEN: "abc", HOME: `/root/${planted}` }).length === 0);
const zipOk = spawnSync("zip", ["-q", join(w, "trace-1.zip"), join(w, "requests.jsonl")]).status === 0;
if (zipOk) { spawnSync("rm", [join(w, "requests.jsonl")]); ok("S4 a key inside a trace zip is found", scan(w, {}).some((h) => h.file === "trace-1.zip")); }
else console.log("NOTE  S4 skipped: no zip command on this machine (CI's ubuntu has zip and unzip)");
const sc = cli(["scan", w]);
ok("S5 the CLI exits 1 on a hit", sc.status === 1 && /FAIL  secret check/.test(sc.stdout), sc.stdout);

// R: the video size.
ok("R1 a 1440 x 900 page records an 800 x 500 video; a small one is kept; a tall one fits 800 high", JSON.stringify(videoSize({ width: 1440, height: 900 })) === '{"width":800,"height":500}' && JSON.stringify(videoSize({ width: 640, height: 480 })) === '{"width":640,"height":480}' && videoSize({ width: 390, height: 844 }).height <= 800);
const rec = readFileSync(join(import.meta.dirname, "journeys", "record.ts"), "utf8");
ok("R2 record.ts records every context's video through videoSize", /recordVideo: \{ dir: join\(OUT!, "video"\), size: videoSize\(/.test(rec));

// W: the workflow's shape.
const wf = readFileSync(join(ROOT, ".github", "workflows", "item-proof.yml"), "utf8");
ok("W1 it starts on a push to main (a PR's merge commit, found through the API) and by hand from main with a PR number", /\bpush:\s*\n\s*branches: \[main\]/.test(wf) && /commits\/\$SHA\/pulls/.test(wf) && /merge_commit_sha===process\.argv\[1\]/.test(wf) && /workflow_dispatch:/.test(wf) && /if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}/.test(wf) && !/pull_request_target/.test(wf.replace(/^#.*$/gm, "")));
ok("W2 every checkout is the commit that started the run (no computed ref: CodeQL); prove is read-only, no credentials kept", !/^\s*with:.*\bref:/m.test(wf) && (wf.match(/persist-credentials: false/g) ?? []).length === 3 && /prove:[\s\S]*?permissions: \{ contents: read \}/.test(wf) && !/head\.sha|head\.ref/.test(wf));
ok("W3 packs by works-set --run, suites by run-suites --only, the journey by walk.mjs, the scan before the upload", /works-set\.mjs" --run/.test(wf) && /run-suites\.sh" --demo --only/.test(wf) && /walk\.mjs/.test(wf) && wf.indexOf("item-proof.mjs\" scan") < wf.indexOf("upload-artifact"));
ok("W3b packs go through pack-line; the verdict is written aside under pipefail; the comment step always runs; no report concurrency group", /item-proof\.mjs" pack-line/.test(wf) && /set -o pipefail; mkdir -p "\$RUNNER_TEMP\/verdict"/.test(wf) && /one verdict comment on the merged PR\s*\n\s*if: always\(\)/.test(wf) && !/^\s*concurrency:/m.test(wf));
ok("W4 the recording is kept 90 days, named proof-<item>-<sha>", /name: proof-\$\{\{ matrix\.item \}\}-\$\{\{ needs\.detect\.outputs\.sha \}\}\s*\n\s*path: [^\n]+\n\s*retention-days: 90/.test(wf));
ok("W5 verdicts go to the branch auto-verdicts, never main; one comment; CAPABILITIES.md never written", /BRANCH: auto-verdicts/.test(wf) && !/git[^\n]*\bpush\b[^\n]*\bmain\b/.test(wf.replace(/^#.*$/gm, "")) && (wf.match(/issues\/\$PR\/comments/g) ?? []).length === 1 && !/CAPABILITIES\.md"?\s*$/m.test(wf.replace(/^#.*$/gm, "")));
ok("W6 no secret is read; the PR body reaches the shell only through env", !/secrets\./.test(wf) && !/run:[^\n]*github\.event\.pull_request\.body/.test(wf));
const prr = readFileSync(join(ROOT, ".github", "workflows", "pr-rules.yml"), "utf8");
ok("W7 pr-rules checks the Completes line with item-proof.mjs detect", /item-proof\.mjs detect/.test(prr));


// K: the prove job is never green when it proved nothing (A274, 21 Nov: run 44921268206 showed "prove (R1.4)" success
// while its verdict said FAIL "no J-test file on main" and no suite ran). gate exits 1 on a FAIL verdict, on zero runs
// and on a missing verdict file, and says why.
const kd = mkdtempSync(join(tmpdir(), "item-proof-gate-")), kf = (n: string, v: unknown) => { const f = join(kd, n); writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v)); return f; };
const vR14 = verdict({ item: "R1.4", plan: { ...p6, item: "R1.4", journey: "tests/journeys/j_4.ts", journeyExists: false }, results: [], ...base });
const g1 = cli(["gate", kf("r14.json", vR14)]), g2 = cli(["gate", kf("pass.json", vPass)]);
ok("K1 the 21 Nov R1.4 verdict (FAIL, no J-test file, nothing ran) makes gate exit 1, naming FAIL, the reason and zero runs", g1.status === 1 && /FAIL/.test(g1.stdout) && /no J-test file on main/.test(g1.stdout) && /0 of \d+ planned run/.test(g1.stdout), [g1.status, g1.stdout]);
ok("K2 a PASS verdict with its journey run passes gate (exit 0)", g2.status === 0 && /PASS/.test(g2.stdout), [g2.status, g2.stdout]);
const g3 = cli(["gate", kf("norun.json", { ...vPass, suites: vPass.suites.map((s: object) => ({ ...s, exit: null })) })]);
ok("K3 a verdict marked PASS where no pack, suite or journey has an exit (nothing ran) still fails gate", g3.status === 1 && /nothing ran/.test(g3.stdout), [g3.status, g3.stdout]);
const g4 = cli(["gate", join(kd, "missing.json")]), g5 = cli(["gate", kf("torn.json", "{")]);
ok("K4 a missing or torn verdict file fails gate", g4.status === 1 && g5.status === 1 && /no verdict/.test(g4.stdout + g5.stdout), [g4.status, g5.status, g4.stdout]);
const proveJob = wf.slice(wf.indexOf("\n  prove:"), wf.indexOf("\n  report:"));
const gateAt = proveJob.indexOf('item-proof.mjs" gate'), keepAt = proveJob.indexOf("name: keep the verdict for the report job");
ok("K5 item-proof.yml: the prove job's last step runs gate (if: always(), after the verdict is kept, its why in the summary)",
  gateAt > keepAt && keepAt > 0 && /if: always\(\)\s*\n\s*run: \|[\s\S]*item-proof\.mjs" gate[^\n]*\n[^\n]*GITHUB_STEP_SUMMARY[^\n]*exit "\$st"/.test(proveJob.slice(keepAt)) && proveJob.lastIndexOf("\n      - ") < gateAt, proveJob.slice(keepAt, keepAt + 900));

// Q: a runtime or screens PR whose title names an R1 row and whose body has no Completes line is told (A274; 21 Nov:
// #2814 "runtime: PF-12b part 3 (R1.4)" had none, so item-proof skipped). A warning, exit 0, until the Lead adds --strict.
const claim = (title: string, b: string, strict = false) => cli(["claim", "--title", title, ...(strict ? ["--strict", "on"] : [])], b);
const q1 = claim("runtime: PF-12b part 3 (R1.4) — the three no-firm bypass uses write a firm-less audit line", "Done when: x\n");
ok("Q1 #2814's title with no Completes line prints MISSING: \"Completes: R1.4\" as a warning, exit 0", q1.status === 0 && q1.stdout.includes('MISSING: "Completes: R1.4"') && /::warning/.test(q1.stdout), [q1.status, q1.stdout]);
const q2 = claim("screens: FO-5 (R1 row 42) and R1.13, R1.15 cloud halves", "body\n```\nCompletes: R1.42\n```\n");
ok("Q2 \"(R1 row n)\" and several ids are read; a Completes line inside a fence is no claim", q2.status === 0 && ["R1.13", "R1.15", "R1.42"].every((i) => q2.stdout.includes(`MISSING: "Completes: ${i}"`)), q2.stdout);
const q3 = claim("runtime: PF-12b part 4 (R1.4)", "Completes: R1.4\n"), q4 = claim("qa: capability R1.47 — Works on main", "x\n"), q5 = claim("tooling: item-proof fixes", "x\n");
ok("Q3 a body with a Completes line, a qa PR and a title naming no R1 row print nothing", q3.status === 0 && q4.status === 0 && q5.status === 0 && !/MISSING/.test(q3.stdout + q4.stdout + q5.stdout), [q3.stdout, q4.stdout, q5.stdout]);
const q6 = claim("migration — runtime: PF-15 part 1b (for PF-16, R1.90)", "x\n", true);
ok("Q6 with --strict on (the Lead's switch) the same miss exits 1", q6.status === 1 && q6.stdout.includes('MISSING: "Completes: R1.90"'), [q6.status, q6.stdout]);
ok("Q7 pr-rules runs claim on the title and body as a warning (no --strict yet), the title only through env",
  /TITLE: "\$\{\{ github\.event\.pull_request\.title \}\}"/.test(prr) && /item-proof\.mjs claim --title "\$TITLE"\s*$/m.test(prr) && !/claim[^\n]*--strict/.test(prr));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
