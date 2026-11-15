// qa, QA-453 (R1.9 "Background jobs, schedules, reminders"; the swap lands in FO-3's runtime ports): PF-14's pg-boss
// runner (PlatformJobs, a JobPort) is on main, but no module of the running app uses it. The one module that queues
// jobs today, FO-3's booking (reminders), still gets PF-0p's in-memory fakeJobs "until PF-14's pg-boss adapter"
// (front-office/booking/runtime-ports.ts), so a booking reminder lives in memory and is lost on a restart.
// Fails today, passes when the running app's job users take PF-14's JobPort. Code only; no server. US$0.
// Limits (review m2): check 1 refuses any fakeJobs( call left in api/src (tests live outside it); check 2 looks for the
// class PlatformJobs outside platform/jobs (as platform-jobs.ts says modules inject it) or a token bound to it with
// useExisting/useClass.
// Run from prototype/: tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa453_real_jobport.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..", "api", "src");
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
const all = files(SRC).map((p) => ({ p: p.slice(SRC.length + 1), t: readFileSync(p, "utf8") }));
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");   // comments never count (review M1, m1)

const fakeUsers = all.filter((f) => /\bfakeJobs\s*\(/.test(code(f.t))).map((f) => f.p);
check("QA-453: no running-app module queues its jobs on PF-0p's in-memory fakeJobs", fakeUsers.length === 0, fakeUsers.join(", "));
const realUsers = all.filter((f) => (!f.p.startsWith("platform/jobs/") && !f.p.startsWith("features/platform-jobs") && /\bPlatformJobs\b/.test(code(f.t)))
  || /use(Existing|Class)\s*:\s*PlatformJobs\b/.test(code(f.t))).map((f) => f.p);
check("QA-453: some module outside platform/jobs injects PF-14's PlatformJobs (the real JobPort)", realUsers.length > 0, realUsers.join(", ") || "none");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
