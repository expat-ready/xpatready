// PF-5 part 2 (contracts §7 §1.1; SA-4-54, -67, SA-4-52, AG-1-65, SA-2-24): the firm's billing page and its profile.
//   * view: plan, status, trial or period end, seats used of the limit, card on file and cancel at period end (Stripe's,
//     read through BillingPort; null when Stripe is unreachable, never guessed), why the firm is held, and the deletion
//     date (90 days from the hold, contracts §7 "Firm exit"; the clock that acts on it is part 3);
//   * invoices: our invoices to the firm with Stripe's hosted links (drafts never shown);
//   * address: the business address (platform_firm.business_address, the office shape), also put on the Stripe customer
//     so Stripe Tax can tax the first invoice (Lead B, step 0 fact 3); works on hold;
//   * card and portal hand-offs: a card Checkout (its completion resumes a held subscription, webhook.ts) and the
//     Customer Portal (plan switching off; PF-16's);
//   * profile: the firm record's fields; the legal name only by the Owner (AG-1-65); the country never changes (SA-2-24).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { BillingAddress } from "../../../../ports/billing.ts";
import { EVENT } from "../../../../ports/events.ts";
import { firmScope } from "../firm-scope.ts";
import type { StaffContext } from "../identity/keys.ts";
import { ADDRESS_NEEDED, type BillingPorts } from "./webhook.ts";

export const DELETION_DAYS = 90;
const problem = (status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}) => new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code, ...extra }, status);
const fields = (e: z.ZodError) => problem(400, "CHECK_FIELDS", "Check the form", "Some answers need changing.", { errors: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) });
const text = (max: number) => z.string().trim().min(1).max(max).refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), "no control characters");

/** The office shape (samples/firms.json), as platform_firm.business_address keeps it. */
export const Address = z.strictObject({
  unit: text(20).nullable().default(null), street_number: text(20), street_name: text(150), city: text(100), province_state: z.enum(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]),
  postal_code: z.string().trim().toUpperCase().regex(/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, "a Canadian postal code (A1A 1A1)"),
});
const Profile = z.strictObject({
  operatingName: text(120).optional(), legalName: text(200).nullable().optional(), ownerName: text(120).nullable().optional(),
  ownerPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "a phone number").nullable().optional(), billingEmail: z.email().max(254).nullable().optional(),
  countryCode: z.string().optional(), expectedUpdatedAt: z.string().optional(),
});
const toStripe = (a: z.output<typeof Address>, country: string): BillingAddress => ({ line1: `${a.street_number} ${a.street_name}`, ...(a.unit ? { line2: `Unit ${a.unit}` } : {}), city: a.city, province: a.province_state, postalCode: a.postal_code, country });

export class BillingAccount {
  constructor(private readonly db: PrismaClient, private readonly ports: BillingPorts) {}

  private async current(firmId: string) {
    const sub = await this.db.platformSubscription.findFirst({ where: firmScope(firmId, { status: { not: "ENDED" as const } }), orderBy: { createdAt: "desc" }, include: { plan: true } })
      ?? await this.db.platformSubscription.findFirst({ where: firmScope(firmId), orderBy: { createdAt: "desc" }, include: { plan: true } });
    if (!sub) throw problem(404, "NOT_FOUND", "Not found", "This firm has no subscription.");
    return sub;
  }

  async view(s: StaffContext) {
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId } }), sub = await this.current(s.firmId);
    const now = this.ports.clock.now();
    const [staff, invites] = await Promise.all([
      this.db.platformStaff.count({ where: firmScope(s.firmId, { status: { in: ["ACTIVE" as const, "SUSPENDED" as const] } }) }),
      this.db.platformInvitation.count({ where: firmScope(s.firmId, { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }) }),
    ]);
    const live = sub.stripeSubscriptionId ? await this.ports.billing.subscription(sub.stripeSubscriptionId).catch(() => null) : null;
    const hold = firm.status === "PAYMENT_HOLD" ? await this.db.moduleEvent.findFirst({ where: firmScope(s.firmId, { type: EVENT.FIRM_PAYMENT_HOLD }), orderBy: { seq: "desc" } }) : null;
    const reason = (hold?.payload as { reason?: string } | null)?.reason ?? null;
    return {
      plan: { code: sub.plan.code, name: sub.plan.name, seatsLimit: sub.plan.seatsLimit }, status: sub.status, firmStatus: firm.status,
      trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, seatsUsed: staff + invites, seatsLimit: sub.plan.seatsLimit,
      cardOnFile: live?.hasCard ?? null, cancelAtPeriodEnd: live?.cancelAtPeriodEnd ?? null, billingAvailable: !sub.stripeSubscriptionId || live !== null,
      hold: hold ? { reason: reason === ADDRESS_NEEDED ? ADDRESS_NEEDED : "payment needed", since: hold.occurredAt, deletionDate: new Date(hold.occurredAt.getTime() + DELETION_DAYS * 86_400_000) } : null,
      businessAddress: firm.businessAddress ?? null,
    };
  }

  async invoices(s: StaffContext) {
    const sub = await this.current(s.firmId);
    if (!sub.stripeCustomerId) return { invoices: [] };
    const list = await this.ports.billing.invoices(sub.stripeCustomerId).catch(() => { throw problem(503, "BILLING_UNAVAILABLE", "Billing is unavailable", "We could not reach our billing provider. Try again in a few minutes."); });
    return { invoices: list.filter((i) => i.status !== "draft").map((i) => ({ id: i.id, number: i.number, status: i.status, amountDueCents: i.amountDueCents, currency: i.currency.toUpperCase(), createdAt: i.createdAt, hostedUrl: i.hostedUrl })) };
  }

  async setAddress(s: StaffContext, body: unknown) {
    const p = Address.safeParse(body ?? {});
    if (!p.success) throw fields(p.error);
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId } });
    const old = (firm.businessAddress ?? {}) as Record<string, unknown>;
    const value = { ...p.data, country: old.country ?? "canada", ...(old.phone ? { phone: old.phone } : {}) } as Prisma.InputJsonValue;
    await this.db.$transaction(async (tx) => {
      await tx.platformFirm.updateMany({ where: { id: s.firmId }, data: { businessAddress: value } });
      await this.ports.audit.record(tx, { firmId: s.firmId, actor: `staff:${s.staffId}`, action: "platform.firm.address_changed", entity: "platform_firm", entityKey: s.firmId, summary: "The firm's business address was changed", detail: { province: p.data.province_state } });
    });
    const sub = await this.current(s.firmId);
    const onStripe = sub.stripeCustomerId ? await this.ports.billing.updateCustomerAddress(sub.stripeCustomerId, toStripe(p.data, firm.countryCode)).then(() => true, () => false) : null;
    return { saved: true, onStripe, ...(onStripe === false ? { next: "Saved here. We could not update our billing provider yet: save it again in a few minutes." } : {}) };
  }

  async card(s: StaffContext) {
    const sub = await this.current(s.firmId);
    if (!sub.stripeCustomerId) throw problem(409, "NO_BILLING_ACCOUNT", "Start your trial first", "Your free trial has not started yet. Sign in again to finish starting it.");
    return this.ports.billing.cardCheckout({ firmId: s.firmId, customerId: sub.stripeCustomerId, successUrl: `${this.ports.appUrl}/settings/billing?card=saved`, cancelUrl: `${this.ports.appUrl}/settings/billing` });
  }

  async portal(s: StaffContext) {
    const sub = await this.current(s.firmId);
    if (!sub.stripeCustomerId) throw problem(409, "NO_BILLING_ACCOUNT", "Start your trial first", "Your free trial has not started yet. Sign in again to finish starting it.");
    return this.ports.billing.portal({ customerId: sub.stripeCustomerId, returnUrl: `${this.ports.appUrl}/settings/billing` });
  }

  async profile(s: StaffContext) {
    const f = await this.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId } });
    return { key: f.key, operatingName: f.operatingName, legalName: f.legalName, countryCode: f.countryCode, ownerName: f.ownerName, ownerEmail: f.ownerEmail, ownerPhone: f.ownerPhone, billingEmail: f.billingEmail, contactEmail: f.contactEmail, businessAddress: f.businessAddress ?? null, status: f.status, updatedAt: f.updatedAt };
  }

  async setProfile(s: StaffContext, body: unknown) {
    const p = Profile.safeParse(body ?? {});
    if (!p.success) throw fields(p.error);
    const { countryCode, expectedUpdatedAt, ...change } = p.data;
    const f = await this.db.platformFirm.findUniqueOrThrow({ where: { id: s.firmId } });
    if (countryCode !== undefined && countryCode !== f.countryCode) throw problem(400, "CHECK_FIELDS", "Check the form", "Some answers need changing.", { errors: ["countryCode: the firm's country cannot be changed"] });
    if (change.legalName !== undefined && change.legalName !== f.legalName && !s.roles.includes("OWNER")) throw problem(403, "OWNER_ONLY", "Only the Owner", "Only the firm's Owner can change its legal name.");
    if (expectedUpdatedAt && expectedUpdatedAt !== f.updatedAt.toISOString()) throw problem(409, "CHANGED", "Changed by someone else", "Someone changed the firm's details since you opened them. Reload and try again.");
    const changed = Object.keys(change).filter((k) => change[k as keyof typeof change] !== f[k as keyof typeof f]);
    if (!changed.length) return this.profile(s);
    await this.db.$transaction(async (tx) => {
      const n = await tx.platformFirm.updateMany({ where: { id: s.firmId, updatedAt: f.updatedAt }, data: change });
      if (n.count !== 1) throw problem(409, "CHANGED", "Changed by someone else", "Someone changed the firm's details since you opened them. Reload and try again.");
      await this.ports.audit.record(tx, { firmId: s.firmId, actor: `staff:${s.staffId}`, action: "platform.firm.profile_changed", entity: "platform_firm", entityKey: s.firmId, summary: `The firm's details were changed (${changed.join(", ")})`, detail: { fields: changed } });
    });
    return this.profile(s);
  }
}
