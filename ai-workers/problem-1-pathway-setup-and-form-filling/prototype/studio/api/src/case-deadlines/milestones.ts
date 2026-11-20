// CS-DL3 part 1 (R1.74, QA-591; brief design/build-lead-c-briefs/CS-DL3.md; Doc 3 Agent Console line 3337 CaseMilestone,
// line 3141 "drives the Minder ... as the deadline nears"; AG-7-96 r7): a case's government steps (an IRCC letter asking
// for biometrics, a medical exam, documents, a passport, or a procedural fairness letter) with the letter's date and,
// when it gives one, its due date as typed by staff. The app never computes a government deadline (P-170).
// This file holds the plain parts (the keys, the reminder plan, the due date as shown, the stages read's list); the
// routes' service, CaseMilestones, is in ../features/case-milestones.ts (decorators compile only there: api/tsconfig.json).
//   * Record and cancel only (case_milestone is insert-only apart from cancelling; its triggers refuse anything else):
//     a wrong due date is cancelled and recorded again, and both lines stay.
//   * Each write is one transaction: the case row locked (the session's firm, else 404, never 403: BR-20), the line, one
//     audit line (AuditPort, through Audit) and one outbox event (case.milestone_recorded / case.milestone_cancelled),
//     ids only: never the note, the reference or the reason.
//   * Reminders (reminders.ts): the stage plan's offsets (plan.ts) counted back over the firm's open days, as JobPort jobs
//     keyed `case_milestone:<id>:<offset>:<due>:<run time>:r<reopens>`, armed by the sweep from the outbox. A milestone
//     reminds whatever its route's basis is (ruling 3 of the brief: the date comes from the letter, not from a Sample rule).
// Times only from the clock port (P-607). US$0, no model call.
import type { Prisma, PrismaClient } from "@prisma/client";
import { MILESTONE_KEYS, MILESTONE_WORDS, type MilestoneDeadline, type MilestoneDue, type MilestoneKey } from "../../../contracts/milestones.ts";
import { countBack, dayMark, NO_SUCH_DATE, zonedInstant, type FirmCalendar } from "../platform/calendar/working-days.ts";
import { REMINDER_OFFSETS, REMINDER_TIME, stillToCome, type Reminder } from "./plan.ts";

export { MILESTONE_KEYS, MILESTONE_WORDS };
/** The milestone reminder job's queue, and the prefix of every one of its keys (never `deadline:`, so a stage's close
 *  consumer and a milestone's never cancel each other's jobs by mistake). */
export const MILESTONE_JOB = "case_deadlines.milestone_reminder";
export const MILESTONE_KEY_PREFIX = "case_milestone:";

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

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
export const wordsOf = (key: string) => (MILESTONE_WORDS as Record<string, string>)[key] ?? key;

/** The case's open steps with a due date, for the case's stages read (beside the stage deadline), earliest first. */
export async function openMilestoneDeadlines(db: PrismaClient | Tx, caseId: string, cal: FirmCalendar, today: string): Promise<MilestoneDeadline[]> {
  const rows = await db.caseMilestone.findMany({ where: { caseId, cancelledAt: null, dueOn: { not: null } }, orderBy: [{ dueOn: "asc" }, { recordedAt: "asc" }], select: { id: true, milestoneKey: true, reference: true, dueOn: true } });
  return rows.map((r) => ({ id: r.id, key: r.milestoneKey, words: wordsOf(r.milestoneKey), reference: r.reference, ...showDue(isoDay(r.dueOn!), cal, today) }));
}

export type { MilestoneKey };
