// PF-R1 (BACKLOG row PF-R1, batch 5; map row 79, R1.79; AG-14-1, -4, -15, -18 to -20, -22, -27 to -30, -33; P-584 (2)):
// the reporting service's port. Each module registers its metrics here (`MetricRegistry.register`); the one door
// (`POST /api/platform/reports/query`) answers them. A metric is data, CS-R1's `MetricDefinition` shape (AG-14-4, §7:
// source, aggregation, money treatment, drill target), plus the module's `read`. The scope a read gets (own, all or
// financial) is worked out here from the caller's report keys (AG-14-19), never from the request. Money is one figure
// per currency, CAD and USD at most, never summed or converted (AG-14-15, -27, X-6). Live reads, no rollup tables in R1
// (Q8). The run rule below is shared by the real registry and the fake (ports/fakes/metrics.fake.ts), so the fake can
// never promise another answer. This folder imports only zod and its own files.
import { z } from "zod";

/** The report keys (AG-14 §10, seeded by PF-3's catalogue migration 20261114015002_pf3_platform_tables). */
export const REPORT_KEYS = { own: "agent/report:view.own", all: "agent/report:view.all", financial: "agent/report:view-financial", export: "agent/report:export" } as const;
/** STANDARDS §9 ("filter, search, expand < 200 ms" with the Sample data): each metric's read budget, checked in CI at about 100 firms' rows (P-562). */
export const METRIC_READ_BUDGET_MS = 200;
/** At most this many metrics in one query (AG-14-28: no unbounded answer). */
export const QUERY_MAX_METRICS = 30;
/** At most this many rows in a LIST metric (AG-14-28). */
export const LIST_MAX_ROWS = 200;

export const MetricKey = z.string().regex(/^[a-z][a-z_]{0,29}\.[a-z][a-z0-9_]{0,59}$/, "a metric key is module.name, e.g. sales.leads_added");
export const MetricKind = z.enum(["COUNT", "MONEY", "PERCENT", "LIST"]);
export type MetricKind = z.infer<typeof MetricKind>;
/** What the read is told to count: own records, the firm, or the firm's money (AG-14-19). */
export const MetricScope = z.enum(["own", "all", "financial"]);
export type MetricScope = z.infer<typeof MetricScope>;
/** Release 1 currencies (X-6). */
export const Currency = z.enum(["CAD", "USD"]);

/** Where a figure drills to (AG-14-22): the operational list's route and which filters it carries, by the target's own
 *  parameter names. The target re-checks its own keys and firm (the door adds nothing). */
export const DrillTarget = z.strictObject({
  path: z.string().regex(/^\/api\/[a-z0-9/-]{1,200}$/),
  carries: z.partialRecord(z.enum(["from", "to", "staffId", "clientType"]), z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/)).default({}),
});
export type DrillTarget = z.infer<typeof DrillTarget>;

/** CS-R1's `MetricDefinition` (AG-14-4; AG-14 §7), the one shape both sides register (Lead 52's ruling, batch 5). */
export const MetricDefinition = z.strictObject({
  key: MetricKey,
  module: z.string().regex(/^[a-z][a-z-]{0,39}$/),
  label: z.string().trim().min(1).max(120),
  /** "What this counts", in words (PF-R3's card line; CS-R1: each number returns its definition in words). */
  source: z.string().trim().min(1).max(400),
  kind: MetricKind,
  aggregation: z.enum(["COUNT", "SUM", "AVG", "MEDIAN", "RATIO", "LIST"]),
  moneyTreatment: z.enum(["NONE", "PER_CURRENCY"]),
  /** True when the figure can be counted over the viewer's own records; false: a firm-wide figure only (answered WITHHELD at own scope). */
  scopeAware: z.boolean(),
  drillTarget: DrillTarget.nullable(),
}).refine((d) => (d.kind === "MONEY") === (d.moneyTreatment === "PER_CURRENCY"), "a MONEY metric, and only a MONEY metric, is PER_CURRENCY (AG-14-15)");
export type MetricDefinition = z.infer<typeof MetricDefinition>;

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date is YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "not a real date");
/** The shared filter bar (AG-14-20, -33): date range, person, client type. It only narrows (AG-14-20). */
export const MetricFilters = z.strictObject({
  from: DAY.optional(),
  to: DAY.optional(),
  staffId: z.string().uuid("the person is a staff id").optional(),
  clientType: z.enum(["INDIVIDUAL", "CORPORATE"]).optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, { message: "the start date is after the end date", path: ["from"] });
export type MetricFilters = z.infer<typeof MetricFilters>;

/** The door's body (AG-14-30). `scope` is accepted and never read: the scope is the server's (AG-14-19). */
export const ReportQuery = z.strictObject({
  metrics: z.array(z.string()).min(1, "name at least one metric").max(QUERY_MAX_METRICS, `at most ${QUERY_MAX_METRICS} metrics`),
  filters: MetricFilters.default({}),
  scope: z.unknown().optional(),
});

const Money = z.strictObject({ currency: Currency, amount: z.string().regex(/^-?\d{1,13}\.\d{2}$/, "major units with two decimals") });
/** What a read gives back, by kind. A MONEY read is a list of per-currency figures (never one total; each currency once). */
export const Reading = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("COUNT"), value: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("PERCENT"), value: z.number().min(0).max(100).nullable() }),
  z.strictObject({ kind: z.literal("MONEY"), figures: z.array(Money).max(2).refine((f) => new Set(f.map((x) => x.currency)).size === f.length, "each currency once") }),
  z.strictObject({ kind: z.literal("LIST"), rows: z.array(z.record(z.string(), z.union([z.string().max(300), z.number(), z.null()]))).max(LIST_MAX_ROWS) }),
]);
export type Reading = z.infer<typeof Reading>;

/** What a module's read is given: the firm, the viewer, the scope the server worked out and the narrowed filters. Under
 *  `own`, `filters.staffId` is always the viewer. */
export type MetricReadContext = { firmId: string; staffId: string; scope: MetricScope };
export type MetricRead = (ctx: MetricReadContext, filters: MetricFilters) => Promise<Reading>;
export type MetricRegistration = MetricDefinition & { read: MetricRead };

/** Who asks (PF-4's StaffContext carries these and more). */
export type ReportCaller = { firmId: string; staffId: string; keys: readonly string[] };
export type MetricAnswer = {
  key: string; label: string; kind: MetricKind; source: string;
  status: "OK" | "WITHHELD" | "UNAVAILABLE";
  scope: MetricScope | null;
  reading: Reading | null;
  drill: { path: string; query: Record<string, string> } | null;
};
export type ReportAnswer = { metrics: MetricAnswer[]; filters: MetricFilters };

/** A refusal the door turns into 400 (bad metric or filter) or 403 (no report key, or another person's figures at own scope). */
export class ReportRefused extends Error {
  constructor(readonly status: 400 | 403, readonly code: string, message: string, readonly fields: Record<string, string> = {}) { super(message); this.name = "ReportRefused"; }
}

/** The caller's base scope from the report keys: all, own, or none (AG-14-19; SA6-D1 defaults). */
export function baseScope(keys: readonly string[]): "all" | "own" | null {
  return keys.includes(REPORT_KEYS.all) ? "all" : keys.includes(REPORT_KEYS.own) ? "own" : null;
}
/** The scope one metric is read at: a money metric is firm-wide with view-financial (Billing / Finance), else the base. */
export function scopeFor(keys: readonly string[], kind: MetricKind): MetricScope | null {
  if (kind === "MONEY" && keys.includes(REPORT_KEYS.financial)) return "financial";
  return baseScope(keys);
}
/** True when the caller may read any report at all. */
export const mayReport = (keys: readonly string[]) => baseScope(keys) !== null || keys.includes(REPORT_KEYS.financial);

const fieldsOfIssues = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [i.path.join(".") || "body", i.message]));

/** The run rule both the registry and the fake use. Refuses (ReportRefused) an ill-shaped body, an unknown metric key, a
 *  caller without a report key, and a person filter naming someone else when the caller sees only their own. Each metric
 *  is read at its server-worked scope, all at once; a read that fails or answers the wrong shape is UNAVAILABLE (its
 *  words never leave the server), a firm-wide-only metric at own scope is WITHHELD. */
export async function runMetrics(metrics: ReadonlyMap<string, MetricRegistration>, caller: ReportCaller, body: unknown, onFail?: (key: string, reason: "ERROR" | "SHAPE") => void): Promise<ReportAnswer> {
  const parsed = ReportQuery.safeParse(body ?? {});
  if (!parsed.success) throw new ReportRefused(400, "QUERY_INVALID", parsed.error.issues[0]?.message ?? "Check the report query", fieldsOfIssues(parsed.error));
  const { metrics: keys, filters } = parsed.data;
  if (!mayReport(caller.keys)) throw new ReportRefused(403, "MISSING_PERMISSION", `Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`);
  const unknown = keys.filter((k) => !metrics.has(k));
  if (unknown.length) throw new ReportRefused(400, "UNKNOWN_METRIC", `No such metric: ${unknown.slice(0, 5).map((k) => k.slice(0, 80)).join(", ")}`);
  const plans = [...new Set(keys)].map((key) => { const m = metrics.get(key)!; return { key, m, scope: scopeFor(caller.keys, m.kind) }; });
  // checked before any read starts: at own scope the person filter may name only the caller
  if (filters.staffId && filters.staffId.toLowerCase() !== caller.staffId.toLowerCase() && plans.some((p) => p.scope === "own" && p.m.scopeAware)) throw new ReportRefused(403, "OWN_ONLY", "You can see only your own figures.");
  const answers = await Promise.all(plans.map(async ({ key, m, scope }): Promise<MetricAnswer> => {
    const base = { key, label: m.label, kind: m.kind, source: m.source, scope };
    if (scope === null || (scope === "own" && !m.scopeAware)) return { ...base, status: "WITHHELD", reading: null, drill: null };
    const narrowed: MetricFilters = scope === "own" ? { ...filters, staffId: caller.staffId } : filters;
    let reading: Reading;
    try {
      const got = Reading.safeParse(await m.read({ firmId: caller.firmId, staffId: caller.staffId, scope }, narrowed));
      if (!got.success || got.data.kind !== m.kind) { onFail?.(key, "SHAPE"); return { ...base, status: "UNAVAILABLE", reading: null, drill: null }; }
      reading = got.data;
    } catch { onFail?.(key, "ERROR"); return { ...base, status: "UNAVAILABLE", reading: null, drill: null }; }
    return { ...base, status: "OK", reading, drill: drillOf(m.drillTarget, narrowed) };
  }));
  return { metrics: answers, filters };
}

/** The drill link: the target path and the filters it carries, under the target's own parameter names (AG-14-22). */
export function drillOf(target: DrillTarget | null, filters: MetricFilters): MetricAnswer["drill"] {
  if (!target) return null;
  const query: Record<string, string> = {};
  for (const [ours, theirs] of Object.entries(target.carries) as [keyof MetricFilters, string][]) { const v = filters[ours]; if (v) query[theirs] = v; }
  return { path: target.path, query };
}

/** The register rule both use: the definition must parse, and a key registers once. */
export function checkRegistration(metrics: ReadonlyMap<string, MetricRegistration>, m: MetricRegistration): MetricRegistration {
  const { read, ...definition } = m;
  if (typeof read !== "function") throw new Error(`MetricRegistry: ${String(m?.key)} has no read`);
  const def = MetricDefinition.parse(definition);
  if (metrics.has(def.key)) throw new Error(`MetricRegistry: ${def.key} is already registered`);
  return { ...def, read };
}

/** STANDARDS §9's read budget, for CI (row PF-R1 (7)): reads each metric at each given scope and names every one that
 *  took longer than `budgetMs` or failed. A metric on this list fails the budget test. */
export async function overBudget(metrics: ReadonlyMap<string, MetricRegistration>, contexts: MetricReadContext[], filters: MetricFilters = {}, budgetMs = METRIC_READ_BUDGET_MS): Promise<{ key: string; scope: MetricScope; ms: number | null }[]> {
  const out: { key: string; scope: MetricScope; ms: number | null }[] = [];
  for (const m of metrics.values()) for (const ctx of contexts) {
    const started = performance.now();
    try { await m.read(ctx, ctx.scope === "own" ? { ...filters, staffId: ctx.staffId } : filters); } catch { out.push({ key: m.key, scope: ctx.scope, ms: null }); continue; }
    const ms = performance.now() - started;
    if (ms > budgetMs) out.push({ key: m.key, scope: ctx.scope, ms: Math.round(ms) });
  }
  return out;
}

export interface MetricsPort<C extends ReportCaller = ReportCaller> {
  /** Adds one module's metric (the definition parsed; a key registers once). */
  register(metric: MetricRegistration): void;
  /** The registered definitions, in registration order (no read functions). */
  definitions(): MetricDefinition[];
  /** Answers the door's body for the caller (ReportRefused for 400 and 403). */
  query(caller: C, body: unknown): Promise<ReportAnswer>;
}
