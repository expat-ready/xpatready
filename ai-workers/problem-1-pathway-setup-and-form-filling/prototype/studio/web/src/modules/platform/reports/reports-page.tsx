// R1.79 part 4 (PF-R3; concept product/screens/pf-r3-reports/concept-draft.md r2, approved by Lead 5 on #3849; AG-14-18 to
// -22, -25, -26, -29, -33): the firm's Reports page at /platform/reports. Read-only. The seeded dashboard for the viewer's
// role (BR-2), one filter bar in the address (BR-3), cards, bar lists, the ageing strip and tables from PF-R1's door, each
// with its own scope (BR-1), money per currency (BR-4), "What this counts" (BR-5), states that say why (BR-6), and Export
// CSV of a table for agent/report:export, audited by the server (BR-7). No drill link: no figure carries one yet (BR-8).
// Every rule is the server's; this page only shows what the answers say.
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Select, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, staffToken, useStaffToken } from "../session";
import { Answer, apiFilters, Dashboard, emptyWords, FilterContext, heading, isEmpty, mayReport, moneyWords, monthsBack, readFilters, REPORT, ROLE_WORDS, ROLES, scopeWords, withheldTip, writeFilters,
  type DashboardRole, type Filters, type Metric } from "./contract";

type Widget = Dashboard["widgets"][number];
const MONEY = /^-?\d+\.\d{2}$/;
/** A table cell as shown: an amount with thousands separators ("1,130.00"), a number as is, text as is. */
const cellWords = (v: string | number | null) => (typeof v === "string" && MONEY.test(v) ? moneyWords("", v).trim() : v ?? "");

/** A toggletip (review M1, BIC-14): click, tap, Enter or Space shows the words in the page, Escape or a second press hides
 *  them; hover also shows them as the native title. The words are in the button's accessible name too. */
function Tip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = React.useState(false), id = React.useId();
  // the words open inside the card, across its width (never off the page: review and break r2-m1); a press on them keeps them open
  return <span className="inline-flex">
    <button type="button" title={text} aria-label={`${label}: ${text}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} onBlur={(e) => { if (!e.relatedTarget || (e.relatedTarget as HTMLElement).id !== id) setOpen(false); }}
      className="inline-flex size-6 items-center justify-center rounded-full border border-border text-xs text-text-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-report-tip>i</button>
    {open ? <span id={id} role="status" tabIndex={-1} onBlur={() => setOpen(false)} className="absolute inset-x-4 top-11 z-10 rounded-lg border border-border bg-surface-raised p-2 text-xs font-normal text-text shadow-md outline-none" data-report-tip-text>{text}</span> : null}
  </span>;
}

function Value({ m }: { m: Metric }) {
  const r = m.reading!;
  if (r.kind === "COUNT") return <p className="text-2xl font-semibold" data-report-value>{r.value.toLocaleString("en-CA")}</p>;
  if (r.kind === "PERCENT") return <p className="text-2xl font-semibold" data-report-value>{r.value}%</p>;
  if (r.kind === "MONEY") return <div data-report-value>{r.figures.map((x) => <p key={x.currency} className="text-2xl font-semibold" data-report-money={x.currency}>{moneyWords(x.currency, x.amount)}</p>)}</div>;
  return null;
}

function Rows({ m, visual }: { m: Metric; visual: Widget["visual"] }) {
  const rows = m.reading?.kind === "LIST" ? m.reading.rows : [];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const ordered = cols.includes("currency") ? ["currency", ...cols.filter((c) => c !== "currency")] : cols;
  if (visual === "BAR") {
    const label = ordered[0]!, count = ordered.find((c) => typeof rows[0]?.[c] === "number") ?? ordered[1]!;
    const max = Math.max(1, ...rows.map((r) => Number(r[count] ?? 0)));
    return <BarList rows={rows} label={m.label} render={(r, i) => (
      <li key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm" data-report-bar>
        <span className="truncate" title={String(r[label] ?? "No stage yet")}>{r[label] ?? "No stage yet"}</span>
        <span className="h-2.5 rounded-full bg-primary/10"><span className="block h-2.5 rounded-full bg-primary" style={{ width: `${(Number(r[count] ?? 0) / max) * 100}%` }} /></span>
        <span className="text-right tabular-nums">{r[count]}</span></li>)} />;
  }
  return <Table head={ordered.map(heading)} label={m.label} className="rounded-none border-0">{rows.map((r, i) => <tr key={i} data-report-row>{ordered.map((c) => <td key={c} className={cn(typeof r[c] === "number" || MONEY.test(String(r[c] ?? "")) ? "text-right tabular-nums" : "")}>{cellWords(r[c] ?? null)}</td>)}</tr>)}</Table>;
}

/** A bar list shows its first BAR_SHOWN rows, then "Show all" (break m9: 200 bars at 375 px). */
const BAR_SHOWN = 15;
function BarList({ rows, label, render }: { rows: Record<string, string | number | null>[]; label: string; render: (r: Record<string, string | number | null>, i: number) => React.ReactNode }) {
  const [all, setAll] = React.useState(false), shown = all ? rows : rows.slice(0, BAR_SHOWN);
  return <div className="flex flex-col gap-2"><ul className="flex flex-col gap-1" aria-label={label}>{shown.map(render)}</ul>
    {rows.length > BAR_SHOWN ? <Button variant="link" size="sm" className="min-h-11 self-start px-0 sm:min-h-8" onClick={() => setAll((a) => !a)} data-report-bars-toggle>{all ? "Show fewer" : `Show all ${rows.length}`}</Button> : null}</div>;
}

function Card({ w, m, person, canExport, onExport, retry, blocked, exporting }: { w: Widget; m: Metric | undefined; person: string | null; canExport: boolean; onExport: (key: string, label: string) => void; retry: () => void;
  /** Why nothing will load (dates that cannot be read, a failed answer): said instead of a skeleton (r2-m2). */ blocked: string | null; exporting: boolean }) {
  const wide = w.visual !== "TILE";
  const label = m?.label ?? w.label ?? heading(w.metricKey.split(".").at(-1)!);   // an unregistered widget has no label yet: its key in words
  const scope = m ? scopeWords(m, person) : null;
  const exportable = canExport && wide && m?.status === "OK" && m.reading?.kind === "LIST" && m.reading.rows.length > 0;
  return (
    <section className={cn("relative flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4", wide && "sm:col-span-2", !w.registered && "border-dashed bg-surface")} data-report-card={w.metricKey} aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{label}{m ? <Tip label="What this counts" text={m.source} /> : null}</h2>
        {exportable ? <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" disabled={exporting} busy={exporting} onClick={() => onExport(w.metricKey, label)} data-report-export={w.metricKey}>Export CSV</Button> : null}
      </div>
      {!w.registered ? <p className="text-sm text-text-muted" data-report-state="not-counted">Not counted yet <Tip label="Not counted yet" text="Coming in Release 1." /></p>
        : !m && blocked ? <p className="text-sm text-text-muted" data-report-state="blocked">{blocked}</p>
        : !m ? <div className="h-8 animate-pulse rounded bg-text/5" data-report-state="loading" aria-hidden />
        : m.status === "WITHHELD" ? <p className="text-sm text-text-muted" data-report-state="withheld">Not in your access <Tip label="Not in your access" text={withheldTip(m.key)} /></p>
        : m.status === "UNAVAILABLE" ? <div className="flex flex-wrap items-center gap-2 text-sm" data-report-state="unavailable"><span>Could not be counted just now. Try again</span><Button size="sm" className="min-h-11 sm:min-h-8" onClick={retry} data-report-retry>Retry</Button></div>
        : isEmpty(m) ? <p className="text-sm text-text-muted" data-report-state="empty">{emptyWords(m.key)}</p>
        : wide ? <Rows m={m} visual={w.visual} /> : <Value m={m} />}
      {scope ? <p className="text-xs text-text-muted"><span className="rounded-full border border-primary px-2 py-0.5 text-text-link" data-report-scope>{scope}</span></p> : null}
    </section>
  );
}

function Reports() {
  const me = usePlatformStaff(), token = useStaffToken();
  const [params, setParams] = useSearchParams();
  const seesAll = me.keys.includes(REPORT.all);
  const allByDefault = seesAll || me.keys.includes(REPORT.financial);
  const role = readFilters(params, { roles: me.roles, keys: me.keys, period: null }).dashboard;
  const dash = useQuery({ queryKey: ["pf", "reports", "dashboard", token, role], enabled: !!token, retry: false, staleTime: 60_000,
    queryFn: async () => Dashboard.parse(await staffApi(`/platform/reports/dashboards/${role}`)) });
  const ctxQ = useQuery({ queryKey: ["pf", "reports", "filters", token], enabled: !!token, retry: false, staleTime: 60_000, queryFn: async () => FilterContext.parse(await staffApi("/platform/reports/filters")) });
  const period = ctxQ.data?.period ?? null, people = ctxQ.data?.people;
  const f = readFilters(params, { roles: me.roles, keys: me.keys, period, people });
  const set = (patch: Partial<Filters>) => setParams(writeFilters({ ...f, ...patch }, period, allByDefault), { replace: true });
  const months = monthsBack(period), month = months.find((x) => x.from === f.from && x.to === f.to);
  const [custom, setCustom] = React.useState(false);
  const showDates = custom || (!!f.from && !month);
  // BR-6 (m2): only registered widgets are asked for; an unregistered key would refuse the whole query
  const keys = dash.data?.widgets.filter((w) => w.registered).map((w) => w.metricKey) ?? [];
  const body = { metrics: keys, filters: apiFilters(f) };
  // asked only once the filter context is in (the person is checked against it, break M1 and m7) and the dates read together
  const answer = useQuery({ queryKey: ["pf", "reports", "query", token, JSON.stringify(body)], enabled: !!token && keys.length > 0 && !!ctxQ.data && !!f.from && !f.rangeProblem, retry: false, placeholderData: keepPreviousData,
    queryFn: async () => Answer.parse(await staffApi("/platform/reports/query", { method: "POST", json: body })) });
  // the previous answer is never shown under the new filters (review M2, break m1): its cards wait, busy, with no Export
  const stale = answer.isPlaceholderData || !!f.rangeProblem;
  const byKey = new Map(stale ? [] : answer.data?.metrics.map((m) => [m.key, m]) ?? []);
  const personName = f.staffId ? people?.find((p) => p.id === f.staffId)?.name ?? null : null;
  const [said, setSaid] = React.useState(""), [exportError, setExportError] = React.useState("");
  const exporting = React.useRef(false), [busyExport, setBusyExport] = React.useState(false);
  const exportNow = async (metric: string) => {
    if (exporting.current) return;   // one export per press (break m2); every Export button shows busy meanwhile (r2-m3)
    exporting.current = true; setBusyExport(true);
    try { await exportOnce(metric); } finally { exporting.current = false; setBusyExport(false); }
  };
  const exportOnce = async (metric: string) => {
    setSaid(""); setExportError("");
    const sent = staffToken();
    const res = await fetch("/api/platform/reports/export", { method: "POST", headers: { "content-type": "application/json", accept: "text/csv, application/problem+json", ...(sent ? { authorization: `Bearer ${sent}` } : {}) }, body: JSON.stringify({ metric, filters: apiFilters(f) }) });
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { code?: string }).code;
      setExportError(code === "WITHHELD" ? "This table is not in your access, so it cannot be exported." : res.status === 403 ? "You can't export reports. Ask your firm's Owner for the Export permission."
        : res.status === 503 ? "This table could not be counted just now, so nothing was exported. Try again." : code === "NOTHING_TO_EXPORT" ? "This table has no rows for these filters, so nothing was exported." : "The export did not work. Try again.");
      return;
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "report.csv";
    const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaid(`Downloaded ${name}. The export is recorded in the activity log.`);
  };
  const blocked = f.rangeProblem ? "Fix the dates above to see this figure." : answer.isError ? "Could not be counted just now. Try again." : null;
  const failed = dash.error instanceof StaffApiError ? dash.error : ctxQ.error instanceof StaffApiError ? ctxQ.error : answer.error instanceof StaffApiError ? answer.error : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Reports</h1><p className="mt-1 text-sm text-text-muted">How the firm is doing, counted from your records</p></div>
        <Field label="Dashboard"><Select value={role} onChange={(e) => set({ dashboard: e.target.value as DashboardRole })} data-report-dashboard>{ROLES.map((r) => <option key={r} value={r}>{ROLE_WORDS[r]}</option>)}</Select></Field>
      </header>
      <div role="group" aria-label="Filters" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3" data-report-filters>
        <Field label="Month"><Select value={showDates ? "custom" : month?.from ?? ""} onChange={(e) => { if (e.target.value === "custom") return setCustom(true); const x = months.find((y) => y.from === e.target.value); setCustom(false); if (x) set({ from: x.from, to: x.to }); }} data-report-month>
          {months.map((x) => <option key={x.from} value={x.from}>{x.label}</option>)}<option value="custom">Custom dates…</option></Select></Field>
        {showDates ? <>
          <Field label="From"><Input type="date" value={f.from} onChange={(e) => e.target.value && set({ from: e.target.value })} data-report-from /></Field>
          <Field label="To" error={f.rangeProblem ?? null}><Input type="date" value={f.to} onChange={(e) => e.target.value && set({ to: e.target.value })} aria-invalid={!!f.rangeProblem} data-report-to /></Field></> : null}
        {seesAll && people
          ? <Field label="Person"><Select className="max-w-xs" value={f.staffId ?? ""} onChange={(e) => set({ staffId: e.target.value || undefined })} data-report-person><option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inactive)"}</option>)}</Select></Field>
          : <Field label="Person"><p className="flex min-h-9 items-center text-sm" data-report-person-you>You</p></Field>}
        <Field label="Client type"><Select value={f.clientType ?? "ALL"} onChange={(e) => set({ clientType: e.target.value === "ALL" ? undefined : (e.target.value as Filters["clientType"]) })} data-report-client-type>
          <option value="ALL">All</option><option value="INDIVIDUAL">Individual</option><option value="CORPORATE">Corporate</option></Select></Field>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
      {said ? <Notice tone="ok"><span data-report-export-said>{said}</span></Notice> : null}
      {exportError ? <Notice tone="danger" title="Not exported"><span data-report-export-error>{exportError}</span></Notice> : null}
      {failed ? <Notice tone="danger" title="Reports could not be shown"><span data-report-error>{failed.problem?.detail ?? "Try again in a moment."}</span></Notice> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={!blocked && (answer.isFetching || stale)} data-report-grid>
        {dash.isPending ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-text/5" aria-hidden data-report-skeleton />)
          : dash.data?.widgets.map((w) => <Card key={w.metricKey} w={w} m={byKey.get(w.metricKey)} person={personName} canExport={ctxQ.data?.canExport === true} onExport={(k) => void exportNow(k)} retry={() => void answer.refetch()} blocked={blocked} exporting={busyExport} />)}
      </div>
    </div>
  );
}

function Gate() {
  const me = usePlatformStaff();
  if (!mayReport(me.keys)) return <div className="mx-auto max-w-6xl"><Notice tone="info" title="Your roles include no report permission"><span data-report-no-access>Ask your firm's Owner for a Reports permission.</span></Notice></div>;
  return <Reports key={`${me.firmId}:${me.staffId}`} />;
}

export function ReportsPage() {
  return <PlatformFrame crumbs={[{ label: "Reports" }]}><Gate /></PlatformFrame>;
}
