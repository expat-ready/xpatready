// PF-16 part 1a (SA-4-28..31, -49, -50, -55, -56; SA-3-58..61; Lead B P-566 (3)): plan changes on our own page, where
// checkDowngrade runs (SA-3-58: no override). Owner only. By our status (server clock) and Stripe's price: a running trial
// switches at once, free, trial end unchanged; a raise or monthly → yearly applies now with Stripe's proration; same or
// cheaper or yearly → monthly at the renewal (a schedule, no refund, PF-15b's booking after checkDowngrade); held → 409;
// booked → withdraw first. The change carries the preview's date, kind and amount, checked again; one change per firm;
// ours is written once Stripe, read back, shows the new price, and a retry repairs ours.
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
  private async plan(s: StaffContext, target: z.infer<typeof ChangeTarget>, c: Tx | PrismaClient = this.d.db) {
    if (this.d.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.d.notReady);
    const now = this.d.clock.now();
    const firm = await c.platformFirm.findFirstOrThrow({ where: ownFirm(s.firmId), select: { key: true, status: true } });
    const sub = await c.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }), include: { plan: true } });
    if (!sub) throw problem(409, "NO_LIVE_SUBSCRIPTION", "No live subscription", "Your firm has no live subscription, so its plan cannot change.");
    if (sub.status === "PAYMENT_HOLD" || firm.status === "PAYMENT_HOLD") throw problem(409, "BILLING_NOT_ACTIVE", "Pay first", "Your firm is on payment hold: pay the open invoice before changing the plan.");
    if (!sub.stripeSubscriptionId) throw problem(409, "NO_BILLING_ACCOUNT", "Start your trial first", "Your free trial has not started yet. Sign in again to finish starting it.");
    const to = await c.platformPlan.findFirst({ where: { code: target.plan, active: true } });
    if (!to) throw problem(404, "PLAN_NOT_FOUND", "Not found", "No such plan.");
    const priceId = target.period === "month" ? to.stripeMonthlyPrice : to.stripeYearlyPrice;
    if (!priceId) throw problem(409, "PLAN_NOT_PURCHASABLE", "This plan cannot be bought here", `${to.name} has no ${words(target.period)} price.`);
    const cur = await this.d.plans.current(sub.stripeSubscriptionId).catch(() => { throw unavailable(); });
    const open = await this.d.bookings.open(s.firmId, c);
    // Review B1: a change while a renewal change is booked (in Stripe or ours) would leave the two disagreeing at the renewal.
    if (cur.pendingPriceId || open) throw problem(409, "PLAN_CHANGE_BOOKED", "A plan change is already booked", `A change${open ? ` to ${open.toPlan} on ${open.effectiveAt.slice(0, 10)}` : ""} is booked for the renewal. Withdraw it first.`);
    const samePlan = to.id === sub.planId;
    if (cur.priceId === priceId) {
      if (samePlan) throw problem(409, "SAME_PLAN", "Already on that plan", `Your firm is already on ${to.name}, ${words(target.period)}.`);
      // Break round 2: a repair trusts Stripe's price only when one plan carries it (else the price names no plan).
      if (await c.platformPlan.count({ where: { active: true, OR: [{ stripeMonthlyPrice: priceId }, { stripeYearlyPrice: priceId }] } }) !== 1) throw problem(409, "PLAN_PRICE_SHARED", "Ask us", "Your billing and your plan disagree, and the price names more than one plan. Ask us to put it right.");
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
    // A trial switch is free: Stripe's preview with no proration is the upcoming (trial-end) invoice, not a charge now (review R2-M3).
    const now = p.kind === "now" ? await this.d.plans.preview(this.priceChange(p, input.period, at)).catch(() => { throw unavailable(); }) : null;
    return { ...base, kind: p.kind, effectiveAt: p.kind === "renewal" ? p.cur.periodEnd : at, amountDueNowCents: now?.amountDueCents ?? 0, prorationCents: now?.prorationCents ?? 0,
      nextPriceCents: p.price.unitAmount, currency: (now?.currency ?? p.price.currency).toUpperCase(), conflicts };
  }

  /** Makes the change the preview showed (its proration date, kind and amount). One change per firm at a time. */
  async change(s: StaffContext, input: z.infer<typeof ChangeRequest>) {
    const at = new Date(input.prorationDate), nowMs = this.d.clock.now().getTime();
    if (at.getTime() > nowMs + 60_000 || at.getTime() < nowMs - PREVIEW_MINUTES * 60_000) throw stale(`That preview is more than ${PREVIEW_MINUTES} minutes old.`);
    return this.d.db.$transaction(async (tx) => {
      await this.lock(tx, s);
      const p = await this.plan(s, input, tx), actor = `staff:${s.staffId}`;
      if (p.kind === "repair") {   // review R2-m1: our side follows Stripe only without conflicts
        const c = p.samePlan ? [] : (await this.d.bookings.conflicts(tx, s.firmId, p.firm.key, p.to.code)).conflicts;
        if (c.length) throw problem(409, "DOWNGRADE_CONFLICTS", "Reduce the usage first", `${c.map((x) => x.words).join(" ")} Your billing already shows ${p.to.name}: reduce the usage, then confirm again.`, { conflicts: c });
        return this.writeOurs(tx, s, p, input.period, actor, "repair", 0, at);
      }
      if (p.kind !== input.kind) throw stale("The change is no longer the same kind (the trial may have ended).");
      if (p.cur.scheduleId) await this.d.plans.releaseSchedule(p.cur.id).catch(() => { throw unavailable(); });   // one left in its last phase: nothing ahead (R2-M2), released quietly
      if (p.kind === "renewal") return this.atRenewal(tx, s, p, actor);
      if (!p.samePlan) {   // an immediate move's conflicts; a "now" move also under the staff changes' and case openings' locks (review m5)
        if (p.kind === "now") {
          await tx.$queryRaw`select id from platform_firm where id = ${firmScope(s.firmId).firmId}::uuid for no key update`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case-open:${p.firm.key}`}))`;
        }
        const c = (await this.d.bookings.conflicts(tx, s.firmId, p.firm.key, p.to.code)).conflicts;
        if (c.length) throw problem(409, "DOWNGRADE_CONFLICTS", "Reduce the usage first", `${c.map((x) => x.words).join(" ")} Nothing was changed.`, { conflicts: c });
      }
      const change = this.priceChange(p, input.period, at);
      const shown = p.kind === "trial" ? { amountDueCents: 0 } : await this.d.plans.preview(change).catch(() => { throw unavailable(); });
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
        const b = await this.d.bookings.book(s.firmId, p.to.code, actor, tx).catch(async (e) => { await this.d.plans.changeNow({ ...change, priceId: p.cur.priceId }, `${key}-undo-${randomUUID()}`).catch(() => undefined); throw e; });
        return { kind: p.kind, plan: p.to.code, period: input.period, appliedAt: b.appliedAt, chargedNow: false, chargedCents: 0 };
      }
      return this.writeOurs(tx, s, p, input.period, actor, p.kind, shown.amountDueCents, at, after.periodEnd);
    }, { timeout: 60_000, maxWait: 30_000 });
  }

  /** One change per firm at a time, never waited for (break round 2: a queue of waiting changes held every pooled connection
   *  while the one holding the lock needed a second); every query of a change then runs on this one transaction. */
  private async lock(tx: Tx, s: StaffContext) {
    const got = (await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`plan-change:${firmScope(s.firmId).firmId}`})) AS ok`)[0]?.ok;
    if (!got) throw problem(409, "PLAN_CHANGE_IN_PROGRESS", "A change is in progress", "Another plan change for your firm is being made. Wait a moment, then look at Billing again.");
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
    const b = p.samePlan ? null : await this.d.bookings.book(s.firmId, p.to.code, actor, tx).catch((e) => {
      const code = (e as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
      if (code === "PLAN_RAISE_NOT_BOOKED") throw problem(409, "PLAN_RAISE_NOT_BOOKED", "Ask us", `${p.to.name} gives more than your plan on some limit, so it cannot start at the renewal. Ask us to make this change.`);   // break m4, review R2-m4
      throw e;
    });
    try { await this.d.plans.scheduleAtRenewal({ subscriptionId: p.cur.id, priceId: p.priceId }, `pf16-${s.firmId}-${p.cur.id}-renewal-${randomUUID()}`); } catch {
      // Break M2, review R2-M1: booked only if a phase ahead moves to the target; anything else (a half-made schedule
      // included) is released and ours withdrawn, or the answer says it could not be confirmed.
      const back = await this.d.plans.current(p.cur.id).catch(() => null);
      if (back?.pendingPriceId !== p.priceId) {
        const undone = !!back && (!back.scheduleId || await this.d.plans.releaseSchedule(p.cur.id).then(() => true, () => false))
          && (!b || await this.d.bookings.withdraw(s.firmId, "system:platform.billing.plan-change", tx).then(() => true, () => false));
        if (!undone) throw problem(503, "BILLING_UNCONFIRMED", "We could not confirm the change", "The change could not be completed or undone yet. Check Billing in a minute; withdraw the change there if it shows.");
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
      await this.lock(tx, s);
      const sub = await tx.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }) });
      const cur = sub?.stripeSubscriptionId ? await this.d.plans.current(sub.stripeSubscriptionId).catch(() => { throw unavailable(); }) : null;
      const open = await this.d.bookings.open(s.firmId, tx);
      if (cur?.scheduleId) await this.d.plans.releaseSchedule(cur.id).catch(() => { throw unavailable(); });   // a pending one, or one left in its last phase (quietly)
      if (!open && !cur?.pendingPriceId) return { withdrawn: false, toPlan: null, scheduleReleased: false };   // nothing booked: changes nothing (PF-28: an empty body that changes nothing passes)
      if (open) await this.d.bookings.withdraw(s.firmId, `staff:${s.staffId}`, tx);
      else if (sub) await this.d.audit.record(tx, { firmId: s.firmId, actor: `staff:${s.staffId}`, action: "platform.plan.period_withdrawn", entity: "platform_subscription", entityKey: sub.id,
        summary: "The booked change of billing period was withdrawn; the subscription stays as it is.", detail: { scheduleReleased: true }, before: { bookedPeriod: "booked" }, after: { bookedPeriod: null } });   // review m2
      return { withdrawn: true, toPlan: open?.toPlan ?? null, scheduleReleased: !!cur?.pendingPriceId };
    }, { timeout: 60_000, maxWait: 30_000 });
  }
}
