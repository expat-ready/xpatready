// PF-0c: MetricsPort's contract (ports/metrics.ts; BACKLOG PF-R1). Run by fakeMetrics and by the platform's MetricRegistry.
// What the reporting door's callers rely on: a metric registers once with a definition that parses; the scope is the
// server's, from the report keys (view.own → own, view.all → all, view-financial → financial for money), never the
// body's; under own the person filter is the caller; money is one figure per currency; an unknown key, a bad filter or
// no report key is refused; a read that fails or answers the wrong shape is UNAVAILABLE while the others answer.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { REPORT_KEYS, ReportRefused, type MetricRegistration, type MetricsPort, type ReportCaller } from "../metrics.ts";

const FIRM = "00000000-0000-4000-8000-0000000000f1";
const ME = "00000000-0000-4000-8000-0000000000a1", OTHER = "00000000-0000-4000-8000-0000000000a2";
const caller = (...keys: string[]): ReportCaller => ({ firmId: FIRM, staffId: ME, keys });
const count = (key: string, read: MetricRegistration["read"], o: Partial<MetricRegistration> = {}): MetricRegistration =>
  ({ key, module: "sample", label: `Sample ${key}`, source: "Sample rows", kind: "COUNT", aggregation: "COUNT", moneyTreatment: "NONE", scopeAware: true, drillTarget: null, read, ...o });
const refusedWith = (status: number, code: string) => (e: unknown) => e instanceof ReportRefused && e.status === status && e.code === code;

export const metricsPortContract = defineContract("MetricsPort", (make: () => MetricsPort) => [
  {
    name: "a metric registers once; an ill-shaped definition is refused",
    async run() {
      const p = make();
      p.register(count("sample.one", async () => ({ kind: "COUNT", value: 1 })));
      await expectRefused(() => p.register(count("sample.one", async () => ({ kind: "COUNT", value: 1 }))), "the same key twice");
      await expectRefused(() => p.register(count("NoDot", async () => ({ kind: "COUNT", value: 1 }))), "a key that is not module.name");
      await expectRefused(() => p.register(count("sample.money", async () => ({ kind: "COUNT", value: 1 }), { kind: "MONEY" })), "a MONEY metric without PER_CURRENCY");
      expect(p.definitions().map((d) => d.key).join() === "sample.one" && !("read" in p.definitions()[0]), "definitions without reads", p.definitions());
    },
  },
  {
    name: "the scope is the server's: view.own reads own with the caller as the person, view.all reads all; a body scope is never read",
    async run() {
      const p = make(); const seen: unknown[] = [];
      p.register(count("sample.seen", async (ctx, f) => { seen.push([ctx.scope, f.staffId ?? null]); return { kind: "COUNT", value: ctx.scope === "all" ? 9 : 2 }; }));
      const own = await p.query(caller(REPORT_KEYS.own), { metrics: ["sample.seen"], scope: "all" });
      const all = await p.query(caller(REPORT_KEYS.own, REPORT_KEYS.all), { metrics: ["sample.seen"], scope: "own" });
      expect(own.metrics[0].scope === "own" && JSON.stringify(own.metrics[0].reading) === '{"kind":"COUNT","value":2}' && all.metrics[0].scope === "all" && JSON.stringify(seen) === JSON.stringify([["own", ME], ["all", null]]), "own then all", { own, all, seen });
    },
  },
  {
    name: "a money metric is financial with view-financial and answers one figure per currency",
    async run() {
      const p = make();
      p.register(count("sample.fees", async (ctx) => ({ kind: "MONEY", figures: [{ currency: "CAD", amount: ctx.scope === "financial" ? "42000.00" : "10.00" }, { currency: "USD", amount: "3500.00" }] }), { kind: "MONEY", moneyTreatment: "PER_CURRENCY", aggregation: "SUM" }));
      const r = await p.query(caller(REPORT_KEYS.own, REPORT_KEYS.financial), { metrics: ["sample.fees"] });
      const reading = r.metrics[0].reading;
      expect(r.metrics[0].scope === "financial" && reading?.kind === "MONEY" && reading.figures.length === 2 && reading.figures[0].amount === "42000.00", "two figures, firm-wide", r);
    },
  },
  {
    name: "an unknown key and a bad filter are 400; no report key is 403; another person's figures at own scope are 403",
    async run() {
      const p = make();
      p.register(count("sample.one", async () => ({ kind: "COUNT", value: 1 })));
      await expectRefused(() => p.query(caller(REPORT_KEYS.all), { metrics: ["sample.nope"] }), "unknown key", refusedWith(400, "UNKNOWN_METRIC"));
      await expectRefused(() => p.query(caller(REPORT_KEYS.all), { metrics: ["sample.one"], filters: { from: "2026-13-01" } }), "bad date", refusedWith(400, "QUERY_INVALID"));
      await expectRefused(() => p.query(caller(), { metrics: ["sample.one"] }), "no report key", refusedWith(403, "MISSING_PERMISSION"));
      await expectRefused(() => p.query(caller(REPORT_KEYS.own), { metrics: ["sample.one"], filters: { staffId: OTHER } }), "another person", refusedWith(403, "OWN_ONLY"));
    },
  },
  {
    name: "a failing or ill-shaped read is UNAVAILABLE while the others answer; a firm-wide-only metric is WITHHELD at own scope",
    async run() {
      const p = make();
      p.register(count("sample.ok", async () => ({ kind: "COUNT", value: 3 })));
      p.register(count("sample.boom", async () => { throw new Error("Sample secret words"); }));
      p.register(count("sample.summed", async () => ({ kind: "MONEY", figures: [{ currency: "CAD", amount: "1.00" }, { currency: "CAD", amount: "2.00" }] }) as never, { kind: "MONEY", moneyTreatment: "PER_CURRENCY", aggregation: "SUM" }));
      p.register(count("sample.firm", async () => ({ kind: "COUNT", value: 5 }), { scopeAware: false }));
      const r = await p.query(caller(REPORT_KEYS.own), { metrics: ["sample.ok", "sample.boom", "sample.summed", "sample.firm"] });
      expect(r.metrics.map((m) => m.status).join() === "OK,UNAVAILABLE,UNAVAILABLE,WITHHELD" && !JSON.stringify(r).includes("secret"), "statuses", r);
    },
  },
]);
