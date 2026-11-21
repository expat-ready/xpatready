// PF-16 part 1a (BACKLOG PF-16; SA-4-28..31, SA-4-49, -50, -55, -56; SA-3-58..61; Lead B P-566 (3)): plan changes on our
// own page, never Stripe's portal (its plan switching is off), because only here does checkDowngrade run (SA-3-58: no
// override). Owner only (the route's keys). What a change does, from our status (the server's clock) and Stripe's price:
//   * trial (still running): any public plan or period, at once, nothing charged, the trial end unchanged (SA-4-56);
//   * raise (same period, dearer) or monthly → yearly (a fresh year from today): at once, with Stripe's proration;
//   * same or cheaper (same period) or yearly → monthly: at the next renewal (a Stripe schedule), no refund, and our booking
//     (PF-15 part 1b: every limit the lower of the two plans' until then) only once checkDowngrade passes;
//   * a held firm pays first (409; its routes answer 402 anyway); while a renewal change is booked, withdraw it first.
// The change sends back the preview's proration date, kind and amount: the kind is decided again and the amount previewed
// again at that date, and a difference refuses (409 PREVIEW_STALE), so nothing is charged that was not shown. One change
// per firm at a time (a lock held for the whole change: review M1). Our side is written only once Stripe shows the new
// price (read back); a failure that may have reached Stripe is never answered "not charged", and a retry finds Stripe
// already changed and completes our side (review M2).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { BillingPort } from "../../../../../ports/billing.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import { EVENT } from "../../../../../ports/events.ts";
import { PaymentDeclined, type PlanChangePort } from "../../../../../ports/plan-change.ts";
import type { PlanBookings } from "../../entitlements/plan-booking.ts";
import { firmScope, ownFirm } from "../../firm-scope.ts";
import type { StaffContext } from "../../identity/keys.ts";

type Tx = Prisma.TransactionClient;
export type PlanChangeDeps = { db: PrismaClient; billing: BillingPort; plans: PlanChangePort; bookings: PlanBookings; audit: AuditPort<Tx>; clock: ClockPort; notReady?: string | null };

export const ChangeTarget = z.strictObject({ plan: z.string().trim().min(1).max(64), period: z.enum(["month", "year"]) });
export const ChangeRequest = ChangeTarget.extend({ prorationDate: z.iso.datetime({ offset: true }), kind: z.enum(["trial", "now", "renewal", "repair"]), amountDueNowCents: z.number().int().min(0).max(100_000_000) });
/** How long a preview's proration date stays good for its change (then preview again). */
export const PREVIEW_MINUTES = 30;
export type Kind = "trial" | "now" | "renewal";

const problem = (status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code, ...extra }, status);
const unavailable = () => problem(503, "BILLING_UNAVAILABLE", "Billing is unavailable", "We could not reach our billing provider. Nothing was changed. Try again in a few minutes.");
const stale = (why: string) => problem(409, "PREVIEW_STALE", "Preview again", `${why} Nothing was changed: look at the change again before confirming it.`);
const words = (period: string) => (period === "month" ? "monthly" : "yearly");

export class PlanChanges {
  constructor(private readonly d: PlanChangeDeps) {}

  /** Everything a change needs, read once: our subscription, the target plan's price, Stripe's current item, the kind. */
  private async plan(s: StaffContext, target: z.infer<typeof ChangeTarget>) {
    if (this.d.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.d.notReady);
    const now = this.d.clock.now();
    const firm = await this.d.db.platformFirm.findFirstOrThrow({ where: ownFirm(s.firmId), select: { key: true, status: true } });
    const sub = await this.d.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }), include: { plan: true } });
    if (!sub) throw problem(409, "NO_LIVE_SUBSCRIPTION", "No live subscription", "Your firm has no live subscription, so its plan cannot change.");
    if (sub.status === "PAYMENT_HOLD" || firm.status === "PAYMENT_HOLD") throw problem(409, "BILLING_NOT_ACTIVE", "Pay first", "Your firm is on payment hold: pay the open invoice before changing the plan.");
    if (!sub.stripeSubscriptionId) throw problem(409, "NO_BILLING_ACCOUNT", "Start your trial first", "Your free trial has not started yet. Sign in again to finish starting it.");
    const to = await this.d.db.platformPlan.findFirst({ where: { code: target.plan, active: true } });
    if (!to) throw problem(404, "PLAN_NOT_FOUND", "Not found", "No such plan.");
    const priceId = target.period === "month" ? to.stripeMonthlyPrice : to.stripeYearlyPrice;
    if (!priceId) throw problem(409, "PLAN_NOT_PURCHASABLE", "This plan cannot be bought here", `${to.name} has no ${words(target.period)} price.`);
    const cur = await this.d.plans.current(sub.stripeSubscriptionId).catch(() => { throw unavailable(); });
    const open = await this.d.bookings.open(s.firmId);
    // Review B1: a change while a renewal change is booked (in Stripe or ours) would leave the two disagreeing at the renewal.
    if (cur.scheduleId || open) throw problem(409, "PLAN_CHANGE_BOOKED", "A plan change is already booked", `A change${open ? ` to ${open.toPlan} on ${open.effectiveAt.slice(0, 10)}` : ""} is booked for the renewal. Withdraw it first.`);
    const samePlan = to.id === sub.planId;
    if (cur.priceId === priceId) {
      if (samePlan) throw problem(409, "SAME_PLAN", "Already on that plan", `Your firm is already on ${to.name}, ${words(target.period)}.`);
      return { firm, sub, to, priceId, price: null, cur, kind: "repair" as const, samePlan };   // Stripe changed and our side did not (review M2)
    }
    const price = (await this.d.billing.prices([priceId]).catch(() => { throw unavailable(); }))[0];
    if (!price || !price.active || price.interval !== target.period) throw problem(409, "PLAN_NOT_PURCHASABLE", "This plan cannot be bought here", `${to.name}'s ${words(target.period)} price is not available.`);
    const trial = sub.status === "TRIAL" && (!sub.trialEndsAt || sub.trialEndsAt > now);   // the server's clock (review M4), as PF-15b's trigger
    const kind: Kind = trial ? "trial" : cur.interval === "month" && target.period === "year" ? "now" : cur.interval === target.period && price.unitAmount > cur.unitAmount ? "now" : "renewal";
    return { firm, sub, to, priceId, price, cur, kind, samePlan };
  }

  private priceChange(p: { cur: { id: string; interval: string }; priceId: string; kind: string }, period: string, at: Date) {
    return { subscriptionId: p.cur.id, priceId: p.priceId, prorate: p.kind === "now", anchorNow: p.kind === "now" && p.cur.interval !== period, prorationDate: at };
  }

  /** What the change would do, read only: its kind, when, the amount now (Stripe's preview) and every conflict. */
  async preview(s: StaffContext, input: z.infer<typeof ChangeTarget>) {
    const at = new Date(Math.floor(this.d.clock.now().getTime() / 1000) * 1000), p = await this.plan(s, input);
    const base = { plan: { code: p.to.code, name: p.to.name }, period: input.period, prorationDate: at.toISOString(), refund: false, taxNote: "Prices are shown before applicable taxes." };
    if (p.kind === "repair") return { ...base, kind: p.kind, effectiveAt: at, amountDueNowCents: 0, prorationCents: 0, nextPriceCents: p.cur.unitAmount, currency: "CAD", conflicts: [] };
    const conflicts = p.samePlan ? [] : (await this.d.db.$transaction((tx) => this.d.bookings.conflicts(tx, s.firmId, p.firm.key, p.to.code))).conflicts;
    const now = p.kind !== "renewal" ? await this.d.plans.preview(this.priceChange(p, input.period, at)).catch(() => { throw unavailable(); }) : null;
    return { ...base, kind: p.kind, effectiveAt: p.kind === "renewal" ? p.cur.periodEnd : at, amountDueNowCents: now?.amountDueCents ?? 0, prorationCents: now?.prorationCents ?? 0,
      nextPriceCents: p.price.unitAmount, currency: (now?.currency ?? p.price.currency).toUpperCase(), conflicts };
  }

  /** Makes the change the preview showed (its proration date, kind and amount). One change per firm at a time. */
  async change(s: StaffContext, input: z.infer<typeof ChangeRequest>) {
    const at = new Date(input.prorationDate), nowMs = this.d.clock.now().getTime();
    if (at.getTime() > nowMs + 60_000 || at.getTime() < nowMs - PREVIEW_MINUTES * 60_000) throw stale(`That preview is more than ${PREVIEW_MINUTES} minutes old.`);
    return this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-change:${firmScope(s.firmId).firmId}`}))`;   // a second click waits, then reads the first's result
      const p = await this.plan(s, input), actor = `staff:${s.staffId}`;
      if (p.kind === "repair") return this.writeOurs(tx, s, p, input.period, actor, "repair", 0, at);
      if (p.kind !== input.kind) throw stale("The change is no longer the same kind (the trial may have ended).");
      if (p.kind === "renewal") return this.atRenewal(tx, s, p, actor);
      if (!p.samePlan) {   // an immediate move's conflicts; a "now" move also under the staff changes' and case openings' locks (review m5)
        if (p.kind === "now") {
          await tx.$queryRaw`select id from platform_firm where id = ${firmScope(s.firmId).firmId}::uuid for no key update`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case-open:${p.firm.key}`}))`;
        }
        const c = p.kind === "now" ? (await this.d.bookings.conflicts(tx, s.firmId, p.firm.key, p.to.code)).conflicts : (await this.d.db.$transaction((t) => this.d.bookings.conflicts(t, s.firmId, p.firm.key, p.to.code))).conflicts;
        if (c.length) throw problem(409, "DOWNGRADE_CONFLICTS", "Reduce the usage first", `${c.map((x) => x.words).join(" ")} Nothing was changed.`, { conflicts: c });
      }
      const change = this.priceChange(p, input.period, at);
      const shown = await this.d.plans.preview(change).catch(() => { throw unavailable(); });
      if (shown.amountDueCents !== input.amountDueNowCents) throw stale(`The amount due now is ${shown.amountDueCents} cents, not the ${input.amountDueNowCents} shown.`);
      const key = `pf16-${s.firmId}-${p.cur.id}-${p.priceId}-${Math.floor(at.getTime() / 1000)}`;
      try { await this.d.plans.changeNow(change, key); } catch (e) {
        if (e instanceof PaymentDeclined) throw problem(402, "PAYMENT_FAILED", "The payment did not go through", "Your card was declined: nothing was charged and your plan has not changed. Update the card in Billing, then preview the change again.");
        const after = await this.d.plans.current(p.cur.id).catch(() => null);
        if (after?.priceId !== p.priceId) throw problem(503, "BILLING_UNCONFIRMED", "We could not confirm the change", "Our billing provider did not confirm the change. Check Billing in a minute before trying again.");
      }
      const after = await this.d.plans.current(p.cur.id).catch(() => { throw unavailable(); });
      if (after.priceId !== p.priceId) throw stale("Our billing provider did not take the change.");   // e.g. a replayed key after an undo (review M2)
      if (p.kind === "trial" && !p.samePlan) {   // PF-15 part 1b applies a trial's move at once (the trial end unchanged) and writes plan.changed
        const b = await this.d.bookings.book(s.firmId, p.to.code, actor).catch(async (e) => { await this.d.plans.changeNow({ ...change, priceId: p.cur.priceId }, `${key}-undo-${randomUUID()}`).catch(() => undefined); throw e; });
        return { kind: p.kind, plan: p.to.code, period: input.period, appliedAt: b.appliedAt, chargedNow: false, chargedCents: 0 };
      }
      return this.writeOurs(tx, s, p, input.period, actor, p.kind, shown.amountDueCents, at, after.periodEnd);
    }, { timeout: 60_000, maxWait: 30_000 });
  }

  /** Our side of a change Stripe has made: the plan, one audit line and plan.changed (last), in the locked transaction. */
  private async writeOurs(tx: Tx, s: StaffContext, p: { sub: { id: string; planId: string; plan: { code: string } }; to: { id: string; code: string }; cur: { interval: string; periodEnd: Date | null }; samePlan: boolean }, period: string, actor: string, kind: string, cents: number, at: Date, periodEnd: Date | null = p.cur.periodEnd) {
    // The plan, and Stripe's period end as it is now (a fresh year from monthly → yearly; break M5: a later booking's
    // renewal date is read from it), on the row we read (break B2: a row changed meanwhile refuses, count checked).
    const n = await tx.platformSubscription.updateMany({ where: firmScope(s.firmId, { id: p.sub.id, planId: p.sub.planId }), data: { planId: p.to.id, ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) } });
    if (n.count !== 1) throw stale("The plan changed meanwhile.");
    await this.d.audit.record(tx, { firmId: s.firmId, actor, action: "platform.plan.changed", entity: "platform_subscription", entityKey: p.sub.id,
      summary: kind === "repair" ? `Our record now matches billing: ${p.to.code} (${words(period)}), as already changed with our billing provider.` : kind === "trial" ? `The billing period changed to ${words(period)} during the trial; nothing was charged.` : `The plan changed from ${p.sub.plan.code} to ${p.to.code} (${words(period)}) now; ${cents} cents charged, prorated.`,
      detail: { kind, chargedCents: cents }, before: { plan: p.sub.plan.code, period: p.cur.interval, chargedCents: null }, after: { plan: p.to.code, period, chargedCents: cents } });
    if (!p.samePlan) await tx.moduleEvent.create({ data: { firmId: s.firmId, type: EVENT.PLAN_CHANGED, subjectId: p.sub.id, payload: { firmId: s.firmId, from: p.sub.plan.code, to: p.to.code, when: "now" } } });   // last
    return { kind, plan: p.to.code, period, appliedAt: at.toISOString(), chargedNow: cents > 0, chargedCents: cents };
  }

  /** Same or cheaper, or yearly → monthly: our booking first (its checks), then Stripe's schedule; Stripe refusing undoes ours.
   *  A fresh key each time (review m1): the lock and the booked check above stop a second schedule. */
  private async atRenewal(tx: Tx, s: StaffContext, p: Awaited<ReturnType<PlanChanges["plan"]>>, actor: string) {
    const b = p.samePlan ? null : await this.d.bookings.book(s.firmId, p.to.code, actor).catch((e) => {
      const code = (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
      if (code === "PLAN_RAISE_NOT_BOOKED") throw problem(409, "PLAN_RAISE_NOT_BOOKED", "Not as one change", `${p.to.name} is a larger plan: move to it at the same billing period first (it applies at once), then change the period.`);   // break m4
      throw e;
    });
    try { await this.d.plans.scheduleAtRenewal({ subscriptionId: p.cur.id, priceId: p.priceId }, `pf16-${s.firmId}-${p.cur.id}-renewal-${randomUUID()}`); } catch {
      // Break M2: the schedule may have been made and the answer lost; read Stripe back before undoing ours.
      const back = await this.d.plans.current(p.cur.id).catch(() => null);
      if (!back) throw problem(503, "BILLING_UNCONFIRMED", "We could not confirm the change", "Our billing provider did not confirm the change. Check Billing in a minute before trying again.");
      if (!back.scheduleId) {
        if (b && !(await this.d.bookings.withdraw(s.firmId, "system:platform.billing.plan-change").then(() => true, () => false))) throw problem(503, "BILLING_UNCONFIRMED", "We could not confirm the change", "The change could not be completed and our booking could not be undone yet. Check Billing in a minute; withdraw the change there if it shows.");
        throw unavailable();
      }
    }
    const period = p.price?.interval ?? p.cur.interval, when = (b?.effectiveAt ?? p.cur.periodEnd?.toISOString()) ?? null;
    if (!b) await this.d.audit.record(tx, { firmId: s.firmId, actor, action: "platform.plan.period_booked", entity: "platform_subscription", entityKey: p.sub.id,
      summary: `The billing period changes to ${words(period)} at the renewal on ${when?.slice(0, 10) ?? "the next renewal"}; no refund.`, detail: { effectiveAt: when }, before: { period: p.cur.interval, bookedPeriod: null }, after: { period: p.cur.interval, bookedPeriod: period } });
    return { kind: p.kind, plan: p.to.code, period, effectiveAt: when, chargedNow: false, chargedCents: 0 };
  }

  /** Withdraws a booked change: Stripe's schedule released, then our booking (its limits are the current plan's again). */
  async withdraw(s: StaffContext) {
    if (this.d.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.d.notReady);
    return this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-change:${firmScope(s.firmId).firmId}`}))`;
      const sub = await this.d.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }) });
      const cur = sub?.stripeSubscriptionId ? await this.d.plans.current(sub.stripeSubscriptionId).catch(() => { throw unavailable(); }) : null;
      const open = await this.d.bookings.open(s.firmId);
      if (!open && !cur?.scheduleId) return { withdrawn: false, toPlan: null, scheduleReleased: false };   // nothing booked: changes nothing (PF-28: an empty body that changes nothing passes)
      if (cur?.scheduleId) await this.d.plans.releaseSchedule(cur.id).catch(() => { throw unavailable(); });
      if (open) await this.d.bookings.withdraw(s.firmId, `staff:${s.staffId}`);
      else if (sub) await this.d.audit.record(tx, { firmId: s.firmId, actor: `staff:${s.staffId}`, action: "platform.plan.period_withdrawn", entity: "platform_subscription", entityKey: sub.id,
        summary: "The booked change of billing period was withdrawn; the subscription stays as it is.", detail: { scheduleReleased: true }, before: { bookedPeriod: "booked" }, after: { bookedPeriod: null } });   // review m2
      return { withdrawn: true, toPlan: open?.toPlan ?? null, scheduleReleased: !!cur?.scheduleId };
    }, { timeout: 60_000, maxWait: 30_000 });
  }
}
