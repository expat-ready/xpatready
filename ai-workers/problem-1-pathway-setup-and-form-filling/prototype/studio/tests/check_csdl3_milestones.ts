// CS-DL3 part 1 (R1.74, QA-591): government steps (case_milestone) and their reminders, DW1-DW7 each with a pass and a
// fail, the migration, review M1 and break m1-m3. A scratch database (every migration, Sample firms), SQL fixture cases on
// a CITED or SAMPLE route (test data, no immigration value), the services in process on fakeJobs and a FakeClock. US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_csdl3_milestones.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { CaseDeadlines } from "../api/src/case-deadlines/reminders.ts";
import { REMINDER_JOB } from "../api/src/case-deadlines/plan.ts";
import { MILESTONE_JOB, openMilestoneDeadlines } from "../api/src/case-deadlines/milestones.ts";
import { CaseMilestones, CaseMilestonesController } from "../api/src/features/case-milestones.ts";
import { CaseClose } from "../api/src/case-close.ts";
import { isOpenDay, type FirmCalendar } from "../api/src/platform/calendar/working-days.ts";
import { PLATFORM_ACCESS } from "../api/src/platform/identity/keys.ts";
import { MILESTONE_KEYS } from "../contracts/milestones.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeNotifications, NOTIFICATION_GROUP, NOTIFICATION_ITEM_KIND, NOTIFICATION_KIND } from "../ports/notifications.ts";
import { EVENT } from "../ports/events.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const MIG = join(import.meta.dirname, "..", "prisma", "migrations"), NEW = "20261120170000_csdl3_case_milestone";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PGA = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"], SDB = `xr_studio_csdl3_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${SDB}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refusedSql = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
/** An HttpException's status and body, or null when the call passed. */
const answer = async (p: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> => { try { await p; return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 500, body: { error: String(e) } }; } };

execFileSync(join(BIN, "dropdb"), [...PGA, "--if-exists", SDB]); execFileSync(join(BIN, "createdb"), [...PGA, SDB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: "ignore" });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });

try {
  await seedSampleFirms(db);
  const firm = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id, staff = async (actorId: string) => (await db.platformStaff.findUniqueOrThrow({ where: { actorId } })).id;
  const [FA, FB, REP, OFF, SOLO] = [await firm("sample-firm"), await firm("sample-solo"), await staff("user-R"), await staff("user-O"), await staff("user-S")];
  const W = randomUUID(), CMB = [randomUUID(), randomUUID()];
  sql(`set session_replication_role = replica; insert into workspace (id, key, label) values ('${W}', 'csdl3-${process.pid}', 'CS-DL3 check');
    insert into route (id, workspace_id, key, label, basis, stages, created_by) values (gen_random_uuid(), '${W}', 'test-cited', 'Test route (labelled test data)', 'CITED', '[{"key":"study"},{"key":"work"}]', 'seed:csdl3'), (gen_random_uuid(), '${W}', 'test-sample', 'Test route, Sample', 'SAMPLE', '[{"key":"study"},{"key":"work"}]', 'seed:csdl3')`);
  const clock = new FakeClock("2027-02-20T12:00:00.000Z"), jobs = fakeJobs(clock), inner = fakeNotifications({ now: () => clock.now() });
  const calls: { staffId: string; kind: string; item: { kind: string; id: string }; at: string }[] = [];
  const notifications = { ...inner, async notify(tx: unknown, r: { staffId: string }, k: never, i: never) { calls.push({ staffId: r.staffId, kind: k, item: i, at: clock.now().toISOString() }); return inner.notify(tx, r, k, i); } };
  const dl = new CaseDeadlines({ db, jobs, notifications: notifications as never, clock }), ms = new CaseMilestones(db as never), closer = new CaseClose(db as never);
  await dl.register({ sweep: false }); ms.clock = clock;
  const ctx = (firmId: string, firmKey: string, staffId: string) => ({ staffId, firmId, firmKey, roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" }) as never;
  const A = ctx(FA, "sample-firm", REP), B = ctx(FB, "sample-solo", SOLO);
  let n = 0;
  /** A case on `route` (a study date of 8 Mar 2027 giving the stage deadline); team user-R and user-O (firm A) or user-S (firm B). */
  const newCase = (o: { route?: string; firmKey?: string; firmId?: string } = {}) => {
    const id = randomUUID(), fk = o.firmKey ?? "sample-firm", fid = o.firmId ?? FA, route = o.route ?? "test-cited";
    const kd = `{"stage.permit_valid_until": {"value": "2027-03-08", "by": "user-O", "at": "2027-02-01T10:00:00.000Z"}}`;
    const spec = (dl: boolean) => JSON.stringify({ key_details: dl ? [] : [{ field: "stage.permit_valid_until", label: "Study permit valid until", type: "DATE" }], ...(dl ? { deadline: { label: "Apply by (test)", from_stage: "study", field: "stage.permit_valid_until", add_days: 0 } } : {}) });
    const team = fk === "sample-firm" ? `('user-R', 'LEAD_REPRESENTATIVE'), ('user-O', 'OFFICER')` : `('user-S', 'LEAD_REPRESENTATIVE')`;
    sql(`set session_replication_role = replica;
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id) values ('${id}', '${W}', '${CMB[1]}', 'user-P', 'user-O', 'C-2027-${String(++n).padStart(5, "0")}', '${fk}', '${fid}');
      insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, state, key_details, spec, route_key, application_subject_id, started_from) values
        (gen_random_uuid(), '${W}', '${id}', '${fk}', '${fid}', 1, 'study', 'Study permit', 'Study permit', '${CMB[0]}', 'DONE_BEFORE', '${kd}', '${spec(false)}', '${route}', null, null),
        (gen_random_uuid(), '${W}', '${id}', '${fk}', '${fid}', 2, 'work', 'Work permit', 'Work permit', '${CMB[1]}', 'CURRENT', '{}', '${spec(true)}', '${route}', gen_random_uuid(), 'BEGIN');
      insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) select gen_random_uuid(), '${W}', '${id}', u, r, 'seed:csdl3' from (values ${team}) t(u, r)`);
    return id;
  };
  const walk = async (to: string) => { while (clock.now() < new Date(to)) await clock.set(new Date(Math.min(clock.now().getTime() + 3_600_000, Date.parse(to)))); };
  const mjobs = (mid: string, status?: string) => jobs.jobs.filter((j) => j.name === MILESTONE_JOB && j.payload.milestoneId === mid && (!status || j.status === status));
  const told = (mid: string) => calls.filter((c) => c.item.kind === "case-milestone" && c.item.id === mid);
  const at = (mid: string) => [...new Set(told(mid).map((c) => c.at.slice(0, 16)))];
  const biometrics = (due: string | null, extra: Record<string, unknown> = {}) => ({ milestoneKey: "biometrics", occurredOn: "2027-02-15", dueOn: due, reference: "B-TEST-0001", ...extra });
  const WEEK: FirmCalendar["hours"] = ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, opens: "09:00", closes: "17:00" }));
  const allOpen = (days: string[], cal: FirmCalendar) => days.every((d) => isOpenDay(d, cal));

  // ---------------------------------------------------------------- the migration (M), the kind and the keys
  ok("CS-DL3 M1 pass: the migration has its rollback file, a stamp later than every other migration before it, and the table is insert-only apart from cancelling",
    existsSync(join(MIG, NEW, "rollback.sql")) && readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort().indexOf(NEW) >= 0
      && sql(`select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'case_milestone'::regclass and not tgisinternal`) === "case_milestone_insert,case_milestone_no_delete,case_milestone_no_truncate,case_milestone_no_update");
  ok("CS-DL3 M1 fail: the rollback drops the table and both functions and its _prisma_migrations row (read, not run)",
    /DROP TABLE "case_milestone"/.test(readFileSync(join(MIG, NEW, "rollback.sql"), "utf8")) && /case_milestone_refuse_change\(\), case_milestone_check_insert\(\)/.test(readFileSync(join(MIG, NEW, "rollback.sql"), "utf8")) && readFileSync(join(MIG, NEW, "rollback.sql"), "utf8").includes(NEW));
  ok("CS-DL3 kind pass: CASE_MILESTONE_DEADLINE is added after the earlier kinds (add-only), in My deadlines, with item kind case-milestone",
    NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE === "case-milestone-deadline" && Object.keys(NOTIFICATION_KIND).slice(0, 3).join() === "PORT_SELF_TEST,CASE_STAGE_DEADLINE,CASE_MILESTONE_DEADLINE" /* add-only: later rows add after these (FO-7c part 1) */
      && NOTIFICATION_GROUP[NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE] === "MY_DEADLINES" && NOTIFICATION_ITEM_KIND.slice(0, 6).join() === "case,firm,staff,review-round,case-stage,case-milestone");
  ok("CS-DL3 keys pass: the step list is fixed in code and Sample: biometrics, medical, ADR, PPR, procedural fairness, Other",
    MILESTONE_KEYS.join() === "biometrics,medical,adr,ppr,procedural_fairness,other" && (await ms.list(A, newCase())).sample === true);
  const unknownKey = await answer(ms.record(A, newCase(), { ...biometrics("2027-03-08"), milestoneKey: "visa_stamp" }));
  const otherNoNote = await answer(ms.record(A, newCase(), { ...biometrics("2027-03-08"), milestoneKey: "other" }));
  ok("CS-DL3 keys fail: a key not on the list is 400 at milestoneKey; Other without a note is 400 at note",
    unknownKey?.status === 400 && Object.keys(unknownKey.body.fields as object).join() === "milestoneKey" && otherNoNote?.status === 400 && Object.keys(otherNoNote.body.fields as object).join() === "note", [unknownKey, otherNoNote]);

  // ---------------------------------------------------------------- DW1 a biometrics letter's three reminders, on open days
  const c1 = newCase();
  const m1 = await ms.record(A, c1, biometrics("2027-03-08"));
  await dl.sweep();
  ok("CS-DL3 DW1 pass: a biometrics letter due Mon 8 Mar 2027 schedules three keyed jobs at 09:00 Toronto: Thu 25 Feb (7 working days), Thu 4 Mar (2), Mon 8 Mar (on the day), firm A's",
    mjobs(m1.id).map((j) => `${j.payload.offset}@${j.runAt.toISOString()}|${j.key}|${j.firmId}`).join() === [7, 2, 0].map((o, i) => { const d = ["2027-02-25", "2027-03-04", "2027-03-08"][i]; return `${o}@${d}T14:00:00.000Z|case_milestone:${m1.id}:${o}:2027-03-08:${d}T14:00:r0|${FA}`; }).join(),
    mjobs(m1.id).map((j) => [j.key, j.runAt]));
  ok("CS-DL3 DW1 pass: the view lists the reminder days and the due date as shown (never moved), with days left", m1.reminders.map((r) => r.day).join() === "2027-02-25,2027-03-04,2027-03-08" && m1.deadline?.shown === "Mon 8 Mar 2027" && m1.deadline.daysLeft === 16 && m1.deadline.missed === false, m1);
  const c1w = newCase(), m1w = await ms.record(A, c1w, biometrics("2027-03-07"));   // a Sunday
  await dl.sweep();
  const toronto: FirmCalendar = { zone: "America/Toronto", hours: WEEK, closedDays: [] };
  ok("CS-DL3 DW1 fail: a due date on a Sunday (7 Mar) is shown as the Sunday, but no reminder falls on the weekend: 7 before → Thu 25 Feb, 2 → Thu 4 Mar, on the day → Fri 5 Mar",
    m1w.deadline?.shown === "Sun 7 Mar 2027 (weekend)" && mjobs(m1w.id).map((j) => j.payload.day).join() === "2027-02-25,2027-03-04,2027-03-05" && allOpen(mjobs(m1w.id).map((j) => String(j.payload.day)), toronto), mjobs(m1w.id).map((j) => j.payload.day));
  ok("CS-DL3 DW1 fail: the open-day check catches a reminder dated on a weekend (Sat 6 Mar) or a closed day (Thu 4 Mar, firm closed)",
    !allOpen(["2027-03-04", "2027-03-06"], toronto) && !allOpen(["2027-03-04"], { ...toronto, closedDays: ["2027-03-04"] }) && allOpen(["2027-03-04"], toronto));
  await dl.sweep();
  ok("CS-DL3 DW1 fail: a second sweep queues nothing new (the keys)", mjobs(m1.id).length === 3);
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL3 DW1 pass: each fires once, to the representative and the officer, kind case-milestone-deadline",
    at(m1.id).join() === "2027-02-25T14:00,2027-03-04T14:00,2027-03-08T14:00" && told(m1.id).length === 6 && told(m1.id).every((c) => [REP, OFF].includes(c.staffId) && c.kind === "case-milestone-deadline"), at(m1.id));
  const noDue = await ms.record(A, newCase(), biometrics(null));
  await dl.sweep();
  ok("CS-DL3 DW1 fail: a letter with no due date arms nothing and shows no deadline", mjobs(noDue.id).length === 0 && noDue.deadline === null && noDue.reminders.length === 0);

  // ---------------------------------------------------------------- DW2 a due date is never edited
  await clock.set("2027-02-20T12:00:00.000Z");
  const routes = Object.getOwnPropertyNames(CaseMilestonesController.prototype).filter((k) => k !== "constructor").map((k) => {
    const h = (CaseMilestonesController.prototype as unknown as Record<string, object>)[k];
    return { k, method: Reflect.getMetadata(METHOD_METADATA, h), path: Reflect.getMetadata(PATH_METADATA, h), access: Reflect.getMetadata(PLATFORM_ACCESS, h) };
  });
  ok("CS-DL3 DW2 pass: the routes are GET (agent/case:show), POST (agent/case:edit) and POST :mid/cancel (agent/case:edit) under api/runtime/cases/:id/milestones",
    Reflect.getMetadata(PATH_METADATA, CaseMilestonesController) === "api/runtime/cases/:id/milestones"
      && routes.map((r) => `${RequestMethod[r.method]} ${r.path} ${r.access?.keys?.join("+")}`).sort().join("|") === ["GET / agent/case:show", "POST / agent/case:edit", "POST :mid/cancel agent/case:edit"].sort().join("|"), routes);
  ok("CS-DL3 DW2 fail: there is no update route (no PUT, PATCH or DELETE, and no service method that changes a line but cancel)",
    routes.every((r) => [RequestMethod.GET, RequestMethod.POST].includes(r.method)) && Object.getOwnPropertyNames(CaseMilestones.prototype).filter((k) => !k.startsWith("_") && !["constructor", "caseOf", "names", "view", "run", "record_"].includes(k)).sort().join() === "cancel,list,record");
  const c2 = newCase(), m2 = await ms.record(A, c2, biometrics("2027-03-08"));
  ok("CS-DL3 DW2 fail: a direct SQL update of the due date, of the note, an undo of a cancel, a delete and a truncate are refused by the triggers",
    refusedSql(`update case_milestone set due_on = '2027-04-08' where id = '${m2.id}'`, /recorded step never changes/)
      && refusedSql(`update case_milestone set note = 'x' where id = '${m2.id}'`, /recorded step never changes/)
      && refusedSql(`update case_milestone set cancelled_at = now(), cancelled_by = 'x', cancel_reason = 'r', due_on = '2027-04-08' where id = '${m2.id}'`, /recorded step never changes/)
      && refusedSql(`delete from case_milestone where id = '${m2.id}'`, /recorded step never changes/) && refusedSql(`truncate case_milestone`, /recorded step never changes/)
      && sql(`select due_on from case_milestone where id = '${m2.id}'`) === "2027-03-08");
  await dl.sweep();
  const missingReason = await answer(ms.cancel(A, c2, m2.id, { reason: "  " }));
  const cx = await ms.cancel(A, c2, m2.id, { reason: "Typed the wrong due date" });
  const again = await answer(ms.cancel(A, c2, m2.id, { reason: "Twice" }));
  ok("CS-DL3 DW2 fail: a cancel needs a reason (400 REASON_REQUIRED); a second cancel is 409 ALREADY_CANCELLED; an undo of the cancel by SQL is refused",
    missingReason?.status === 400 && missingReason.body.code === "REASON_REQUIRED" && again?.status === 409 && again.body.code === "ALREADY_CANCELLED"
      && refusedSql(`update case_milestone set cancelled_at = null, cancelled_by = null, cancel_reason = null where id = '${m2.id}'`, /recorded step never changes/), [missingReason, again]);
  const m2b = await ms.record(A, c2, biometrics("2027-03-15"));
  await dl.sweep();
  const l2 = await ms.list(A, c2);
  ok("CS-DL3 DW2 pass: cancel plus a new record keeps both lines: the cancelled one with its reason and who, and the new one open",
    l2.milestones.length === 2 && l2.milestones[0].id === m2.id && l2.milestones[0].cancelled?.reason === "Typed the wrong due date" && l2.milestones[0].cancelled.by.staffId === REP && l2.milestones[0].deadline === null
      && l2.milestones[1].id === m2b.id && l2.milestones[1].cancelled === null && l2.milestones[1].dueOn === "2027-03-15" && cx.cancelled !== null, l2.milestones);
  ok("CS-DL3 DW2 pass: the cancelled line's waiting jobs are cancelled; the new line's three are waiting", mjobs(m2.id, "cancelled").length === 3 && mjobs(m2b.id, "waiting").length === 3, [mjobs(m2.id).map((j) => j.status), mjobs(m2b.id).map((j) => j.status)]);
  const forced = mjobs(m2.id)[2];
  ok("CS-DL3 DW2 fail: a cancelled step's job delivered anyway tells nobody", (await dl.runMilestoneReminder({ payload: forced.payload, key: forced.key, firmId: FA })) === 0);
  await walk("2027-03-16T12:00:00.000Z");
  ok("CS-DL3 DW2 pass: only the new line reminds (Thu 4, Thu 11, Mon 15 Mar), never the cancelled one", told(m2.id).length === 0 && at(m2b.id).join() === "2027-03-04T14:00,2027-03-11T14:00,2027-03-15T13:00", at(m2b.id));

  // ---------------------------------------------------------------- DW3 close stops, reopen resumes
  await clock.set("2027-02-20T12:00:00.000Z");
  const c3 = newCase(), m3 = await ms.record(A, c3, biometrics("2027-03-08"));
  await dl.sweep(); await walk("2027-02-26T12:00:00.000Z");
  ok("CS-DL3 DW3 setup: the 7-day reminder fired on Thu 25 Feb", at(m3.id).join() === "2027-02-25T14:00");
  await closer.withdraw(A, c3, { reason: "Test: the client withdrew", withdrawnOn: "2027-02-26" }); await dl.sweep();
  const closedRecord = await answer(ms.record(A, c3, biometrics("2027-03-20")));
  await walk("2027-03-01T12:00:00.000Z");
  ok("CS-DL3 DW3 pass: the close cancels the step's waiting reminders (2 and 0) and none fires", mjobs(m3.id, "cancelled").length === 2 && told(m3.id).length === 2, mjobs(m3.id).map((j) => j.status));
  ok("CS-DL3 DW3 fail: a closed case takes no new step (409 CASE_CLOSED)", closedRecord?.status === 409 && closedRecord.body.code === "CASE_CLOSED", closedRecord);
  await closer.reopen(A, c3, { reason: "Test: the client came back" }); await dl.sweep(); await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL3 DW3 pass: the reopen arms those still to come (round 1) and each fires once: Thu 4 Mar and Mon 8 Mar",
    mjobs(m3.id).filter((j) => j.key.endsWith(":r1")).map((j) => j.payload.offset).join() === "2,0" && at(m3.id).join() === "2027-02-25T14:00,2027-03-04T14:00,2027-03-08T14:00" && told(m3.id).length === 6, at(m3.id));
  ok("CS-DL3 DW3 fail: the passed 7-day reminder is not armed again and never fires late", mjobs(m3.id).filter((j) => j.payload.offset === 7).length === 1);

  // ---------------------------------------------------------------- DW4 a Sample route's case still reminds (ruling 3)
  await clock.set("2027-02-20T12:00:00.000Z");
  const c4 = newCase({ route: "test-sample" }), m4 = await ms.record(A, c4, biometrics("2027-03-08"));
  await dl.sweep(); await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL3 DW4 pass: a biometrics letter on a Sample-route case arms its three reminders and they fire (the date comes from the letter)",
    mjobs(m4.id).length === 3 && told(m4.id).length === 6, mjobs(m4.id).map((j) => j.key));
  ok("CS-DL3 DW4 fail: the same case's Sample stage deadline still arms nothing (CS-DL1b's rule stays for the stage)",
    jobs.jobs.filter((j) => j.name === REMINDER_JOB && j.payload.caseId === c4).length === 0 && jobs.jobs.filter((j) => j.name === REMINDER_JOB && j.payload.caseId === c1).length === 3);

  // ---------------------------------------------------------------- DW5 firm walls
  await clock.set("2027-02-20T12:00:00.000Z");
  const c5 = newCase(), m5 = await ms.record(A, c5, biometrics("2027-03-08"));
  const cB = newCase({ firmKey: "sample-solo", firmId: FB }), mB = await ms.record(B, cB, biometrics("2027-03-08"));
  const b404 = [await answer(ms.list(B, c5)), await answer(ms.record(B, c5, biometrics("2027-03-08"))), await answer(ms.cancel(B, c5, m5.id, { reason: "x" })), await answer(ms.cancel(A, c5, mB.id, { reason: "x" })), await answer(ms.list(A, "not-a-uuid"))];
  ok("CS-DL3 DW5 fail: firm B gets 404 on firm A's case (list, record, cancel); firm A cannot cancel firm B's step through its own case; a bad id is 404",
    b404.every((x) => x?.status === 404) && sql(`select count(*) from case_milestone where case_id = '${c5}'`) === "1" && sql(`select cancelled_at is null from case_milestone where id = '${mB.id}'`) === "t", b404);
  ok("CS-DL3 DW5 pass: each firm reads its own case's steps", (await ms.list(A, c5)).milestones.map((m) => m.id).join() === m5.id && (await ms.list(B, cB)).milestones.map((m) => m.id).join() === mB.id);
  ok("CS-DL3 DW5 fail: a line naming another firm than its case's is refused by the insert trigger; a line inserted already cancelled too",
    refusedSql(`insert into case_milestone (id, firm_id, case_id, milestone_key, occurred_on, recorded_by) values (gen_random_uuid(), '${FB}', '${c5}', 'biometrics', '2027-02-15', 'x')`, /is not the firm of case/)
      && refusedSql(`insert into case_milestone (id, firm_id, case_id, milestone_key, occurred_on, recorded_by, cancelled_at, cancelled_by, cancel_reason) values (gen_random_uuid(), '${FA}', '${c5}', 'biometrics', '2027-02-15', 'x', now(), 'x', 'r')`, /never already cancelled/));
  await dl.sweep();
  const jB = mjobs(mB.id)[0], jA = mjobs(m5.id)[0];
  ok("CS-DL3 DW5 fail: a job carrying firm A's id refuses firm B's step, and firm B's id refuses firm A's: nobody told",
    jB.firmId === FB && (await dl.runMilestoneReminder({ payload: jB.payload, key: jB.key, firmId: FA })) === 0 && (await dl.runMilestoneReminder({ payload: jA.payload, key: jA.key, firmId: FB })) === 0 && told(mB.id).length === 0 && told(m5.id).length === 0);
  await walk("2027-03-09T12:00:00.000Z");
  ok("CS-DL3 DW5 pass: firm B's step tells firm B's representative only", told(mB.id).length === 3 && told(mB.id).every((c) => c.staffId === SOLO), told(mB.id));

  // ---------------------------------------------------------------- DW6 due before the letter's date
  await clock.set("2027-02-20T12:00:00.000Z");
  const c6 = newCase();
  const early = await answer(ms.record(A, c6, biometrics("2027-02-14")));
  const badDate = await answer(ms.record(A, c6, biometrics("2027-02-31")));
  ok("CS-DL3 DW6 pass: a due date before the letter's date is 400 at dueOn, and nothing is written", early?.status === 400 && Object.keys(early.body.fields as object).join() === "dueOn" && /can't be before/.test(String(early.body.detail)) && sql(`select count(*) from case_milestone where case_id = '${c6}'`) === "0", early);
  ok("CS-DL3 DW6 fail: a due date on the letter's own day is accepted (201 path), and a date that does not exist is 400 at dueOn",
    (await ms.record(A, c6, biometrics("2027-02-15"))).dueOn === "2027-02-15" && badDate?.status === 400 && Object.keys(badDate.body.fields as object).join() === "dueOn", badDate);
  ok("CS-DL3 DW6 fail: the database refuses a due date before the letter's date too", refusedSql(`insert into case_milestone (id, firm_id, case_id, milestone_key, occurred_on, due_on, recorded_by) values (gen_random_uuid(), '${FA}', '${c6}', 'biometrics', '2027-02-15', '2027-02-14', 'x')`, /case_milestone_due_check/));

  // ---------------------------------------------------------------- DW7 audit and outbox: ids only
  const c7 = newCase(), SECRET = `NOTE-${process.pid}-confidential`, REF = `REF-${process.pid}`, WHY = `WHY-${process.pid}`;
  const m7 = await ms.record(A, c7, { ...biometrics("2027-03-08"), reference: REF, note: SECRET });
  await ms.cancel(A, c7, m7.id, { reason: WHY });
  const lines = sql(`select action || '|' || detail::text from audit_event where entity = 'case' and entity_key = '${c7}' order by at, id`).split("\n");
  const events = sql(`select type || '|' || payload::text || '|' || firm_id from module_event where subject_id = '${c7}' order by seq`).split("\n");
  ok("CS-DL3 DW7 pass: one audit line per write (recorded, cancelled) with only the step's id, key and firm; one outbox event each with the case and step ids, firm A's",
    lines.length === 2 && lines.every((l, i) => { const [a, d] = [l.slice(0, l.indexOf("|")), JSON.parse(l.slice(l.indexOf("|") + 1))]; return a === ["case.milestone_recorded", "case.milestone_cancelled"][i] && Object.keys(d).sort().join() === "firmId,milestoneId,milestoneKey" && d.milestoneId === m7.id; })
      && events.length === 2 && events.every((e, i) => { const [t, p, f] = e.split("|"); return t === [EVENT.CASE_MILESTONE_RECORDED, EVENT.CASE_MILESTONE_CANCELLED][i] && Object.keys(JSON.parse(p)).sort().join() === "caseId,milestoneId" && JSON.parse(p).milestoneId === m7.id && f === FA; }), { lines, events });
  ok("CS-DL3 DW7 fail: the note, the letter's reference and the cancel reason appear in no audit line and no outbox event",
    [SECRET, REF, WHY].every((s) => sql(`select count(*) from audit_event where (summary || coalesce(detail::text, '')) like '%${s}%'`) === "0" && sql(`select count(*) from module_event where payload::text like '%${s}%'`) === "0")
      && sql(`select note from case_milestone where id = '${m7.id}'`) === SECRET);

  // ---------------------------------------------------------------- review M1: idempotent creates (STANDARDS §4); break m1-m3: text
  const c8 = newCase(), body8 = { ...biometrics("2027-03-08"), idempotencyKey: "retry-8" };
  const [k1, k2] = await Promise.all([ms.record(A, c8, body8), ms.record(A, c8, body8).catch((e) => e)]);
  const k3 = await ms.record(A, c8, body8), reused = await answer(ms.record(A, c8, { ...body8, dueOn: "2027-03-09" }));
  ok("CS-DL3 M1 pass (review): the same key again returns the first line (replayed), never a second one, and one audit line",
    k3.id === k1.id && k3.replayed === true && sql(`select count(*) from case_milestone where case_id = '${c8}'`) === "1" && sql(`select count(*) from audit_event where entity_key = '${c8}'`) === "1" && (k2.id === k1.id || (k2 as { getStatus?: () => number }).getStatus?.() === 409), [k1.id, k2, k3.id]);
  ok("CS-DL3 M1 fail (review): the same key with another due date is 409 IDEMPOTENCY_KEY_REUSED and writes nothing", reused?.status === 409 && reused.body.code === "IDEMPOTENCY_KEY_REUSED" && sql(`select count(*) from case_milestone where case_id = '${c8}'`) === "1", reused);
  const txt = await Promise.all([{ note: "a\ud800b" }, { reference: "B-\u202E1000" }].map((x) => answer(ms.record(A, c8, { ...biometrics("2027-03-08"), ...x }))));
  const lone = await answer(ms.cancel(A, c8, k1.id, { reason: "\udc00" })), emoji = await ms.record(A, c8, { ...biometrics("2027-03-08"), note: "😀".repeat(1500) });
  ok("CS-DL3 text fail (break m1, m3): a lone surrogate in a note or reason and a bidi override in a reference are 400 at the field", txt.every((x, i) => x?.status === 400 && Object.keys(x.body.fields as object).join() === ["note", "reference"][i]) && lone?.status === 400, [txt, lone]);
  ok("CS-DL3 text pass (break m2): limits count characters: a 1500-emoji note is accepted", [...(emoji.note ?? "")].length === 1500);

  // ---------------------------------------------------------------- the case's deadlines read (the stages read's milestones)
  const { cal: calA, today } = { cal: toronto, today: "2027-02-20" };
  const read = await openMilestoneDeadlines(db as never, c2, calA, today);
  ok("CS-DL3 R1 pass: the case's deadlines read lists open steps with a due date beside the stage deadline (the new line, 15 Mar)", read.length === 1 && read[0].id === m2b.id && read[0].due === "2027-03-15" && read[0].words === "Biometrics instruction letter" && read[0].reference === "B-TEST-0001", read);
  ok("CS-DL3 R1 fail: a cancelled step and a step with no due date are not listed", (await openMilestoneDeadlines(db as never, c7, calA, today)).length === 0 && !(await openMilestoneDeadlines(db as never, c2, calA, today)).some((x) => x.id === m2.id));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PGA, "--if-exists", SDB]);
}

process.exit(summary() ? 1 : 0);
