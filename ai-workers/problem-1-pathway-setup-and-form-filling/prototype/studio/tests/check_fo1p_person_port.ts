// FO-1p (Lead B's brief lead-b-briefs/FO-1p.md; P-607; P-606 (8)): FoPersonPort, the case side's way to a front-office
// person or company for a case client. Its shared contract (ports/contracts/fo-person-port.contract.ts, DW1-DW6) runs
// against the fake and against the real adapter (api/src/front-office/people/fo-person-port.ts) as the API runs it: the
// app role xr_app under the firm walls, on one scratch database dropped at the end; a broken adapter (one that links by
// email, one that opens its own transaction) fails it. Plus: FO-9a's match finds the DW2 pair, the prospect stays
// share-locked to the caller's commit, a transaction walled to another firm is "not found", a forced audit failure leaves
// no person, the audit line's actor type is the database's, the API binds FO_PERSON_PORT, the port guard passes and
// ports/ imports only zod and its own folder. US$0, no model call.
//   tsx studio/tests/check_fo1p_person_port.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { foPersonPortContract, type FoPersonHarness } from "../ports/contracts/fo-person-port.contract.ts";
import { FO_PERSON_ACTION, FO_PERSON_PORT, FoPersonNotFound, NO_FRONT_OFFICE, fakeFoPerson, type FoPersonPort } from "../ports/fo-person.ts";
import { Duplicates } from "../api/src/front-office/duplicates/service.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { PrismaFoPerson, foPersonPort } from "../api/src/front-office/people/fo-person-port.ts";
import { oneQueryPerCaller, walledPool, withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo1p_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const ACTIONS: string[] = Object.values(FO_PERSON_ACTION);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();

// ------------------------------------------------------------------------------------------------------- the fake
const FIRM_A = "00000000-0000-4000-8000-0000000f0001", FIRM_B = "00000000-0000-4000-8000-0000000f0002";
/** The fake's harness; `wrap` turns the fake into a broken adapter (its seeded emails are handed to it). */
const fakeHarness = (wrap: (p: FoPersonPort<unknown>, emails: Map<string, string>) => FoPersonPort<unknown> = (p) => p): FoPersonHarness => {
  const audit = fakeAudit(), f = fakeFoPerson({ audit }), emails = new Map<string, string>();
  f.addSetup(FIRM_A); f.addSetup(FIRM_B);
  return {
    port: wrap(f, emails), firmId: FIRM_A, otherFirmId: FIRM_B, actor: "staff:00000000-0000-4000-8000-0000000f0101",
    tx: (fn) => f.transaction(fn),
    async firmWithoutSetup() { return randomUUID(); },
    async firmThatLeft() { const id = randomUUID(); f.closeFirm(id); return id; },
    async seedPerson(firmId, email) { const id = f.seedPerson(firmId, { givenNames: "Seeded", email }); emails.set(email, id); return id; },
    async seedProspect(firmId, type) { return f.seedProspect(firmId, type); },
    async readPerson(id) { const p = f.person(id); return p && { firmId: p.firmId, givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone: p.phone, phoneReadable: p.phoneReadable, createdBy: p.createdBy }; },
    async readCompany(id) { const c = f.company(id); return c && { firmId: c.firmId, operatingName: c.operatingName, createdBy: c.createdBy }; },
    async counts(firmId) { return f.counts(firmId); },
    async auditLines() { return audit.entries.filter((e) => ACTIONS.includes(e.action)).map((e) => ({ ...e })); },
  };
};
const good = await runContract(foPersonPortContract, "fakeFoPerson", () => fakeHarness(), ok);
// Fail: an adapter that reuses a same-email person (an automatic link, BR-2) breaks DW2 only; one that opens its own
// transaction (commits when the caller rolls back) breaks the rollback case only.
const linksByEmail = await runContract(foPersonPortContract, "linksByEmail", () => fakeHarness((p, emails) => ({
  ...p, ensureForClient: async (tx, a) => { const hit = a.email ? emails.get(a.email.trim().toLowerCase()) : undefined; return hit ? { foPersonId: hit } : p.ensureForClient(tx, a); },
})), null);
const ownTx = await runContract(foPersonPortContract, "ownTransaction", () => fakeHarness((p) => ({
  ensureForClient: (_tx, a) => p.ensureForClient({}, a), ensureCompanyForClient: (_tx, a) => p.ensureCompanyForClient({}, a),
})), null);
ok("FO-1p DW6 fail: an adapter that links a same-email person fails DW2 alone; one that opens its own transaction fails the rollback case alone",
  good.failed.length === 0 && linksByEmail.failed.length === 1 && /^DW2/.test(linksByEmail.failed[0]) && ownTx.failed.length === 1 && /^DW1 fail/.test(ownTx.failed[0]), { linksByEmail: linksByEmail.failed, ownTx: ownTx.failed });

// ------------------------------------------------------------------------------------------------ the real adapter
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const walled = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_)) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-1p setup: both Sample firms have a front office", fo.failed.length === 0 && fo.missing.length === 0, fo);
  oneQueryPerCaller(walled);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R'`);
  let n = 0;
  const u = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const stage = (f: string, pipe: string, key: string) => `(select id from fo_stage where firm_id = '${f}' and pipeline = '${pipe}' and key = '${key}')`;
  const asApp = <T,>(f: string, fn: () => Promise<T>) => withFirm(f, fn);

  const realHarness = (port: FoPersonPort<unknown> = foPersonPort as FoPersonPort<unknown>): FoPersonHarness => ({
    port, firmId: A, otherFirmId: B, actor: `staff:${staffR}`,
    tx: (fn, f = A) => asApp(f, () => walled.$transaction((t) => fn(t))),
    async firmWithoutSetup() {
      const id = randomUUID();
      sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('${id}', 'fo1p-${id.slice(0, 8)}', 'FO-1p firm (Sample)', 'CA', 'fo1p-${id.slice(0, 8)}@example.com', now())`);
      return id;
    },
    async firmThatLeft() {
      const id = randomUUID();
      sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at) values ('${id}', 'fo1p-left-${id.slice(0, 8)}', 'FO-1p firm that left (Sample)', 'CA', 'fo1p-left-${id.slice(0, 8)}@example.com', 'DELETED', now())`);
      return id;
    },
    async seedPerson(f, email) { const id = u(); sql(`insert into fo_person (id, firm_id, given_names, email, created_by, updated_at) values ('${id}', '${f}', 'Seeded', '${email}', 'seed:test', now())`); return id; },
    async seedProspect(f, type) {
      // A won prospect as FO-2/FO-2b and Signed offline leave it: an ENGAGED lead, Engage's first move, then the WON move.
      const person = u(), company = u(), lead = u(), id = u(), [col, subject] = type === "INDIVIDUAL" ? ["subject_person_id", person] : ["subject_company_id", company];
      sql(`begin;
        insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values ('${person}', '${f}', 'Client', 'Won', 'seed:test', now());
        ${type === "CORPORATE" ? `insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${company}', '${f}', 'Sample Won Co', 'sample won', 'seed:test', now());
          insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${f}', '${company}', '${person}', 'PRIMARY', 'seed:test');` : ""}
        insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values ('${lead}', '${f}', '${person}', 'MANUAL', 'WEBSITE', 'seed:test', now());
        update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'seed:test' where id = '${lead}';
        insert into fo_prospect (id, firm_id, lead_id, type, stage_id, ${col}, primary_contact_person_id, created_by, updated_at)
          values ('${id}', '${f}', '${lead}', '${type}', ${stage(f, type, "ENGAGED")}, '${subject}', '${person}', 'seed:test', now());
        insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'seed:test' from fo_prospect where id = '${id}';
        update fo_prospect set stage_id = ${stage(f, type, "RETAINER_SIGNED")}, won_via = 'SIGNED_OFFLINE', won_at = now() where id = '${id}';
        insert into fo_stage_move (firm_id, prospect_id, from_stage_id, to_stage_id, cause, by_actor) select firm_id, id, ${stage(f, type, "ENGAGED")}, stage_id, 'SIGNED_OFFLINE', 'seed:test' from fo_prospect where id = '${id}';
        commit;`);
      return { prospectId: id, subjectId: type === "INDIVIDUAL" ? person : company };
    },
    async readPerson(id) { return db.foPerson.findUnique({ where: { id }, select: { firmId: true, givenNames: true, familyName: true, email: true, phone: true, phoneReadable: true, createdBy: true } }); },
    async readCompany(id) { return db.foCompany.findUnique({ where: { id }, select: { firmId: true, operatingName: true, createdBy: true } }); },
    async counts(f) {
      const [p, c, s] = sql(`select (select count(*) from fo_person where firm_id = '${f}') || '|' || (select count(*) from fo_company where firm_id = '${f}') || '|' || (select count(*) from fo_sales_setup where firm_id = '${f}')`).split("|").map(Number);
      return { persons: p, companies: c, setups: s };
    },
    async auditLines() {
      const rows = await db.auditEvent.findMany({ where: { action: { in: ACTIONS } }, orderBy: [{ at: "asc" }, { id: "asc" }], select: { actor: true, action: true, entity: true, entityKey: true, summary: true, detail: true } });
      return rows.map((r) => ({ ...r, entityKey: r.entityKey ?? "", firmId: String((r.detail as { firmId?: string } | null)?.firmId ?? "") }));
    },
  });
  await runContract(foPersonPortContract, "PrismaFoPerson", () => realHarness(), ok);

  // DW2 (review m4): FO-9a's match finds both persons of the pair by email (its definer function, as the owner may name
  // the firm), and the staff check flags it (a count: neither person has a lead the caller may open, so none is named).
  const h = realHarness(), email = "pair.client@example.com";
  const old = await h.seedPerson(A, email);
  const made = (await h.tx((t) => foPersonPort.ensureForClient(t as never, { firmId: A, actor: h.actor, displayName: "Pair Client", email }))).foPersonId;
  const pair = sql(`select string_agg(id::text, ',' order by id) from fo_sales_person_matches('${A}', '${email}', '{}', '', '${staffR}', true, true, 0.6, 10) where by_email`);
  ok("FO-1p DW2 pass: FO-9a's match finds both persons of the same-email pair, neither linked to the other", pair === [old, made].sort().join(","), { pair, old, made });
  const keys = sql(`select string_agg(distinct p.permission_key, ',') from platform_role_permission p join platform_role_grant g on g.role = p.role where g.staff_id = '${staffR}'`).split(",");
  const R: StaffContext = { staffId: staffR, firmId: A, firmKey: "sample-firm", roles: [], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  const dup = await asApp(A, () => new Duplicates(walled).check(R, { email }));
  ok("FO-1p DW2 pass: the staff duplicate check flags it, as a count (no lead names either person)", dup.hidden === 1 && !dup.matches.some((m) => m.kind === "PERSON"), dup);

  // Review m3: the prospect read is share-locked to the caller's commit, so a Change type (any update of the prospect)
  // waits for it. Control: the same read without the port (no lock) does not hold the update.
  const held = await h.seedProspect(A, "INDIVIDUAL");
  const update = () => spawnSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", `set lock_timeout = '500ms'; update fo_prospect set value_cents = coalesce(value_cents, 0) + 1 where id = '${held.prospectId}'`], { encoding: "utf8" });
  let during = { status: -1 as number | null, stderr: "" };
  await h.tx(async (t) => { await foPersonPort.ensureForClient(t as never, { firmId: A, actor: h.actor, displayName: "Lock", prospectId: held.prospectId }); during = update(); });
  const afterCommit = update();
  let unlocked = { status: -1 as number | null, stderr: "" };
  await h.tx(async (t) => { await (t as PrismaClient).foProspect.findFirst({ where: { firmId: A, id: held.prospectId }, select: { id: true } }); unlocked = update(); });
  ok("FO-1p pass (review m3): while the caller's transaction is open the prospect is share-locked (an update times out at 500 ms); after its commit, and after a plain read, the update runs",
    during.status !== 0 && /lock timeout/i.test(during.stderr) && afterCommit.status === 0 && unlocked.status === 0, { during, afterCommit: afterCommit.status, unlocked });

  // Review m1: a transaction walled to firm A that names firm B sees no front office there: "not found", nothing written.
  const bBefore = await h.counts(B);
  let walledAway = "";
  try { await h.tx((t) => foPersonPort.ensureForClient(t as never, { firmId: B, actor: h.actor, displayName: "Client K" })); walledAway = "made"; } catch (e) { walledAway = e instanceof FoPersonNotFound ? e.message : String(e); }
  ok("FO-1p fail (review m1): firm A's transaction naming firm B is FoPersonNotFound (no front office), and nothing is written in firm B", walledAway === NO_FRONT_OFFICE && JSON.stringify(await h.counts(B)) === JSON.stringify(bBefore), walledAway);

  // Fail-closed: a forced audit failure rolls the new person back (the line is written in the caller's transaction).
  const failing = new PrismaFoPerson({ async record() { throw new Error("forced audit failure"); } });
  const before = Number(sql(`select count(*) from fo_person where firm_id = '${A}'`));
  let refused = false;
  try { await h.tx((t) => failing.ensureForClient(t as never, { firmId: A, actor: h.actor, displayName: "Client Audit" })); } catch (e) { refused = /forced audit failure/.test(String(e)); }
  ok("FO-1p DW1 fail: a forced audit failure refuses the call and leaves no person", refused && Number(sql(`select count(*) from fo_person where firm_id = '${A}'`)) === before);

  // The typed actor reaches the trail as the database types it (AUD-1a's aud_event_actor_type): staff → FIRM_STAFF, system → SYSTEM.
  const sys = await h.tx((t) => foPersonPort.ensureCompanyForClient(t as never, { firmId: A, actor: "system:cs-k1.backfill", name: "Backfilled Co" }));
  ok("FO-1p pass: the audit lines' actor types are FIRM_STAFF for staff:<id> and SYSTEM for system:<door>; the line's firm is firm A",
    sql(`select string_agg(distinct actor_type::text, ',' order by actor_type::text) from audit_event where action in ('${ACTIONS.join("','")}')`) === "FIRM_STAFF,SYSTEM"
    && sql(`select actor || '|' || (detail->>'firmId') from audit_event where entity_key = '${sys.foCompanyId}'`) === `system:cs-k1.backfill|${A}`);
} catch (e) {
  fail++;
  console.log(`FAIL  FO-1p: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await walled.$disconnect(); await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}

// ------------------------------------------------------------------------------------------------- binding and rules
const feature = (await import("../api/src/features/front-office-sales.ts")).default as { providers: unknown[] };
const bound = feature.providers.find((p) => typeof p === "object" && p !== null && (p as { provide?: unknown }).provide === FO_PERSON_PORT) as { useValue?: unknown } | undefined;
ok("FO-1p pass: the API binds FO_PERSON_PORT to the real adapter (api/src/features/front-office-sales.ts)", bound?.useValue === foPersonPort && foPersonPort instanceof PrismaFoPerson && FO_PERSON_PORT === Symbol.for("front-office.FoPersonPort"));
const imports = (f: string) => [...readFileSync(join(STUDIO, f), "utf8").matchAll(/^import\s.*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
const own = (f: string, i: string) => i === "zod" || i.startsWith("./") || (f.startsWith("ports/contracts/") && /^\.\.\/[^./][^/]*\.ts$/.test(i));
const foreign = ["ports/fo-person.ts", "ports/contracts/fo-person-port.contract.ts"].flatMap((f) => imports(f).filter((i) => !own(f, i)).map((i) => `${f}: ${i}`));
ok("FO-1p pass: the port and its contract import only zod and their own folder (case-side contract v0.1 §1 rule 3)", foreign.length === 0, foreign);
const guard = spawnSync(process.execPath, [join(STUDIO, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
ok("FO-1p pass: tools/check-port-contracts.mjs exits 0 and finds FoPersonPort's contract", guard.status === 0 && /FoPersonPort/.test(guard.stdout), guard.stdout.slice(-600));

console.log(`\nFO-1p person port: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
