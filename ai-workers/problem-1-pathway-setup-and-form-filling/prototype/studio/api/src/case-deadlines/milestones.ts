// CS-DL3 part 1 (R1.74, QA-591; Doc 3 line 3337 CaseMilestone, line 3141; AG-7-96 r7): the plain parts of a case's
// government steps: the reminder plan (plan.ts's Sample offsets over the firm's open days, keys
// `case_milestone:<id>:<offset>:<due>:<run time>:r<reopens>`), a due date as shown, and the stages read's list. The due
// date is the one on IRCC's letter, typed by staff, never computed (P-170). The routes and their service are in
// ../features/case-milestones.ts (decorators compile only in api/tsconfig.json's folders); the jobs in reminders.ts.
import type { Prisma, PrismaClient } from "@prisma/client";
import { MILESTONE_WORDS, type MilestoneDeadline, type MilestoneDue } from "../../../contracts/milestones.ts";
import { countBack, dayMark, NO_SUCH_DATE, zonedInstant, type FirmCalendar } from "../platform/calendar/working-days.ts";
import { REMINDER_OFFSETS, REMINDER_TIME, stillToCome, type Reminder } from "./plan.ts";

/** The milestone reminder job's queue; its keys never start `deadline:` (the stage's). */
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

