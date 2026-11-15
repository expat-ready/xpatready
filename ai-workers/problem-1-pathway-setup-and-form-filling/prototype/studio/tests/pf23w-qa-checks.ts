// PF-23w DW5 and DW6: qa's own checks for QA-452 and QA-453, run as child processes. A helper of
// check_pf23w_jobs_wired.ts, kept apart on purpose: it names each qa file by its full path and lists no folder, so
// select-suites.mjs ties the suite to these two files only, never to every file under tests/qa (qa's records PRs with
// scripts stay "records"; check-gate-b.mjs QA-366 Major 1). Not a suite (no check_ prefix).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, "..");
export const QA_CHECKS = [
  { name: "PF-23w DW5: qa's check_qa452_jobs_observed.ts passes", path: "tests/qa/check_qa452_jobs_observed.ts", tag: "qa452", pattern: /^[1-9]\d* passed, 0 failed$/m },
  { name: "PF-23w DW6: qa's check_qa453_real_jobport.ts passes 2/2", path: "tests/qa/check_qa453_real_jobport.ts", tag: "qa453", pattern: /^2 passed, 0 failed$/m },
] as const;

/** Runs one of qa's checks with this process's tsx arguments, from the folder the suite was started in (tsx's --tsconfig
 *  path is relative to it); null when the file is not on this checkout (qa's #1789 not merged). */
export function runQaCheck(path: string): { status: number | null; out: string } | null {
  const p = join(STUDIO, path);
  if (!existsSync(p)) return null;
  const r = spawnSync(process.execPath, [...process.execArgv, p], { encoding: "utf8", cwd: process.cwd() });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}
