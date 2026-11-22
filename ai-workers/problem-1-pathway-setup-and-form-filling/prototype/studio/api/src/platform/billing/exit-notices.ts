// PF-5 part 4 (R1.105; SA-2-6, SA-2-38, SA2-D13; P-799): the departure notices of a firm on payment hold. Day 0 is the
// payment-hold notice; days 16, 46 and 83 of the hold are the deletion warnings (EXIT_NOTICE_DAYS, the one constant).
// Each goes to the firm's Owners and Admins (active, a live grant) and to the billing email, never to another role or
// another firm. The words state only our own facts (SA-2-38, SA2-D13): the deletion date and where to pay. No regulator
// name, number of years or section, never "legal obligation". The data download is PF-11's: until it exists the notice
// names the billing page only and says nothing about a download (BACKLOG row PF-5).
// A sweep runs on PF-14's runner (ExitNotices.register), every firm on hold, each in its own firm scope. Per firm: the
// newest due notice is sent once (the mail key per recipient: a run twice sends nothing new), then one audit line
// `firm.exit_notice_sent` records it (actor system:platform.billing.exit_notices). A notice missed while the job was down
// is sent on the next run, only the newest one due, never on or after the deletion date. A hold that ends sends nothing
// more; a new hold starts a new clock. The close on day 90 is PF-11c's. Legal readings: Unconfirmed: no counsel.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { asBypass, firmScope, touchEachFirm, withFirm } from "../firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../identity/session/mail.ts";
import { logPort } from "../observability/log.ts";
import { EXIT_NOTICE_ACTION, EXIT_NOTICE_ENTITY, dueNotice, exitClock, exitNoticeKey, type ExitClock, type ExitNoticeDay } from "./exit-clock.ts";

type Tx = Prisma.TransactionClient;
/** Hourly from 06:45 to 22:45 Toronto: outside 01:00-03:00 in every Canadian zone (St. John's 08:15-00:15, Vancouver
 *  03:45-19:45), so the day-0 notice goes out within the hour a hold starts in the day, not the next day. */
export const EXIT_NOTICE_QUEUE = "platform.billing.exit_notices", EXIT_NOTICE_CRON = "45 6-22 * * *", EXIT_NOTICE_ZONE = "America/Toronto";
const ACTOR = "system:platform.billing.exit_notices";

export type ExitNoticeDeps = { db: PrismaClient; mail: MailPort | null; audit: AuditPort<Tx>; now: () => Date; appUrl: string };
type Recipient = { email: string; staffId: string | null };

const dateWords = (d: Date) => d.toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The words (SA-2-38's facts only). Exported for the test that reads them. */
export function exitNoticeWords(day: ExitNoticeDay, deletionDate: Date, appUrl: string) {
  const on = dateWords(deletionDate), billing = `${appUrl}/settings/billing`;
  const subject = day === 0 ? "Your ExpatReady subscription is on hold" : `Your firm's data will be permanently deleted on ${on}`;
  const first = day === 0
    ? `Your firm's ExpatReady subscription is on hold. Unless it is paid, your firm's data will be permanently deleted on ${on}.`
    : `Your firm's ExpatReady subscription is still on hold. Your firm's data will be permanently deleted on ${on}.`;
  const text = `${first}\n\nTo keep your firm's data, add a card or pay the open invoice on your billing page: ${billing}. Paying at any time before then restores your account with all its data.\n\nKeep your own copy of your records for as long as your professional rules require.`;
  return { subject, text };
}

export class ExitNotices {
  constructor(private readonly d: ExitNoticeDeps) {}

  /** Sends the due notice of one firm, in the caller's firm scope (the job's withFirm, or a test). */
  async runFirm(firmId: string): Promise<{ sent: ExitNoticeDay | null; to: number }> {
    const id = firmScope(firmId).firmId, now = this.d.now();
    if (!this.d.mail) return { sent: null, to: 0 };   // no mail wired: nothing is recorded as sent
    const mail = this.d.mail;
    const read = await this.d.db.$transaction(async (tx) => {
      const clock = await exitClock(tx, id);
      const day = clock ? dueNotice(clock, now) : null;
      return clock && day !== null ? { clock, day, to: await this.recipients(tx, id) } : null;
    });
    if (!read) return { sent: null, to: 0 };
    const { clock, day, to } = read;
    {
      const { subject, text } = exitNoticeWords(day, clock.deletionDate, this.d.appUrl), key = exitNoticeKey(id, clock.holdSeq, day);
      // Each recipient once per notice (its own key): a failure leaves no line, and the next run sends only the rest.
      for (const r of to) await mail.send({ firmId: id, to: r.email, replyTo: SYSTEM_REPLY_TO, templateKey: day === 0 ? "platform.billing.payment_hold" : "platform.billing.deletion_warning",
        idempotencyKey: `${key}:${r.staffId ?? "billing"}`, subject, text,
        // A SERVICE email names its person (MessagePort's gate); the billing email of no staff member is an account notice with no person.
        ...(r.staffId ? { class: "SERVICE" as const, person: { kind: "STAFF" as const, id: r.staffId } } : { class: "TRANSACTIONAL" as const }) });
    }
    const written = await this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`firm-exit:${id}`}))`;
      const again = await exitClock(tx, id);
      if (!again || again.holdSeq !== clock.holdSeq || again.noticesSent.some((n) => n.day === day)) return false;
      await this.d.audit.record(tx, { firmId: id, actor: ACTOR, action: EXIT_NOTICE_ACTION, entity: EXIT_NOTICE_ENTITY, entityKey: exitNoticeKey(id, clock.holdSeq, day),
        summary: day === 0 ? `The payment-hold notice was sent; the firm's data is deleted on ${dateWords(clock.deletionDate)} unless paid.` : `The day-${day} deletion warning was sent; the firm's data is deleted on ${dateWords(clock.deletionDate)} unless paid.`,
        detail: { day, holdSeq: clock.holdSeq, deletionDate: clock.deletionDate.toISOString(), sentAt: now.toISOString(), recipients: to.length } });
      return true;
    });
    return { sent: written ? day : null, to: to.length };
  }

  /** The firm's active Owners and Admins (a live grant), then the billing email when it is none of theirs. */
  private async recipients(tx: Tx, firmId: string): Promise<Recipient[]> {
    const staff = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const, grants: { some: { firmId, role: { in: ["OWNER" as const, "ADMIN" as const] }, endedAt: null } } }), select: { id: true, email: true }, orderBy: { id: "asc" } });
    const firm = await tx.platformFirm.findFirst({ where: { id: firmId }, select: { billingEmail: true } });
    const out: Recipient[] = staff.map((s) => ({ email: s.email, staffId: s.id }));
    const billing = firm?.billingEmail?.trim();
    if (billing && !out.some((r) => r.email.toLowerCase() === billing.toLowerCase())) out.push({ email: billing, staffId: null });
    return out;
  }

  /** The sweep: every firm on hold, each in its own firm scope; one firm's failure never stops the rest. */
  async sweep(): Promise<{ sent: number; failed: number }> {
    // PF-12b: the list reads every firm's row, so each firm listed gets its platform.bypass line first (P-607).
    const { firms, unrecorded } = await asBypass(`job:${EXIT_NOTICE_QUEUE}`, async () => {
      const all = await this.d.db.platformFirm.findMany({ where: { status: "PAYMENT_HOLD" as const }, select: { id: true }, orderBy: { id: "asc" } });
      const { failed: lost } = await touchEachFirm(this.d.db, all.map((f) => f.id));
      return { firms: all.filter((f) => !lost.has(f.id.toLowerCase())), unrecorded: lost.size };
    });
    let sent = 0, failed = unrecorded;
    for (const f of firms) {
      try { if ((await withFirm(f.id, () => this.runFirm(f.id))).sent !== null) sent++; } catch (e) { failed++; logPort.error("exit_notice_failed", e, { firmId: f.id }); }
    }
    return { sent, failed };
  }

  /** Registers the sweep on PF-14's runner (before it starts). */
  async register(jobs: JobPort) {
    await jobs.handle(EXIT_NOTICE_QUEUE, async () => { await this.sweep(); });
    await jobs.recurring(EXIT_NOTICE_QUEUE, EXIT_NOTICE_CRON, EXIT_NOTICE_ZONE);
  }
}

export type { ExitClock };
