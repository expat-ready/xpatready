// FO-9a, the duplicate result on `prospect.won` (R1.29; case-side contract v0.1 §4 and row "Front office (FO-9a)", F6;
// P-574 (2); BACKLOG rev 14.1: "no DuplicateCheckPort: the duplicate result travels on prospect.won"). Every win carries
// `duplicates`: other records of the firm whose email or E.164 phone equals the subject's, or whose name is similar
// (ports/matching.ts), ids, score and reasons only, never the subject itself; warn only. Each check has a pass and a
// fail, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0, no live AI.
//   tsx studio/tests/check_fo9a_won_duplicates.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { EVENT, ProspectWonPayload, WonDuplicates } from "../ports/events.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { normaliseCompanyName } from "../api/src/front-office/sales/corporate/match.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9aw_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-9a won setup: the Sample firms have their front office", fo.failed.length === 0);

  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key <> 'sample-firm' order by key limit 1`);
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), corp = new Corporate(db, ports);
  clearingConflicts(db, { prospects: Prospects.prototype });   // FO-13c: the conflict check first

  type Added = { id: string; person: { id: string } };
  const lead = (who: StaffContext, given: string, family: string, more: { email?: string; phone?: string } = {}) =>
    leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: family, source: "Phone call", confirmedNew: true, ...more }) as Promise<Added>;
  const winOf = async (prospectId: string) => {
    const ev = await db.moduleEvent.findFirst({ where: { subjectId: prospectId, type: EVENT.PROSPECT_WON } });
    const p = ev ? ProspectWonPayload.safeParse(ev.payload) : null;
    return p?.success ? p.data : null;
  };
  const convert = async (who: StaffContext, l: Added) => { const p = await pros.engage(who, l.id) as { id: string }; await pros.convert(who, p.id, {}); return winOf(p.id); };

  // ------------------------------------------------------------- D1: a person who is already on file under another record
  const lena = await lead(R, "Lena", "Park", { email: "lena.park@example.org", phone: "+1 (416) 555-0101" });
  const lena2 = await lead(R, "Lena", "Parks", { email: "lp.work@example.org", phone: "416.555.0101" });
  const w1 = await convert(R, lena2);
  const m1 = w1?.duplicates?.matches ?? [];
  const toLena = m1.find((m) => m.id === lena.person.id);
  ok("FO-9a won D1 pass: Convert's prospect.won carries the duplicate result: Lena Park (same phone, two spellings; similar name), PERSON, score 100",
    toLena?.kind === "PERSON" && toLena.score === 100 && toLena.reasons.some((r) => r.key === "PHONE") && toLena.reasons.some((r) => r.key === "NAME"), w1?.duplicates);
  ok("FO-9a won D1 fail: the won person is never its own match", w1 !== null && !m1.some((m) => m.id === lena2.person.id), m1);
  ok("FO-9a won D1 pass: ids, score and reasons only: no name, email or phone of the other record travels in the result",
    w1 !== null && !/Park\b|lena\.park|4165550101|"name"/.test(JSON.stringify(w1.duplicates)) && WonDuplicates.safeParse(w1.duplicates).success, w1?.duplicates);

  // ------------------------------------------------------------- D2: someone new carries an empty result, not none
  const ivo = await lead(R, "Ivo", "Zbrlnik", { email: "ivo.z@example.org", phone: "+1 604 555 0199" });
  const w2 = await convert(R, ivo);
  ok("FO-9a won D2 fail: a person who matches no one → duplicates present with an empty list", w2 !== null && Array.isArray(w2.duplicates?.matches) && w2.duplicates!.matches.length === 0, w2?.duplicates);

  // ------------------------------------------------------------- D3: same first name only; the email alone
  const lenaS = await lead(R, "Lena", "Smith", { email: "lena.smith@example.org" });
  const w3 = await convert(R, lenaS);
  ok("FO-9a won D3 fail: the same first name only (Lena Smith) is below the threshold: neither Lena Park nor Lena Parks is offered",
    w3 !== null && !(w3.duplicates?.matches ?? []).some((m) => m.id === lena.person.id || m.id === lena2.person.id), w3?.duplicates);
  const omar = await lead(R, "Omar", "Haddad", { email: "omar.h@example.org" });
  const omar2 = await lead(R, "O.", "H.", { email: "OMAR.H@EXAMPLE.ORG" });
  const w3b = await convert(R, omar2);
  const m3b = (w3b?.duplicates?.matches ?? []).find((m) => m.id === omar.person.id);
  ok("FO-9a won D3 pass: the email whatever its case finds Omar Haddad (EMAIL, score 100)", m3b?.score === 100 && m3b.reasons.some((r) => r.key === "EMAIL"), w3b?.duplicates);

  // ------------------------------------------------------------- D4: an unreadable number matches nothing by phone
  const u1 = await lead(R, "Aki", "Tanaka", { phone: "12" }), u2 = await lead(R, "Bo", "Ström", { phone: "12" });
  const w4 = await convert(R, u2);
  ok("FO-9a won D4 fail: two people who both typed the unreadable \"12\" are not duplicates by phone", w4 !== null && !(w4.duplicates?.matches ?? []).some((m) => m.id === u1.person.id), w4?.duplicates);

  // ------------------------------------------------------------- D5: the firm wall; visibility is the case side's
  sql(`insert into fo_person (firm_id, given_names, family_name, email, phone, phone_readable, created_by, updated_at) values ('${B}', 'Noor', 'Rahman', 'noor.r@example.org', '+14165550177', true, 'test', now())`);
  const noorB = sql(`select id from fo_person where firm_id = '${B}' and email = 'noor.r@example.org'`);
  const noor = await lead(R, "Noor", "Rahman", { email: "noor.r@example.org", phone: "+1 416 555 0177" });
  const w5 = await convert(R, noor);
  ok("FO-9a won D5 fail: firm B's person with the same email and phone is never in firm A's result", w5 !== null && !(w5.duplicates?.matches ?? []).some((m) => m.id === noorB), w5?.duplicates);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const zed = await lead(T, "Zed", "Okafor", { email: "zed.o@example.org" });
  const zed2 = await lead(R, "Zed", "Okafor", { email: "zed.okafor@example.org" });
  const w5b = await convert(R, zed2);
  ok("FO-9a won D5 pass: a record the converting staff member cannot open still counts (a system result for the case side, ids only; the case side applies its own access)",
    (w5b?.duplicates?.matches ?? []).some((m) => m.id === zed.person.id && m.reasons.some((r) => r.key === "NAME")), w5b?.duplicates);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  // ------------------------------------------------------------- D6: a company subject carries its similar companies
  const CO = randomUUID();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${CO}', '${A}', 'Cedar Work Ltd', '${normaliseCompanyName("Cedar Work Ltd")}', 'test', now())`);
  const gil = await lead(R, "Gil", "Moreau", { email: "gil.m@example.org" });
  const pc = await corp.engage(R, gil.id, { companyName: "Cedar Works Ltd", confirmedNew: true }) as { id: string; company?: { id: string } | null };
  await pros.convert(R, pc.id, {});
  const w6 = await winOf(pc.id);
  const m6 = w6?.duplicates?.matches ?? [];
  ok("FO-9a won D6 pass: a Corporate win carries the similar company (Cedar Work Ltd, COMPANY, NAME, score 60-99)",
    w6?.subject.subject === "COMPANY" && m6.some((m) => m.id === CO && m.kind === "COMPANY" && m.reasons[0]?.key === "NAME" && m.score >= 60 && m.score < 100), { subject: w6?.subject, m6 });
  ok("FO-9a won D6 fail: the won company is never its own match, and no person is listed for a company", w6 !== null && !m6.some((m) => m.id === pc.company?.id || m.kind === "PERSON"), m6);

  // ------------------------------------------------------------- D7: the contract: additive, bounded
  const base = w2!;
  const { duplicates: _drop, ...before } = base;
  ok("FO-9a won D7 pass: a prospect.won written before this part (no duplicates) still reads (the field is optional)", ProspectWonPayload.safeParse(before).success);
  ok("FO-9a won D7 fail: a score above 100, a reason-less match or a name in a match is refused by the contract",
    !ProspectWonPayload.safeParse({ ...base, duplicates: { matches: [{ kind: "PERSON", id: lena.person.id, score: 101, reasons: [{ key: "EMAIL" }] }] } }).success
      && !ProspectWonPayload.safeParse({ ...base, duplicates: { matches: [{ kind: "PERSON", id: lena.person.id, score: 100, reasons: [] }] } }).success
      && !ProspectWonPayload.safeParse({ ...base, duplicates: { matches: [{ kind: "PERSON", id: lena.person.id, score: 100, reasons: [{ key: "EMAIL" }], name: "Lena Park" }] } }).success);
  ok("FO-9a won D7 pass: reading the result wrote nothing (no merge, no link: the first Lena still has her own one lead)",
    sql(`select count(*) from fo_lead where person_id = '${lena.person.id}'`) === "1" && sql(`select count(*) from fo_person where id in ('${lena.person.id}', '${lena2.person.id}')`) === "2");
} catch (e) {
  fail++; console.log(`FAIL  FO-9a won: ${(e as Error).stack ?? String(e)}`);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
}
console.log(`\nFO-9a won: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
