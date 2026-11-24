// FO-5cr (rows rev 16.43, P-626-order.md "New row FO-5cr"; AG-4-49 rule 6, AG-4-50 rule 4; MS-D18(4); concept fo-3-booking
// BR-16, Q3): the retainer draft is filled in from a consult record. FO-5's draft with `consultRecordId` reads
// ConsultRecordPort in the caller's firm: the record's recommended items name the first fee row and a CAD quoted fee is its
// amount; nothing is typed twice and nothing is sent. An unknown id, another firm's record and a record that hangs on another
// person give the same empty row and the same one notice (never told apart, no content leaks). One scratch database (every
// migration, the Sample firms and their front office); the port's fake carries the records, and the default adapter
// (FO-3a part 2a's, whose contract check_fo3a2_consult_record.ts runs on both) answers the unknown id. No server, no
// browser, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo5cr_consult_prefill.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeConsultRecords } from "../ports/consult-record.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { NO_CONSULT_RECORD, QUOTED, Retainers, feesFromConsult } from "../api/src/front-office/retainers/service.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";
import type { StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo5cr_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo5cr-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fails = async (f: () => Promise<unknown>, status: number, re: RegExp) => {
  try { await f(); return false; } catch (e) {
    const r = e as { getResponse?: () => unknown; getStatus?: () => number }, body = JSON.stringify(r.getResponse?.() ?? String(e));
    const okay = r.getStatus?.() === status && re.test(body);
    if (!okay) console.log(`      (refused ${r.getStatus?.()}: ${body.slice(0, 300)})`);
    return okay;
  }
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const R: StaffContext = { staffId: sql(`select id from platform_staff where actor_id='user-R'`), firmId: A, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" };
  const clock = { now: () => Date.parse("2026-11-24T14:00:00Z") };
  const store = new LocalFiles(join(WORK, "files"));
  const records = fakeConsultRecords();
  const svc = new Retainers(db, store, clock, undefined, records), plain = new Retainers(db, store, clock);
  clearingConflicts(db, { retainers: Retainers.prototype });   // FO-13c: the conflict check first, as FO-5's suite
  const tpl = await svc.uploadTemplate(R, { name: "Standard retainer" }, { bytes: buildDocx(["Client: {client.name}", "{#fees}", "{label}: {amount} ({when}{due_on})", "{/fees}", "Total {fees.total}"]), size: 1000 });

  // An Individual prospect per draft (FO-5's one-live rule), on its own person, as FO-5's suite makes them.
  let n = 900;
  const stage = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'`);
  const prospect = () => {
    const P = u(n++), L = u(n++), id = u(n++);
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${P}', '${A}', 'Client B', 'Sample', 'client.b.${n}@example.com', 'test', now())`);
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values ('${L}', '${A}', '${P}', 'MANUAL', 'WEBSITE', 'test', now()); update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${L}'`);
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${id}', '${A}', '${L}', 'INDIVIDUAL', '${stage}', '${P}', '${P}', '${R.staffId}', 'test', now())`);
    sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
    return { id, person: P };
  };
  const rec = (firmId: string, recordId: string, partyRef: { kind: "lead" | "prospect" | "client"; id: string } | null, recommended: string[], quotedFee: { amountMinor: number; currency: "CAD" | "USD" } | null) =>
    records.add(firmId, { recordId, bookingId: u(5000 + n++), partyRef, recommended, quotedFee });
  const auditOf = (id: string) => sql(`select coalesce(detail::text, '') from audit_event where entity_key = '${id}' and action = 'retainer.drafted'`);
  const first = (d: { version: { fees: { label: string; amountMinor: string | null }[] } }) => d.version.fees[0];

  // 1. The record's items and fee appear on the draft (pass), and a draft without a record is unchanged (fail of the pre-fill).
  const p1 = prospect(), r1 = rec(A, u(7001), { kind: "prospect", id: p1.id }, ["Work permit", "Translation"], { amountMinor: 350000, currency: "CAD" });
  const d1 = await svc.draft(R, p1.id, { templateId: tpl.id, consultRecordId: r1.recordId });
  ok("FO-5cr pass: the record's recommended items and CAD quoted fee are the first fee row (AG-4-50 rule 4)",
    d1.version.fees.length === 1 && first(d1).label === `${QUOTED}: Work permit, Translation` && first(d1).amountMinor === "350000" && !d1.warnings.includes(NO_CONSULT_RECORD), d1.version);
  ok("FO-5cr pass: the draft's audit line names the consult record it was filled from", auditOf(d1.id).includes(r1.recordId), auditOf(d1.id));
  ok("FO-5cr pass: nothing is sent: the draft stays DRAFT at version 1", d1.status === "DRAFT" && d1.version.n === 1 && d1.version.sentAt === null);
  const p0 = prospect(), d0 = await svc.draft(R, p0.id, { templateId: tpl.id });
  ok("FO-5cr fail: without a consult record the first row stays \"Deposit on signing\" with no amount, and no notice",
    first(d0).label === "Deposit on signing" && first(d0).amountMinor === null && !d0.warnings.includes(NO_CONSULT_RECORD), d0.version);

  // 2. Another firm's record id → an empty draft with no error leak (even a record that names this very prospect).
  const p2 = prospect(), r2 = rec(B, u(7002), { kind: "prospect", id: p2.id }, ["Study permit"], { amountMinor: 999900, currency: "CAD" });
  const d2 = await svc.draft(R, p2.id, { templateId: tpl.id, consultRecordId: r2.recordId });
  const body2 = JSON.stringify(d2, (_k, v) => (typeof v === "bigint" ? String(v) : v));
  ok("FO-5cr fail: another firm's record → the empty first row and the one neutral notice, nothing of the record shown",
    first(d2).label === "Deposit on signing" && first(d2).amountMinor === null && d2.warnings.includes(NO_CONSULT_RECORD) && !/Study permit|999900|9,999/.test(body2) && !auditOf(d2.id).includes(r2.recordId), { fees: d2.version.fees, warnings: d2.warnings });
  // The default adapter (FO-3a part 2a's PgConsultRecords): an id with no record answers the very same words.
  const p3 = prospect(), d3 = await plain.draft(R, p3.id, { templateId: tpl.id, consultRecordId: u(7999) });
  ok("FO-5cr fail: an unknown id through the real adapter → the same empty row and the same notice (never told apart from another firm's)",
    first(d3).label === "Deposit on signing" && JSON.stringify(d3.warnings) === JSON.stringify(d2.warnings), d3.warnings);

  // 3. The party: a record on the lead counts once that lead's person is this prospect's; another person's record does not.
  const p4 = prospect(), r4 = rec(A, u(7004), { kind: "lead", id: p4.person }, ["Work permit"], { amountMinor: 120000, currency: "CAD" });
  const d4 = await svc.draft(R, p4.id, { templateId: tpl.id, consultRecordId: r4.recordId });
  ok("FO-5cr pass: a lead's record (Engage and prepare retainer) fills the draft of the prospect its person became",
    first(d4).label === `${QUOTED}: Work permit` && first(d4).amountMinor === "120000", d4.version);
  const p5 = prospect(), other = prospect(), r5 = rec(A, u(7005), { kind: "prospect", id: other.id }, ["Visitor visa"], { amountMinor: 50000, currency: "CAD" });
  const d5 = await svc.draft(R, p5.id, { templateId: tpl.id, consultRecordId: r5.recordId });
  ok("FO-5cr fail: a record of another prospect in the same firm fills nothing (the same notice)", first(d5).label === "Deposit on signing" && d5.warnings.includes(NO_CONSULT_RECORD), d5.version);
  const p6 = prospect(), r6 = rec(A, u(7006), { kind: "client", id: p6.person }, ["Renewal"], { amountMinor: 50000, currency: "CAD" });
  const d6 = await svc.draft(R, p6.id, { templateId: tpl.id, consultRecordId: r6.recordId });
  ok("FO-5cr fail: a case call's record (AG-4-50 rule 3: no Prepare retainer on a case) fills nothing", first(d6).label === "Deposit on signing" && d6.warnings.includes(NO_CONSULT_RECORD), d6.version);

  // 4. Currency (X-6; the retainer's fee rows are CAD by their CHECK): a USD quote fills the items and asks for the amount.
  const p7 = prospect(), r7 = rec(A, u(7007), { kind: "prospect", id: p7.id }, ["Work permit"], { amountMinor: 250000, currency: "USD" });
  const d7 = await svc.draft(R, p7.id, { templateId: tpl.id, consultRecordId: r7.recordId });
  ok("FO-5cr pass: a USD quote fills the items, leaves the amount empty and says to enter it in CAD (nothing converted)",
    first(d7).label === `${QUOTED}: Work permit` && first(d7).amountMinor === null && d7.warnings.some((w) => w === "The quoted fee was USD 2,500.00. A retainer is in CAD, so enter the amount in CAD."), { fees: d7.version.fees, warnings: d7.warnings });
  ok("FO-5cr fail: a USD quote never lands as a CAD amount", sql(`select count(*) from fo_retainer_fee_row f join fo_retainer_version v on v.id = f.version_id where v.retainer_id = '${d7.id}' and f.amount_minor is not null`) === "0");

  // 5. The words: a fee alone, items alone, an empty record, a list longer than a fee row's label.
  const only = (r: Parameters<typeof feesFromConsult>[0]) => feesFromConsult(r, true);
  const base = { recordId: u(1), bookingId: u(2), partyRef: { kind: "prospect" as const, id: u(3) } };
  ok("FO-5cr pass: a quoted fee with no items is the row \"Quoted at the consultation\"", (() => { const f = only({ ...base, recommended: [], quotedFee: { amountMinor: 100, currency: "CAD" } }).fees[0]; return f.label === QUOTED && f.amountMinor === 100n; })());
  ok("FO-5cr pass: items with no fee name the row and leave its amount empty", (() => { const f = only({ ...base, recommended: ["Translation"], quotedFee: null }).fees[0]; return f.label === `${QUOTED}: Translation` && f.amountMinor === null; })());
  ok("FO-5cr fail: a record with neither items nor a fee changes nothing and says nothing", (() => { const x = only({ ...base, recommended: [], quotedFee: null }); return x.fees[0].label === "Deposit on signing" && x.warnings.length === 0; })());
  const long = only({ ...base, recommended: Array.from({ length: 12 }, (_v, i) => `Programme number ${i + 1}`), quotedFee: null }).fees[0].label;
  ok("FO-5cr fail: a long list is cut to the fee row's 120 characters with \"…\", never refused", long.length <= 120 && long.endsWith("…") && long.startsWith(`${QUOTED}: Programme number 1, `), long);
  const p8 = prospect(), r8 = rec(A, u(7008), { kind: "prospect", id: p8.id }, Array.from({ length: 20 }, () => "é".repeat(60) + "😀"), null);
  ok("FO-5cr pass: the cut label is one the draft accepts (whole characters, at most 120)", (await svc.draft(R, p8.id, { templateId: tpl.id, consultRecordId: r8.recordId })).version.fees[0].label.length <= 120);

  // 6. The input: a malformed id and an id beside fee rows are refused at the field, before anything is read.
  const p9 = prospect();
  ok("FO-5cr fail: consultRecordId that is not an id → 422 on the field", await fails(() => svc.draft(R, p9.id, { templateId: tpl.id, consultRecordId: "not-an-id" }), 422, /consultRecordId/));
  ok("FO-5cr fail: consultRecordId with fee rows → 422 \"not both\"", await fails(() => svc.draft(R, p9.id, { templateId: tpl.id, consultRecordId: r1.recordId, fees: [{ label: "Fee", amountMinor: 1 }] }), 422, /not both/));
  ok("FO-5cr pass: the refused calls wrote no retainer", sql(`select count(*) from fo_retainer where prospect_id = '${p9.id}'`) === "0");
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
