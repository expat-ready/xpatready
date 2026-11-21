// PF-16 part 1a (BACKLOG PF-16): plan changes on our own page (Stripe's portal keeps card, invoices and cancel; its plan
// switching is off). PlanChanges over BillingPort's prices, PlanChangePort (Stripe's preview, change now, schedule at the
// renewal) and PF-15 part 1b's PlanBookings. Stripe test-mode keys only; with no key (local) the fakes, as PF-5 does.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { fakePlanChange } from "../../../ports/plan-change.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { BILLING_PORTS } from "../platform/billing/routes.ts";
import type { BillingPorts } from "../platform/billing/webhook.ts";
import { PLAN_CHANGES, PlanChangeController } from "../platform/billing/plan-change/routes.ts";
import { PlanChanges } from "../platform/billing/plan-change/service.ts";
import { StripePlanChange } from "../platform/billing/plan-change/stripe-plan-change.ts";
import { platformConfig } from "../platform/config/settings.ts";
import { PlanBookings } from "../platform/entitlements/plan-booking.ts";

export default {
  controllers: [PlanChangeController],
  providers: [{ provide: PLAN_CHANGES, useFactory: (db: Db, ports: BillingPorts, bookings: PlanBookings) => {
    const key = platformConfig().stripe.secretKey?.reveal() ?? null;
    return new PlanChanges({ db, billing: ports.billing, plans: key ? StripePlanChange.fromKey(key) : fakePlanChange({ prices: [] }), bookings, audit: auditEvent, clock: ports.clock, notReady: ports.notReady ?? null });
  }, inject: [Db, BILLING_PORTS, PlanBookings] }],
} satisfies Feature;
