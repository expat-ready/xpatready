// CS-DL1 part 2 (R1.74; briefs design/briefs/CS-DL1.md part 2, build-lead-c-briefs/CS-DL1b.md): when a stage deadline's
// reminders fall, worked out with no database. AG-7-94@2b63ee12 r5, r6: a reminder "n working days before" lands on the
// nth open day before the date (on the day: the last open day on or before it), never later, never after the date; the
// date itself is never moved. The offsets and the time of day are Sample until cited (P-412 F13 (b)).
import { countBack, localDate, zonedInstant, type FirmCalendar } from "../platform/calendar/working-days.ts";

/** Sample: 7 and 2 working days before, and on the day. */
export const REMINDER_OFFSETS = [7, 2, 0] as const;
/** Sample: the reminder's time of day in the firm's zone. */
export const REMINDER_TIME = "09:00";
/** The reminder job's queue, and the prefix of every one of its keys (a close cancels only these, never a recorded-date
 *  reminder's: Lead 61's ruling, AG16-60). */
export const REMINDER_JOB = "case_deadlines.reminder";
export const KEY_PREFIX = "deadline:";

/** One reminder of one deadline. The key names everything the reminder hangs on: the stage, the date, the planned run
 *  time (so a closed day or a time zone set later plans a new time, a new key) and `round`, the case's reopens (a reopen
 *  arms a fresh set: JobPort never queues a used key twice, even after a cancel). A job whose key the case's state no
 *  longer gives does nothing (the breaker's M1 and M2 on CS-DL1b). */
export type Reminder = { offset: number; day: string; at: Date; key: string };
export const reminderKey = (caseId: string, stageId: string, offset: number, due: string, at: Date, round: number) =>
  `${KEY_PREFIX}${caseId}:${stageId}:${offset}:${due}:${at.toISOString().slice(0, 16)}:r${round}`;

/** Every reminder of the deadline `due`, in the firm's calendar. */
export function remindersOf(caseId: string, stageId: string, due: string, round: number, cal: FirmCalendar): Reminder[] {
  return REMINDER_OFFSETS.map((offset) => {
    const day = countBack(due, offset, cal);
    const at = zonedInstant(day, REMINDER_TIME, cal.zone);
    return { offset, day, at, key: reminderKey(caseId, stageId, offset, due, at, round) };
  });
}

/** The reminders still to come at `now`: a reminder whose day has passed never fires late; one due earlier today runs
 *  now ("Duplicate beats a miss", AG16-60: a reopen at 10:00 still gets that day's 09:00 reminder, never the day before's). */
export function stillToCome(all: Reminder[], now: Date, cal: FirmCalendar): Reminder[] {
  const today = localDate(cal.zone, now);
  return all.filter((r) => r.day >= today).map((r) => (r.at < now ? { ...r, at: new Date(now) } : r));
}
