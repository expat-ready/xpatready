// qa, QA-452 (R1.13; the fix lands in PF-14's worker, R1.9's code): PF-23 left three hooks for PF-14's real job worker
// and nothing on main connects them. Fails today, passes when wired:
//   1. /api/health/ready counts the job queue (PF-23 Done when (4): "ready (database and job queue)"): something must
//      provide JOB_QUEUE_PROBE, else ready says "No job queue on this copy yet (PF-14 adds it); not counted" (ok: null);
//   2. every job handler is wrapped by PF-23's observeJob (one job line and its metrics per run; observability/jobs.ts
//      says "PF-14's worker wraps every handler with it");
//   3. the stuck-job alarm (alerts.ts stuckJobs, SA8-D40) is fed from the real queue by some caller.
// Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qagate 4474 start --ttl 20 && trap 'zsh studio/tools/isolated.sh qagate 4474 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa452_jobs_observed.ts 4474
// Without a port it runs the code checks (2, 3, and the provider half of 1) only. US$0.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..", "api", "src"), PORT = process.argv[2] ? Number(process.argv[2]) : null;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");   // comments never count (review M1, m1)
const all = files(SRC).map((p) => ({ p: p.slice(SRC.length + 1), t: code(readFileSync(p, "utf8")) }));
// A use, not a name: a call, or a provider entry for the token (review M1).
const users = (use: RegExp, except: string) => all.filter((f) => f.p !== except && use.test(f.t)).map((f) => f.p);

const probe = users(/provide\s*:\s*JOB_QUEUE_PROBE\b/, "platform/observability/health.ts");
check("QA-452 (1): a module provides JOB_QUEUE_PROBE for /api/health/ready", probe.length > 0, probe.join(", ") || "only health.ts names it");
const wrapped = users(/\bobserveJob\s*\(/, "platform/observability/jobs.ts");
check("QA-452 (2): PF-14's worker wraps job handlers with PF-23's observeJob", wrapped.some((p) => p.startsWith("platform/jobs/")), wrapped.join(", ") || "no caller");
const stuck = users(/\bstuckJobs\s*\(/, "platform/observability/alerts.ts");
check("QA-452 (3): the stuck-job alarm is fed from the real queue", stuck.length > 0, stuck.join(", ") || "no caller");
if (PORT) {
  const r = await fetch(`http://localhost:${PORT}/api/health/ready`), body = await r.json() as { checks?: { job_queue?: { ok: boolean | null; words: string } } };
  const q = body.checks?.job_queue;
  check("QA-452 (1): ready counts the job queue on a running copy (job_queue.ok is true, not null)", r.status === 200 && q?.ok === true, `${r.status} ${JSON.stringify(q)}`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
