// PF-8r (map row 14, first half; NFR5-04 "quarterly restore drill … with recorded evidence"; P-586): runs
// tools/restore-drill.sh four times on deploy/compose.test.yml's pinned PostgreSQL (a pass, then its three fail cases) and
// checks its evidence file, its log and the runbook (plus DW7, Lead B's condition: a lost index and policy are caught). Needs docker and the image studio-skeleton:test, so run-suites.sh
// skips it (SKIP list) and nightly.yml's job "restore-drill" runs it. Live AI off, no model call (US$0).
//   docker compose -f studio/deploy/compose.test.yml build && tsx studio/tests/check_pf8r_restore.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const studio = join(import.meta.dirname, ".."), product = join(studio, "..", "..", "product");
const out = join(studio, "var", "restore-drill"); mkdirSync(out, { recursive: true });
type Evidence = { restore_seconds: number; main_sha: string; result: string; checks: { check: string; result: string; saw: string }[]; tables: { table: string; source_rows: number; restored_rows: number | null; ids_match: boolean }[] };

function drill(name: string, args: string[]) {
  const evidence = join(out, `${name}.json`), log = join(out, `${name}.log`);
  const t0 = Date.now();
  const r = spawnSync("bash", [join(studio, "tools", "restore-drill.sh"), "--evidence", evidence, ...args], { encoding: "utf8", timeout: 900_000, env: { ...process.env, RESTORE_DRILL_TAG: `${name}-${process.pid}` } });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`; writeFileSync(log, text);
  console.log(`--- ${name} (exit ${r.status}, ${Math.round((Date.now() - t0) / 1000)} s)\n${text.trim().split("\n").map((l) => `    ${l}`).join("\n")}`);
  const ev: Evidence | null = existsSync(evidence) ? JSON.parse(readFileSync(evidence, "utf8")) : null;
  return { status: r.status, text, ev, evidence, log, lines: text.split("\n") };
}
const res = (ev: Evidence | null, check: string) => ev?.checks.find((c) => c.check === check)?.result;

// DW1, DW4: today's main.
const p = drill("dw1-pass", []);
const steps = ["source", "dump", "restore", "migrate status", "migrate diff", "rows", "app and smoke"];
ok("PF-8r DW1 pass: the drill passes on today's main: every check PASS, the audit step SKIP in words, and it writes the evidence file",
  p.status === 0 && !!p.ev && p.ev.result === "pass" && steps.every((s) => res(p.ev, s) === "PASS") && res(p.ev, "audit chain") === "SKIP"
  && p.lines.some((l) => /^SKIP  audit chain: AUD-1c's chain verifier is not on main/.test(l)) && !p.lines.some((l) => l.startsWith("FAIL")),
  { status: p.status, checks: p.ev?.checks.map((c) => `${c.check}=${c.result}`) });
ok("PF-8r DW1 pass: the evidence holds main's sha and every table's counts (platform_*, fo_*, msg_*, module_event and the case tables), each the same in both copies",
  !!p.ev && /^[0-9a-f]{40}$/.test(p.ev.main_sha) && p.ev.tables.length > 20 && p.ev.tables.every((t) => t.ids_match && t.source_rows === t.restored_rows)
  && ["platform_firm", "module_event", "runtime_case", "fo_lead", "msg_outbox"].every((n) => p.ev!.tables.some((t) => t.table === n))
  && (p.ev.tables.find((t) => t.table === "runtime_case")?.source_rows ?? 0) > 0 && (p.ev.tables.find((t) => t.table === "platform_firm")?.source_rows ?? 0) > 0,
  { tables: p.ev?.tables.length, firms: p.ev?.tables.find((t) => t.table === "platform_firm"), cases: p.ev?.tables.find((t) => t.table === "runtime_case") });
const printed = Number(p.text.match(/^restore time: (\d+) s/m)?.[1] ?? NaN);
// Sample bound (the brief): under 5 minutes on GitHub's runner; measured by this run.
ok("PF-8r DW4: the drill finishes in under 5 minutes (Sample bound), and the printed time is the evidence file's",
  Number.isFinite(printed) && printed < 300 && p.ev?.restore_seconds === printed, { printed, evidence: p.ev?.restore_seconds });

// DW2: one table's rows deleted in the restored copy after the restore.
const c = drill("dw2-corrupt", ["--corrupt", "platform_firm"]);
const rowFails = c.lines.filter((l) => /^FAIL  rows /.test(l));
ok("PF-8r DW2 fail: platform_firm's rows deleted in the restored copy after the restore → the count check fails and names the table",
  c.status === 1 && rowFails.length === 1 && /^FAIL  rows platform_firm: count [1-9]\d* in the source, 0 in the restored copy$/.test(rowFails[0])
  && c.lines.some((l) => /^NOTE  corrupt: [1-9]\d* row\(s\) deleted from platform_firm in the restored copy after the restore/.test(l))
  && c.lines.findIndex((l) => l.startsWith("PASS  restore")) < c.lines.findIndex((l) => l.startsWith("NOTE  corrupt")), rowFails);
ok("PF-8r DW2 fail: nothing else is reported as passing for that table (no rows PASS line; its evidence row says the ids differ)",
  !c.lines.some((l) => /^PASS  rows/.test(l)) && c.ev?.result === "fail" && c.ev.tables.find((t) => t.table === "platform_firm")?.ids_match === false
  && c.ev.tables.filter((t) => !t.ids_match).length === 1, c.ev?.tables.filter((t) => !t.ids_match));

// DW3: a schema with one extra migration that was never applied to the restored database.
const m = drill("dw3-extra-migration", ["--extra-migration"]);
ok("PF-8r DW3 fail: the restored database checked against one extra, never-applied migration → migrate status fails and names it",
  m.status === 1 && m.lines.some((l) => /^FAIL  migrate status: .*not applied: 29991231000000_pf8r_drill_never_applied/.test(l)) && res(m.ev, "migrate status") === "FAIL",
  m.lines.filter((l) => l.includes("migrate status")));

// DW7 (Lead B's condition on #2014): the drift check catches a real loss. One index and one firm-wall policy dropped in
// the restored copy after the restore → migrate diff FAILs and names both (prisma sees the index, the catalogue both).
const d = drill("dw7-lost-index-and-policy", ["--drop-index", "platform_staff_identity_subject_key", "--drop-policy", "msg_template.pf12_platform_read"]);
const dl = d.lines.find((l) => l.startsWith("FAIL  migrate diff")) ?? "";
ok("PF-8r DW7 fail: an index and a firm-wall policy dropped in the restored copy after the restore → the drift check fails and names both",
  d.status === 1 && res(d.ev, "migrate diff") === "FAIL" && /prisma: .*CREATE UNIQUE INDEX "platform_staff_identity_subject_key"/.test(dl)
  && /catalogue: .*only in the source: .*platform_staff_identity_subject_key.*policy msg_template pf12_platform_read/.test(dl)
  && d.lines.findIndex((l) => l.startsWith("PASS  restore")) < d.lines.findIndex((l) => l.startsWith("NOTE  drop")), dl.slice(0, 300));

// DW5: no row values in the evidence files or the logs.
const firms = JSON.parse(readFileSync(join(studio, "samples", "firms.json"), "utf8")).firms as { name: string; users: { email?: string; name?: string; given_names?: string; family_name?: string; licence?: { number?: string } | null }[] }[];
const values = [...new Set([...firms.map((f) => f.name), ...firms.flatMap((f) => f.users.flatMap((u) => [u.email, u.name, u.given_names && u.family_name ? `${u.given_names} ${u.family_name}` : undefined, u.licence?.number])), "Sample Drill Client"].filter((v): v is string => !!v && v.length > 5))];
const files = [p, c, m, d].flatMap((r) => [r.evidence, r.log]).filter((f) => existsSync(f));
const hits = files.flatMap((f) => { const t = readFileSync(f, "utf8").toLowerCase(); return values.filter((v) => t.includes(v.toLowerCase())).map((v) => `${f.split("/").pop()}: ${v.replace(/^(.{3}).*/, "$1***")}`); });
ok("PF-8r DW5: the evidence files and the logs hold none of the Sample firms' emails, names or licence numbers, nor the demo case's name",
  files.length === 8 && values.some((v) => v.includes("@")) && hits.length === 0, { files: files.length, values: values.length, hits });

// DW6: the runbook names every step and the evidence file; check-docs.sh passes.
const rb = readFileSync(join(studio, "deploy", "RUNBOOK-restore.md"), "utf8");
const named = ["point in time", "new instance", "migrate status", "migrate diff", "row count", "skeleton-smoke.sh", "audit chain", "switch the service's database secret", "keep the old instance", "release holder", "the founder signs off", "RPO", "RTO", "15 minutes", "4 hours", "restore-drill-evidence.json", "not run yet", "NFR5-04"];
const missing = named.filter((w) => !rb.toLowerCase().includes(w.toLowerCase()));
ok("PF-8r DW6: RUNBOOK-restore.md names every step, who decides, how the RPO and RTO are measured and the evidence file", missing.length === 0, { missing });
const docs = spawnSync("bash", [join(product, "tools", "check-docs.sh")], { encoding: "utf8" });
ok("PF-8r DW6: tools/check-docs.sh passes", docs.status === 0, (docs.stdout ?? "").trim().split("\n").slice(0, 5));

process.exit(summary() ? 1 : 0);
