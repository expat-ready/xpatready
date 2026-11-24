// CS-D6 part 2 (R1.69, map row 69; brief design/briefs/CS-D6.md part 2): the closed client files past their keep period,
// and a weekly reminder about them. Requirement text (cited, read only this):
//   SA-11-33: the firm's own "Keep closed client files for ___ years", not set by default; a reminder, not a lock; the
//             list of files past it; no automatic deletion from it in Release 1. The number is AUD-5's one setting, read
//             through KeepPeriodPort.forFirm; this file adds no setting, no default and no number of its own.
//   AG-9-53:  a document is visible only to those who can see its case, on every read path and list: the list is of
//             cases, each only if the person's caseScope holds it; no document names on it (ids and a count only).
//   P-607:    reminders only. Nothing here deletes a file or a row (Dispose is part 3, through CS-X3's door).
// The period is counted in calendar dates in the firm's time zone (Lead 61's ruling on #1867): a case closed on D is past
// its keep period of N years from D + N years (a 29 February close passes on 28 February), and a reopened case is not on
// the list (status OPEN); closed again, it counts from its new close (case-close.ts writes the new closed_at).
// Reminder: the weekly run (a platform-wide job, on its declared bypass use: it reads only which firms have a closed
// case) queues one job per firm, keyed `keep-period:<firm id>:<ISO week>`, so a second run in the same week queues
// nothing; that firm's job (in its own firm scope) tells each active holder of agent/document:dispose once per case on
// the list that they can see, through NotificationPort (one notification per person, case and kind: a redelivered job
// adds none). Times only from the clock port (P-607). US$0, no model call.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ClockPort } from "../../../ports/clock.ts";
import type { JobPort, JobRun } from "../../../ports/jobs.ts";
import type { FirmKeepPeriod } from "../../../ports/keep-period.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../ports/notifications.ts";
import { caseScope, caseVisibleSql, type CaseScope } from "../case-access.ts";
import { localDate, readFirmCalendar } from "../platform/calendar/working-days.ts";
import { asBypass, firmScope, touchEachFirm } from "../platform/firm-scope.ts";
import { problem, type StaffContext } from "../platform/identity/keys.ts";
import { logPort } from "../platform/observability/log.ts";
import { KEEP_PERIOD_WEEKLY_BYPASS } from "./keep-period.bypass.ts";

/** Who may read the list and is reminded: the key Dispose needs (brief part 2; Owner only in PF-3's seed). */
export const DISPOSE_KEY = "agent/document:dispose";
/** Cases per page of the list. */
export const KEEP_LIST_PAGE = 50;
export const NOT_SET_WORDS = "Your firm has not set a keep period for closed client files.";
/** The weekly run (no firm) and each firm's reminder job. */
export const KEEP_WEEKLY_JOB = "case_documents.keep_period_weekly";
export const KEEP_REMIND_JOB = "case_documents.keep_period_remind";
/** Sample: Mondays 09:17 UTC (outside 01:00-03:00, ports/jobs.ts). */
export const KEEP_WEEKLY_CRON = "17 9 * * 1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Reader = PrismaClient | Prisma.TransactionClient;
type KeepPeriodsReader = { forFirm(firmId: string): Promise<FirmKeepPeriod> };

export type PastCase = { case_id: string; case_number: string; client: string; closed_on: string; passed_on: string; documents_held: number; document_ids: string[] };
export type PastKeepList = { years: number | null; source: FirmKeepPeriod["source"]; words: string; zone: string; today: string; cases: PastCase[]; next: string | null };

/** The `after` query: absent, empty, or a case id the list gave. */
export const KeepListCursor = z.union([z.undefined(), z.literal(""), z.string().max(36).regex(UUID)]);
const badCursor = (): never => problem(400, "Check the details", "The page cursor is not one this list gave.", { code: "INVALID", fields: { after: "The page cursor is not one this list gave." } });

/** The firm's closed cases whose keep period has passed by `today` (YYYY-MM-DD in `zone`), oldest close first, keyset
 *  paged by (closed_at, id). `scope` limits them to the cases a person can see; null means every case of the firm (the
 *  reminder job, which then filters per recipient). */
export async function pastKeepPeriod(db: Reader, firmId: string, years: number, zone: string, today: string, scope: CaseScope | null, after: string | null, limit: number): Promise<{ cases: PastCase[]; next: string | null }> {
  const firm = firmScope(firmId).firmId;
  const visible = scope ? caseVisibleSql(scope) : Prisma.sql`true`;
  const past = Prisma.sql`c.firm_id = ${firm}::uuid and c.status = 'CLOSED' and c.closed_at is not null
    and ((c.closed_at at time zone ${zone})::date + make_interval(years => ${years}))::date <= ${today}::date and ${visible}`;
  if (after && !(await db.$queryRaw<{ n: number }[]>`select 1 as n from runtime_case c where c.id = ${after}::uuid and ${past}`).length) badCursor();
  const rows = await db.$queryRaw<{ id: string; case_number: string; client: string | null; closed_on: string; passed_on: string }[]>`
    select c.id::text, c.case_number, k.display_name as client,
           to_char((c.closed_at at time zone ${zone})::date, 'YYYY-MM-DD') as closed_on,
           to_char(((c.closed_at at time zone ${zone})::date + make_interval(years => ${years}))::date, 'YYYY-MM-DD') as passed_on
      from runtime_case c left join case_client k on k.id = c.client_id
     where ${past} ${after ? Prisma.sql`and (c.closed_at, c.id) > (select x.closed_at, x.id from runtime_case x where x.id = ${after}::uuid)` : Prisma.empty}
     order by c.closed_at, c.id limit ${limit + 1}`;
  const page = rows.slice(0, limit), ids = page.map((r) => r.id);
  // The documents still held on each case (every stored version; Dispose, part 3, will mark the ones it removes): ids only.
  const docs = ids.length ? await db.$queryRaw<{ case_id: string; id: string }[]>`
    select distinct p.case_id::text, d.id::text from case_participant p join case_document d on d.subject_id = p.subject_id
     where p.case_id = any(${ids}::uuid[]) order by 1, 2` : [];
  const cases = page.map((r) => {
    const mine = docs.filter((d) => d.case_id === r.id).map((d) => d.id);
    return { case_id: r.id, case_number: r.case_number, client: r.client ?? "", closed_on: r.closed_on, passed_on: r.passed_on, documents_held: mine.length, document_ids: mine };
  });
  return { cases, next: rows.length > limit ? page[page.length - 1]!.id : null };
}

/** GET /api/runtime/documents/past-keep-period?after=: the list a holder of agent/document:dispose reads (session firm). */
export async function keepListFor(db: Reader, keepPeriods: KeepPeriodsReader, clock: ClockPort, ctx: StaffContext, after?: unknown): Promise<PastKeepList> {
  const q = KeepListCursor.safeParse(after);
  if (!q.success) return badCursor();
  const firm = await keepPeriods.forFirm(ctx.firmId), cal = await readFirmCalendar(db, ctx.firmId), today = localDate(cal.zone, clock.now());
  const y = firm.closedClientFilesYears;
  if (y === null) return { years: null, source: firm.source, words: NOT_SET_WORDS, zone: cal.zone, today, cases: [], next: null };
  const scope = await caseScope(db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys });
  const { cases, next } = await pastKeepPeriod(db, ctx.firmId, y, cal.zone, today, scope, q.data ? q.data.toLowerCase() : null, KEEP_LIST_PAGE);
  const words = `Your firm keeps closed client files for ${y} year${y === 1 ? "" : "s"} after closing. This is a reminder, not a lock: nothing is deleted automatically.`;
  return { years: y, source: firm.source, words, zone: cal.zone, today, cases, next };
}

/** ISO 8601 week of a UTC date, as 2026-W48. */
export function isoWeek(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(), week = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

const RemindPayload = z.strictObject({ week: z.string().regex(/^\d{4}-W\d{2}$/) });
export type KeepReminderPorts = { db: PrismaClient; jobs: JobPort; notifications: NotificationPort<Prisma.TransactionClient>; clock: ClockPort; keepPeriods: KeepPeriodsReader };

/** The weekly keep-period reminder (PF-14's jobs, PF-18np's port). It lists and tells; it deletes nothing. */
export class KeepPeriodReminders {
  constructor(private readonly p: KeepReminderPorts) {}

  /** The two handlers and the weekly schedule. `sweep` is accepted for the same call shape as the case deadlines'
   *  register; the weekly schedule is the reminder itself, so it is always set. */
  async register(_o: { sweep?: boolean } = {}) {
    await this.p.jobs.handle(KEEP_WEEKLY_JOB, async () => { await this.weekly(); });
    await this.p.jobs.handle(KEEP_REMIND_JOB, async (job) => { await this.remind(job); });
    await this.p.jobs.recurring(KEEP_WEEKLY_JOB, KEEP_WEEKLY_CRON, "UTC");
  }

  /** The weekly run: which firms have a closed case (on its declared bypass use, a platform.bypass line per firm), then
   *  one job per firm and ISO week. Returns the firms queued this time (0 on a second run in the same week). */
  async weekly(): Promise<number> {
    const now = this.p.clock.now(), week = isoWeek(now);
    const firms = await asBypass(KEEP_PERIOD_WEEKLY_BYPASS, async () => {
      const rows = await this.p.db.$queryRaw<{ id: string }[]>`select distinct firm_id::text as id from runtime_case where status = 'CLOSED' and firm_id is not null order by 1`;
      const { failed } = await touchEachFirm(this.p.db, rows.map((r) => r.id));
      return rows.map((r) => r.id).filter((f) => !failed.has(f.toLowerCase()));
    });
    let queued = 0;
    for (const firmId of firms) {
      try {
        const q = await this.p.jobs.schedule(KEEP_REMIND_JOB, now, { week }, { key: `keep-period:${firmId}:${week}`, firmId });
        if (q.queued) queued++;
      } catch (e) { logPort.error("keep_period_queue_failed", e, { firmId }); }
    }
    return queued;
  }

  /** One firm's reminder (in its own firm scope): each active holder of the dispose key, once per case on the list that
   *  they can see. Returns how many notifications were asked for (0: no period set, nothing past, a stale week). */
  async remind(job: Pick<JobRun, "payload" | "firmId">): Promise<number> {
    const p = RemindPayload.safeParse(job.payload);
    if (!p.success || !job.firmId || !UUID.test(job.firmId)) return 0;
    if (p.data.week !== isoWeek(this.p.clock.now())) return 0;   // a run delayed into the next week: that week's job tells
    const firmId = firmScope(job.firmId).firmId;
    const y = (await this.p.keepPeriods.forFirm(firmId)).closedClientFilesYears;
    if (y === null) return 0;
    const cal = await readFirmCalendar(this.p.db, firmId), today = localDate(cal.zone, this.p.clock.now());
    const { cases } = await pastKeepPeriod(this.p.db, firmId, y, cal.zone, today, null, null, 10_000);
    if (!cases.length) return 0;
    const holders = await this.p.db.$queryRaw<{ id: string }[]>`
      select distinct s.id::text from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.firm_id = s.firm_id and g.ended_at is null
        join platform_role_permission rp on rp.role = g.role and rp.permission_key = ${DISPOSE_KEY}
       where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE' order by 1`;
    const tell: { staffId: string; caseId: string }[] = [];
    for (const h of holders) {
      const scope = await caseScope(this.p.db, { firmId, staffId: h.id });
      const seen = scope.all ? cases : (await pastKeepPeriod(this.p.db, firmId, y, cal.zone, today, scope, null, 10_000)).cases;
      for (const c of seen) tell.push({ staffId: h.id, caseId: c.case_id });
    }
    await this.p.db.$transaction(async (tx) => {
      for (const t of tell) await this.p.notifications.notify(tx, { staffId: t.staffId }, NOTIFICATION_KIND.KEEP_PERIOD_PASSED, { kind: "case", id: t.caseId });
    });
    return tell.length;
  }
}
