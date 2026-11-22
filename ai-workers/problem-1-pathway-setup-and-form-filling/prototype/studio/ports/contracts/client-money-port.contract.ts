// PF-0c: ClientMoneyPort's contract (ports/client-money.ts; FO-7b part 1b, added outside the part's touch list on the tech
// lead's ruling on #2953). Run by fakeClientMoney and by ClientMoney (api/src/client-money/port.ts) in
// tests/check_fo7b_invoices.ts. The port file's sentence: hasMoney is true when any invoice, payment or trust entry exists
// for the party in the firm. What callers rely on (FO-9b before a merge): a party with money answers true, one with none
// false; the same id in another firm, or read as the other party kind, is false; an id in capitals is the same id; a party
// naming neither a person nor a company, or both, is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { ClientMoneyPort } from "../client-money.ts";

/** What the adapter's test hands the contract: a firm, a person of it with money, one without, and another firm. */
export type ClientMoneyHarness = { port: ClientMoneyPort; firmId: string; withMoney: string; without: string; otherFirmId: string };

export const clientMoneyPortContract = defineContract("ClientMoneyPort", (make: () => Promise<ClientMoneyHarness> | ClientMoneyHarness) => [
  {
    name: "a person with money is true, a person with none false (an id in capitals is the same id)",
    async run() {
      const h = await make();
      const a = await h.port.hasMoney(h.firmId, { personId: h.withMoney }), b = await h.port.hasMoney(h.firmId, { personId: h.withMoney.toUpperCase() }), c = await h.port.hasMoney(h.firmId, { personId: h.without });
      expect(a === true && b === true && c === false, "true, true, false", { a, b, c });
    },
  },
  {
    name: "the same id in another firm, or read as a company, is false",
    async run() {
      const h = await make();
      const a = await h.port.hasMoney(h.otherFirmId, { personId: h.withMoney }), b = await h.port.hasMoney(h.firmId, { companyId: h.withMoney });
      expect(a === false && b === false, "false, false", { a, b });
    },
  },
  {
    name: "a party naming neither a person nor a company, or both, is refused",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.hasMoney(h.firmId, {} as never), "no party");
      await expectRefused(() => h.port.hasMoney(h.firmId, { personId: h.withMoney, companyId: h.without } as never), "both");
    },
  },
]);
