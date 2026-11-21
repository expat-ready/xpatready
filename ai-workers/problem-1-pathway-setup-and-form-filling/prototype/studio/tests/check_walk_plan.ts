// A274, QA-702, QA-698: walks.yml on a pull request walks only the journeys the PR touches (their files or what they
// import) plus those its "Completes: R1.n" line names; the 20 cap stays for dispatches; zero journeys skips the walk
// job with a reason. Checks tools/walk-plan.mjs's self-test (a made-up tree), the real tree (more than 20 journeys: a PR
// changing one journey walks that one, never "journeys: at most 20"), and walks.yml's shape. No server; US$0.
// Run from prototype/:
//   tsx studio/tests/check_walk_plan.ts
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { walkPlan, CAP } from "../tools/walk-plan.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const J = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/journeys";
const TOOL = join(import.meta.dirname, "..", "tools", "walk-plan.mjs");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

const st = spawnSync("node", [TOOL, "selftest"], { encoding: "utf8" });
ok("W1 walk-plan.mjs selftest (T1-T9: imports followed, Completes read, machinery walks the fixtures only, no PR cap, dispatch cap and input checks) exits 0", st.status === 0 && /T1-T9 hold/.test(st.stdout), st.stdout + st.stderr);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
