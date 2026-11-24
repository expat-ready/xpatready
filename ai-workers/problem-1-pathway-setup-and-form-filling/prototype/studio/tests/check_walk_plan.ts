// A274, QA-702, QA-698: walks.yml on a pull request walks only the journeys the PR touches (their files or what they
// import) plus those its "Completes: R1.n" line names; the 20 cap stays for dispatches; zero journeys skips the walk
// job with a reason. Checks tools/walk-plan.mjs's self-test (a made-up tree), the real tree (more than 20 journeys: a PR
// changing one journey walks that one, never "journeys: at most 20"), and walks.yml's shape. No server; US$0.
// ENF-733 (P-733, W10-W13): a merge to main walks the merged PR's named journeys (title or Completes) on main's head,
// and walk-report.yml, main's code with the only write token, posts the run id and the PASS/FAIL counts on that PR.
// Run from prototype/:
//   tsx studio/tests/check_walk_plan.ts
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { walkPlan, CAP, APP, importsOf } from "../tools/walk-plan.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const J = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/journeys";
const TOOL = join(import.meta.dirname, "..", "tools", "walk-plan.mjs");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

const st = spawnSync("node", [TOOL, "selftest"], { encoding: "utf8" });
ok("W1 walk-plan.mjs selftest (T1-T9: imports followed, Completes read, machinery walks the fixtures only, no PR cap, dispatch cap and input checks; T10-T15: the push plan and the comment) exits 0", st.status === 0 && /T1-T15 hold/.test(st.stdout), st.stdout + st.stderr);

const real = readdirSync(join(ROOT, J)).filter((f) => /^j_[1-9]\d*\.ts$/.test(f));
const p = walkPlan({ event: "pull_request", jdir: J, changed: [`${J}/j_6.ts`], body: "Done when: x\n", root: ROOT });
ok(`W2 QA-702 on this tree (${real.length} journeys, over ${CAP}): a PR changing j_6.ts walks j_6 and the two fixtures, no refusal`, real.length > CAP && p.matrix.map((m: { name: string }) => m.name).join(" ") === "j_6 j_0_fails j_0_throws", p);
const z = walkPlan({ event: "pull_request", jdir: J, changed: ["somewhere/else/not-read-by-a-journey.txt"], root: ROOT });
ok("W3 a PR touching no journey and nothing one imports: empty matrix, a \"skipped:\" reason", z.matrix.length === 0 && /^skipped: /.test(z.reason), z);
let refused = ""; try { walkPlan({ event: "workflow_dispatch", jdir: J, want: "", root: ROOT }); } catch (e) { refused = (e as Error).message; }
ok("W4 a dispatch of every journey on this tree is still refused at 20", /at most 20/.test(refused), refused);

const y = readFileSync(join(ROOT, ".github", "workflows", "walks.yml"), "utf8"), code = y.replace(/^\s*#.*$/gm, "");
const plan = code.slice(code.indexOf("\n  plan:"), code.indexOf("\n  walk:")), walk = code.slice(code.indexOf("\n  walk:"));
ok("W5 the plan step runs the self-test first, then walk-plan.mjs (no shell copy of the rule, no \"at most 20\" left in the workflow)",
  /walk-plan\.mjs" selftest/.test(plan) && /walk-plan\.mjs" --event "\$EVENT"/.test(plan) && plan.indexOf("selftest") < plan.indexOf('--event "$EVENT"') && !/at most 20/.test(code), plan.slice(0, 1600));
ok("W6 on a pull_request the changed files come from the PR's file list under pipefail (both sides of a rename), the body only through env and a file",
  /pulls\/\$PR\/files/.test(plan) && /previous_filename/.test(plan) && /set -o pipefail/.test(plan) && /BODY: \$\{\{ github\.event\.pull_request\.body \}\}/.test(plan) && /--body-file/.test(plan) && /pull-requests: read/.test(plan) && !/run:[^\n]*github\.event\.pull_request\.body/.test(code));
ok("W7 an empty matrix skips the walk job (the check passes) and the reason goes to the summary",
  /needs: plan\s*\n\s*if: \$\{\{ needs\.plan\.outputs\.matrix != '\[\]' \}\}/.test(walk) && /reason[\s\S]*GITHUB_STEP_SUMMARY/.test(plan));

// Review round 1 (Major): the trigger must start walks for every file a journey reads, or the import rule never runs.
const STUDIO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/";
const paths = [...y.slice(y.indexOf("    paths:"), y.indexOf("permissions:")).matchAll(/^\s*- (\S+)$/gm)].map((m) => m[1]);
const covers = (f: string) => paths.some((g) => g === f || (g.endsWith("/**") && f.startsWith(g.slice(0, -2))));
const read = [...new Set(real.flatMap((f) => [...importsOf(`${J}/${f}`, ROOT)]))], missed = read.filter((f) => !covers(f));
ok(`W8 walks.yml's pull_request paths cover every file the ${real.length} journeys read (${read.length} files): a PR changing any of them starts the plan`, read.length > real.length && !missed.length && covers(`${STUDIO}api/src/front-office/firm-seed.ts`), { paths, missed: missed.slice(0, 5) });

// Lead 17 on #2860: at most 20 on a PR. Past 20, only own-file and Completes journeys walk; the rest are skipped by name
// in a warning; the count never fails the plan. Real tree: tests/runtime/api.ts and front-office/firm-seed.ts reach
// more than 20 journeys through imports; j_6's own file changes; Completes: R1.40 names j_38.
const shared = [`${STUDIO}tests/runtime/api.ts`, `${STUDIO}api/src/front-office/firm-seed.ts`];
const touched = real.filter((f) => [...importsOf(`${J}/${f}`, ROOT)].some((x) => shared.includes(x))).length;
let big: { matrix: { name: string }[]; warn: string } | null = null, bigErr = "";
try { big = walkPlan({ event: "pull_request", jdir: J, changed: [...shared, `${J}/j_6.ts`], body: "Done when: x\nCompletes: R1.40\n", root: ROOT }); } catch (e) { bigErr = (e as Error).message; }
ok(`W9 over 20 on a PR (${touched} journeys reached through two shared files): walks j_6 (own file) and j_38 (Completes: R1.40) only, warns naming the skipped ones, never fails`,
  touched > CAP && !bigErr && big?.matrix.map((m) => m.name).join(" ") === "j_6 j_38 j_0_fails j_0_throws" && /over 20\): walking only the 2 /.test(big.warn) && /skipped \(reached through imports only\): j_\d/.test(big.warn) && !/\bj_6\b|\bj_38\b/.test(big.warn.split("skipped")[1] ?? ""), bigErr || big);

// ENF-733: walks on merge. W10 the push plan on this tree; W11 walks.yml's push shape; W12 walk-report.yml's shape.
const appFile = `${STUDIO}api/src/front-office/firm-seed.ts`, ids = (q: { matrix: { name: string }[] }) => q.matrix.map((m) => m.name).join(" ");
const m1 = walkPlan({ event: "push", jdir: J, title: "runtime: R1.29 — FO-9b part 3", body: "Completes: R1.40\n", changed: [appFile], pr: "3174", sha: "c".repeat(40), root: ROOT });
const m2 = walkPlan({ event: "push", jdir: J, title: "qa: R1.29 re-run on main (25/25)", changed: ["ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/CAPABILITIES.md"], pr: "3516", root: ROOT });
const pathsApp = paths.filter((g) => g !== ".github/workflows/walks.yml").map((g) => g.replace(/\*\*$/, ""));
ok("W10 on this tree a merged PR naming R1.29 (title) and R1.40 (Completes) walks j_29 and j_38 only, no fixtures; a qa-records PR naming R1.29 walks nothing; APP equals walks.yml's paths",
  ids(m1) === "j_29 j_38" && m1.pr === "3174" && m1.matrix[1].items === "R1.40" && m2.matrix.length === 0 && /changes nothing the app/.test(m2.reason) && JSON.stringify(pathsApp) === JSON.stringify(APP), { m1, m2, pathsApp, APP });
const onPush = /\n  push:\s*\n\s*branches: \[main\]/.test(code) && !/\n  push:[\s\S]*?branches: \[(?!main\])/.test(code);
const planIf = (plan.match(/\n    if: (.*)/) ?? [])[1] ?? "";
ok("W11 walks.yml runs on a push to main: the plan finds the merged PR from this commit (commits/$SHA/pulls, merged, merge_commit_sha, base main), reads title and body into files, passes --event push with --pr; the walk checks out this commit; plan and walk.json kept only on a push; no write scope in walks.yml",
  onPush && /github\.event_name == 'push'/.test(planIf) && /commits\/\$SHA\/pulls/.test(plan) && /merge_commit_sha == \\"\$SHA\\"/.test(plan) && /base\.ref == \\"main\\"/.test(plan)
  && /--title-file "\$RUNNER_TEMP\/title\.txt" --pr "\$PRN"/.test(plan) && /echo "pr=\$PRN"/.test(plan) && /pr: \$\{\{ steps\.p\.outputs\.pr \}\}/.test(code)
  && /if: github\.event_name == 'push' && steps\.p\.outputs\.pr != '' && steps\.p\.outputs\.matrix != '\[\]'\s*\n\s*uses: actions\/upload-artifact@v4\s*\n\s*with: \{ name: walk-plan,/.test(plan)
  && /if: always\(\) && github\.event_name == 'push'\s*\n\s*uses: actions\/upload-artifact@v4\s*\n\s*with:\s*\n\s*name: walk-result-\$\{\{ matrix\.j\.name \}\}\s*\n\s*path: \$\{\{ runner\.temp \}\}\/walk\/walk\.json/.test(walk)
  && /- if: github\.event_name != 'pull_request'\s*\n\s*uses: actions\/checkout@v4\s*\n/.test(walk) && !/:\s*write\b/.test(code), { planIf, onPush });
const r = readFileSync(join(ROOT, ".github", "workflows", "walk-report.yml"), "utf8"), rc = r.replace(/^\s*#.*$/gm, "");
ok("W12 walk-report.yml: main's copy on walks' completed runs, only for a push to main of this repository; write scopes on its one job only; main's checkout without the token; artifacts from that run; the PR checked as merged with that commit before one comment",
  /on:\s*\n\s*workflow_run:\s*\n\s*workflows: \[walks\]\s*\n\s*types: \[completed\]/.test(rc) && !/\n  (push|pull_request|pull_request_target|issue_comment|workflow_dispatch):/.test(rc)
  && /\npermissions: \{\}/.test(rc) && /if: \$\{\{ github\.event\.workflow_run\.event == 'push' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.head_repository\.full_name == github\.repository \}\}/.test(rc)
  && /permissions: \{ contents: read, actions: read, pull-requests: write, issues: write \}/.test(rc) && (rc.match(/write/g) ?? []).length === 2
  && /uses: actions\/checkout@v4\s*\n\s*with: \{ persist-credentials: false \}/.test(rc) && !/\bref:/.test(rc) && (rc.match(/run-id: "\$\{\{ github\.event\.workflow_run\.id \}\}"/g) ?? []).length === 2
  && /\[\[ "\$PR" =~ \^\[1-9\]\[0-9\]\{0,6\}\$ \]\]/.test(rc) && /merge_commit_sha == "'"\$SHA"'"/.test(rc) && /\n\s*\[ "\$m" = true \] \|\| \{ [^}\n]*exit 1; \}\n/.test(rc) && rc.indexOf('[ "$m" = true ]') < rc.indexOf("issues/$PR/comments")
  && /walk-plan\.mjs" comment --plan/.test(rc) && !/secrets\./.test(rc) && !/run:[^\n]*\$\{\{/.test(rc) && !/\$\{\{[^}]*(head_branch|display_title|head_commit)[^}]*\}\}/.test(rc.replace(/\n    if: .*/, "")), rc.slice(0, 800));
// W13: the comment walk-report.yml posts, built here from two made-up walk.json files and one missing.
const tmp = mkdtempSync(join(tmpdir(), "walk-report-"));
try {
  mkdirSync(join(tmp, "walk-result-j_29")); writeFileSync(join(tmp, "walk-result-j_29", "walk.json"), JSON.stringify({ exit: 0, pass: 25, fail: 0, held: 0, seconds: 120, failed: [] }));
  const out = spawnSync("node", [TOOL, "comment", "--plan", join(tmp, "plan.json"), "--results", tmp, "--run-id", "45444030492", "--run-url", "https://github.com/o/r/actions/runs/45444030492", "--sha", "c".repeat(40)], { encoding: "utf8", input: "" });
  writeFileSync(join(tmp, "plan.json"), JSON.stringify(m1));
  const c = spawnSync("node", [TOOL, "comment", "--plan", join(tmp, "plan.json"), "--results", tmp, "--run-id", "45444030492", "--run-url", "https://github.com/o/r/actions/runs/45444030492", "--sha", "c".repeat(40)], { encoding: "utf8" });
  ok("W13 walk-plan.mjs comment: no plan exits 3 with nothing printed; with the plan, the headline counts (1 PASS, 1 FAIL of 2), the run id and link, j_29's 25 PASS 0 FAIL, j_38 FAIL (no result)",
    out.status === 3 && out.stdout === "" && c.status === 0 && c.stdout.startsWith("## Walks on merge (ENF-733, P-733): 1 PASS, 1 FAIL of 2 journeys\n") && c.stdout.includes("run [45444030492](https://github.com/o/r/actions/runs/45444030492)")
    && c.stdout.includes("| j_29 | R1.29 (title) | PASS | 25 | 0 | 0 | 0 | 120 |") && c.stdout.includes("| j_38 | R1.40 (Completes) | FAIL (no result) |"), { out: out.status, c: c.stdout + c.stderr });
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
