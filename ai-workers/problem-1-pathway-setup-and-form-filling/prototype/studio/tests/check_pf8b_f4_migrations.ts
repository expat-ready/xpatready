// PF-8b F4 (RDS; R1.13, R1.15): the two edited applied migrations stay what 20261121230000_pf8b_f4_reader_create says they
// are (their sha256, which that migration writes into _prisma_migrations on a database holding the old checksum), and no
// role statement a non-superuser may not run (any SUPERUSER or REPLICATION clause, PostgreSQL 16+) runs unconditionally.
// Pure: reads files only, no database (the RDS-shaped proof is tools/rds-shape-check.sh). US$0.
//   tsx studio/tests/check_pf8b_f4_migrations.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = join(import.meta.dirname, "..", "prisma", "migrations");
const read = (m: string) => readFileSync(join(MIG, m, "migration.sql"), "utf8");
const sha = (m: string) => createHash("sha256").update(readFileSync(join(MIG, m, "migration.sql"))).digest("hex");
let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => { total++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const F4 = read("20261121230000_pf8b_f4_reader_create");
// PF-8b F5 edited pf12 again: its current sha256 is written by 20261122030000_pf8b_f5_grant_loop (the latest writer wins).
const writers: Record<string, string> = { "20261116013000_pf12_firm_walls": "20261122030000_pf8b_f5_grant_loop", "20261118090000_csw1_firm_id": "20261121230000_pf8b_f4_reader_create" };
for (const [m, w] of Object.entries(writers)) {
  const want = new RegExp(`SET checksum = '${sha(m)}'\\s+WHERE migration_name = '${m}' AND finished_at IS NOT NULL AND checksum <> '${sha(m)}'`);
  check(`${m}: its sha256 is the checksum ${w} writes (edit it only with that line)`, want.test(read(w)), sha(m));
}
// An unconditional role statement is a string literal or a plain statement; F4's form builds ALTER from the differing
// attributes, so a literal 'ALTER ROLE … NOSUPERUSER' or 'NOREPLICATION' (the form RDS refused) must not come back.
for (const m of ["20261116013000_pf12_firm_walls", "20261118090000_csw1_firm_id"]) {
  const sql = read(m).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const bad = sql.match(/'(?:ALTER|CREATE) ROLE [^']*\b(?:NO)?(?:SUPERUSER|REPLICATION)\b[^']*'/g) ?? [];
  check(`${m}: no fixed role statement names SUPERUSER or REPLICATION`, bad.length === 0, bad);
}
const pf12 = read("20261116013000_pf12_firm_walls");
check("pf12: the end state is checked for every role (NOSUPERUSER, NOREPLICATION, NOCREATEDB, NOCREATEROLE, login, BYPASSRLS)",
  /IF r\.rolsuper OR r\.rolreplication OR r\.rolcreatedb OR r\.rolcreaterole OR r\.rolcanlogin <> want\.login OR r\.rolbypassrls <> want\.bypass/.test(pf12));
check("pf12: only xr_staff_bypass and xr_wall_reader are BYPASSRLS; xr_app is LOGIN",
  /\('xr_data', false, false\), \('xr_app', true, false\), \('xr_staff_bypass', false, true\),\s+\('xr_wall_reader', false, true\), \('xr_case_lookup', false, false\)/.test(pf12));
check("F4: the reader's CREATE on public is taken back", /REVOKE CREATE ON SCHEMA public FROM xr_wall_reader/.test(F4));

// review M1: on RDS a later migration may hand xr_wall_reader a function only while the reader holds CREATE on its schema;
// every migration after F4 that does so grants it first and takes it back after (the order is checked in the text).
const F4_STAMP = "20261121230000";
const later = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d) && d.slice(0, 14) > F4_STAMP);
const unpairedText = (text: string): boolean => {
  const sql = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const hand = sql.search(/OWNER TO xr_wall_reader/);
  if (hand < 0) return false;
  const grant = sql.search(/GRANT CREATE ON SCHEMA public TO xr_wall_reader/), revoke = sql.lastIndexOf("REVOKE CREATE ON SCHEMA public FROM xr_wall_reader");
  return !(grant >= 0 && grant < hand && revoke > sql.lastIndexOf("OWNER TO xr_wall_reader"));
};
const unpaired = later.filter((d) => unpairedText(read(d)));
check(`every migration after F4 that hands xr_wall_reader a function grants it CREATE on public first and revokes it after (${later.length} later)`, unpaired.length === 0, unpaired);
// the rule itself, on made-up migrations: a bare hand-over and a revoke before it are caught; the pair passes
const hand = "ALTER FUNCTION f() OWNER TO xr_wall_reader;";
check("the pairing rule catches a hand-over without the grant, or with the revoke before it, and passes the pair",
  unpairedText(hand) && unpairedText(`GRANT CREATE ON SCHEMA public TO xr_wall_reader;\nREVOKE CREATE ON SCHEMA public FROM xr_wall_reader;\n${hand}`)
  && !unpairedText(`GRANT CREATE ON SCHEMA public TO xr_wall_reader;\n${hand}\nREVOKE CREATE ON SCHEMA public FROM xr_wall_reader;`) && !unpairedText("SELECT 1;"));

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
