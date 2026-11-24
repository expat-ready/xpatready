// FO-3c part 2 (R1.104, J-104 W2; Lead 10, 23 Nov): live delivery of `booking.scheduled` and `booking.rescheduled` to the
// consultation agreement, a polling publisher over the outbox (module_event), as CS-K1 part 2's `case-clients/live.ts`.
//   * At app start, and then every CONSULTATION_AGREEMENT_POLL_MS (default 2000 ms, Sample), the events after the
//     poller's cursor (module_event.seq) are read on the one bypass use AGREEMENT_POLL_USE (poll.bypass.ts), and each is
//     handed to `onBookingEvent` as its own firm (withFirm): a new booking sends its agreement, a moved one moves its
//     24-hour reminder. Both are safe to repeat (the send is once per booking, the reminder's job key names the booking's
//     sequence), so at start the cursor is set a day back and that day's events are read again.
//   * Every CATCH_UP_EVERY-th run, `catchUp` makes good what the events missed (a send that failed, a seal that failed),
//     its reads on the same use, each booking sent as its own firm.
//   * Each firm read in a run is touched once (touchFirms: one platform.bypass line in its trail) before any of its rows
//     is handled; a firm whose line cannot be written is not handled this run. Single-flight; it stops on shutdown. A
//     failure is logged by id and the poll goes on.
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { EVENT } from "../../../../../ports/events.ts";
import { asBypass, touchFirms, withFirm } from "../../../platform/firm-scope.ts";
import { logPort } from "../../../platform/observability/log.ts";
import { AGREEMENT_POLL_USE } from "./poll.bypass.ts";
import type { ConsultationAgreementService } from "./service.ts";

/** Sample: how often the outbox is read (ms), and how many runs between catch-ups. */
export const agreementPollMs = () => Math.min(3_600_000, Math.max(200, Number(process.env.CONSULTATION_AGREEMENT_POLL_MS) || 2_000));
export const CATCH_UP_EVERY = 15;
const BATCH = 200, DAY = 24 * 60 * 60_000;
export const BACKOFF_MAX_MS = 3_600_000;
const TYPES = [EVENT.BOOKING_SCHEDULED, EVENT.BOOKING_RESCHEDULED];

export type PollRun = { events: number; sent: number; failed: number; caughtUp: { sent: number; failed: number; sealed: number } | null };

export class AgreementPoll implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<PollRun | null> | null = null;
  private cursor: bigint | null = null;
  private runs = 0;
  /** The last run's result (a test reads it). */
  last: PollRun | null = null;
  constructor(private readonly db: PrismaClient, private readonly svc: ConsultationAgreementService, private readonly now: () => Date = () => new Date()) {}

  onApplicationBootstrap() { void this.tick(); this.timer = setInterval(() => void this.tick(), agreementPollMs()); this.timer.unref(); }
  async onApplicationShutdown() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.running; }

  /** One run, unless one is still going (single-flight). */
  tick() { if (!this.running) this.running = this.run().finally(() => { this.running = null; }); return this.running; }

  /** Rows that failed: not tried again (so no bypass line written for them) until their wait is over; the wait doubles
   *  from one catch-up to at most an hour (break P2-3, as CS-K1's touchedEach). A row with a meeting (`before`) waits at
   *  most half the time left before it, never less than one catch-up, so it is tried again while the meeting is still
   *  ahead (break P2R2-2). */
  private readonly backoff = new Map<string, { until: number; wait: number; at: number }>();
  /** Each firm's rows run as that firm, once its bypass line of this run is written; a held-back row answers null. */
  private eachOf() {
    const lined = new Map<string, Promise<void>>();
    return async <T,>(firmId: string, fn: () => Promise<T>, key?: string, before?: Date): Promise<T | null> => {
      const k = key ? `${firmId}:${key}` : null, held = k ? this.backoff.get(k) : undefined, now = this.now().getTime();
      // The cap is read again at each check with the meeting's time now (review m3-2: a booking moved nearer meanwhile).
      if (held && Math.min(held.until, before ? held.at + Math.max(agreementPollMs() * CATCH_UP_EVERY, Math.floor((before.getTime() - held.at) / 2)) : Infinity) > now) return null;
      if (!lined.has(firmId)) lined.set(firmId, touchFirms(this.db, [firmId]));
      await lined.get(firmId)!;
      try { const r = await withFirm(firmId, fn); if (k) this.backoff.delete(k); return r; } catch (e) {
        if (k) {
          const least = agreementPollMs() * CATCH_UP_EVERY, wait = held ? Math.min(BACKOFF_MAX_MS, held.wait * 2) : least;
          const cap = before ? Math.max(least, Math.floor((before.getTime() - now) / 2)) : wait;
          this.backoff.set(k, { until: now + Math.min(wait, cap), wait, at: now });
        }
        throw e;
      }
    };
  }

  private async run(): Promise<PollRun | null> {
    try {
      const out: PollRun = { events: 0, sent: 0, failed: 0, caughtUp: null };
      const each = this.eachOf();
      await asBypass(AGREEMENT_POLL_USE, async () => {
        if (this.cursor === null) {
          const since = new Date(this.now().getTime() - DAY);
          this.cursor = (await this.db.$queryRaw<{ s: bigint | null }[]>`select max(seq) as s from module_event where occurred_at < ${since}`)[0]?.s ?? 0n;
        }
        const rows = await this.db.$queryRaw<{ seq: bigint; firm_id: string; type: string; payload: unknown }[]>`
          select seq, firm_id::text, type, payload from module_event where seq > ${this.cursor} and type = any(${TYPES}) and firm_id is not null order by seq limit ${BATCH}`;
        for (const e of rows) {
          out.events++;
          try { const r = await each(e.firm_id, () => this.svc.onBookingEvent({ type: e.type, firmId: e.firm_id, payload: e.payload })); if (r?.sent) out.sent++; }   // no key: an event is read once
          catch (err) { out.failed++; logPort.error("consultation_agreement_event_failed", err, { seq: String(e.seq), firmId: e.firm_id }); }
          this.cursor = e.seq;   // a failed send is made good by the catch-up below (the booking still has no agreement)
        }
        if (this.runs++ % CATCH_UP_EVERY === 0) out.caughtUp = await this.svc.catchUp(each);
      });
      this.last = out;
      return out;
    } catch (e) { logPort.error("consultation_agreement_poll_failed", e, {}); return null; }
  }
}
