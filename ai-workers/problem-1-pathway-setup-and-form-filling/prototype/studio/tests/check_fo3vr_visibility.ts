// FO-3vr (AG-4-67 rules 1-5, its two tests and its edge case; AG-2-64 rules 2-3; brief lead-b-briefs/FO-3vr.md): a booking
// follows the visibility of the record it hangs on, or its host sees it. One named case per Done when line, a pass and a
// fail each: DW1 a colleague's lead · DW2 the host · DW3 a host change · DW4 prospects · DW5 not linked yet · DW6 firm
// walls, READ_ONLY and Billing/Finance · DW7 the rule is in the query. (DW8 is the other suites, run unchanged.)
// The firm's "everyone sees all" is on, and a Case Officer role copy without agent/prospect:view.all is made here (PF-6b
// DW6's pattern; FO-2v's check). Keys are read from platform_role_permission, as the migrations seed them. One scratch
// database with every migration; the booking service is built with PF-0p's fakes; no server, no browser, no model call
// (US$0). Bookings are written straight to the database (Sample rows). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo3vr_visibility.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3vr_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function status(fn: () => Promise<unknown>): Promise<number> {
  try { await fn(); return 200; } catch (e) { const x = e as { getStatus?: () => number }; if (!x.getStatus) throw e; return x.getStatus(); }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL_;

const { BookingService } = await import("../api/src/front-office/booking/service.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { seedFirmFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
type StaffContext = import("../api/src/platform/identity/keys.ts").StaffContext;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  const HOUR = 3_600_000, T0 = Date.parse("2027-01-11T14:00:00Z");   // a Monday; the clock sits a week before
  const clock = new FakeClock(new Date(T0 - 7 * 24 * HOUR));
  const ports = { audit: fakeAudit() as never, clock, jobs: fakeJobs(clock), mail: fakeMail({ clock }), arrival: fakeArrival(), publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
  const svc = new BookingService(db, ports as never);

  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => sql(`insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), '${key}', 'Sample ${key}', 'CA', 'ACTIVE', '${key}@firm.example', now()) returning id`);
  const [A, B] = [firm("fo3vr-a"), firm("fo3vr-b")];
  for (const f of [A, B]) await db.$transaction((tx) => seedFirmFrontOffice(tx, f));
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const keysOf = (role: string) => sql(`select coalesce(string_agg(permission_key, ','), '') from platform_role_permission where role::text = '${role}'`).split(",").filter(Boolean);
  let n = 0;
  const staff = (f: string, name: string) => sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${f}', 'fo3vr.staff${++n}@example.com', '${name} (Sample)', now()) returning id`);
  const ctx = (f: string, staffId: string, keys: string[]): StaffContext => ({ staffId, firmId: f, firmKey: "fo3vr", roles: [], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" });
  const officerKeys = keysOf("CASE_OFFICER");
  const own = ctx(A, staff(A, "Officer own-only"), officerKeys.filter((k) => k !== "agent/prospect:view.all" && k !== "agent/prospect:assign"));
  const colleague = ctx(A, staff(A, "Colleague"), officerKeys);
  const allK = [...new Set([...officerKeys, "agent/prospect:view.all", "agent/booking:list"])];
  const viewAll = ctx(A, staff(A, "Officer view.all"), allK);
  const assigner = ctx(A, staff(A, "Assigner"), [...new Set([...own.keys, "agent/prospect:assign"])]);
  const readOnly = ctx(A, staff(A, "Read only"), keysOf("READ_ONLY"));
  const billing = ctx(A, staff(A, "Billing"), keysOf("BILLING_FINANCE"));
  const firmB = ctx(B, staff(B, "Firm B owner"), keysOf("OWNER"));
  ok("FO-3vr setup: the own-only Case Officer holds agent/booking:list and neither view.all nor assign", own.keys.includes("agent/booking:list") && !own.keys.includes("agent/prospect:view.all") && !own.keys.includes("agent/prospect:assign"), own.keys);

  const person = (f: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${f}', 'Client ${++n}', 'Sample', 'fo3vr${n}@example.com', 'test', now()) returning id`);
  const lead = (f: string, p: string, owner: string | null) => sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${f}', '${p}', 'MANUAL', 'WEBSITE', ${owner ? `'${owner}'` : "null"}, 'test', now()) returning id`);
  const types = new Map<string, string>();
  const typeOf = (f: string) => types.get(f) ?? (types.set(f, sql(`insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'free', 'Free consultation', '{VIDEO}', '{}', 30, now()) returning id`)), types.get(f)!);
  let slot = 0;
  const booking = (f: string, host: string, link: { personId?: string; prospectId?: string } = {}, at?: number) => {
    const s = new Date(at ?? T0 + slot++ * HOUR), e = new Date(s.getTime() + 30 * 60_000);
    sql(`update fo_consultation_type set host_staff_ids = array_append(host_staff_ids, '${host}'::uuid) where id = '${typeOf(f)}' and not ('${host}'::uuid = any(host_staff_ids))`);
    return sql(`insert into fo_booking (id, firm_id, type_id, staff_id, person_id, prospect_id, mode, starts_at, ends_at, visitor_time_zone, updated_at) values (gen_random_uuid(), '${f}', '${typeOf(f)}', '${host}', ${link.personId ? `'${link.personId}'` : "null"}, ${link.prospectId ? `'${link.prospectId}'` : "null"}, 'VIDEO', '${s.toISOString()}', '${e.toISOString()}', 'America/Toronto', now()) returning id`);
  };
  const range = { from: new Date(T0 - HOUR).toISOString(), to: new Date(T0 + 90 * 24 * HOUR).toISOString() };
  const listed = async (c: StaffContext) => new Set((await svc.staffList(c, range)).map((b) => b.id));
  const byId = (c: StaffContext, id: string) => status(() => svc.staffGet(c, id));
  const due = async (c: StaffContext) => { clock.set(new Date(T0 + 200 * 24 * HOUR)); try { return new Set((await svc.attendanceDue(c)).map((b) => b.id)); } finally { clock.set(new Date(T0 - 7 * 24 * HOUR)); } };

  // A booking on the colleague's lead, hosted by the colleague.
  const pColleague = person(A); lead(A, pColleague, colleague.staffId);
  const onColleaguesLead = booking(A, colleague.staffId, { personId: pColleague });

  // ------------------------------------------------------------------------------------------- DW1 (AG-4-67 test 1)
  const [l1, d1, g1] = [await listed(own), await due(own), await byId(own, onColleaguesLead)];
  ok("FO-3vr DW1 fail (AG-4-67 test 1): the own-only Case Officer does not see a booking on a colleague's lead: not in GET bookings, not in attendance-due, 404 by id",
    !l1.has(onColleaguesLead) && !d1.has(onColleaguesLead) && g1 === 404, { list: l1.has(onColleaguesLead), due: d1.has(onColleaguesLead), get: g1 });
  const [l2, d2, g2] = [await listed(viewAll), await due(viewAll), await byId(viewAll, onColleaguesLead)];
  ok("FO-3vr DW1 pass: the view.all holder (everyone sees all on) sees it in the list, attendance-due and by id", l2.has(onColleaguesLead) && d2.has(onColleaguesLead) && g2 === 200, { list: l2.has(onColleaguesLead), due: d2.has(onColleaguesLead), get: g2 });

  // ------------------------------------------------------------------------------------------- DW2 (AG-4-67 test 2)
  const hosted = booking(A, own.staffId, { personId: pColleague });
  const [l3, g3] = [await listed(own), await byId(own, hosted)];
  ok("FO-3vr DW2 pass (AG-4-67 test 2): the same Case Officer, as host of a booking on a colleague's lead, sees it in the list and by id", l3.has(hosted) && g3 === 200, { list: l3.has(hosted), get: g3 });
  const hostNoKey = ctx(A, own.staffId, own.keys.filter((k) => k !== "agent/booking:list"));
  const [g3b, g3c] = [await byId(hostNoKey, hosted), await byId(hostNoKey, onColleaguesLead)];
  ok("FO-3vr DW2 fail: without the list key the host still opens their own (200) and never the colleague's (404); the list without the key gives only their own", g3b === 200 && g3c === 404 && [...(await listed(hostNoKey))].every((id) => id === hosted), { g3b, g3c });

  // ------------------------------------------------------------------------------------------- DW3 (edge case: host changed)
  const moved = booking(A, own.staffId, { personId: pColleague });
  const before = await byId(own, moved);
  sql(`update fo_consultation_type set host_staff_ids = array_append(host_staff_ids, '${colleague.staffId}'::uuid) where id = '${typeOf(A)}' and not ('${colleague.staffId}'::uuid = any(host_staff_ids))`);
  sql(`update fo_booking set staff_id = '${colleague.staffId}', status = 'RESCHEDULED', sequence = sequence + 1 where id = '${moved}'`);   // the host change (no staff route changes the host on main)
  const [l4, g4, g4c] = [await listed(own), await byId(own, moved), await byId(colleague, moved)];
  ok("FO-3vr DW3 fail (edge case): after the host changes to the colleague, the old host (no record rule) no longer sees it: not listed, 404 by id", before === 200 && !l4.has(moved) && g4 === 404, { before, list: l4.has(moved), get: g4 });
  const back = booking(A, colleague.staffId, { personId: pColleague });   // hosted by the lead's owner, then moved to the officer
  sql(`update fo_booking set staff_id = '${own.staffId}', status = 'RESCHEDULED', sequence = sequence + 1 where id = '${back}'`);
  const [g5, g5n] = [await byId(colleague, back), await byId(own, back)];
  ok("FO-3vr DW3 pass: the new host sees it (200); an old host whose record rule allows it (the lead's owner) still sees theirs after it moved to the officer, and the officer as new host sees it", g4c === 200 && g5 === 200 && g5n === 200 && (await listed(colleague)).has(back), { g4c, g5, g5n });

  // ------------------------------------------------------------------------------------------- DW4 (prospects)
  const prospect = (owner: string | null, leadOwner: string | null = owner, p = person(A)) => {
    const l = lead(A, p, leadOwner), _e = sql(`update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${l}'`), st = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and kind = 'ACTIVE' order by sort_order limit 1`);
    return sql(`insert into fo_prospect (id, firm_id, lead_id, primary_contact_person_id, subject_person_id, owner_staff_id, type, stage_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${l}', '${p}', '${p}', ${owner ? `'${owner}'` : "null"}, 'INDIVIDUAL', '${st}', 'test', now()) returning id`);
  };
  let prospects: { mine: string; theirs: string; none: string } | null = null;
  try { prospects = { mine: prospect(own.staffId), theirs: prospect(colleague.staffId), none: prospect(null) }; } catch (e) { ok("FO-3vr DW4 setup: prospects can be written", false, String(e).slice(0, 400)); }
  if (prospects) {
    const host = staff(A, "Prospect host");
    const [bMine, bTheirs, bNone] = [booking(A, host, { prospectId: prospects.mine }), booking(A, host, { prospectId: prospects.theirs }), booking(A, host, { prospectId: prospects.none })];
    const lo = await listed(own), la = await listed(assigner), lv = await listed(viewAll);
    ok("FO-3vr DW4 pass: a booking on a prospect the Case Officer owns is seen (list and by id)", lo.has(bMine) && (await byId(own, bMine)) === 200);
    ok("FO-3vr DW4 fail: on a prospect a colleague owns it is not (list, 404 by id); on an ownerless prospect not either without assign or view.all", !lo.has(bTheirs) && (await byId(own, bTheirs)) === 404 && !lo.has(bNone) && (await byId(own, bNone)) === 404);
    ok("FO-3vr DW4 pass: the ownerless prospect's booking is seen with agent/prospect:assign and with view.all; a deactivated owner counts as no owner",
      la.has(bNone) && lv.has(bNone) && (await byId(assigner, bNone)) === 200 && !la.has(bTheirs) && (sql(`update platform_staff set status = 'DEACTIVATED' where id = '${colleague.staffId}'`), (await listed(assigner)).has(bTheirs)) && (sql(`update platform_staff set status = 'ACTIVE' where id = '${colleague.staffId}'`), true));
    // Review m1: rule 2 c (a booking on the person only, whose prospect the officer owns, the lead a colleague's) and a
    // deactivated owner on the direct link (seesBooking), each a pass and a fail.
    const p2c = person(A); prospect(own.staffId, colleague.staffId, p2c);
    const b2c = booking(A, host, { personId: p2c }), lo2 = await listed(own);
    ok("FO-3vr DW4 pass (AG-2-64 rule 2 c): a booking naming only the person, whose prospect the officer owns (the lead is a colleague's), is seen in the list and by id", lo2.has(b2c) && (await byId(own, b2c)) === 200);
    const pNot = person(A); prospect(colleague.staffId, colleague.staffId, pNot);
    const bNot = booking(A, host, { personId: pNot });
    ok("FO-3vr DW4 fail: the same with the prospect and the lead both a colleague's is not (list, 404 by id)", !(await listed(own)).has(bNot) && (await byId(own, bNot)) === 404);
    // Lead B on #2308 (apply; AG-2-64 rule 3): a booking naming only the person whose prospect has no active owner (the
    // lead's owner active) follows the prospect's rule too: seen with assign, not by the own-only officer.
    const pNo = person(A); prospect(null, colleague.staffId, pNo);
    const bNo = booking(A, host, { personId: pNo });
    ok("FO-3vr DW4 pass (AG-2-64 rule 3, person only): the assigner sees a booking naming only the person whose prospect has no active owner (list, 200 by id)", (await listed(assigner)).has(bNo) && (await byId(assigner, bNo)) === 200);
    ok("FO-3vr DW4 fail: the own-only officer does not (list, 404 by id)", !(await listed(own)).has(bNo) && (await byId(own, bNo)) === 404);
    const beforeOff = await byId(assigner, bTheirs);
    sql(`update platform_staff set status = 'DEACTIVATED' where id = '${colleague.staffId}'`);
    const [offId, offOwn] = [await byId(assigner, bTheirs), await byId(own, bTheirs)];
    sql(`update platform_staff set status = 'ACTIVE' where id = '${colleague.staffId}'`);
    ok("FO-3vr DW4 pass/fail (BR-4, direct link): a colleague's prospect is 404 by id for the assigner while the owner is active, 200 once the owner is deactivated (no active owner); the own-only officer stays 404", beforeOff === 404 && offId === 200 && offOwn === 404, { beforeOff, offId, offOwn });
  }

  // Review m1: a deactivated lead owner counts as no owner on a booking that names only the person (list and by id).
  const pDeact = person(A); lead(A, pDeact, colleague.staffId);
  const bDeact = booking(A, staff(A, "Lead host"), { personId: pDeact });
  const onBefore = (await listed(assigner)).has(bDeact);
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${colleague.staffId}'`);
  const [onAfter, idAfter, ownAfter] = [(await listed(assigner)).has(bDeact), await byId(assigner, bDeact), (await listed(own)).has(bDeact)];
  sql(`update platform_staff set status = 'ACTIVE' where id = '${colleague.staffId}'`);
  ok("FO-3vr DW4 pass/fail (BR-4, a lead's owner deactivated): the assigner does not see the booking while the lead's owner is active, sees it (list, 200 by id) once deactivated; the own-only officer never", !onBefore && onAfter && idAfter === 200 && !ownAfter, { onBefore, onAfter, idAfter, ownAfter });

  // ------------------------------------------------------------------------------------------- DW5 (not linked yet)
  const unlinkedNoPerson = booking(A, colleague.staffId), unlinkedPerson = booking(A, colleague.staffId, { personId: person(A) });
  const la5 = await listed(assigner), lo5 = await listed(own);
  ok("FO-3vr DW5 pass (rule 3): a not-linked booking (no person, or a person with no lead or prospect) is seen by an agent/prospect:assign holder", la5.has(unlinkedNoPerson) && la5.has(unlinkedPerson) && (await byId(assigner, unlinkedPerson)) === 200);
  ok("FO-3vr DW5 fail: the own-only Case Officer does not see either (list, 404 by id)", !lo5.has(unlinkedNoPerson) && !lo5.has(unlinkedPerson) && (await byId(own, unlinkedNoPerson)) === 404);

  // ------------------------------------------------------------------------------------------- DW6 (walls, READ_ONLY, Billing)
  const inB = booking(B, firmB.staffId, { personId: person(B) });
  const lr = await listed(readOnly), lb = await listed(firmB), firmARows = sql(`select count(*) from fo_booking where firm_id = '${A}'`);
  ok("FO-3vr DW6 pass: READ_ONLY (agent/booking:list and view.all) sees the firm's rows", readOnly.keys.includes("agent/booking:list") && readOnly.keys.includes("agent/prospect:view.all") && lr.size === Number(firmARows) && !lr.has(inB), { size: lr.size, firmARows });
  ok("FO-3vr DW6 fail: firm B's bookings never reach firm A (list, 404 by id), and firm B sees none of firm A's", !lr.has(inB) && (await byId(viewAll, inB)) === 404 && lb.size === 1 && lb.has(inB));
  const declared = Reflect.getMetadataKeys(BookingStaffController.prototype.list).map((k) => JSON.stringify(Reflect.getMetadata(k, BookingStaffController.prototype.list))).join(" ");
  ok("FO-3vr DW6 fail: Billing/Finance holds no agent/booking:list, and GET bookings and attendance-due declare that key for PF-4's guard (403 before the service)",
    !billing.keys.includes("agent/booking:list") && declared.includes("agent/booking:list") && JSON.stringify(Reflect.getMetadataKeys(BookingStaffController.prototype.attendanceDue).map((k) => Reflect.getMetadata(k, BookingStaffController.prototype.attendanceDue))).includes("agent/booking:list"), declared);

  // ------------------------------------------------------------------------------------------- DW7 (in the query)
  const quiet = ctx(A, staff(A, "Quiet officer"), own.keys);
  const pQ = person(A); lead(A, pQ, quiet.staffId);
  const visible = [booking(A, quiet.staffId), booking(A, colleague.staffId, { personId: pQ }), booking(A, colleague.staffId, { personId: pQ })];
  const pOther = person(A); lead(A, pOther, colleague.staffId);
  for (let i = 0; i < 147; i++) booking(A, colleague.staffId, { personId: pOther });
  const reads: { model: string; args: unknown }[] = [], raws: string[] = [];
  const spy = db.$extends({ query: { $allModels: { async findMany({ model, args, query }) { reads.push({ model, args }); return query(args); } } } });
  const spyDb = new Proxy(spy, { get(t, k) { if (k === "$queryRaw") return (s: TemplateStringsArray | { strings?: string[] }, ...v: unknown[]) => { raws.push(Array.isArray(s) ? s.join("?") : String((s as { strings?: string[] }).strings?.join("?") ?? s)); return (t as never as PrismaClient).$queryRaw(s as never, ...v); }; return Reflect.get(t, k); } });
  const spied = new BookingService(spyDb as never, ports as never);
  const got = await spied.staffList(quiet, range);
  const bookingReads = reads.filter((r) => r.model === "FoBooking");
  ok("FO-3vr DW7 pass: with 150+ bookings of which 3 are the officer's to see, a 90-day list returns exactly those 3, none dropped by a cap",
    got.length === 3 && visible.every((id) => got.some((g) => g.id === id)) && Number(sql(`select count(*) from fo_booking where firm_id = '${A}'`)) >= 150, got.map((g) => g.id));
  const where = JSON.stringify(bookingReads[0]?.args ?? {});
  ok("FO-3vr DW7 fail: one findMany on fo_booking carries the visibility in its where (the 3 ids from the SQL record rule), and the record rule ran in SQL (fo_lead, fo_prospect, the host), not after a read",
    bookingReads.length === 1 && visible.every((id) => where.includes(id)) && raws.length === 1 && /fo_lead/.test(raws[0]) && /fo_prospect/.test(raws[0]) && /staff_id/.test(raws[0]), { bookingReads: bookingReads.length, raws: raws.length });
  // Review m2 (break F1) and re-review n1: a visible set larger than one read's ids is read in pieces and merged in
  // time order. The officer's own bookings are written latest first, so the record rule's ids come back out of time order
  // and only the merge puts them right; attendance-due is checked the same way.
  const late = ctx(A, staff(A, "Late officer"), own.keys);
  const mine = [5, 4, 3, 2, 1].map((d) => booking(A, late.staffId, {}, T0 + 60 * 24 * HOUR + d * HOUR));
  const one = (await svc.staffList(late, range)).map((b) => b.id), dueOne = (await due(late)).size;
  svc.seenChunk = 1;
  const pieces = (await svc.staffList(late, range)).map((b) => b.id), duePieces = await due(late);
  svc.seenChunk = 10_000;
  ok("FO-3vr DW7 pass/fail: read one id at a time, the list has the same bookings in the same (time) order as in one read, and attendance-due the same set",
    one.length === 5 && pieces.join() === one.join() && one.join() === [...mine].reverse().join() && duePieces.size === dueOne && dueOne === 5, { one, pieces, dueOne, duePieces: duePieces.size });
} catch (e) {
  ok("FO-3vr: the check ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 1500));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
}
console.log(`\nFO-3vr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
