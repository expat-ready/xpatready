// PF-16 part 1a: PlanChangePort's contract, run by fakePlanChange and by StripePlanChange on recorded answers: the item and
// price; a raise previews a positive proration, a trial none; one charge and one schedule per key; release; bad input refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { PlanChangePort } from "../plan-change.ts";

/** Monthly, mid-period on `fromPrice` (`raisePrice` dearer); `charges()`: charges now; `scheduled()`: the renewal's price or null. */
export type PlanChangeHarness = { port: PlanChangePort; subscriptionId: string; fromPrice: string; raisePrice: string; charges(): number; scheduled(): string | null };

export const planChangePortContract = defineContract("PlanChangePort", (make: () => PlanChangeHarness) => [
  { name: "the current item: its id, price, interval, amount and period end", async run() {
      const h = make(), s = await h.port.current(h.subscriptionId);
      expect(s.id === h.subscriptionId && /^si_/.test(s.itemId) && s.priceId === h.fromPrice && s.interval === "month" && s.unitAmount > 0 && s.periodEnd instanceof Date, "the item", s);
  } },
  { name: "a raise mid-period previews a positive proration; without proration (a trial) nothing", async run() {
      const h = make(), at = new Date(), c = { subscriptionId: h.subscriptionId, priceId: h.raisePrice, anchorNow: false, prorationDate: at };
      const up = await h.port.preview({ ...c, prorate: true }), none = await h.port.preview({ ...c, prorate: false });
      expect(up.prorationCents > 0 && up.amountDueCents > 0 && none.prorationCents === 0 && none.amountDueCents === 0, "raise > 0, trial 0", [up, none]);
  } },
  { name: "a change now with the same key twice changes and charges once", async run() {
      const h = make(), c = { subscriptionId: h.subscriptionId, priceId: h.raisePrice, prorate: true, anchorNow: false, prorationDate: new Date() };
      await h.port.changeNow(c, "pf16-contract-key-1"); await h.port.changeNow(c, "pf16-contract-key-1");
      expect(h.charges() === 1 && (await h.port.current(h.subscriptionId)).priceId === h.raisePrice, "one charge, the new price", h.charges());
  } },
  { name: "a change at the renewal is one schedule per key, and its release drops it", async run() {
      const h = make(), a = await h.port.scheduleAtRenewal({ subscriptionId: h.subscriptionId, priceId: h.raisePrice }, "pf16-contract-sched-1");
      const b = await h.port.scheduleAtRenewal({ subscriptionId: h.subscriptionId, priceId: h.raisePrice }, "pf16-contract-sched-1");
      expect(/^sub_sched_/.test(a.scheduleId) && a.scheduleId === b.scheduleId && h.scheduled() === h.raisePrice, "one schedule", [a, b, h.scheduled()]);
      await h.port.releaseSchedule(h.subscriptionId);
      expect(h.scheduled() === null && (await h.port.current(h.subscriptionId)).scheduleId === null, "released", h.scheduled());
  } },
  { name: "a malformed price or key is refused before any call", async run() {
      const h = make(), before = h.charges();
      await expectRefused(() => h.port.changeNow({ subscriptionId: h.subscriptionId, priceId: "nope", prorate: true, anchorNow: false, prorationDate: new Date() }, "pf16-contract-key-2"), "a bad price");
      await expectRefused(() => h.port.changeNow({ subscriptionId: h.subscriptionId, priceId: h.raisePrice, prorate: true, anchorNow: false, prorationDate: new Date() }, "x"), "a bad key");
      expect(h.charges() === before, "nothing charged", h.charges());
  } },
]);
