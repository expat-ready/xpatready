// CS-DL1 part 2 (R1.74; briefs design/briefs/CS-DL1.md part 2, build-lead-c-briefs/CS-DL1b.md): a stage deadline's
// reminders as JobPort jobs, stopped by a close and armed again by a reopen.
//   * Only cited routes remind (P-412 F13 (b), Build Lead C's ruling): a SAMPLE route's deadline is shown, never reminded.
//   * The arm: for an open case's CURRENT stage deadline with a date, one keyed job per reminder (plan.ts), run at 09:00
//     (Sample) in the firm's zone; recipients the case's current OFFICER and LEAD_REPRESENTATIVE (case_team_member,
//     matched to the firm's staff by platform_staff.actor_id, or by id).
//   * The handler (AG-13-14 skip-if-stale): the job's firm must be the case's (else it reads nothing more); the case open,
//     the stage still current, the date, round and planned run time unchanged (its key is still the one today's calendar
//     gives), the day not passed; then one NotificationPort call
//     per person on the stage (item kind case-stage; AG-13-15: the job key and the port's one per person and item keep a redelivery from adding any).
//   * The two consumers, read from the outbox (module_event) by the sweep: `case.closed` cancels the case's waiting
//     reminder jobs (prefix `deadline:`, so never a recorded-date reminder: AG-7-34 r3, AG16-60); `case.reopened` arms
//     the ones still to come (AG-7-13 r5). A changed date arms a new set; the old jobs do nothing.
// CS-DL3 part 1 (QA-591): government steps (milestones.ts) remind by the same plan on queue MILESTONE_JOB, whatever the
// route's basis (ruling 3: the date is IRCC's). The sweep arms on `case.milestone_recorded` and cancels on
// `case.milestone_cancelled`; close and reopen as for the stage; the handler skips a cancelled step or a moved plan.
// No schema for the jobs: a job carries its state (its key and payload). Times only from the clock port (P-607). US$0, no model call.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { deadlineOf, type StoredDetail } from "../../../engine/runtime/stages.ts";
import type { ClockPort } from "../../../ports/clock.ts";
import { CaseClosedPayload, CaseMilestonePayload, CaseReopenedPayload, EVENT } from "../../../ports/events.ts";
import type { JobPort, JobRun } from "../../../ports/jobs.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../ports/notifications.ts";
import { deadlineDay } from "../case-stages.ts";
import { calendarDate, type FirmCalendar } from "../platform/calendar/working-days.ts";
import { firmScope } from "../platform/firm-scope.ts";
import { logPort } from "../platform/observability/log.ts";
import { readSpec } from "../routes-data.ts";
import { MILESTONE_JOB, milestoneRemindersOf } from "./milestones.ts";
import { REMINDER_JOB, remindersOf, stillToCome } from "./plan.ts";

export const SWEEP_JOB = "case_deadlines.sweep";
/** Sample: how often the sweep reads the outbox and arms new or moved deadlines (UTC, every 10 minutes). */
export const SWEEP_CRON = "*/10 * * * *";
const RECIPIENT_ROLES = ["OFFICER", "LEAD_REPRESENTATIVE"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ReminderPayload = z.strictObject({ caseId: z.uuid(), stageId: z.uuid(), offset: z.number().int(), due: z.string(), day: z.string(), round: z.number().int() });
const MilestoneReminderPayload = z.strictObject({ caseId: z.uuid(), milestoneId: z.uuid(), offset: z.number().int(), due: z.string(), day: z.string(), round: z.number().int() });
const SWEEP_EVENTS = [EVENT.CASE_CLOSED, EVENT.CASE_REOPENED, EVENT.CASE_MILESTONE_RECORDED, EVENT.CASE_MILESTONE_CANCELLED];

export type CaseDeadlinePorts = { db: PrismaClient; jobs: JobPort; notifications: NotificationPort<Prisma.TransactionClient>; clock: ClockPort };
type CaseRow = Awaited<ReturnType<CaseDeadlines["read"]>>;
/** A case's live deadline: its current stage, the date, the round and the firm's calendar; null when nothing reminds. */
type Live = { stageId: string; due: string; round: number; cal: FirmCalendar; today: string };

export class CaseDeadlines {
  /** The outbox position read so far (in memory: a restart reads every close and reopen again; each consumer is idempotent). */
  private seen = 0n;
  constructor(private readonly p: CaseDeadlinePorts) {}

  /** The handlers, and the sweep's schedule when `sweep` (the app; a suite runs `sweep()` itself). */
  async register(o: { sweep: boolean }) {
    await this.p.jobs.handle(REMINDER_JOB, async (job) => { await this.runReminder(job); });
    await this.p.jobs.handle(MILESTONE_JOB, async (job) => { await this.runMilestoneReminder(job); });
    await this.p.jobs.handle(SWEEP_JOB, () => this.sweep());
    if (o.sweep) await this.p.jobs.recurring(SWEEP_JOB, SWEEP_CRON, "UTC");
  }

  private read(id: string, firmId?: string) {
    return this.p.db.case.findFirst({
      where: { id, ...(firmId ? { firmId } : {}) },
      select: { id: true, firmId: true, firmKey: true, status: true, stages: { select: { id: true, workspaceId: true, stageKey: true, staffName: true, state: true, keyDetails: true, spec: true, routeKey: true } } },
    });
  }

  /** The current stage's deadline on a cited route, or null (no date, a Sample route, a date the calendar refuses). */
  private async live(c: NonNullable<CaseRow>): Promise<Live | null> {
    const cur = c.stages.find((s) => s.state === "CURRENT"), rule = cur ? readSpec(cur.spec).deadline : null;
    if (!cur || !rule || !cur.routeKey) return null;
    const route = await this.p.db.route.findUnique({ where: { workspaceId_key: { workspaceId: cur.workspaceId, key: cur.routeKey } }, select: { basis: true } });
    if (route?.basis !== "CITED") return null;
    const due = deadlineOf(rule, c.stages.map((s) => ({ stage_key: s.stageKey, staff_name: s.staffName, key_details: s.keyDetails as Record<string, StoredDetail>, defs: readSpec(s.spec).key_details })))?.due;
    try { if (!due) return null; calendarDate(due); } catch { return null; }
    const round = await this.p.db.moduleEvent.count({ where: { type: EVENT.CASE_REOPENED, subjectId: c.id } });
    const { cal, today } = await deadlineDay(this.p.db as never, this.p.clock, c.firmKey);
    return { stageId: cur.id, due, round, cal, today };
  }

  /** Arms the reminders still to come of an open case (a second arm queues nothing: the keys). Returns the keys queued. */
  async arm(caseId: string): Promise<string[]> {
    const c = await this.read(caseId);
    if (!c || c.status !== "OPEN" || !c.firmId) return [];
    const l = await this.live(c), queued: string[] = [];
    if (l) for (const r of stillToCome(remindersOf(c.id, l.stageId, l.due, l.round, l.cal), this.p.clock.now(), l.cal)) {
      const q = await this.p.jobs.schedule(REMINDER_JOB, r.at, { caseId: c.id, stageId: l.stageId, offset: r.offset, due: l.due, day: r.day, round: l.round }, { key: r.key, firmId: c.firmId! });
      if (q.queued) queued.push(r.key);
    }
    const s = await this.steps(c);
    for (const m of s.steps) for (const r of stillToCome(milestoneRemindersOf(m.id, m.due, s.round, s.cal), this.p.clock.now(), s.cal)) {
      const q = await this.p.jobs.schedule(MILESTONE_JOB, r.at, { caseId: c.id, milestoneId: m.id, offset: r.offset, due: m.due, day: r.day, round: s.round }, { key: r.key, firmId: c.firmId! });
      if (q.queued) queued.push(r.key);
    }
    return queued;
  }

  /** The case's open steps with a valid due date (any route basis: ruling 3), the round and the firm's calendar. */
  private async steps(c: NonNullable<CaseRow>, only?: string) {
    const rows = await this.p.db.caseMilestone.findMany({ where: { caseId: c.id, cancelledAt: null, dueOn: { not: null }, ...(only ? { id: only } : {}), ...(c.firmId ? { firmId: c.firmId } : {}) }, select: { id: true, dueOn: true } });
    const steps = rows.map((r) => ({ id: r.id, due: r.dueOn!.toISOString().slice(0, 10) })).filter((r) => { try { calendarDate(r.due); return true; } catch { return false; } });
    const round = await this.p.db.moduleEvent.count({ where: { type: EVENT.CASE_REOPENED, subjectId: c.id } });
    const { cal, today } = await deadlineDay(this.p.db as never, this.p.clock, c.firmKey);
    return { steps, round, cal, today };
  }

  /** `case.closed` (AG-7-34 r3): cancels the waiting deadline reminders of the closed case's round; a case reopened since
   *  is left alone (its new round is the reopen's). */
  async onCaseClosed(e: CaseClosedPayload): Promise<number> {
    const c = await this.read(CaseClosedPayload.parse(e).caseId);
    if (!c || c.status !== "CLOSED") return 0;
    const l = await this.live(c);
    let n = 0;
    if (l) for (const r of remindersOf(c.id, l.stageId, l.due, l.round, l.cal)) if (await this.p.jobs.cancel(r.key)) n++;
    const s = await this.steps(c);
    for (const m of s.steps) for (const r of milestoneRemindersOf(m.id, m.due, s.round, s.cal)) if (await this.p.jobs.cancel(r.key)) n++;
    return n;
  }

  /** `case.milestone_recorded`: arms the case's reminders still to come (the new step's among them). */
  async onMilestoneRecorded(e: CaseMilestonePayload): Promise<string[]> { return this.arm(CaseMilestonePayload.parse(e).caseId); }

  /** `case.milestone_cancelled`: cancels the step's waiting reminders of every round (one planned on an earlier calendar
   *  has another key, and its handler finds the step cancelled). */
  async onMilestoneCancelled(e: CaseMilestonePayload): Promise<number> {
    const p = CaseMilestonePayload.parse(e);
    const m = await this.p.db.caseMilestone.findFirst({ where: { id: p.milestoneId, caseId: p.caseId }, select: { id: true, dueOn: true, cancelledAt: true, case: { select: { firmKey: true } } } });
    if (!m || !m.cancelledAt || !m.dueOn) return 0;
    const due = m.dueOn.toISOString().slice(0, 10);
    try { calendarDate(due); } catch { return 0; }
    const round = await this.p.db.moduleEvent.count({ where: { type: EVENT.CASE_REOPENED, subjectId: p.caseId } });
    const { cal } = await deadlineDay(this.p.db as never, this.p.clock, m.case.firmKey);
    let n = 0;
    for (let r = 0; r <= round; r++) for (const x of milestoneRemindersOf(m.id, due, r, cal)) if (await this.p.jobs.cancel(x.key)) n++;
    return n;
  }

  /** `case.reopened` (AG-7-13 r5): arms the reminders still to come. */
  async onCaseReopened(e: CaseReopenedPayload): Promise<string[]> { return this.arm(CaseReopenedPayload.parse(e).caseId); }

  /** The sweep (a platform-wide run, no firm): the outbox's closes and reopens after the last read, in order, then every
   *  open case whose current stage is on a cited route (a new date, a moved stage, a changed key detail). */
  async sweep(): Promise<void> {
    const events = await this.p.db.moduleEvent.findMany({ where: { type: { in: SWEEP_EVENTS }, seq: { gt: this.seen } }, orderBy: { seq: "asc" }, select: { seq: true, type: true, payload: true } });
    for (const e of events) {
      try {
        if (e.type === EVENT.CASE_CLOSED) await this.onCaseClosed(e.payload as CaseClosedPayload);
        else if (e.type === EVENT.CASE_REOPENED) await this.onCaseReopened(e.payload as CaseReopenedPayload);
        else if (e.type === EVENT.CASE_MILESTONE_RECORDED) await this.onMilestoneRecorded(e.payload as CaseMilestonePayload);
        else await this.onMilestoneCancelled(e.payload as CaseMilestonePayload);
      }
      catch (err) { logPort.error("case_deadlines_consume_failed", err, { type: e.type, seq: String(e.seq) }); }
      this.seen = e.seq;
    }
    const since = new Date(this.p.clock.now().getTime() - 2 * 86_400_000).toISOString().slice(0, 10);   // the clock port's day (P-607)
    const open = await this.p.db.$queryRaw<{ id: string }[]>`select c.id::text from runtime_case c join case_stage s on s.case_id = c.id and s.state = 'CURRENT'
      join route r on r.workspace_id = s.workspace_id and r.key = s.route_key where c.status = 'OPEN' and c.firm_id is not null and r.basis = 'CITED'
      union select c.id::text from runtime_case c join case_milestone m on m.case_id = c.id
      where c.status = 'OPEN' and c.firm_id is not null and m.cancelled_at is null and m.due_on is not null and m.due_on >= ${since}::date`;
    for (const { id } of open) {
      try { await this.arm(id); } catch (err) { logPort.error("case_deadlines_arm_failed", err, { caseId: id }); }
    }
  }

  /** The reminder job (AG-13-14, AG-13-15). Returns how many people were told (0: stale, or another firm's case). */
  async runReminder(job: Pick<JobRun, "payload" | "firmId" | "key">): Promise<number> {
    const p = ReminderPayload.safeParse(job.payload);
    if (!p.success || !job.firmId || !UUID.test(job.firmId)) return 0;
    const firmId = firmScope(job.firmId).firmId;
    const c = await this.read(p.data.caseId, firmId);   // another firm's case is not read (DW10)
    const l = c?.status === "OPEN" ? await this.live(c) : null;
    // Stale unless the case's state today plans this very job: same stage, date, round, and run time in today's calendar.
    const want = l ? remindersOf(c!.id, l.stageId, l.due, l.round, l.cal).find((r) => r.offset === p.data.offset) : null;
    if (!c || !l || !want || want.key !== job.key || l.today > want.day) return 0;
    const staff = await this.recipients(c.id, firmId);
    await this.p.db.$transaction(async (tx) => {
      for (const id of staff) await this.p.notifications.notify(tx, { staffId: id }, NOTIFICATION_KIND.CASE_STAGE_DEADLINE, { kind: "case-stage", id: l.stageId });
    });
    return staff.length;
  }

  /** A government step's reminder job (AG-13-14, -15): how many were told (0: stale, cancelled, another firm's). */
  async runMilestoneReminder(job: Pick<JobRun, "payload" | "firmId" | "key">): Promise<number> {
    const p = MilestoneReminderPayload.safeParse(job.payload);
    if (!p.success || !job.firmId || !UUID.test(job.firmId)) return 0;
    const firmId = firmScope(job.firmId).firmId;
    const c = await this.read(p.data.caseId, firmId);   // another firm's case is not read
    if (!c || c.status !== "OPEN" || c.firmId !== firmId) return 0;
    const s = await this.steps(c, p.data.milestoneId), m = s.steps[0];
    // Stale unless today's state plans this very job: the step open, the same due date, round and run time.
    const want = m ? milestoneRemindersOf(m.id, m.due, s.round, s.cal).find((r) => r.offset === p.data.offset) : null;
    if (!m || !want || want.key !== job.key || s.today > want.day) return 0;
    const staff = await this.recipients(c.id, firmId);
    await this.p.db.$transaction(async (tx) => {
      for (const id of staff) await this.p.notifications.notify(tx, { staffId: id }, NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE, { kind: "case-milestone", id: m.id });
    });
    return staff.length;
  }

  /** The case's current officer and lead representative, as the firm's staff ids. */
  private async recipients(caseId: string, firmId: string): Promise<string[]> {
    const team = await this.p.db.caseTeamMember.findMany({ where: { caseId, endedAt: null, role: { in: RECIPIENT_ROLES } }, select: { userId: true } });
    const ids = [...new Set(team.map((t) => t.userId))];
    const staff = await this.p.db.platformStaff.findMany({ where: firmScope(firmId, { OR: [{ actorId: { in: ids } }, { id: { in: ids.filter((i) => UUID.test(i)) } }] }), select: { id: true } });
    return staff.map((x) => x.id);
  }
}
