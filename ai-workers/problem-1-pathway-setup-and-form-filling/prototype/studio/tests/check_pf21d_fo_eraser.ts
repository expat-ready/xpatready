// PF-21d part 2b-1 (R1.85; brief product/screens/PF-21d-2/brief.md "Part 2b"; SA-11-16, SA-11-28, SA-11-40; P-819): the
// front office's eraser, each line a pass and a fail. The person's rows in that firm anonymised or cleared; another person,
// a family member and the same person in another firm untouched; the KEPT classes named; a second run NOTHING or KEPT,
// never ERASED; ErasurePort's eraserCases; the end HELD / partial while anything is kept, COMPLETED when nothing is; every
// person column of FO-9b's inventory classified; the feature registers it once. The eraser runs as the app (xr_app under
// PF-12's walls, walledPool) inside the job's firm transaction. Scratch database, Sample values, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21d_fo_eraser.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eraserCases } from "../ports/contracts/erasure-port.contract.ts";
import { EraseOutcome, type ErasureOrder } from "../ports/erasure.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21dfo_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const one = (q: string) => sql(q).split("\n")[0];

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort())
  execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL_;
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { seedSampleConsultationType } = await import("../api/src/front-office/booking-seed.ts");
const { oneQueryPerCaller, walledPool, withFirm } = await import("../api/src/platform/firm-scope.ts");
const { COLUMNS } = await import("../api/src/front-office/duplicates/merge/columns.ts");
const { ERASE_COLUMNS, ERASE_OTHER, PERSON_ERASED, PERSON_NOT_WORDS } = await import("../api/src/front-office/erase/columns.ts");
const { frontOfficeEraser, erasedName, FO_ERASER_MODULE, KEPT_SQL, KEPT_WORDS, keptNote } = await import("../api/src/front-office/erase/eraser.ts");
const { arrive } = await import("../api/src/front-office/sales/arrival.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { ErasureRegistry } = await import("../api/src/platform/erasure/registry.ts");
const { Erasure } = await import("../api/src/platform/erasure/service.ts");
const { PlatSwitches } = await import("../api/src/platform/switches/service.ts");
const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const feature = (await import("../api/src/features/front-office-erasure.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const app = new PrismaClient({ adapter: new PrismaPg(walledPool(URL_), { disposeExternalPool: true }) });
oneQueryPerCaller(app);
type Tx = Prisma.TransactionClient;
const inFirm = <T>(firm: string, fn: (tx: Tx) => Promise<T>) => withFirm(firm, () => app.$transaction((tx) => fn(tx)));
const erase = (o: ErasureOrder) => inFirm(o.firmId, (tx) => frontOfficeEraser.erase(tx, o)).then((r) => EraseOutcome.parse(r));
const uuid = () => globalThis.crypto.randomUUID();
try {
  await seedSampleFirms(owner);
  await seedSampleFirmsFrontOffice(owner);
  await seedSampleConsultationType(owner);
  const A = one(`select id from platform_firm where key = 'sample-firm'`), B = one(`select id from platform_firm where key = 'sample-solo'`);
  const [typeId, hostId] = one(`select t.id || '|' || s.id from fo_consultation_type t join platform_staff s on s.firm_id = t.firm_id and s.actor_id = 'user-R' where t.firm_id = '${A}' limit 1`).split("|");
  const stage = (firm: string) => one(`select id from fo_stage where firm_id = '${firm}' and pipeline = 'INDIVIDUAL' and kind = 'ACTIVE' order by sort_order limit 1`);
  let n = 0;
  /** One person and the rows that name them; `full` adds a booking, a consult record, a note and an activity line. */
  const seed = (firm: string, email: string, full = true) => {
    n++;
    const p = one(`insert into fo_person (firm_id, given_names, family_name, email, phone, phone_readable, language, time_zone, created_by, updated_at)
      values ('${firm}', 'Given${n}', 'Family${n}', '${email}', '+1416555${String(1000 + n).slice(-4)}', true, 'fr', 'America/Toronto', 'seed:pf21d-fo', now()) returning id`);
    const lead = one(`insert into fo_lead (firm_id, person_id, door, source, state, arrived_at, engaged_at, engaged_by, interested_in_text, source_detail, close_note, created_by, updated_at)
      values ('${firm}', '${p}', 'MANUAL', 'Referral', 'ENGAGED', now(), now(), 'seed', 'Sample words: wants a study permit', 'Sample: met at a fair', 'Sample: will call back in spring', 'seed', now()) returning id`);
    one(`insert into fo_prospect (firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, lost_note, currency, created_by, updated_at)
      values ('${firm}', '${lead}', 'INDIVIDUAL', '${stage(firm)}', '${p}', '${p}', 'Sample: chose another firm', 'CAD', 'seed', now()) returning id`);
    one(`insert into fo_call (firm_id, person_id, lead_id, direction, outcome, seconds, started_at, notes, by_actor) values ('${firm}', '${p}', '${lead}', 'OUT', 'CONNECTED', 60, now(), 'Sample: talked about family', 'seed') returning id`);
    one(`insert into fo_arrival_receipt (firm_id, door, lead_id, person_id, outcome, completed_at, received_at, intake_key, ip_hash, payload_hash)
      values ('${firm}', 'MANUAL', '${lead}', '${p}', 'CREATED', now(), now(), 'manual:${uuid()}', 'ab12', repeat('a', 64)) returning id`);
    if (full && firm === A) {
      const bk = one(`insert into fo_booking (id, firm_id, type_id, staff_id, person_id, status, mode, starts_at, ends_at, visitor_time_zone, updated_at)
        values (gen_random_uuid(), '${A}', '${typeId}', '${hostId}', '${p}', 'SCHEDULED', 'VIDEO', now() - interval '${n} days 2 hours', now() - interval '${n} days 1 hour', 'Asia/Kolkata', now()) returning id`);
      sql(`update fo_booking set status = 'COMPLETED' where id = '${bk}'`);
      one(`insert into fo_consult_record (id, firm_id, booking_id, time_spent_minutes, version, notes, recommended, created_by, updated_by, updated_at) values (gen_random_uuid(), '${A}', '${bk}', 30, 1, 'Sample: spouse and two children', ARRAY['Sample: spousal sponsorship'], 'seed', 'seed', now()) returning id`);
      const bk2 = one(`insert into fo_booking (id, firm_id, type_id, staff_id, person_id, status, mode, starts_at, ends_at, visitor_time_zone, updated_at)
        values (gen_random_uuid(), '${A}', '${typeId}', '${hostId}', '${p}', 'SCHEDULED', 'VIDEO', now() + interval '${n + 20} days', now() + interval '${n + 20} days 1 hour', 'Asia/Kolkata', now()) returning id`);
      sql(`update fo_booking set status = 'CANCELLED', cancel_reason = 'Sample: moving to Calgary' where id = '${bk2}'`);
    }
    if (full) {
      one(`insert into fo_note (id, firm_id, person_id, lead_id, visibility, by_actor, text) values (gen_random_uuid(), '${firm}', '${p}', '${lead}', 'INTERNAL', 'seed', 'Sample note') returning id`);
      one(`insert into msg_suppression (id, firm_id, channel, reason, address, created_by) values (gen_random_uuid(), '${firm}', 'EMAIL', 'UNSUBSCRIBE', '${email}', 'seed:pf21d-fo') returning id`);
    }
    return { p, lead };
  };
  // words: every personal word the eraser clears, for one person in one firm (one line, compared before and after).
  const words = (firm: string, p: string) => sql(`select concat_ws('|',
      (select concat_ws(',', given_names, family_name, email, phone, language, time_zone) from fo_person where id = '${p}'),
      (select string_agg(nullif(concat_ws(',', interested_in_text, close_note, source_detail), ''), ';') from fo_lead where firm_id = '${firm}' and person_id = '${p}'),
      (select string_agg(lost_note, ';') from fo_prospect where firm_id = '${firm}' and subject_person_id = '${p}'),
      (select string_agg(notes, ';') from fo_call where firm_id = '${firm}' and person_id = '${p}'),
      (select string_agg(ip_hash, ';') from fo_arrival_receipt where firm_id = '${firm}' and person_id = '${p}'),
      (select string_agg(cancel_reason, ';') from fo_booking where firm_id = '${firm}' and person_id = '${p}'),
      (select string_agg(nullif(concat_ws(',', r.notes, array_to_string(r.recommended, ',')), ''), ';') from fo_consult_record r join fo_booking b on b.id = r.booking_id where b.person_id = '${p}'))`);

  // ------------------------------------------------------------------------------------------------ the column list
  const listed = Object.keys(COLUMNS).sort(), classified = Object.keys(ERASE_COLUMNS).sort();
  ok("PF-21d 2b pass: every person column of FO-9b's inventory has a treatment and a reason here", JSON.stringify(listed) === JSON.stringify(classified)
    && [...Object.values(ERASE_COLUMNS), ...Object.values(ERASE_OTHER)].every(([t, why]) => ["ERASE", "KEEP", "LINK", "ELSEWHERE", "NOT-PERSON"].includes(t) && why.length > 10),
    { unclassified: listed.filter((c) => !classified.includes(c)), stale: classified.filter((c) => !listed.includes(c)) });
  // Review M2: read from the live schema (FO-9b's own query), so a person column a later row adds is caught here too.
  const NAMING = `
    with fk as (select c.conrelid::regclass::text as t, a.attname::text as c from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                 where c.contype = 'f' and c.confrelid in ('fo_person'::regclass, 'fo_company'::regclass) and a.attname <> 'firm_id'),
         named as (select table_name::text as t, column_name::text as c from information_schema.columns where table_schema = 'public' and column_name ~ '(^|_)(person|company)_id$'),
         poly as (select c.table_name::text as t, 'subject_id' as c from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'subject_kind'
                   and c.udt_name in (select t.typname from pg_type t join pg_enum e on e.enumtypid = t.oid where e.enumlabel in ('FO_PERSON', 'FRONT_OFFICE_PERSON', 'FO_COMPANY')))
    select string_agg(x, ',' order by x) from (select distinct t || '.' || c as x from (select * from fk union select * from named union select * from poly) u) v`;
  const unclassified = () => sql(NAMING).split(",").filter((c) => !(c in ERASE_COLUMNS));
  ok("PF-21d 2b pass: every person column in the live schema is classified here", unclassified().length === 0, unclassified());
  sql(`alter table fo_note add column pf21d_probe_person_id uuid`);
  const caught = unclassified();
  sql(`alter table fo_note drop column pf21d_probe_person_id`);
  ok("PF-21d 2b fail: a person column added to the schema and not classified here is caught (a probe column, dropped after)", JSON.stringify(caught) === JSON.stringify(["fo_note.pf21d_probe_person_id"]), caught);
  const personCols = sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'fo_person'`).split(",");
  const named = [...PERSON_ERASED, ...PERSON_NOT_WORDS] as string[];
  ok("PF-21d 2b pass: every fo_person column is erased or named as holding no personal words", personCols.every((c) => named.includes(c)) && named.every((c) => personCols.includes(c)), { unnamed: personCols.filter((c) => !named.includes(c)) });
  const otherCols = Object.keys(ERASE_OTHER).map((k) => k.split("."));
  ok("PF-21d 2b pass: the rows found by another path name live columns", otherCols.every(([t, c]) => one(`select count(*) from information_schema.columns where table_name = '${t}' and column_name = '${c}'`) === "1"));

  // ------------------------------------------------------------------------------------------------ one person, erased
  const P = seed(A, "erase.me.pf21dfo@example.com"), FAM = seed(A, "family.pf21dfo@example.com"), SAME = seed(B, "erase.me.pf21dfo@example.com");
  sql(`insert into audit_event (id, workspace_id, at, actor_type, firm_id, actor, action, entity, entity_key, summary)
    select gen_random_uuid(), workspace_id, now(), actor_type, '${A}', 'seed:pf21d-fo', 'fo.person.created', 'fo_person', '${P.p}', 'Sample line' from audit_event where firm_id = '${A}' limit 1`);
  const famBefore = words(A, FAM.p), sameBefore = words(B, SAME.p), before = words(A, P.p);
  ok("PF-21d 2b setup: the person, a family member and the same person in another firm each hold Sample words", before.includes("Given") && before.includes("Calgary") && before.includes("spouse") && before.includes("spring") && before.includes("spousal sponsorship") && famBefore.includes("Given") && sameBefore.includes("Given"), { before });
  const requestId = uuid(), order = { requestId, firmId: A, personId: P.p };
  const first = await erase(order);
  const after = words(A, P.p), name = erasedName(requestId);
  ok("PF-21d 2b pass: the person's rows in that firm are anonymised or cleared (name replaced, email, phone, language, zone null; leads, prospect, calls, receipt, bookings, consult record cleared)",
    after === name && one(`select phone_e164 is null and name_key is not null from fo_person where id = '${P.p}'`) === "t", { after, name });
  ok("PF-21d 2b fail: before the run the same reading held every word (the check reads the words, not a flag)", before !== after && before.length > 100);
  ok("PF-21d 2b pass: the person record stays (its id, leads, bookings and money links keep pointing at it)", one(`select count(*) from fo_person where id = '${P.p}'`) === "1" && Number(one(`select count(*) from fo_booking where person_id = '${P.p}'`)) === 2);
  ok("PF-21d 2b pass: the anonymised name carries a number, so the duplicate match pairs erased records only by an exact name", /^Erased person \d+$/.test(name) && erasedName(uuid()) !== name);
  ok("PF-21d 2b fail: a family member in the same firm is untouched", words(A, FAM.p) === famBefore, { famBefore, now: words(A, FAM.p) });
  ok("PF-21d 2b fail: the same person (same email) in another firm is untouched", words(B, SAME.p) === sameBefore);
  ok("PF-21d 2b pass: KEPT, naming each kept class with its count (do not contact, the insert-only rows not yet erasable, the activity log), counts and class names only",
    first.outcome === "KEPT" && /Kept \(Sample, Unconfirmed: no counsel\): do-not-contact address 1\./.test(first.note) && /Kept \(not yet erasable\): notes, attribution, merge and message records \d/.test(first.note) && /Kept \(kept by a floor\): activity log lines \(7 years\) \d/.test(first.note) && !first.note.includes("@") && !/Given|Family|Calgary/.test(first.note), first);
  ok("PF-21d 2b fail: a class with no rows is not named (no consent, signing, retainer, identity, conflict or money rows for this person)", !/consent|signing|retainer|identity|conflict|money/.test(first.note), first);
  ok("PF-21d 2b pass: the kept rows stay (the note, the suppressed address, the activity line)",
    one(`select count(*) from fo_note where person_id = '${P.p}'`) === "1" && one(`select count(*) from msg_suppression where firm_id = '${A}' and address = 'erase.me.pf21dfo@example.com'`) === "1");
  const again = await erase(order);
  ok("PF-21d 2b pass: a second run answers KEPT again, clearing nothing (port rule 4)", again.outcome === "KEPT" && /Nothing left to clear\./.test(again.note) && words(A, P.p) === name, again);
  ok("PF-21d 2b fail: the second run never answers ERASED", again.outcome !== "ERASED");

  // A person with nothing kept: ERASED, then NOTHING.
  const LIGHT = seed(A, "light.pf21dfo@example.com", false), lightOrder = { requestId: uuid(), firmId: A, personId: LIGHT.p };
  const l1 = await erase(lightOrder), l2 = await erase(lightOrder);
  ok("PF-21d 2b pass: with nothing kept the eraser answers ERASED, and a second run NOTHING", l1.outcome === "ERASED" && l2.outcome === "NOTHING", { l1, l2 });
  ok("PF-21d 2b fail: a person record not in that firm answers NOTHING and changes nothing", (await erase({ requestId: uuid(), firmId: A, personId: SAME.p })).outcome === "NOTHING" && words(B, SAME.p) === sameBefore);
  const wrongScope = await withFirm(B, () => app.$transaction((tx) => frontOfficeEraser.erase(tx, { requestId: uuid(), firmId: A, personId: FAM.p }))).then(() => "ran", (e) => String(e));
  ok("PF-21d 2b fail: an order run in another firm's scope is refused before anything changes", /not this transaction's firm/.test(wrongScope) && words(A, FAM.p) === famBefore, wrongScope);

  // ------------------------------------------------------------------------------------------------ the breaker's findings (#3713 round 1)
  // B1: the only activity line is keyed on the person's lead, its detail holding their email: KEPT, never ERASED.
  const B1 = seed(A, "b1.pf21dfo@example.com", false);
  sql(`insert into audit_event (id, workspace_id, at, actor_type, firm_id, actor, action, entity, entity_key, summary, detail)
    select gen_random_uuid(), workspace_id, now(), actor_type, '${A}', 'seed:pf21d-fo', 'fo.lead.created', 'fo_lead', '${B1.lead}', 'Sample line', '{"email":"b1.pf21dfo@example.com"}'::jsonb from audit_event where firm_id = '${A}' limit 1`);
  const b1 = await erase({ requestId: uuid(), firmId: A, personId: B1.p });
  ok("PF-21d 2b fail (break B1): an activity line keyed on the person's lead (their email in its detail) keeps the answer KEPT activity_log, never ERASED", b1.outcome === "KEPT" && /activity log lines \(7 years\) 1/.test(b1.note), b1);
  // B2: a row another module's eraser answers for (the case side's client) keeps the answer KEPT until that eraser exists.
  const B2 = seed(A, "b2.pf21dfo@example.com", false);
  sql(`insert into case_client (id, workspace_id, firm_key, client_number, display_name, display_kind, created_by, firm_id, fo_person_id)
    select gen_random_uuid(), (select id from workspace limit 1), 'sample-firm', 900001, 'Sample Client', 'PERSON', 'seed', '${A}', '${B2.p}' returning id`);
  const b2 = await erase({ requestId: uuid(), firmId: A, personId: B2.p });
  ok("PF-21d 2b fail (break B2): a case-side client row of the person keeps the answer KEPT awaiting_other_eraser, never ERASED", b2.outcome === "KEPT" && /Kept \(waiting for another module's eraser\): case or complaint rows 1/.test(b2.note), b2);
  // M1: a record merged into the person keeps its old words until the person is erased; then it is anonymised too.
  const SURV = seed(A, "surv.pf21dfo@example.com", false), LOSER = seed(A, "loser.pf21dfo@example.com", false);
  sql(`update fo_person set merged_into_id = '${SURV.p}', merged_at = now() where id = '${LOSER.p}'`);
  const loserBefore = one(`select email from fo_person where id = '${LOSER.p}'`);
  const m1 = await erase({ requestId: uuid(), firmId: A, personId: SURV.p });
  ok("PF-21d 2b pass (break M1): a merged-away record of the person is anonymised with them (its old name, email and phone gone)",
    loserBefore === "loser.pf21dfo@example.com" && one(`select concat_ws(',', given_names, email, phone, language, time_zone) || '|' || family_name from fo_person where id = '${LOSER.p}'`).startsWith("|Erased person") && /merged-away records 1/.test(m1.note), { loserBefore, m1 });
  // M2: another party's conflict check that found this person names them in its matches: KEPT conflict_check.
  const M2 = seed(A, "m2.pf21dfo@example.com", false), OTHER = seed(A, "other.pf21dfo@example.com", false);
  sql(`insert into fo_conflict_check (id, firm_id, party_kind, person_id, matches, checked_by, result, searched_name)
    values (gen_random_uuid(), '${A}', 'PERSON', '${OTHER.p}', '[{"source":"FRONT_OFFICE","kind":"PERSON","recordId":"${M2.p}","matchedOn":["NAME"]}]'::jsonb, '${hostId}', 'NO_CONFLICT', 'Sample') returning id`);
  const m2 = await erase({ requestId: uuid(), firmId: A, personId: M2.p });
  ok("PF-21d 2b fail (break M2): another party's conflict check naming the person in its matches keeps the answer KEPT conflict_check", m2.outcome === "KEPT" && /conflict checks 1/.test(m2.note), m2);
  const long = keptNote(Object.keys(KEPT_WORDS).map((cls) => ({ cls, n: 123456 })), `Cleared: ${"person 1, ".repeat(30)}.`);
  ok("PF-21d 2b pass (break m1, review m2): the KEPT note leads with its kept groups, each label before its counts (Sample only for the Sample classes; floors said as floors), so the length limit cuts the cleared list first",
    [first, b1, b2, m2].every((x) => x.note.startsWith("Kept (")) && long.length <= 300 && long.startsWith("Kept (Sample, Unconfirmed: no counsel): consent proof 123456") && long.includes("Kept (kept by a floor): money records (7 years) 123456") && !/Sample[^.]*money/.test(long), long);
  // Review m4: a second request for an already-erased person renames nothing and answers KEPT or NOTHING, never ERASED.
  const m4 = await erase({ requestId: uuid(), firmId: A, personId: LIGHT.p });
  ok("PF-21d 2b fail (review m4): a second request for an already-erased person keeps its name and never answers ERASED", m4.outcome === "NOTHING" && one(`select family_name from fo_person where id = '${LIGHT.p}'`) === erasedName(lightOrder.requestId), m4);
  // Review B1: a person added by hand through the app's own arrival path (its lead.created line holds their words).
  const made = await inFirm(A, (tx) => arrive(tx, { firmId: A, door: "MANUAL", intakeKey: `manual:${uuid()}`, person: { givenNames: "Arrived", familyName: "Sample", email: "arrived.pf21dfo@example.com", phone: null },
    source: "Referral", actor: "system:pf21d-fo", payloadHash: "arrived" }, { audit: auditEvent, consent: new ConsentStore(auditEvent) }));
  const arrived = await erase({ requestId: uuid(), firmId: A, personId: made.personId! });
  ok("PF-21d 2b fail (review B1): a person made by the app's arrival path answers KEPT (its activity lines name them), never ERASED; the record is anonymised",
    arrived.outcome === "KEPT" && /activity log lines/.test(arrived.note) && one(`select coalesce(email, '-') from fo_person where id = '${made.personId}'`) === "-", arrived);
  // Review M2: every column classified KEEP is counted by a kept class (its table appears in a KEPT query).
  const keptTables = Object.entries({ ...ERASE_COLUMNS, ...ERASE_OTHER }).filter(([, [t]]) => t === "KEEP").map(([tc]) => tc.split(".")[0]);
  const uncounted = [...new Set(keptTables)].filter((t) => !KEPT_SQL.some(([, q]) => new RegExp(`\\b${t}\\b`).test(q)));
  ok("PF-21d 2b pass (review M2): every table classified KEEP is counted by one of the eraser's kept classes; every kept class has words", !uncounted.length && KEPT_SQL.every(([c]) => c in KEPT_WORDS), uncounted);

  // ------------------------------------------------------------------------------------------------ ErasurePort's contract
  for (const c of eraserCases(async () => ({
    eraser: frontOfficeEraser,
    run: (firm, fn) => inFirm(firm, fn),
    async seed() { const tag = uuid().slice(0, 8), a = seed(A, `c.${tag}@example.com`, false), b = seed(B, `c.${tag}@example.com`, false), o = seed(A, `o.${tag}@example.com`, false);
      return { order: { requestId: uuid(), firmId: A, personId: a.p }, otherFirmOrder: { requestId: uuid(), firmId: B, personId: b.p }, otherPersonId: o.p }; },
    async rowsOf(firm, p) { return Number(one(`select (select count(*) from fo_person where id = '${p}' and email is not null) + (select count(*) from fo_lead where firm_id = '${firm}' and person_id = '${p}' and interested_in_text is not null) + (select count(*) from fo_call where firm_id = '${firm}' and person_id = '${p}' and notes is not null)`)); },
  }))) {
    const r = await c.run().then(() => true, (e) => String(e));
    ok(`PF-21d 2b pass: ErasurePort eraserCases — ${c.name}`, r === true, r);
  }

  // ------------------------------------------------------------------------------------------------ through the job
  const registered: string[] = [];
  const registry = new ErasureRegistry();
  const provider = feature.providers[0] as { useFactory: (r: InstanceType<typeof ErasureRegistry>) => boolean };
  ok("PF-21d 2b pass: the front office's feature registers its eraser once, as module front-office", provider.useFactory(registry) && registry.erasers().map((e) => e.module).join() === FO_ERASER_MODULE);
  ok("PF-21d 2b fail: a second registration is refused (ports/erasure.ts rule 1)", (() => { try { provider.useFactory(registry); return false; } catch { return true; } })());
  registered.push(...registry.erasers().map((e) => e.module));
  const clock = new (class extends PlatformClock { t = Date.now() + 8 * 86_400_000; override now() { return this.t; } })();
  const noAudit = { audit: async () => undefined };
  const job = new Erasure(app as never, noAudit as never, clock, new PlatSwitches(app as never, noAudit as never), registry, new PgLegalHolds());
  const request = (p: string) => {
    const id = one(`insert into plat_data_request (id, type, received_on, target_date, firm_id, person_id, requester_name, requester_email, recorded_by)
      values (gen_random_uuid(), 'DELETION', current_date - 10, current_date + 20, '${A}', '${p}', 'Sample Requester', 'requester.pf21dfo@example.com', 'staff:seed') returning id`);
    const out = one(`select plat_data_request_erasure_approve('${id}', current_date - 3, 'staff:seed')`);
    if (out !== "APPROVED") throw new Error(`approve: ${out}`);
    return id;
  };
  const KEEPS = seed(A, "keeps.pf21dfo@example.com"), CLEAN = seed(A, "clean.pf21dfo@example.com", false);
  const rKeeps = request(KEEPS.p), rClean = request(CLEAN.p);
  const run = await job.run();
  const statusOf = (id: string) => one(`select status::text from plat_data_request where id = '${id}'`);
  ok("PF-21d 2b pass: through the daily job, anything kept ends the request HELD (partial) with the front office's KEPT step", run.partial.includes(rKeeps) && statusOf(rKeeps) === "HELD"
    && /front-office: KEPT/.test(sql(`select string_agg(note, ' | ') from plat_data_request_event where request_id = '${rKeeps}'`)) && words(A, KEEPS.p).startsWith("Erased person"), { run, s: statusOf(rKeeps) });
  ok("PF-21d 2b fail: nothing kept ends COMPLETED, never HELD", run.erased.includes(rClean) && statusOf(rClean) === "COMPLETED", { run, s: statusOf(rClean) });
} catch (e) {
  ok("PF-21d 2b: the check ran to the end", false, String((e as { stderr?: unknown }).stderr ?? e).slice(0, 800));
} finally {
  await app.$disconnect().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
