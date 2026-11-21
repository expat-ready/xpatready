// PF-16 part 1a (BACKLOG PF-16; SA-4-28..31, SA-4-49, -50, -55, -56; SA-3-58..61; Lead B P-566 (3)): plan changes on our
// own page, never Stripe's portal (its plan switching is off), because only here does checkDowngrade run (SA-3-58: no
// override). Owner only (the route's keys). What a change does, from our status and Stripe's price:
//   * trial (still running): any public plan or period, at once, nothing charged, the trial end unchanged (SA-4-56);
//   * raise (same period, dearer) or monthly → yearly (a fresh year from today): at once, with Stripe's proration;
//   * same or cheaper (same period) or yearly → monthly: at the next renewal (a Stripe schedule), no refund, and our booking
//     (PF-15 part 1b: every limit the lower of the two plans' until then) only once checkDowngrade passes;
//   * a held firm pays first (409; its routes answer 402 anyway).
// The preview reads Stripe's preview (invoices.createPreview) at a proration date; the change must send that date back, so
// the amount charged is the amount shown and a repeated click is one charge (the date is in Stripe's idempotency key).
// Order: our checks, then Stripe, then ours in one transaction (plan, audit line, plan.changed last). A renewal booking
// is written first and withdrawn if Stripe refuses.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { BillingPort } from "../../../../../ports/billing.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import { EVENT } from "../../../../../ports/events.ts";
import type { PlanChangePort } from "../../../../../ports/plan-change.ts";
import type { PlanBookings } from "../../entitlements/plan-booking.ts";
import { firmScope } from "../../firm-scope.ts";
import type { StaffContext } from "../../identity/keys.ts";

type Tx = Prisma.TransactionClient;
export type PlanChangeDeps = { db: PrismaClient; billing: BillingPort; plans: PlanChangePort; bookings: PlanBookings; audit: AuditPort<Tx>; clock: ClockPort; notReady?: string | null };

export const ChangeTarget = z.strictObject({ plan: z.string().trim().min(1).max(64), period: z.enum(["month", "year"]) });
export const ChangeRequest = ChangeTarget.extend({ prorationDate: z.iso.datetime({ offset: true }) });
/** How long a preview's proration date stays good for its change (then preview again). */
export const PREVIEW_MINUTES = 30;
export type Kind = "trial" | "now" | "renewal";

const problem = (status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code, ...extra }, status);
const unavailable = () => problem(503, "BILLING_UNAVAILABLE", "Billing is unavailable", "We could not reach our billing provider. Nothing was changed. Try again in a few minutes.");

export class PlanChanges {
  constructor(private readonly d: PlanChangeDeps) {}

  /** Everything a change needs, read once: our subscription, the target plan's price, Stripe's current item, the kind. */
  private async plan(s: StaffContext, target: z.infer<typeof ChangeTarget>, at: Date) {
    if (this.d.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.d.notReady);
    const firm = await this.d.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId }, select: { key: true, status: true } });
    const sub = await this.d.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }), include: { plan: true } });
    if (!sub) throw problem(409, "NO_LIVE_SUBSCRIPTION", "No live subscription", "Your firm has no live subscription, so its plan cannot change.");
    if (sub.status === "PAYMENT_HOLD" || firm.status === "PAYMENT_HOLD") throw problem(409, "BILLING_NOT_ACTIVE", "Pay first", "Your firm is on payment hold: pay the open invoice before changing the plan.");
    if (!sub.stripeSubscriptionId) throw problem(409, "NO_BILLING_ACCOUNT", "Start your trial first", "Your free trial has not started yet. Sign in again to finish starting it.");
    const to = await this.d.db.platformPlan.findFirst({ where: { code: target.plan, active: true } });
    const priceId = to ? (target.period === "month" ? to.stripeMonthlyPrice : to.stripeYearlyPrice) : null;
    if (!to) throw problem(404, "PLAN_NOT_FOUND", "Not found", "No such plan.");
    if (!priceId) throw problem(409, "PLAN_NOT_PURCHASABLE", "This plan cannot be bought here", `${to.name} has no ${target.period === "month" ? "monthly" : "yearly"} price.`);
    const cur = await this.d.plans.current(sub.stripeSubscriptionId).catch(() => { throw unavailable(); });
    if (cur.priceId === priceId) throw problem(409, "SAME_PLAN", "Already on that plan", `Your firm is already on ${to.name}, ${target.period === "month" ? "monthly" : "yearly"}.`);
    const price = (await this.d.billing.prices([priceId]).catch(() => { throw unavailable(); }))[0];
    if (!price || !price.active || price.interval !== target.period) throw problem(409, "PLAN_NOT_PURCHASABLE", "This plan cannot be bought here", `${to.name}'s ${target.period === "month" ? "monthly" : "yearly"} price is not available.`);
    const trial = sub.status === "TRIAL" && (!sub.trialEndsAt || sub.trialEndsAt > at);
    const kind: Kind = trial ? "trial" : cur.interval === "month" && target.period === "year" ? "now" : cur.interval === target.period && price.unitAmount > cur.unitAmount ? "now" : "renewal";
    return { firm, sub, to, priceId, price, cur, kind, samePlan: to.id === sub.planId };
  }

  private async conflicts(s: StaffContext, firmKey: string, planCode: string) {
    const c = await this.d.db.$transaction((tx) => this.d.bookings.conflicts(tx, s.firmId, firmKey, planCode));
    return c.conflicts;
  }

  /** What the change would do, read only: its kind, when, the amount now (Stripe's preview) and every conflict. */
  async preview(s: StaffContext, input: z.infer<typeof ChangeTarget>) {
    const at = new Date(Math.floor(this.d.clock.now().getTime() / 1000) * 1000), p = await this.plan(s, input, at);
    const conflicts = p.samePlan ? [] : await this.conflicts(s, p.firm.key, p.to.code);
    const now = p.kind !== "renewal" ? await this.d.plans.preview({ subscriptionId: p.cur.id, priceId: p.priceId, prorate: p.kind === "now", anchorNow: p.kind === "now" && p.cur.interval !== input.period, prorationDate: at }).catch(() => { throw unavailable(); }) : null;
    return { kind: p.kind, plan: { code: p.to.code, name: p.to.name }, period: input.period, effectiveAt: p.kind === "renewal" ? p.cur.periodEnd : at, prorationDate: at.toISOString(),
      amountDueNowCents: now?.amountDueCents ?? 0, prorationCents: now?.prorationCents ?? 0, nextPriceCents: p.price.unitAmount, currency: (now?.currency ?? p.price.currency).toUpperCase(),
      conflicts, refund: false, taxNote: "Prices are shown before applicable taxes." };
  }

  /** Makes the change the preview showed (the same proration date). Answers the kind, the plan and when it applies. */
  async change(s: StaffContext, input: z.infer<typeof ChangeRequest>) {
    const at = new Date(input.prorationDate), now = this.d.clock.now().getTime();
    if (at.getTime() > now + 60_000 || at.getTime() < now - PREVIEW_MINUTES * 60_000) throw problem(409, "PREVIEW_STALE", "Preview again", `That preview is more than ${PREVIEW_MINUTES} minutes old. Look at the change again before confirming it.`);
    const p = await this.plan(s, input, at), actor = `staff:${s.staffId}`;
    if (!p.samePlan) { const c = await this.conflicts(s, p.firm.key, p.to.code); if (c.length) throw problem(409, "DOWNGRADE_CONFLICTS", "Reduce the usage first", `${c.map((x) => x.words).join(" ")} Nothing was changed.`, { conflicts: c }); }
    const change = { subscriptionId: p.cur.id, priceId: p.priceId, prorate: p.kind === "now", anchorNow: p.kind === "now" && p.cur.interval !== input.period, prorationDate: at };
    const key = `pf16-${s.firmId}-${p.cur.id}-${p.priceId}-${Math.floor(at.getTime() / 1000)}`;
    if (p.kind === "renewal") return this.atRenewal(s, p, actor, `pf16-${s.firmId}-${p.cur.id}-${p.priceId}`);
    try { await this.d.plans.changeNow(change, key); } catch (e) {
      if (p.kind === "now") throw problem(402, "PAYMENT_FAILED", "The payment did not go through", "Your card was not charged and your plan has not changed. Update the card in Billing, then try again.");
      throw unavailable();
    }
    if (p.kind === "trial" && !p.samePlan) {   // PF-15 part 1b applies a trial's move at once (the trial end unchanged) and writes plan.changed
      const b = await this.d.bookings.book(s.firmId, p.to.code, actor).catch(async (e) => { await this.d.plans.changeNow({ ...change, priceId: p.cur.priceId }, `${key}-undo`).catch(() => undefined); throw e; });
      return { kind: p.kind, plan: p.to.code, period: input.period, appliedAt: b.appliedAt, chargedNow: false };
    }
    await this.d.db.$transaction(async (tx) => {
      if (!p.samePlan) await tx.platformSubscription.updateMany({ where: firmScope(s.firmId, { id: p.sub.id, planId: p.sub.planId }), data: { planId: p.to.id } });
      await this.d.audit.record(tx, { firmId: s.firmId, actor, action: "platform.plan.changed", entity: "platform_subscription", entityKey: p.sub.id,
        summary: p.kind === "trial" ? `The billing period changed to ${input.period === "month" ? "monthly" : "yearly"} during the trial; nothing was charged.` : `The plan changed from ${p.sub.plan.code} to ${p.to.code} (${input.period === "month" ? "monthly" : "yearly"}) now, with the prorated difference charged.`,
        detail: { fromPlan: p.sub.plan.code, toPlan: p.to.code, period: input.period, kind: p.kind }, before: { plan: p.sub.plan.code, period: p.cur.interval }, after: { plan: p.to.code, period: input.period } });
      if (!p.samePlan) await tx.moduleEvent.create({ data: { firmId: s.firmId, type: EVENT.PLAN_CHANGED, subjectId: p.sub.id, payload: { firmId: s.firmId, from: p.sub.plan.code, to: p.to.code, when: "now" } } });   // last
    });
    return { kind: p.kind, plan: p.to.code, period: input.period, appliedAt: at.toISOString(), chargedNow: p.kind === "now" };
  }

  /** Same or cheaper, or yearly → monthly: our booking first (its checks), then Stripe's schedule; Stripe refusing undoes ours. */
  private async atRenewal(s: StaffContext, p: Awaited<ReturnType<PlanChanges["plan"]>>, actor: string, key: string) {
    const b = p.samePlan ? null : await this.d.bookings.book(s.firmId, p.to.code, actor);
    // One key per booking (its id), so a booking made again after a withdrawal is a new schedule, never Stripe's replay of
    // the released one; a period-only change keys on Stripe's period end.
    try { await this.d.plans.scheduleAtRenewal({ subscriptionId: p.cur.id, priceId: p.priceId }, `${key}-${b?.id ?? Math.floor((p.cur.periodEnd?.getTime() ?? 0) / 1000)}`); } catch {
      if (b) await this.d.bookings.withdraw(s.firmId, "system:platform.billing.plan-change").catch(() => undefined);
      throw unavailable();
    }
    if (!b) await this.d.db.$transaction((tx) => this.d.audit.record(tx, { firmId: s.firmId, actor, action: "platform.plan.period_booked", entity: "platform_subscription", entityKey: p.sub.id,
      summary: `The billing period changes to ${p.to.code === p.sub.plan.code && p.cur.interval === "year" ? "monthly" : "the new price"} at the renewal on ${p.cur.periodEnd?.toISOString().slice(0, 10) ?? "the next renewal"}; no refund.`,
      detail: { plan: p.to.code, period: p.price.interval, effectiveAt: p.cur.periodEnd?.toISOString() ?? null }, before: { period: p.cur.interval }, after: { period: p.price.interval } }));
    return { kind: p.kind, plan: p.to.code, period: p.price.interval, effectiveAt: (b?.effectiveAt ?? p.cur.periodEnd?.toISOString()) ?? null, chargedNow: false };
  }

  /** Withdraws a booked change: Stripe's schedule released, then our booking (its limits are the current plan's again). */
  async withdraw(s: StaffContext) {
    if (this.d.notReady) throw problem(503, "BILLING_NOT_SET_UP", "Billing is not set up here", this.d.notReady);
    const sub = await this.d.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }) });
    if (sub?.stripeSubscriptionId) await this.d.plans.releaseSchedule(sub.stripeSubscriptionId).catch(() => { throw unavailable(); });
    const open = await this.d.bookings.open(s.firmId);
    if (!open) return { withdrawn: false, scheduleReleased: !!sub?.stripeSubscriptionId };
    await this.d.bookings.withdraw(s.firmId, `staff:${s.staffId}`);
    return { withdrawn: true, toPlan: open.toPlan };
  }
}

