// FO-5d part 1 (row FO-5d, Lead B's brief design/briefs/track-b/FO-5d.md; split approved by Lead 4, 22 Nov 15:35 IST;
// AG-5-68 r1-r2, AG05-D2(6), AG05-D4(7)): the signer's decline reason on fo_signer (one migration) and the signing-side
// decline function (api/src/front-office/signing/decline.ts), each rule with a passing and a failing case. Three scratch
// databases: "empty" gets every migration; "demo" gets every migration before FO-5d's, then demo-shaped rows (the Sample
// firms and staff, a declined and a signed signer of FO-6 part 1's tables), then FO-5d's migration and any later one;
// "bare" stops before FO-5d. The migration is measured right after itself, never assumed to be the newest. No server, no
// browser, no network, no model call (US$0). Every value is Sample; no real person. All are dropped at the end.
//   tsx studio/tests/check_fo5d_decline.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditPort } from "../ports/audit.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { DECLINE_REASON_MAX, DeclineReasonInvalid, declineReasonOf, declineSigning, type DeclineResult } from "../api/src/front-office/signing/decline.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261123000000_fo5d_decline_reason";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const EMPTY = `xr_studio_fo5d_empty_${process.pid}`, DEMO = `xr_studio_fo5d_demo_${process.pid}`, BARE = `xr_studio_fo5d_bare_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `fo5d-check-${process.pid}`);
type Tx = Prisma.TransactionClient;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (db: string, args: string[]) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (db: string, q: string) => psql(db, ["-Atc", q]);
const refused = (db: string, q: string, re: RegExp) => { try { sql(db, q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function signingDiff(db: string): string[] {
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, `prisma.${db}.config.ts`);
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(db))} } });\n`);
  const r = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  if (r.status !== 0 && r.status !== 2) throw new Error(`migrate diff: ${r.stdout}${r.stderr}`);
  return `${r.stdout}`.split("\n").filter((l) => /fo_sign|FoSign|decline_reason/.test(l));
}

const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
for (const db of [EMPTY, DEMO, BARE]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", db]); execFileSync(join(BIN, "createdb"), [...PG, db]); }
const dbs: PrismaClient[] = [];
try {
  // ------------------------------------------------------------------------------------------------ the migration
  const before = all.filter((d) => d < NEW);
  ok(`FO-5d: the migration has its own stamp, later than every one before it (newest before it: ${before.at(-1)}) and unique (P-600 (4))`,
    all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && before.at(-1)! >= "20261122020000_fo6_signing_tables", all.slice(-3));
  const code = readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^--.*$/gm, "");
  const created = [...code.matchAll(/CREATE (?:OR REPLACE )?(?:FUNCTION|TRIGGER) (\w+)/g)].map((m) => m[1]);
  ok("FO-5d (P-600 (3)): the one function the migration creates carries the area prefix fo_signing_", created.length === 1 && created[0] === "fo_signing_reason_ok", created);
  ok("FO-5d (P-600 (2)): the migration only adds to fo_signer — one column and one check; no other table, no DROP, UPDATE, DELETE or trigger",
    [...code.matchAll(/ALTER TABLE "(\w+)"/g)].every((m) => m[1] === "fo_signer") && /ADD COLUMN "decline_reason" TEXT;/.test(code)
    && !/\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT INTO|TRIGGER|NOT NULL DEFAULT)\b/i.test(code.replace(/IS NOT NULL/g, "")));

  for (const d of before) psql(BARE, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5d fail: before FO-5d's migration fo_signer has no decline_reason and the schema differs (diff names it)",
    sql(BARE, `select count(*) from information_schema.columns where table_name = 'fo_signer' and column_name = 'decline_reason'`) === "0" && signingDiff(BARE).some((l) => /decline_reason/.test(l)), signingDiff(BARE));
  for (const d of all) psql(EMPTY, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5d pass: every migration applies to an empty database; decline_reason is a nullable text column",
    sql(EMPTY, `select data_type || ':' || is_nullable from information_schema.columns where table_name = 'fo_signer' and column_name = 'decline_reason'`) === "text:YES");
  ok("FO-5d pass: migrate diff from the migrated empty database to the schema names no signing table, type or column", signingDiff(EMPTY).length === 0, signingDiff(EMPTY));
  ok("FO-5d fail: the migration does not apply twice", (() => { try { psql(EMPTY, ["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());

  // The demo copy: the Sample firms and staff, a request with a declined client and one with a signed client, before FO-5d.
  for (const d of before) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  const pre = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) }); dbs.push(pre);
  await seedSampleFirms(pre);
  await pre.$disconnect();
  const [firmA, firmB] = sql(DEMO, `select string_agg(id::text, ',' order by key) from platform_firm`).split(",");
  const staffOf = (f: string) => sql(DEMO, `select id from platform_staff where firm_id = '${f}' order by id limit 1`);
  const repA = staffOf(firmA), repB = staffOf(firmB);
  let n = 100;
  /** A request of firm f with two clients and the firm signer. */
  const envelope = (f = firmA, rep = repA) => {
    const r = u(++n), c1 = u(++n), c2 = u(++n), fs = u(++n);
    sql(DEMO, `insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, expires_at, updated_at)
      values ('${r}', '${f}', 'RETAINER', '${u(++n)}', '${u(++n)}', 1, 'FAKE', 'fake-${r}', '${rep}', now() + interval '14 days', now())`);
    for (const [s, role] of [[c1, "CLIENT"], [c2, "CLIENT"], [fs, "FIRM"]] as const)
      sql(DEMO, `insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, staff_id, link_token_sha256) values ('${s}', '${f}', '${r}', '${role}', ${role === "CLIENT" ? 1 : 2},
        ${role === "CLIENT" ? `'${u(++n)}'` : "null"}, ${role === "FIRM" ? `'${rep}'` : "null"}, '${sha(s)}')`);
    return { r, c1, c2, f: fs };
  };
  const sign = (s: string) => `update fo_signer set consent_text_version = 'esign-consent-v1', consented_at = now(), signed_at = now() where id = '${s}'`;
  const oldDeclined = envelope(), oldSigned = envelope();
  sql(DEMO, `update fo_signer set declined_at = now() where id = '${oldDeclined.c1}'; update fo_signature_request set status = 'DECLINED' where id = '${oldDeclined.r}'`);
  sql(DEMO, sign(oldSigned.c1));
  const rowsOf = `select (select count(*) from platform_firm) || ':' || (select string_agg(id::text, ',' order by id) from platform_staff) || ':' ||
    (select string_agg(id::text || status::text || coalesce(ended_at::text, '-'), ',' order by id) from fo_signature_request) || ':' ||
    (select string_agg(id::text || coalesce(declined_at::text, '-') || coalesce(signed_at::text, '-'), ',' order by id) from fo_signer)`;
  const was = sql(DEMO, rowsOf);
  psql(DEMO, ["-f", join(MIG, NEW, "migration.sql")]);
  ok("FO-5d pass: right after its own migration, a demo-data copy (the Sample firms and staff, a declined and a signed signer) keeps its rows; the declined signer's reason is empty",
    sql(DEMO, rowsOf) === was && sql(DEMO, `select coalesce(decline_reason, 'none') from fo_signer where id = '${oldDeclined.c1}'`) === "none", was);
  for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", join(MIG, d, "migration.sql")]);
  ok("FO-5d pass: migrate diff after every migration on the demo-data copy names no signing table, type or column", signingDiff(DEMO).length === 0, signingDiff(DEMO));

  // ------------------------------------------------------------------------------------------- the database's rules
  ok("FO-5d pass: a reason written together with declined_at is kept", (() => {
    const e = envelope(); sql(DEMO, `update fo_signer set declined_at = now(), decline_reason = ${lit("Found another firm.\nThank you.")} where id = '${e.c1}'`);
    return sql(DEMO, `select decline_reason from fo_signer where id = '${e.c1}'`) === "Found another firm.\nThank you.";
  })());
  ok("FO-5d pass: a decline with no reason keeps none (AG05-D4(7): no forced reason)", (() => {
    const e = envelope(); sql(DEMO, `update fo_signer set declined_at = now() where id = '${e.c1}'`); return sql(DEMO, `select decline_reason is null from fo_signer where id = '${e.c1}'`) === "t";
  })());
  ok("FO-5d fail: a reason without declined_at is refused", (() => { const e = envelope(); return refused(DEMO, `update fo_signer set decline_reason = 'No' where id = '${e.c1}'`, /fo_signer_decline_reason_check/); })());
  ok("FO-5d fail: a signer added with a reason is refused (a reason never comes before the decline)", (() => {
    const e = envelope();
    return refused(DEMO, `insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, link_token_sha256, decline_reason) values (gen_random_uuid(), '${firmA}', '${e.r}', 'CLIENT', 1, gen_random_uuid(), '${sha("x" + e.r)}', 'No')`, /fo_signer_decline_reason_check/);
  })());
  ok("FO-5d fail: a reason, once written, never changes, and is never removed or added later", (() => {
    const a = envelope(); sql(DEMO, `update fo_signer set declined_at = now(), decline_reason = 'Too expensive' where id = '${a.c1}'`);
    const b = envelope(); sql(DEMO, `update fo_signer set declined_at = now() where id = '${b.c1}'`);
    return refused(DEMO, `update fo_signer set decline_reason = 'Changed my mind' where id = '${a.c1}'`, /signed or declined does not change/)
      && refused(DEMO, `update fo_signer set decline_reason = null where id = '${a.c1}'`, /signed or declined does not change/)
      && refused(DEMO, `update fo_signer set decline_reason = 'Late reason' where id = '${b.c1}'`, /signed or declined does not change/)
      && refused(DEMO, `update fo_signer set decline_reason = 'Old one' where id = '${oldDeclined.c1}'`, /does not change|DECLINED request is final/);
  })());
  ok(`FO-5d pass and fail: ${DECLINE_REASON_MAX} characters are kept, ${DECLINE_REASON_MAX + 1} are refused`, (() => {
    const a = envelope(), b = envelope();
    sql(DEMO, `update fo_signer set declined_at = now(), decline_reason = '${"x".repeat(DECLINE_REASON_MAX)}' where id = '${a.c1}'`);
    return refused(DEMO, `update fo_signer set declined_at = now(), decline_reason = '${"x".repeat(DECLINE_REASON_MAX + 1)}' where id = '${b.c1}'`, /decline_reason_check/);
  })());
  ok("FO-5d fail: an untrimmed, empty, blank or invisible-only reason, or one with a control character, is refused (a tab inside is kept)", (() => {
    const bad = ["E' Too expensive'", "E'Too expensive\\n'", "''", "E' \\t '", "E'\\u00a0\\u200b'", "E'Too\\u0007expensive'"];
    const fails = bad.every((v) => { const e = envelope(); return refused(DEMO, `update fo_signer set declined_at = now(), decline_reason = ${v} where id = '${e.c1}'`, /decline_reason_check/); });
    const e = envelope(); sql(DEMO, `update fo_signer set declined_at = now(), decline_reason = E'Fees:\\ttoo high' where id = '${e.c1}'`);
    return fails && sql(DEMO, `select decline_reason = E'Fees:\\ttoo high' from fo_signer where id = '${e.c1}'`) === "t";
  })());

  // ------------------------------------------------------------------------------------------ the decline function
  ok("FO-5d pass: declineReasonOf keeps a trimmed reason and reads nothing, blank or spaces as no reason",
    declineReasonOf("  Too expensive \r\n") === "Too expensive" && declineReasonOf(undefined) === null && declineReasonOf(null) === null && declineReasonOf(" \n\u200b ") === null
    && declineReasonOf("a\r\nb") === "a\nb");
  ok(`FO-5d fail: declineReasonOf refuses ${DECLINE_REASON_MAX + 1} characters, a control character and a value that is not text`,
    [`${"y".repeat(DECLINE_REASON_MAX + 1)}`, "Too\u0007much", 42, { reason: "x" }].every((v) => { try { declineReasonOf(v); return false; } catch (e) { return e instanceof DeclineReasonInvalid; } })
    && declineReasonOf(`  ${"y".repeat(DECLINE_REASON_MAX)}  `)?.length === DECLINE_REASON_MAX);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) }); dbs.push(db);
  const at = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000);   // after every request's sent_at (the times check), whole seconds
  const decline = (signerId: string, reason?: unknown, o: { firmId?: string; audit?: AuditPort<Tx>; via?: "door" | "hook" } = {}) =>
    db.$transaction((tx) => declineSigning(tx, o.audit ?? auditEvent, { firmId: o.firmId ?? firmA, signerId, reason, at, via: o.via ?? "door" }));
  const lines = (r: string) => Number(sql(DEMO, `select count(*) from audit_event where action = 'signing.declined' and entity_key = '${r}'`));
  const state = (e: { r: string; c1: string; c2: string; f: string }) => sql(DEMO, `select (select status::text || ':' || coalesce(ended_at::text, '-') from fo_signature_request where id = '${e.r}') || '|' ||
    (select string_agg(coalesce(declined_at::text, '-') || ':' || coalesce(decline_reason, '-') || ':' || coalesce(signed_at::text, '-'), ',' order by sign_order, id) from fo_signer where request_id = '${e.r}')`);

  {
    const e = envelope(); sql(DEMO, sign(e.c2));   // the other client already signed: that signature stays (AG-5-68 r2)
    const signedAt = sql(DEMO, `select signed_at from fo_signer where id = '${e.c2}'`);
    const r = await decline(e.c1, "  Found another firm. ");
    ok("FO-5d pass (AG-5-68 r1-r2): a decline with a reason → the request DECLINED for all at the given moment, the reason stored trimmed, the signature already given kept, the other signers untouched",
      "declined" in r && r.declined.reason === "Found another firm." && r.declined.requestId === e.r && r.declined.documentKind === "RETAINER"
      && sql(DEMO, `select status || ':' || (ended_at = '${at.toISOString()}') from fo_signature_request where id = '${e.r}'`) === "DECLINED:true"
      && sql(DEMO, `select (declined_at = '${at.toISOString()}') || ':' || decline_reason from fo_signer where id = '${e.c1}'`) === "true:Found another firm."
      && sql(DEMO, `select signed_at::text || ':' || (declined_at is null) from fo_signer where id = '${e.c2}'`) === `${signedAt}:true`
      && sql(DEMO, `select (declined_at is null and signed_at is null) from fo_signer where id = '${e.f}'`) === "t", { r, s: state(e) });
    ok("FO-5d pass: the decline writes exactly one audit line in its transaction (who: the signing door; the reason in after, ids in detail)",
      lines(e.r) === 1 && sql(DEMO, `select actor || ':' || entity || ':' || (detail->>'signerId') || ':' || (detail->>'declineReason_after') from audit_event where action = 'signing.declined' and entity_key = '${e.r}'`)
        === `system:signing-door:fo_signature_request:${e.c1}:Found another firm.`, sql(DEMO, `select detail from audit_event where entity_key = '${e.r}'`));
    ok("FO-5d fail (AG05-D2(6)): after a decline every link is dead: the other client cannot sign or decline, the firm cannot sign, the reason cannot change",
      refused(DEMO, sign(e.f), /DECLINED request is final|is DECLINED and final/) && refused(DEMO, `update fo_signer set declined_at = now() where id = '${e.f}'`, /DECLINED request is final|is DECLINED and final/)
      && refused(DEMO, `update fo_signer set decline_reason = 'other' where id = '${e.c1}'`, /does not change|DECLINED request is final|is DECLINED and final/));
    const again = await decline(e.f, "Me too");
    ok("FO-5d fail: a second decline on the ended request is refused with its state; nothing changes, no second line",
      "refused" in again && again.refused === "ended" && "status" in again && again.status === "DECLINED" && lines(e.r) === 1, again);
  }
  {
    const e = envelope(), was2 = state(e);
    const r = await decline(e.c1, undefined, { via: "hook" });
    ok("FO-5d pass (the adapter's declined event, AG05-D4(7)): a decline with no reason → DECLINED, no reason stored, one line by the webhook",
      "declined" in r && r.declined.reason === null && sql(DEMO, `select status from fo_signature_request where id = '${e.r}'`) === "DECLINED"
      && sql(DEMO, `select decline_reason is null from fo_signer where id = '${e.c1}'`) === "t" && lines(e.r) === 1
      && sql(DEMO, `select actor from audit_event where action = 'signing.declined' and entity_key = '${e.r}'`) === "system:signing-hook", { r, was2 });
  }
  {
    const e = envelope(), was3 = state(e);
    let err: unknown; try { await decline(e.c1, "z".repeat(DECLINE_REASON_MAX + 1)); } catch (x) { err = x; }
    ok(`FO-5d fail: a ${DECLINE_REASON_MAX + 1}-character reason is refused before anything is read or written (the door answers 422)`, err instanceof DeclineReasonInvalid && state(e) === was3 && lines(e.r) === 0, String(err));
    const signedFirst = await (async () => { sql(DEMO, sign(e.c1)); return decline(e.c1, "No"); })();
    ok("FO-5d fail: a signer who signed cannot decline; the request stays live", "refused" in signedFirst && signedFirst.refused === "signed"
      && sql(DEMO, `select status from fo_signature_request where id = '${e.r}'`) === "SENT" && lines(e.r) === 0, signedFirst);
  }
  {
    const e = envelope();
    const other = await decline(e.c1, "No", { firmId: firmB });
    const unknown = await decline(u(999_999), "No");
    ok("FO-5d fail: another firm's signer, or no such signer, is the one `unknown` answer; nothing changes",
      "refused" in other && other.refused === "unknown" && "refused" in unknown && unknown.refused === "unknown" && sql(DEMO, `select status from fo_signature_request where id = '${e.r}'`) === "SENT", { other, unknown });
    const b = envelope(firmB, repB), viaB = await decline(b.c1, "No", { firmId: firmB });
    ok("FO-5d pass: firm B's own signer declines under firm B", "declined" in viaB && sql(DEMO, `select status from fo_signature_request where id = '${b.r}'`) === "DECLINED", viaB);
  }
  {
    const e = envelope(); sql(DEMO, `update fo_signature_request set status = 'CANCELLED', cancel_reason = 'WITHDRAWN' where id = '${e.r}'`);
    const r: DeclineResult = await decline(e.c1, "No");
    ok("FO-5d fail: a withdrawn (CANCELLED) request cannot be declined: refused with its state", "refused" in r && r.refused === "ended" && "status" in r && r.status === "CANCELLED", r);
    const c = envelope(); sql(DEMO, `${sign(c.c1)}; ${sign(c.c2)}; update fo_signature_request set status = 'CLIENT_SIGNED' where id = '${c.r}'`);
    const firm = await decline(c.f, "The firm will not sign");
    ok("FO-5d pass: the firm signer may decline while the clients have signed (any signer, AG-5-68 r2); the clients' signatures stay",
      "declined" in firm && sql(DEMO, `select status from fo_signature_request where id = '${c.r}'`) === "DECLINED"
      && sql(DEMO, `select count(*) from fo_signer where request_id = '${c.r}' and signed_at is not null`) === "2", firm);
  }
  {
    const e = envelope(), was4 = state(e);
    const failing: AuditPort<Tx> = { record: async () => { throw new Error("audit trail down (Sample)"); } };
    let err: unknown; try { await decline(e.c1, "No", { audit: failing }); } catch (x) { err = x; }
    ok("FO-5d fail (fail-closed audit): when the audit line cannot be written the decline rolls back; the request stays live", err instanceof Error && state(e) === was4 && lines(e.r) === 0, String(err));
  }
  ok("FO-5d: a declined request and its signers are still never deleted (FO-6 part 1's insert-only rule unchanged)", ["fo_signature_request", "fo_signer"].every((t) => refused(DEMO, `delete from ${t}`, /signing records are kept/)));
} finally {
  for (const d of dbs) await d.$disconnect().catch(() => undefined);
  for (const db of [EMPTY, DEMO, BARE]) spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", db], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
