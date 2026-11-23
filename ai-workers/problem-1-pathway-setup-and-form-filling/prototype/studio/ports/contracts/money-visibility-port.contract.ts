// CS-MV1: MoneyVisibilityPort's contract (ports/money-visibility.ts). Run by fakeMoneyVisibility and by
// PgMoneyVisibility (api/src/client-money/visibility-adapter.ts) in tests/check_csmv1_money_visibility.ts. The cases are
// the port file's four rules: the session's firm only, cases and parties as lists, money keys alone give nothing, each
// id once and lower case.
import { defineContract, expect } from "./contract.ts";
import { MoneyVisibility, type MoneyVisibilityPort } from "../money-visibility.ts";
import type { StaffContext } from "../staff.ts";

/** What a contract case may ask the adapter's world for. Each call builds fresh people and records in firm A (and B). */
export type MoneyVisibilityHarness = {
  port: MoneyVisibilityPort;
  /** A person of firm A who may see case `seen` (by its own rule) and not case `unseen`, both firm A's. */
  caseViewer(): Promise<{ ctx: StaffContext; seen: string; unseen: string }>;
  /** A person of firm A who may see party `seen` (a person or company with no case) and not party `unseen`. */
  partyViewer(): Promise<{ ctx: StaffContext; seen: string; unseen: string }>;
  /** A person of firm A who holds the invoice keys only (`agent/invoice:list`, `agent/invoice:show`). */
  moneyKeysOnly(): Promise<{ ctx: StaffContext }>;
  /** A person of firm A who sees the widest scope the adapter gives, and a case and a party of firm B. */
  widestAndOtherFirm(): Promise<{ ctx: StaffContext; otherCase: string; otherParty: string }>;
};

const ids = (xs: string[]) => xs.every((x) => x === x.toLowerCase()) && new Set(xs).size === xs.length;

/** `make` gives a harness each call. */
export const moneyVisibilityPortContract = defineContract("MoneyVisibilityPort", (make: () => Promise<MoneyVisibilityHarness> | MoneyVisibilityHarness) => [
  {
    name: "the answer is two lists of lower-case ids, each id once, never \"ALL\"",
    async run() {
      const h = await make(), { ctx } = await h.caseViewer(), s = await h.port.scopeOf(ctx);
      expect(MoneyVisibility.safeParse(s).success, "{ cases: uuid[], parties: uuid[] }", s);
      expect(ids(s.cases) && ids(s.parties), "lower case, no repeats", s);
    },
  },
  {
    name: "a person who may see case X has X in cases and not case Y",
    async run() {
      const h = await make(), v = await h.caseViewer(), s = await h.port.scopeOf(v.ctx);
      expect(s.cases.includes(v.seen) && !s.cases.includes(v.unseen), "X in, Y out", { s, v: { seen: v.seen, unseen: v.unseen } });
    },
  },
  {
    name: "a person who may see party P (no case) has P in parties and not party Q",
    async run() {
      const h = await make(), v = await h.partyViewer(), s = await h.port.scopeOf(v.ctx);
      expect(s.parties.includes(v.seen) && !s.parties.includes(v.unseen), "P in, Q out", { s, v: { seen: v.seen, unseen: v.unseen } });
    },
  },
  {
    name: "the invoice keys alone give nothing",
    async run() {
      const h = await make(), { ctx } = await h.moneyKeysOnly(), s = await h.port.scopeOf(ctx);
      expect(s.cases.length === 0 && s.parties.length === 0, "empty", s);
    },
  },
  {
    name: "another firm's case and party never appear, even in the widest scope",
    async run() {
      const h = await make(), w = await h.widestAndOtherFirm(), s = await h.port.scopeOf(w.ctx);
      expect(!s.cases.includes(w.otherCase) && !s.parties.includes(w.otherParty), "firm B's ids absent", { s, otherCase: w.otherCase, otherParty: w.otherParty });
    },
  },
]);
