// PF-16 (trial banner part; SA-4-79, SA-4-53 set 2 "Admins can add the card"; R1.90 "trial banner counts days"):
// GET /api/platform/billing/banner, the one small read behind the trial banner on every signed-in page in PF-6's frame.
//   * Owner and Admin only: `agent/subscription:pay` (PF-3's catalogue gives it to OWNER and ADMIN); anyone else 403.
//   * Read only: our own record (platform_subscription's status and stored trial end) and, for the card, the fake
//     BillingPort (Stripe with a key) when the firm has a Stripe subscription; no subscription there means no card yet.
//     Stripe unreachable → cardOnFile and cancelAtPeriodEnd null (never guessed). No charge, no plan change, nothing written.
//   * Days left count a part day as a day (PF-5s part 2's rule: 2.5 days reads 3, 5 hours reads 1), so 0 means the stored
//     end has passed (the record not yet moved by Stripe's event; review M1); amber in the last 3 days (daysLeft ≤ 3) and
//     after. cancelAtPeriodEnd (a trial set to cancel in the Customer Portal) is passed on so the banner never asks for a
//     payment that will not be taken (review M2). Not in a trial (or no trial end) → { show: false }: no banner.
//   * @HoldOpen: a held firm's frame still asks; it answers show: false (the firm's status read, break m3).
import { Controller, Get, Inject, Injectable, Req } from "@nestjs/common";
import { Db } from "../../core.ts";
import { firmScope } from "../firm-scope.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { BILLING_PORTS, HoldOpen } from "./routes.ts";
import type { BillingPorts } from "./webhook.ts";

const DAY = 86_400_000;
export const AMBER_DAYS = 3;
export type TrialBanner = { show: false } | { show: true; daysLeft: number; trialEndsAt: string; cardOnFile: boolean | null; cancelAtPeriodEnd: boolean | null; tone: "neutral" | "amber" };

/** Whole days left, a part day counted as a day; 0 once the end has passed (the same rule as Plan and billing). */
export const bannerDaysLeft = (end: Date, now: number) => Math.max(0, Math.ceil((end.getTime() - now) / DAY));

@Injectable()
export class BillingBanner {
  constructor(@Inject(Db) private readonly db: Db, @Inject(BILLING_PORTS) private readonly ports: BillingPorts) {}

  async read(s: StaffContext): Promise<TrialBanner> {
    const sub = await this.db.platformSubscription.findFirst({ where: firmScope(s.firmId, { status: { not: "ENDED" as const } }), orderBy: { createdAt: "desc" }, select: { status: true, trialEndsAt: true, stripeSubscriptionId: true } });
    if (!sub || sub.status !== "TRIAL" || !sub.trialEndsAt) return { show: false };
    // A held firm is not in a trial, even with its subscription row out of step (break m3).
    if ((await this.db.platformFirm.findUnique({ where: { id: s.firmId }, select: { status: true } }))?.status === "PAYMENT_HOLD") return { show: false };
    const daysLeft = bannerDaysLeft(sub.trialEndsAt, this.ports.clock.now().getTime());
    const live = sub.stripeSubscriptionId ? await this.ports.billing.subscription(sub.stripeSubscriptionId).then((l) => ({ card: l.hasCard, cancel: l.cancelAtPeriodEnd }), () => ({ card: null, cancel: null })) : { card: false, cancel: false };
    return { show: true, daysLeft, trialEndsAt: sub.trialEndsAt.toISOString(), cardOnFile: live.card, cancelAtPeriodEnd: live.cancel, tone: daysLeft <= AMBER_DAYS ? "amber" : "neutral" };
  }
}

type R = { platform?: StaffContext };

@Controller("api/platform/billing")
export class BillingBannerController {
  constructor(@Inject(BillingBanner) private readonly b: BillingBanner) {}

  @Get("banner") @HoldOpen() @PermissionKeys("agent/subscription:pay")
  banner(@Req() r: R) { return this.b.read(staffOf(r)); }
}
