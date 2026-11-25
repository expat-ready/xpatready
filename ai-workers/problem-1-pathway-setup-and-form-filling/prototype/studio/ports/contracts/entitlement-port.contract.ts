// PF-15 part 1a (PF-0c): EntitlementPort's contract (ports/entitlement.ts). Run by fakeEntitlements and by PgEntitlements
// (api/src/platform/entitlements/limits.ts), both in tests/check_pf15_limits.ts. The port file's sentences: a hard metric
// (seats, active individual and corporate cases) allows one more while `used` is below the limit and refuses at it with
// the metric, the limit and the usage; null is Unlimited and 0 allows none (SA-3-4); storage is warn (allowed over the
// limit) until it turns hard (SA-3-40), then allowed only at or under the limit; a malformed firm or usage is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { EntitlementMetric, EntitlementPort } from "../entitlement.ts";

type Limits = Partial<Record<EntitlementMetric, number | null>>;
/** `make(limits, storageHard)` gives a port and the firm (as the port's callers name it) whose plan has those limits. */
export type EntitlementHarness = (limits: Limits, storageHard?: boolean) => Promise<{ port: EntitlementPort; firm: string }>;

export const entitlementPortContract = defineContract("EntitlementPort", (make: EntitlementHarness) => [
  {
    name: "a hard metric allows one more below the limit and refuses at it, naming the metric, the limit and the usage",
    async run() {
      const { port, firm } = await make({ seats: 3, active_individual_cases: 10, active_corporate_cases: 2 });
      expect((await port.check(firm, "seats", 2)).allowed === true, "2 of 3 seats: one more is allowed");
      const at = await port.check(firm, "seats", 3);
      expect(!at.allowed && at.metric === "seats" && at.limit === 3 && at.used === 3, "3 of 3 seats: refused with metric, limit and usage", at);
      expect((await port.check(firm, "active_individual_cases", 9)).allowed === true, "9 of 10 cases allowed");
      const c = await port.check(firm, "active_individual_cases", 10);
      expect(!c.allowed && c.metric === "active_individual_cases" && c.limit === 10, "the 11th case refused", c);
      const k = await port.check(firm, "active_corporate_cases", 5);
      expect(!k.allowed && k.limit === 2 && k.used === 5, "over the limit is refused too", k);
    },
  },
  {
    name: "null is Unlimited and 0 allows none",
    async run() {
      const { port, firm } = await make({ active_individual_cases: null, active_corporate_cases: 0, storage_mb: null }, true);
      expect((await port.check(firm, "active_individual_cases", 100000)).allowed === true, "an Unlimited metric allows any usage");
      const z = await port.check(firm, "active_corporate_cases", 0);
      expect(!z.allowed && z.limit === 0, "a 0 case limit refuses the first case", z);
      expect((await port.check(firm, "storage_mb", 100000)).allowed === true, "Unlimited storage allows any usage, even when hard");
    },
  },
  {
    name: "storage is warn (allowed over the limit) until it turns hard, then allowed only at or under the limit",
    async run() {
      const warn = await make({ storage_mb: 100 });
      expect((await warn.port.check(warn.firm, "storage_mb", 500)).allowed === true, "over the storage limit, not yet hard: allowed (warn)");
      const hard = await make({ storage_mb: 100 }, true);
      const over = await hard.port.check(hard.firm, "storage_mb", 101);
      expect(!over.allowed && over.metric === "storage_mb" && over.limit === 100 && over.used === 101, "hard and over: refused", over);
      expect((await hard.port.check(hard.firm, "storage_mb", 100)).allowed === true, "hard but at the limit (back under): allowed");
    },
  },
  {
    name: "a malformed firm or usage is refused",
    async run() {
      const { port, firm } = await make({ seats: 3 });
      await expectRefused(() => port.check("", "seats", 1), "an empty firm");
      await expectRefused(() => port.check(firm, "seats", -1), "a negative usage");
      await expectRefused(() => port.check(firm, "seats", 1.5), "a fraction");
      await expectRefused(() => port.check(firm, "parking" as EntitlementMetric, 1), "an unknown metric");
    },
  },
]);
