// CS-DL3 part 1 (R1.74, QA-591; brief design/build-lead-c-briefs/CS-DL3.md; Doc 3 Agent Console line 3337 CaseMilestone,
// line 3141 "drives the Minder ... as the deadline nears"; AG-7-96 r7): a case's government steps (an IRCC letter asking
// for biometrics, a medical exam, documents, a passport, or a procedural fairness letter) with the letter's date and,
// when it gives one, its due date as typed by staff. The app never computes a government deadline (P-170).
//   * Record and cancel only (case_milestone is insert-only apart from cancelling; its triggers refuse anything else):
//     a wrong due date is cancelled and recorded again, and both lines stay.
//   * Each write is one transaction: the case row locked (the session's firm, else 404, never 403: BR-20), the line, one
//     audit line (AuditPort, through Audit) and one outbox event (case.milestone_recorded / case.milestone_cancelled),
//     ids only: never the note, the reference or the reason.
//   * Reminders (reminders.ts): the stage plan's offsets (plan.ts) counted back over the firm's open days, as JobPort jobs
//     keyed `case_milestone:<id>:<offset>:<due>:<run time>:r<reopens>`, armed by the sweep from the outbox. A milestone
//     reminds whatever its route's basis is (ruling 3 of the brief: the date comes from the letter, not from a Sample rule).
// Times only from the clock port (P-607). US$0, no model call.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import {
  CancelMilestoneBody, MILESTONE_KEYS, MILESTONE_WORDS, RecordMilestoneBody,
  type CaseMilestonesView, type MilestoneDeadline, type MilestoneDue, type MilestoneKey, type MilestoneView,
} from "../../../contracts/milestones.ts";
import { systemClock, type ClockPort } from "../../../ports/clock.ts";
import { CaseMilestonePayload, EVENT } from "../../../ports/events.ts";
import { deadlineDay } from "../case-stages.ts";
import { Audit, Db } from "../core.ts";
import { countBack, dayMark, NO_SUCH_DATE, zonedInstant, type FirmCalendar } from "../platform/calendar/working-days.ts";
import { problem, type StaffContext } from "../platform/identity/keys.ts";
import { REMINDER_OFFSETS, REMINDER_TIME, stillToCome, type Reminder } from "./plan.ts";

export { MILESTONE_KEYS, MILESTONE_WORDS };
/** The milestone reminder job's queue, and the prefix of every one of its keys (never `deadline:`, so a stage's close
 *  consumer and a milestone's never cancel each other's jobs by mistake). */
export const MILESTONE_JOB = "case_deadlines.milestone_reminder";
export const MILESTONE_KEY_PREFIX = "case_milestone:";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** One reminder's key: the step, the offset, the due date, the planned run time (a calendar change plans a new time, a
 *  new key) and the case's reopens (JobPort never queues a used key twice, even after a cancel). */
export const milestoneReminderKey = (milestoneId: string, offset: number, due: string, at: Date, round: number) =>
  `${MILESTONE_KEY_PREFIX}${milestoneId}:${offset}:${due}:${at.toISOString().slice(0, 16)}:r${round}`;

/** Every reminder of a step's due date in the firm's calendar (plan.ts's offsets and time: Sample). */
export function milestoneRemindersOf(milestoneId: string, due: string, round: number, cal: FirmCalendar): Reminder[] {
  return REMINDER_OFFSETS.map((offset) => {
    const day = countBack(due, offset, cal), at = zonedInstant(day, REMINDER_TIME, cal.zone);
    return { offset, day, at, key: milestoneReminderKey(milestoneId, offset, due, at, round) };
  });
}

/** A due date as the case shows it; a date the calendar refuses shows no weekday and no mark (never a 500). */
export function showDue(due: string, cal: FirmCalendar, today: string): MilestoneDue {
  const daysLeft = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  let m: ReturnType<typeof dayMark> | null = null;
  try { m = dayMark(due, cal); } catch (e) { if (!(e instanceof RangeError && e.message === NO_SUCH_DATE)) throw e; }
  return { due, weekday: m?.weekday ?? null, mark: m?.mark ?? null, shown: m ? `${m.weekday} ${fmt(due)}${m.mark ? ` (${m.mark})` : ""}` : null, missed: due < today, daysLeft };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const wordsOf = (key: string) => (MILESTONE_WORDS as Record<string, string>)[key] ?? key;

/** The case's open steps with a due date, for the case's stages read (beside the stage deadline), earliest first. */
export async function openMilestoneDeadlines(db: Db | Tx, caseId: string, cal: FirmCalendar, today: string): Promise<MilestoneDeadline[]> {
  const rows = await db.caseMilestone.findMany({ where: { caseId, cancelledAt: null, dueOn: { not: null } }, orderBy: [{ dueOn: "asc" }, { recordedAt: "asc" }], select: { id: true, milestoneKey: true, reference: true, dueOn: true } });
  return rows.map((r) => ({ id: r.id, key: r.milestoneKey, words: wordsOf(r.milestoneKey), reference: r.reference, ...showDue(isoDay(r.dueOn!), cal, today) }));
}

const notFound = (what = "case"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
/** A body read through its schema: the first failed check answers 400 at its field (a missing reason: REASON_REQUIRED). */
function parsed<S extends z.ZodType>(schema: S, b: unknown): z.infer<S> {
  const r = schema.safeParse(b && typeof b === "object" && !Array.isArray(b) ? b : {});
  if (r.success) return r.data;
  const i = r.error.issues[0], field = String(i.path[0] ?? "body");
  if ((i as { params?: { code?: string } }).params?.code === "REASON_REQUIRED") return problem(400, "A reason is needed", i.message, { code: "REASON_REQUIRED", fields: { [field]: i.message } });
  return problem(400, "Check the details", i.message, { code: "INVALID", fields: { [field]: i.message } });
}

type Row = { id: string; milestoneKey: string; occurredOn: Date; dueOn: Date | null; reference: string | null; note: string | null; recordedAt: Date; recordedBy: string; cancelledAt: Date | null; cancelledBy: string | null; cancelReason: string | null };
type CaseHead = { id: string; workspaceId: string; caseNumber: string; firmKey: string; status: string; firmId: string };

@Injectable()
export class CaseMilestones {
  /** P-607: today comes from the clock port (a suite sets a FakeClock here). */
  clock: ClockPort = systemClock;
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The case, if it is the session's firm's (locked for this transaction when `lock`); 404 otherwise. */
  private async caseOf(tx: Db | Tx, ctx: StaffContext, id: string, lock: boolean): Promise<CaseHead> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const hit = lock
      ? await tx.$queryRaw<{ id: string }[]>`select id::text from runtime_case where id = ${id}::uuid and firm_key = ${ctx.firmKey} for update`
      : await tx.$queryRaw<{ id: string }[]>`select id::text from runtime_case where id = ${id}::uuid and firm_key = ${ctx.firmKey}`;
    if (!hit.length) return notFound();
    const c = await tx.case.findUniqueOrThrow({ where: { id }, select: { id: true, workspaceId: true, caseNumber: true, firmKey: true, status: true } });
    const firm = await tx.platformFirm.findUnique({ where: { key: c.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return notFound();   // the case's firm key names another platform firm
    return { ...c, firmId: firm.id };
  }

  private async names(firmId: string, actors: (string | null)[]) {
    const ids = [...new Set(actors.filter((a): a is string => !!a).map((a) => a.replace(/^staff:/, "")).filter((x) => UUID.test(x)))];
    return new Map((await this.db.platformStaff.findMany({ where: { id: { in: ids }, firmId }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]));
  }

  private async view(rows: Row[], c: CaseHead): Promise<MilestoneView[]> {
    const names = await this.names(c.firmId, rows.flatMap((r) => [r.recordedBy, r.cancelledBy]));
    const who = (a: string) => { const staffId = a.replace(/^staff:/, ""); return { staffId, name: names.get(staffId) ?? null }; };
    const { cal, today } = await deadlineDay(this.db, this.clock, c.firmKey);
    return rows.map((r) => {
      const due = r.dueOn ? isoDay(r.dueOn) : null, open = !r.cancelledAt;
      let reminders: { offset: number; day: string }[] = [];
      try { reminders = open && due && c.status === "OPEN" ? milestoneRemindersOf(r.id, due, 0, cal).filter((x) => x.day >= today).map((x) => ({ offset: x.offset, day: x.day })) : []; } catch { reminders = []; }
      return {
        id: r.id, key: r.milestoneKey, words: wordsOf(r.milestoneKey), occurredOn: isoDay(r.occurredOn), dueOn: due, reference: r.reference, note: r.note,
        recordedAt: r.recordedAt.toISOString(), recordedBy: who(r.recordedBy),
        cancelled: r.cancelledAt ? { at: r.cancelledAt.toISOString(), by: who(r.cancelledBy ?? ""), reason: r.cancelReason ?? "" } : null,
        deadline: open && due ? showDue(due, cal, today) : null, reminders,
      };
    });
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); }
    catch (e) {
      if (e instanceof HttpException) throw e;
      const m = String((e as Error)?.message ?? e);
      if (/P2034|could not serialize|deadlock/i.test(m)) conflict("This case changed at the same time. Open it again.", "CHANGED");
      throw e;
    }
  }

  private async record_(tx: Tx, ctx: StaffContext, c: CaseHead, action: string, summary: string, milestoneId: string, milestoneKey: string, type: string) {
    // Ids and codes only: never the note, the reference or a reason (DW7).
    await new Audit(tx as never).log(c.workspaceId, `staff:${ctx.staffId}`, action, "case", c.id, `${c.caseNumber}: ${summary}`.slice(0, 600), { milestoneId, milestoneKey, firmId: c.firmId } as Prisma.InputJsonValue);
    await tx.moduleEvent.create({ data: { firmId: c.firmId, type, subjectId: c.id, payload: CaseMilestonePayload.parse({ caseId: c.id, milestoneId }) } });
  }

  /** GET …/milestones: every step of the case, oldest first, cancelled ones included (shown as cancelled). */
  async list(ctx: StaffContext, caseId: string): Promise<CaseMilestonesView> {
    const c = await this.caseOf(this.db, ctx, caseId, false);
    const rows = await this.db.caseMilestone.findMany({ where: { caseId: c.id, firmId: c.firmId }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
    return { caseId: c.id, milestones: await this.view(rows, c), keys: MILESTONE_KEYS.map((key) => ({ key, words: MILESTONE_WORDS[key] })), sample: true, canRecord: c.status === "OPEN" };
  }

  /** POST …/milestones: records a step on an open case. */
  async record(ctx: StaffContext, caseId: string, body: unknown): Promise<MilestoneView> {
    const b = parsed(RecordMilestoneBody, body);
    const { row, c } = await this.run(async (tx) => {
      const c = await this.caseOf(tx, ctx, caseId, true);
      if (c.status !== "OPEN") conflict("This case is closed: reopen it to record a government step.", "CASE_CLOSED");
      const row = await tx.caseMilestone.create({ data: {
        firmId: c.firmId, caseId: c.id, milestoneKey: b.milestoneKey, occurredOn: new Date(`${b.occurredOn}T00:00:00Z`),
        dueOn: b.dueOn ? new Date(`${b.dueOn}T00:00:00Z`) : null, reference: b.reference ?? null, note: b.note ?? null, recordedBy: `staff:${ctx.staffId}`,
      } });
      await this.record_(tx, ctx, c, "case.milestone_recorded", `government step recorded (${b.milestoneKey}${b.dueOn ? `, due ${b.dueOn}` : ""})`, row.id, b.milestoneKey, EVENT.CASE_MILESTONE_RECORDED);
      return { row, c };
    });
    return (await this.view([row], c))[0];
  }

  /** POST …/milestones/:mid/cancel: cancels a step with a reason; the line stays, shown as cancelled. */
  async cancel(ctx: StaffContext, caseId: string, milestoneId: string, body: unknown): Promise<MilestoneView> {
    const b = parsed(CancelMilestoneBody, body);
    const { row, c } = await this.run(async (tx) => {
      const c = await this.caseOf(tx, ctx, caseId, true);
      if (typeof milestoneId !== "string" || !UUID.test(milestoneId)) return notFound("government step");
      const m = await tx.caseMilestone.findFirst({ where: { id: milestoneId, caseId: c.id, firmId: c.firmId } });
      if (!m) return notFound("government step");
      if (m.cancelledAt) conflict("This step is already cancelled.", "ALREADY_CANCELLED");
      const row = await tx.caseMilestone.update({ where: { id: m.id }, data: { cancelledAt: new Date(), cancelledBy: `staff:${ctx.staffId}`, cancelReason: b.reason } });
      await this.record_(tx, ctx, c, "case.milestone_cancelled", `government step cancelled (${m.milestoneKey})`, m.id, m.milestoneKey, EVENT.CASE_MILESTONE_CANCELLED);
      return { row, c };
    });
    return (await this.view([row], c))[0];
  }
}

export type { MilestoneKey };
