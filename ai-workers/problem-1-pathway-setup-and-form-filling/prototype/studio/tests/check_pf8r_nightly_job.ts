// PF-8r (Lead 69 on #2014): the restore drill's nightly job runs every night. A dry run of its wiring, no docker, US$0:
// nightly.yml's job restore-drill waits on no other job, its condition is true on the schedule and on a full hand-run
// (false only on a named-capability re-test), it builds the image and runs tests/check_pf8r_restore.ts, and run-suites.sh
// skips that docker-only suite (so no PR or merge-queue part needs docker). Fail cases: the old condition (on the plan
// job's output) and a `needs` line are both refused by the same reading.
//   tsx studio/tests/check_pf8r_nightly_job.ts
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const root = join(import.meta.dirname, "..", "..", "..", "..", "..");
const nightly = readFileSync(join(root, ".github", "workflows", "nightly.yml"), "utf8");
const runSuites = join(root, "ai-workers", "problem-1-pathway-setup-and-form-filling", "product", "tools", "run-suites.sh");

/** The job's own lines: from `  restore-drill:` to the next job at two spaces' indent. */
const jobOf = (yml: string) => yml.match(/^  restore-drill:\n((?: {4,}.*\n|\s*\n)*)/m)?.[1] ?? "";
type Ctx = Record<string, string>;
/** Evaluates the job's `if` for one run: only `a == 'x'` terms joined by `||` are understood; anything else (another
 *  job's output, a function, &&) is "unknown", never guessed. */
function runsOn(job: string, ctx: Ctx): boolean | "unknown" | "waits on another job" {
  if (/^ {4}needs:/m.test(job)) return "waits on another job";
  const expr = job.match(/^ {4}if: \$\{\{ (.*) \}\}$/m)?.[1];
  if (expr === undefined) return true;
  const terms = expr.split(" || ").map((t) => t.match(/^([a-z_.]+) == '([^']*)'$/));
  if (terms.some((t) => !t || !(t[1] in ctx))) return "unknown";
  return terms.some((t) => ctx[t![1]] === t![2]);
}
const SCHEDULE: Ctx = { "github.event_name": "schedule", "github.event.inputs.capabilities": "" };
const BY_HAND_FULL: Ctx = { "github.event_name": "workflow_dispatch", "github.event.inputs.capabilities": "" };
const RETEST: Ctx = { "github.event_name": "workflow_dispatch", "github.event.inputs.capabilities": "C7.3" };

const job = jobOf(nightly);
ok("PF-8r nightly: nightly.yml is scheduled every night and has the job restore-drill", /^ {4}- cron: "23 20 \* \* \*"$/m.test(nightly) && job.length > 0);
ok("PF-8r nightly pass: the job waits on no other job and runs on the schedule (every night) and on a full hand-run",
  runsOn(job, SCHEDULE) === true && runsOn(job, BY_HAND_FULL) === true, { schedule: runsOn(job, SCHEDULE), byHand: runsOn(job, BY_HAND_FULL) });
ok("PF-8r nightly: a named-capability re-test does not run the drill (it runs the named packs only)", runsOn(job, RETEST) === false);
const old = job.replace(/^ {4}if: .*$/m, "    needs: plan\n    if: ${{ needs.plan.outputs.caps == '[]' }}");
ok("PF-8r nightly fail: the earlier wiring (needs plan, the plan job's output) is refused by the same reading", runsOn(old, SCHEDULE) === "waits on another job"
  && runsOn(old.replace(/^ {4}needs: plan\n/m, ""), SCHEDULE) === "unknown", { needs: runsOn(old, SCHEDULE), output: runsOn(old.replace(/^ {4}needs: plan\n/m, ""), SCHEDULE) });
ok("PF-8r nightly: the job builds the image, runs the drill's test, fails red with it and keeps the evidence as the run's artefact",
  /docker compose -f "\$S\/deploy\/compose\.test\.yml" build/.test(job) && /tests\/check_pf8r_restore\.ts \| tee drill\.txt/.test(job) && /exit "\$st"/.test(job)
  && /if: always\(\)\n\s+uses: actions\/upload-artifact@v4/.test(job) && /name: restore-drill-evidence/.test(job) && /path: .*\/var\/restore-drill\//.test(job));
const list = spawnSync("bash", [runSuites, "--list"], { encoding: "utf8" });
const listed = (list.stdout ?? "").split("\n");
ok("PF-8r nightly: run-suites.sh skips the docker-only suite (never in a PR, queue or nightly part) and still lists this one",
  list.status === 0 && !listed.includes("check_pf8r_restore.ts") && listed.includes("check_pf8r_nightly_job.ts") && /^SKIP=".*\bcheck_pf8r_restore\.ts\b.*"$/m.test(readFileSync(runSuites, "utf8")),
  { status: list.status, restore: listed.includes("check_pf8r_restore.ts"), self: listed.includes("check_pf8r_nightly_job.ts") });

process.exit(summary() ? 1 : 0);
