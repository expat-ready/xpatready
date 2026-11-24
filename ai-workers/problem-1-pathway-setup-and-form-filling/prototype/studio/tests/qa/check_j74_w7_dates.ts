// QA-781 (qa 8, 24 Nov): j_74 W7 re-records the government step; this replays its date choice over 400 start days with
// the app's own countBack (working-days.ts) and the rule of stillToCome (plan.ts: a reminder whose day is before today is
// never armed). The old choice (due - 1) fails on most days; the aligned one (due + 7) on none. No copy, no database.
// Run from studio/: npx tsx --tsconfig api/tsconfig.json tests/qa/check_j74_w7_dates.ts
import { countBack } from "../../api/src/platform/calendar/working-days.ts";
const hours = ["MON","TUE","WED","THU","FRI"].map((day) => ({ day, opens: "09:00", closes: "17:00" }));
// Sample closed days (a firm's own list; not official holidays): the window around year end is where a count could slip.
const holi = ["2026-12-25","2026-12-28","2027-01-01","2027-02-15","2027-04-02","2027-05-24","2027-07-01","2027-08-02","2027-09-06","2027-10-11","2027-12-27","2027-12-28","2028-01-03"];
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
for (const closed of [[], holi]) {
  const cal = { zone: "America/Toronto", hours, closedDays: closed };
  let oldBad = 0, newBad = 0, nrBad = 0;
  for (let i = 0; i < 400; i++) {
    const today = add("2026-11-01", i), due = add(today, 30), clock = countBack(due, 7, cal);   // the clock stands on m1's 7-day day, 09:01
    const old2 = add(due, -1), new2 = add(due, 7);
    if (!(countBack(old2, 7, cal) >= clock)) oldBad++;
    if (!(countBack(new2, 7, cal) > clock)) newBad++;
    if (!(countBack(new2, 7, cal) <= countBack(due, 2, cal))) nrBad++;
  }
  console.log(`${newBad + nrBad === 0 ? "PASS" : "FAIL"}  closed days ${closed.length}: old due-1 fails W7 on ${oldBad}/400 days; new due+7 fails W7 on ${newBad}/400, W7b NR on ${nrBad}/400`);
  if (newBad + nrBad) process.exitCode = 1;
}
