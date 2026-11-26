// FO-7t part 3 (R1.58; design/briefs/FO-7t.md part 3, "The 25-day item"; AG-6-73 rule 5; Code SOR/2022-128 s. 32(g) as
// FO-7a cites it, legal reading Unconfirmed: no counsel): one home item for the holders of agent/payment:record when a
// "To move" line has waited more than 25 days.
// * A line's age counts from its source date (the withdrawal, or the WRONG_ACCOUNT correction): money_to_move.created_at,
//   as ruled in the brief (comment 6900938081). The 25 is the requirement's own number. The Code's s. 32(g) reading (30
//   days after the client is invoiced) would be stricter when trust is applied late: noted only, Unconfirmed: no counsel.
// * The sweep (daily, Sample time) runs on its own bypass use (to-move.bypass.ts): it lists the firms with a line older
//   than 25 days by "now" from the clock port (P-607), never the database's, writes each such firm's platform.bypass line
//   (touchEachFirm), and queues that firm's waiting job keyed `trust-to-move:<firm>:<oldest waiting line>:<its move lines>`.
//   A key never queues twice (JobPort), so the sweep run again with nothing changed tells nobody again; once that line
//   has moved (all or part), or comes back by an undo, a line still waiting is told once more ("Duplicate beats a miss",
//   AG16-60). No table holds the reminder's state: the job key is it.
// * Only trust → operating lines count (the brief rules the start date for withdrawals and WRONG_ACCOUNT corrections;
//   an operating → trust line, what a credit note owes back, carries its withdrawal's date: a question for the tech lead).
// * The waiting job runs in its firm's scope, reads again that a line still waits (skip-if-stale, AG-13-14), and tells
//   every active holder of agent/payment:record through NotificationPort, ids only: item { kind: "firm", id: <firm> }.
// * Clearing the item when no line waits (AG-6-73 rule 5) needs a way to resolve a notification, which NotificationPort
//   (PF-18np) does not have: FO-7t.md's contract gap (1), a question for the tech lead in the PR.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ClockPort } from "../../../../ports/clock.ts";
import type { JobPort, JobRun } from "../../../../ports/jobs.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../../ports/notifications.ts";
import { asBypass, firmScope, touchEachFirm, withFirm } from "../../platform/firm-scope.ts";
import { logPort } from "../../platform/observability/log.ts";
import { TO_MOVE_SWEEP_BYPASS } from "./to-move.bypass.ts";
import { TO_MOVE_WAIT_DAYS } from "./to-move.ts";

export const TO_MOVE_SWEEP_JOB = "client_money.trust_to_move_sweep";
export const TO_MOVE_WAITING_JOB = "client_money.trust_to_move_waiting";
/** Sample: once a day at 09:17 in Toronto (the item is a daily nudge, not a deadline). */
export const TO_MOVE_SWEEP_CRON = "17 9 * * *";
export const TO_MOVE_SWEEP_ZONE = "America/Toronto";
const PAYMENT_RECORD = "agent/payment:record";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ToMoveReminderPorts = { db: PrismaClient; jobs: JobPort; notifications: NotificationPort<Prisma.TransactionClient>; clock: ClockPort };

export class ToMoveReminder {
  constructor(private readonly p: ToMoveReminderPorts) {}

  /** The handlers, and the sweep's schedule when `sweep` (the app; a suite may run `sweep()` itself). */
  async register(o: { sweep: boolean }) {
    await this.p.jobs.handle(TO_MOVE_WAITING_JOB, async (job) => { await this.runWaiting(job); });
    await this.p.jobs.handle(TO_MOVE_SWEEP_JOB, async () => { await this.sweep(); });
    if (o.sweep) await this.p.jobs.recurring(TO_MOVE_SWEEP_JOB, TO_MOVE_SWEEP_CRON, TO_MOVE_SWEEP_ZONE);
  }

  private since() { return new Date(this.p.clock.now().getTime() - TO_MOVE_WAIT_DAYS * 86_400_000); }

  /** Every firm with a line older than 25 days, each queued once per oldest waiting line. Returns how many were queued. */
  async sweep(): Promise<number> {
    const since = this.since();
    const firms = await asBypass(TO_MOVE_SWEEP_BYPASS, async () => {
      // The key also counts the oldest line's move lines (insert-only): a move then an undo, or a part moved, makes a new
      // key, so a line back on the list is told once more (break M2); the sweep run again with nothing changed is not.
      const rows = await this.p.db.$queryRaw<{ firm_id: string; oldest: string; n: number }[]>`
        select distinct on (m.firm_id) m.firm_id::text, m.source_entry_id::text as oldest,
               (select count(*) from money_move_line l where l.firm_id = m.firm_id and l.source_entry_id = m.source_entry_id)::int as n
          from money_to_move m where m.direction = 'TRUST_TO_OPERATING' and m.created_at < ${since}::timestamptz order by m.firm_id, m.created_at, m.source_entry_id`;
      const { failed } = await touchEachFirm(this.p.db, rows.map((r) => r.firm_id));
      return rows.filter((r) => !failed.has(r.firm_id.toLowerCase()));
    });
    let queued = 0;
    for (const f of firms) {
      try { if ((await this.p.jobs.enqueue(TO_MOVE_WAITING_JOB, {}, { key: `trust-to-move:${f.firm_id}:${f.oldest}:${f.n}`, firmId: f.firm_id })).queued) queued++; }
      catch (e) { logPort.error("trust_to_move_queue_failed", e, { firmId: f.firm_id }); }
    }
    return queued;
  }

  /** The waiting job: how many people were told (0: nothing waits any more, or no firm). */
  async runWaiting(job: Pick<JobRun, "firmId">): Promise<number> {
    if (!job.firmId || !UUID.test(job.firmId)) return 0;
    const f = firmScope(job.firmId).firmId, since = this.since();
    return withFirm(f, () => this.p.db.$transaction(async (tx) => {
      const [w] = await tx.$queryRaw<{ waits: boolean }[]>`select exists (select 1 from money_to_move m where m.firm_id = ${f}::uuid and m.direction = 'TRUST_TO_OPERATING' and m.created_at < ${since}::timestamptz) as waits`;
      if (!w?.waits) return 0;
      const roles = (await tx.platformRolePermission.findMany({ where: { permissionKey: PAYMENT_RECORD }, select: { role: true } })).map((r) => r.role);
      const staff = await tx.platformStaff.findMany({ where: firmScope(f, { status: "ACTIVE" as const, grants: { some: { firmId: f, endedAt: null, role: { in: roles } } } }), select: { id: true }, orderBy: { id: "asc" } });
      for (const s of staff) await this.p.notifications.notify(tx, { staffId: s.id }, NOTIFICATION_KIND.TRUST_TO_MOVE_WAITING, { kind: "firm", id: f });
      return staff.length;
    }));
  }
}
