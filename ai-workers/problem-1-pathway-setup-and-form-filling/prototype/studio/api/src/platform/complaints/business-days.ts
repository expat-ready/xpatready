// PF-21: the acknowledgement date of a complaint, in the firm's own calendar. "Promptly respond" (Code SOR/2022-128 s. 29)
// is given a Sample period, ACK_BUSINESS_DAYS business days, until the College's by-laws are read: the deadline is the
// closing time of the Nth business day after the day the complaint was received, in the firm's time zone, where a business
// day is a day with opening hours (platform.business_hours) that is not a closed day (platform.closed_days). The general
// calendar logic (zone helpers, the business-day test, PF-21v's count) moved to platform/calendar/working-days.ts (CS-DL1
// part 1, Lead B's OK on #1867); the acknowledge-by period is a complaint rule and stays here. PF-21v's count is also
// exported here, so PF-21v's suite reads it unchanged.
import { businessClose, localDate, nextDate, zonedInstant, type FirmCalendar } from "../calendar/working-days.ts";

export { BusinessDayTally, businessDaysBetween } from "../calendar/working-days.ts";

/** Sample (FO-13k rev 12): 2 business days, to set from the by-laws once read. */
export const ACK_BUSINESS_DAYS = 2;

/** The acknowledge-by instant: the closing time of the Nth business day after the received day. A firm with no opening
 *  day at all within a year falls back to N calendar days at 17:00 (never an endless walk). */
export function acknowledgeBy(receivedAt: Date, cal: FirmCalendar, days = ACK_BUSINESS_DAYS): Date {
  let date = localDate(cal.zone, receivedAt), counted = 0;
  for (let i = 0; i < 366; i++) {
    date = nextDate(date);
    const at = businessClose(cal, date);
    if (at && ++counted === days) return at;
  }
  let fallback = localDate(cal.zone, receivedAt);
  for (let i = 0; i < days; i++) fallback = nextDate(fallback);
  return zonedInstant(fallback, "17:00", cal.zone);
}
