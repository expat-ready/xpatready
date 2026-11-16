// P-184 (founder, 30 Oct): speed checks are reported, not failed, when the Mac is busy. One helper for every suite with
// a speed budget (STANDARDS §9: first view < 1 s, an in-page change < 200 ms). The budgets never change. When the
// one-minute load is at or below the number of cores, the budget is judged and a miss fails the run as before; above
// it, the step passes as "not judged: machine busy" and prints the time and the load, so nothing is hidden. The busy
// Mac runs CI, the lanes' suites and the lanes themselves at once: r1c missed 5 of 5 at load 8–18 on 8 cores while the
// same views take 58–280 ms when it is quieter (runtime lane, 30 Oct).
const os = require("node:os");

/** The machine now: one-minute load against the core count. GitHub's hosted machines (2 cores, shared) are never judged:
 *  #113's batch missed the 200 ms tab budget at 273 ms on one at load 1.8, so the nightly run on the Mac (self-hosted)
 *  judges the budgets (Lead, 1 Nov; the budgets stay, P-184). */
function machine(env = process.env) {
  const load = os.loadavg()[0], cores = os.cpus().length;
  // CI-RUN (P-648/P-649): an overflow runner (Namespace, vars.CI_SHARD_RUNNER) reports itself to GitHub as self-hosted,
  // but it is a shared hosted CI machine like GitHub's: ci.yml sets CI_HOSTED_RUNNER=1 on the jobs that may run there, so
  // it is treated exactly as github-hosted (run 43941204621: r1c judged there missed at 1237 ms, load 2.3 on 4 cores).
  const hosted = env.RUNNER_ENVIRONMENT === "github-hosted" || env.CI_HOSTED_RUNNER === "1";
  // T1 (P-228 (6)): the nightly full run on GitHub sets SPEED_JUDGE=1 and is judged like the Mac was, when not busy.
  if (hosted && env.SPEED_JUDGE === "1") return { load, cores, busy: load > cores };
  if (hosted) return { load, cores, busy: true, reason: `CI machine (${cores} cores): judged by the nightly run on the Mac` };
  return { load, cores, busy: load > cores };
}

/** A speed step: { label, ok, detail } for the suite's own step()/ok(). within: the measure met its budget; detail: the
 *  measured times. env is for the helper's own check only (check_speed_budget.ts); suites leave it out. */
function speed(label, within, detail, env = machine()) {
  const at = `load ${env.load.toFixed(1)} on ${env.cores} cores`;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  if (env.busy) return { label: `${label} — not judged: ${env.reason ? `${env.reason} (${at})` : `machine busy (${at})`}`, ok: true, detail: `${text} · ${at}` };
  return { label, ok: !!within, detail: `${text} · ${at}` };
}

module.exports = { machine, speed };
