// CS-C1b DW13: CaseCountPort's contract (ports/case-count.ts). Run by fakeCaseCount and by PgCaseCount
// (api/src/case-count.ts) in tests/check_csc1_count.ts. The port file's sentences: counts are whole numbers by group; a
// case counts from its creation until a decision on every filing or its withdrawal, and again once reopened; the group
// is the Pathway's client type (CORPORATE → corporate, everything else → individual); an adapter counts its own firm's
// cases only; the count read in a transaction is the count that transaction sees.
import { defineContract, expect } from "./contract.ts";
import type { ActiveCounts, CaseCountPort } from "../case-count.ts";

/** What a contract case may do to the adapter's world: open a case of a group, end its activity, reopen it, and run a
 *  read inside a transaction. `other` counts another firm's cases. */
export type CaseCountHarness = {
  count: CaseCountPort;
  other: CaseCountPort;
  open(group: "individual" | "corporate" | "family"): Promise<string>;
  /** A decision on every filing (`how: "decided"`) or the case withdrawn (`how: "withdrawn"`). */
  end(id: string, how: "decided" | "withdrawn"): Promise<void>;
  reopen(id: string): Promise<void>;
  inTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
};

const shapeOk = (c: ActiveCounts) => Number.isInteger(c.individual) && Number.isInteger(c.corporate) && c.individual >= 0 && c.corporate >= 0 && Object.keys(c).sort().join() === "corporate,individual";
const plus = (a: ActiveCounts, b: ActiveCounts) => ({ individual: b.individual - a.individual, corporate: b.corporate - a.corporate });

/** `make` gives a harness each call (cases from earlier calls may remain: every case reads a difference). */
export const caseCountPortContract = defineContract("CaseCountPort", (make: () => Promise<CaseCountHarness> | CaseCountHarness) => [
  {
    name: "counts are whole numbers by group; an individual or family case adds to individual, a corporate one to corporate",
    async run() {
      const h = await make(), a = await h.count.activeCounts();
      expect(shapeOk(a), "the counts are { individual, corporate }, whole and not negative", a);
      await h.open("individual"); await h.open("family"); await h.open("corporate");
      const d = plus(a, await h.count.activeCounts());
      expect(d.individual === 2 && d.corporate === 1, "two individual (one a family case), one corporate", d);
    },
  },
  {
    name: "a decision on every filing or a withdrawal ends a case's count; a reopen counts it again",
    async run() {
      const h = await make(), x = await h.open("individual"), y = await h.open("corporate"), a = await h.count.activeCounts();
      await h.end(x, "decided"); await h.end(y, "withdrawn");
      const b = await h.count.activeCounts();
      expect(plus(a, b).individual === -1 && plus(a, b).corporate === -1, "both ended", plus(a, b));
      await h.reopen(x); await h.reopen(y);
      const c = await h.count.activeCounts();
      expect(plus(a, c).individual === 0 && plus(a, c).corporate === 0, "both count again after the reopen", plus(a, c));
    },
  },
  {
    name: "another firm's adapter never counts this firm's cases",
    async run() {
      const h = await make(), o = await h.other.activeCounts();
      await h.open("individual"); await h.open("corporate");
      const d = plus(o, await h.other.activeCounts());
      expect(d.individual === 0 && d.corporate === 0, "the other firm's count is unchanged", d);
    },
  },
  {
    name: "a read inside a transaction gives the count that transaction sees (the same as outside with nothing pending)",
    async run() {
      const h = await make(), out = await h.count.activeCounts(), inside = await h.inTransaction((tx) => h.count.activeCounts(tx));
      expect(inside.individual === out.individual && inside.corporate === out.corporate, "the same counts", { out, inside });
    },
  },
]);
