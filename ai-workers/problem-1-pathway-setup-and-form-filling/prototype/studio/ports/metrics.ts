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
/** At most this many rows, and columns in a row, in a LIST metric (AG-14-28). */
export const LIST_MAX_ROWS = 200;
export const LIST_MAX_COLUMNS = 20;
/** A read that has not answered by then is UNAVAILABLE (TIMEOUT), so one stuck read never holds the answer (break m4). */
export const READ_TIMEOUT_MS = 5000;

/** The filter bar's names (a plain const: tests/check_pf0p_ports.ts reads an export holding "from" and a quote as an import). */
const FILTER_NAMES = ["from", "to", "staffId", "clientType"] as const;
/** A metric key is reports.<area>.<name> (two dots: a one-dot name reads as a combination key to B164's guard, Lead 12 on #3291). */
export const MetricKey = z.string().regex(/^reports\.[a-z][a-z_]{0,29}\.[a-z][a-z0-9_]{0,59}$/, "a metric key is reports.<area>.<name>, e.g. reports.sales.leads_added");
export const MetricKind = z.enum(["COUNT", "MONEY", "PERCENT", "LIST"]);
export type MetricKind = z.infer<typeof MetricKind>;
const AGGREGATIONS: Record<MetricKind, string[]> = { COUNT: ["COUNT", "SUM"], PERCENT: ["RATIO", "AVG"], MONEY: ["SUM", "AVG", "MEDIAN"], LIST: ["LIST"] };
/** What the read is told to count: own records, the firm, or the firm's money (AG-14-19). */
export const MetricScope = z.enum(["own", "all", "financial"]);
export type MetricScope = z.infer<typeof MetricScope>;
/** Release 1 currencies (X-6). */
export const Currency = z.enum(["CAD", "USD"]);

/** Where a figure drills to (AG-14-22): the operational list's route and which filters it carries, by the target's own
 *  parameter names. The target re-checks its own keys and firm (the door adds nothing). */
export const DrillTarget = z.strictObject({
  path: z.string().regex(/^\/api\/[a-z0-9/-]{1,200}$/),
  carries: z.partialRecord(z.enum(FILTER_NAMES), z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/)).default({}),
}).refine((t) => new Set(Object.values(t.carries)).size === Object.values(t.carries).length, "each filter goes to its own parameter (break M4)");
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
  /** True when the figure can be counted over the viewer's own records; false: a firm-wide figure only (answered WITHHELD at own scope).
   *  A PER_CURRENCY metric (money, or a LIST with a currency on each row) is answered only with view-financial (AG-14-35 to -37). */
  scopeAware: z.boolean(),
  drillTarget: DrillTarget.nullable(),
}).refine((d) => d.kind === "MONEY" ? d.moneyTreatment === "PER_CURRENCY" : d.kind === "LIST" || d.moneyTreatment === "NONE", "a MONEY metric is PER_CURRENCY; a COUNT or PERCENT is NONE; a LIST may be either (AG-14-15)")
  .refine((d) => AGGREGATIONS[d.kind].includes(d.aggregation), "the aggregation does not fit the kind (COUNT: COUNT or SUM; PERCENT: RATIO or AVG; MONEY: SUM, AVG or MEDIAN; LIST: LIST)");
export type MetricDefinition = z.infer<typeof MetricDefinition>;

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date is YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "not a real date");
/** The shared filter bar (AG-14-20, -33): date range, person, client type. It only narrows (AG-14-20). */
export const MetricFilters = z.strictObject({
  from: DAY.optional(),
  to: DAY.optional(),
  staffId: z.string().uuid("the person is a staff id").optional(),
  clientType: z.enum(["INDIVIDUAL", "CORPORATE"]).optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, { message: "the start date is after the end date", path: [FILTER_NAMES[0]] });
export type MetricFilters = z.infer<typeof MetricFilters>;

/** The door's body (AG-14-30). `scope` is accepted and never read: the scope is the server's (AG-14-19). */
export const ReportQuery = z.strictObject({
  metrics: z.array(MetricKey).min(1, "name at least one metric").max(QUERY_MAX_METRICS, `at most ${QUERY_MAX_METRICS} metrics`),
  filters: MetricFilters.default({}),
  // R1.10 A4: still never read (the server works out the scope), but a value of the wrong kind is named, as every field is.
  scope: z.enum(["own", "all", "financial"], { error: "own or all (the server works out the scope from your roles)." }).optional(),
});

const Money = z.strictObject({ currency: Currency, amount: z.string().regex(/^-?\d{1,13}\.\d{2}$/, "major units with two decimals") });
/** What a read gives back, by kind. A MONEY read is a list of per-currency figures (never one total; each currency once). */
export const Reading = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("COUNT"), value: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("PERCENT"), value: z.number().min(0).max(100).nullable() }),
  z.strictObject({ kind: z.literal("MONEY"), figures: z.array(Money).max(2).refine((f) => new Set(f.map((x) => x.currency)).size === f.length, "each currency once") }),
  z.strictObject({ kind: z.literal("LIST"), rows: z.array(z.record(z.string().max(60), z.union([z.string().max(300), z.number(), z.null()])).refine((r) => Object.keys(r).length <= LIST_MAX_COLUMNS, `at most ${LIST_MAX_COLUMNS} columns`)).max(LIST_MAX_ROWS) }),
]);
export type Reading = z.infer<typeof Reading>;

/** What a module's read is given: the firm, the viewer, the viewer's keys (so the read counts only records the viewer may
 *  open under the area's own view.own / view.all, AG-14-19, SA6-D6: break M1), the scope the server worked out and the
 *  narrowed filters (a frozen copy per read). Under `own`, `filters.staffId` is always the viewer. */
export type MetricReadContext = { firmId: string; staffId: string; keys: readonly string[]; scope: MetricScope };
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

/** A refusal the door turns into 422 (a body or filter failing its schema: PF-28's field-error status), 400 (an unknown metric) or 403 (no report key, or another person's figures at own scope). */
export class ReportRefused extends Error {
  constructor(readonly status: 400 | 403 | 422, readonly code: string, message: string, readonly fields: Record<string, string> = {}) { super(message); this.name = "ReportRefused"; }
}

/** The caller's base scope from the report keys: all, own, or none (AG-14-19; SA6-D1 defaults). */
export function baseScope(keys: readonly string[]): "all" | "own" | null {
  return keys.includes(REPORT_KEYS.all) ? "all" : keys.includes(REPORT_KEYS.own) ? "own" : null;
}
/** The scope one metric is read at: a PER_CURRENCY metric only with view-financial, firm-wide ("financial"; AG-14-35 to
 *  -37, §2: "firm-wide financial reports come from view-financial, not from view.all"), else none (WITHHELD); any other
 *  metric at the base scope. */
export function scopeFor(keys: readonly string[], money: MetricDefinition["moneyTreatment"]): MetricScope | null {
  if (money === "PER_CURRENCY") return keys.includes(REPORT_KEYS.financial) ? "financial" : null;
  return baseScope(keys);
}
/** True when the caller may read any report at all. */
export const mayReport = (keys: readonly string[]) => baseScope(keys) !== null || keys.includes(REPORT_KEYS.financial);

/** A plain message per issue (AG-14-30; review m3), never the input itself beyond a known key name, at most 10 fields (break m1). */
const plain = (i: z.core.$ZodIssue): string => {
  if (i.code === "unrecognized_keys") return `not a field here: ${i.keys.slice(0, 3).map((k) => (/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k) ? k : "(unreadable)")).join(", ")}${i.keys.length > 3 ? ` and ${i.keys.length - 3} more` : ""}`;
  if (i.code === "invalid_type") return "this has the wrong type";
  if (i.code === "invalid_value") return "this is not one of the allowed values";
  return i.message.slice(0, 200);
};
const pathOf = (i: z.core.$ZodIssue) => i.path.slice(0, 4).map((p) => String(p).slice(0, 40)).join(".") || "body";
/** The fields, at most 10: an unknown field is named by its own key, as PF-28's fieldsOf does ("This field is not allowed here."). */
const fieldsOfIssues = (e: z.ZodError) => {
  const out: [string, string][] = [];
  for (const i of e.issues) {
    if (i.code === "unrecognized_keys") for (const k of i.keys) out.push([[...i.path.slice(0, 3).map((p) => String(p).slice(0, 40)), /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k) ? k : "(unreadable)"].join("."), "This field is not allowed here."]);
    else out.push([pathOf(i), plain(i)]);
  }
  return Object.fromEntries(out.slice(0, 10));
};
const timeout = <T,>(p: Promise<T>, ms: number) => { let t: ReturnType<typeof setTimeout> | undefined; return Promise.race([p, new Promise<"TIMEOUT">((r) => { t = setTimeout(() => r("TIMEOUT"), ms); })]).finally(() => clearTimeout(t)); };
/** The 422 for a body that fails ReportQuery: one plain message and at most 10 named fields. */
export function queryRefusal(error: z.ZodError): ReportRefused {
  const first = error.issues[0];
  return new ReportRefused(422, "QUERY_INVALID", first ? plain(first) : "Check the report query", fieldsOfIssues(error));
}
/** A reading that fits its definition: the kind, and a currency on every row of a PER_CURRENCY list. */
const fits = (m: MetricDefinition, raw: unknown): Reading | null => {
  const got = Reading.safeParse(raw);
  if (!got.success || got.data.kind !== m.kind) return null;
  if (got.data.kind === "LIST" && m.moneyTreatment === "PER_CURRENCY" && !got.data.rows.every((r) => Currency.safeParse(r.currency).success)) return null;
  // a table not declared per currency never carries money: a row with a currency there would skip view-financial (break r1)
  if (got.data.kind === "LIST" && m.moneyTreatment === "NONE" && got.data.rows.some((r) => "currency" in r)) return null;
  return got.data;
};

/** The run rule both the registry and the fake use. Refuses (ReportRefused) an ill-shaped body, an unknown metric key, a
 *  caller without a report key, and a person filter naming someone else when the caller sees only their own. Each metric
 *  is read at its server-worked scope, all at once; a read that fails or answers the wrong shape is UNAVAILABLE (its
 *  words never leave the server), a firm-wide-only metric at own scope is WITHHELD. */
export async function runMetrics(metrics: ReadonlyMap<string, MetricRegistration>, caller: ReportCaller, body: unknown, onFail?: (key: string, reason: "ERROR" | "SHAPE" | "TIMEOUT") => void, readTimeoutMs = READ_TIMEOUT_MS): Promise<ReportAnswer> {
  if (!mayReport(caller.keys)) throw new ReportRefused(403, "MISSING_PERMISSION", `Your roles include no report permission (${REPORT_KEYS.own}, ${REPORT_KEYS.all} or ${REPORT_KEYS.financial}).`);
  const parsed = ReportQuery.safeParse(body ?? {});
  if (!parsed.success) throw queryRefusal(parsed.error);
  const { metrics: keys, filters } = parsed.data;
  const unknown = keys.filter((k) => !metrics.has(k));
  if (unknown.length) throw new ReportRefused(400, "UNKNOWN_METRIC", `No such metric: ${unknown.slice(0, 5).join(", ")}`);
  const plans = [...new Set(keys)].map((key) => { const m = metrics.get(key)!; return { key, m, scope: scopeFor(caller.keys, m.moneyTreatment) }; });
  // checked before any read starts: at own scope the person filter may name only the caller
  if (filters.staffId && filters.staffId.toLowerCase() !== caller.staffId.toLowerCase() && plans.some((p) => p.scope === "own" && p.m.scopeAware)) throw new ReportRefused(403, "OWN_ONLY", "You can see only your own figures.");
  const answers = await Promise.all(plans.map(async ({ key, m, scope }): Promise<MetricAnswer> => {
    const base = { key, label: m.label, kind: m.kind, source: m.source, scope };
    if (scope === null || (scope === "own" && !m.scopeAware)) return { ...base, status: "WITHHELD", reading: null, drill: null };
    const narrowed: MetricFilters = Object.freeze(scope === "own" ? { ...filters, staffId: caller.staffId } : { ...filters });
    let reading: Reading | null;
    try {
      const got = await timeout(Promise.resolve().then(() => m.read(Object.freeze({ firmId: caller.firmId, staffId: caller.staffId, keys: Object.freeze([...caller.keys]), scope }), narrowed)), readTimeoutMs);
      if (got === "TIMEOUT") { onFail?.(key, "TIMEOUT"); return { ...base, status: "UNAVAILABLE", reading: null, drill: null }; }
      reading = fits(m, got);
      if (!reading) { onFail?.(key, "SHAPE"); return { ...base, status: "UNAVAILABLE", reading: null, drill: null }; }
    } catch { onFail?.(key, "ERROR"); return { ...base, status: "UNAVAILABLE", reading: null, drill: null }; }
    return { ...base, status: "OK", reading, drill: drillOf(m.drillTarget, narrowed) };
  }));
  return { metrics: answers, filters };
}

/** The drill link: the target path and the filters it carries, under the target's own parameter names (AG-14-22). A link
 *  only when the target carries every filter in effect (the own scope's person included), so the drilled list is the
 *  figure's exact set, never a wider one (break M4); otherwise none. */
export function drillOf(target: DrillTarget | null, filters: MetricFilters): MetricAnswer["drill"] {
  if (!target) return null;
  const query: Record<string, string> = {};
  for (const [ours, v] of Object.entries(filters) as [keyof MetricFilters, string | undefined][]) {
    if (!v) continue;
    const theirs = target.carries[ours];
    if (!theirs) return null;
    query[theirs] = v;
  }
  return { path: target.path, query };
}

/** The register rule both use: the definition must parse, and a key registers once. */
export function checkRegistration(metrics: ReadonlyMap<string, MetricRegistration>, m: MetricRegistration): MetricRegistration {
  const { read, ...definition } = m;
  if (typeof read !== "function") throw new Error(`MetricRegistry: ${String(m?.key)} has no read`);
  const def = MetricDefinition.parse(structuredClone(definition));
  if (metrics.has(def.key)) throw new Error(`MetricRegistry: ${def.key} is already registered`);
  const prefix = def.key.split(".").slice(0, 2).join(".");   // reports.<area>
  const owner = [...metrics.values()].find((x) => x.key.startsWith(`${prefix}.`) && x.module !== def.module);
  if (owner) throw new Error(`MetricRegistry: the ${prefix}.* keys are ${owner.module}'s (break m2)`);
  return { ...def, read };
}
/** The definitions as copies: a caller can change nothing registered (break m5). */
export const definitionsOf = (metrics: ReadonlyMap<string, MetricRegistration>): MetricDefinition[] => [...metrics.values()].map(({ read: _read, ...d }) => structuredClone(d));

/** STANDARDS §9's read budget, for CI (row PF-R1 (7)): reads each metric at each given context, each inside that
 *  context's firm (`runAs`: the platform's withFirm, so the walls apply and a read outside any firm cannot pass by reading
 *  nothing: break M3), and names every one that took longer than `budgetMs`, failed, or answered the wrong shape. A metric
 *  on this list fails the budget test. */
export async function overBudget(metrics: ReadonlyMap<string, MetricRegistration>, contexts: MetricReadContext[], runAs: <T>(firmId: string, fn: () => Promise<T>) => Promise<T>, filters: MetricFilters = {}, budgetMs = METRIC_READ_BUDGET_MS): Promise<{ key: string; scope: MetricScope; ms: number | null }[]> {
  const out: { key: string; scope: MetricScope; ms: number | null }[] = [];
  for (const m of metrics.values()) for (const ctx of contexts) {
    const started = performance.now();
    try {
      const got = await runAs(ctx.firmId, () => m.read(ctx, ctx.scope === "own" ? { ...filters, staffId: ctx.staffId } : filters));
      if (!fits(m, got)) { out.push({ key: m.key, scope: ctx.scope, ms: null }); continue; }
    } catch { out.push({ key: m.key, scope: ctx.scope, ms: null }); continue; }
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
