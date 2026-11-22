// PF-0c: FindPort's contract (ports/find.ts; BACKLOG PF-30a). Run by fakeFind and by the platform's FindRegistry. What the
// find door's callers rely on: a text of 2-100 characters (trimmed) or a refusal; every finder runs, its hits grouped by
// kind in registration order; at most 8 hits from one finder and 20 in all; a slow (over the budget), failing or
// ill-shaped finder is dropped with the partial-results line while the others still answer; a module registers once;
// the answer never repeats the query.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { FIND_BUDGET_MS, FIND_MAX_HITS, FINDER_MAX_HITS, PARTIAL_LINE, type FindCaller, type FindHit, type FindPort } from "../find.ts";

const CALLER: FindCaller = { firmId: "00000000-0000-4000-8000-0000000000f1", staffId: "00000000-0000-4000-8000-0000000000a1", keys: [] };
const hit = (kind: string, n: number): FindHit => ({ kind, id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, title: `Sample ${kind} ${n}`, subtitle: null, matched_on: ["NAME"], url: `/sample/${n}` });
const many = (kind: string, from: number, count: number) => Array.from({ length: count }, (_, i) => hit(kind, from + i));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const findPortContract = defineContract("FindPort", (make: () => FindPort) => [
  {
    name: "a text of 1 or 101 characters (trimmed) is refused; 2 characters with spaces around are read",
    async run() {
      const f = make();
      f.register("one", async () => [hit("thing", 1)]);
      await expectRefused(() => f.find(CALLER, " a "), "one character");
      await expectRefused(() => f.find(CALLER, "x".repeat(101)), "101 characters");
      await expectRefused(() => f.find(CALLER, undefined), "no text");
      const r = await f.find(CALLER, "  ab  ");
      expect(r.groups.length === 1 && r.groups[0].hits.length === 1 && !r.partial && r.message === null, "two characters answer", r);
    },
  },
  {
    name: "every finder runs; hits are grouped by kind in registration order",
    async run() {
      const f = make();
      f.register("first", async () => [hit("person", 1), hit("company", 2)]);
      f.register("second", async () => [hit("case", 3), hit("person", 4)]);
      const r = await f.find(CALLER, "sample");
      expect(JSON.stringify(r.groups.map((g) => [g.kind, g.hits.map((h) => h.title)])) === JSON.stringify([["person", ["Sample person 1", "Sample person 4"]], ["company", ["Sample company 2"]], ["case", ["Sample case 3"]]]), "grouped in order", r.groups);
    },
  },
  {
    name: `at most ${FINDER_MAX_HITS} hits from one finder and ${FIND_MAX_HITS} in all`,
    async run() {
      const f = make();
      f.register("mod-a", async () => many("a", 1, 12));
      f.register("mod-b", async () => many("b", 101, 12));
      f.register("mod-c", async () => many("c", 201, 12));
      const r = await f.find(CALLER, "sample"), n = (k: string) => r.groups.find((g) => g.kind === k)?.hits.length ?? 0;
      expect(n("a") === FINDER_MAX_HITS && n("b") === FINDER_MAX_HITS && n("c") === FIND_MAX_HITS - 2 * FINDER_MAX_HITS, "8, 8 and the 4 left", [n("a"), n("b"), n("c")]);
    },
  },
  {
    name: "a finder slower than the budget is dropped with the partial-results line; the others still answer",
    async run() {
      const f = make();
      f.register("quick", async () => [hit("person", 1)]);
      f.register("slow", async () => { await sleep(FIND_BUDGET_MS + 600); return [hit("case", 2)]; });
      const t = Date.now(), r = await f.find(CALLER, "sample"), took = Date.now() - t;
      expect(r.partial && r.message === PARTIAL_LINE && r.groups.length === 1 && r.groups[0].kind === "person", "slow dropped, quick kept", r);
      expect(took < FIND_BUDGET_MS + 400, "the answer does not wait for the slow finder", took);
    },
  },
  {
    name: "a failing or ill-shaped finder is dropped with the partial-results line, never its error's words",
    async run() {
      const f = make();
      f.register("good", async () => [hit("person", 1)]);
      f.register("broken", async (_c, q) => { throw new Error(`no record for ${q.text}`); });
      f.register("odd", async () => [{ ...hit("company", 2), url: "https://elsewhere.example" }]);
      const r = await f.find(CALLER, "Sample Secretname");
      expect(r.partial && r.message === PARTIAL_LINE && r.groups.length === 1 && !JSON.stringify(r).includes("Secretname"), "two dropped, no words of theirs", r);
    },
  },
  {
    name: "no finder: an empty answer, not partial; a module registers once",
    async run() {
      const f = make();
      const r = await f.find(CALLER, "sample");
      expect(r.groups.length === 0 && !r.partial && r.message === null, "empty", r);
      f.register("once", async () => []);
      await expectRefused(() => f.register("once", async () => []), "a second registration");
      await expectRefused(() => f.register("Not A Name", async () => []), "a module name that is not one");
    },
  },
  {
    name: "the answer never repeats the query",
    async run() {
      const f = make();
      f.register("echo", async (_c, q) => [{ ...hit("person", 1), title: "Sample person" , subtitle: q.email ? "by email" : null }]);
      const r = await f.find(CALLER, "Canary.Query@example.org");
      expect(!JSON.stringify(r).toLowerCase().includes("canary.query"), "no query text", r);
    },
  },
]);
