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
import { Answer, apiFilters, Dashboard, emptyWords, FilterContext, heading, isEmpty, mayReport, moneyWords, readFilters, REPORT, ROLE_WORDS, ROLES, scopeWords, withheldTip, writeFilters,
  type DashboardRole, type Filters, type Metric } from "./contract";

type Widget = Dashboard["widgets"][number];
const MONEY = /^-?\d+\.\d{2}$/;
/** A table cell as shown: an amount with thousands separators ("1,130.00"), a number as is, text as is. */
const cellWords = (v: string | number | null) => (typeof v === "string" && MONEY.test(v) ? moneyWords("", v).trim() : v ?? "");

function Tip({ text, label }: { text: string; label: string }) {
  // a real button, so the words open on keyboard focus too (EXPERIENCE §2.10); the same words sit in its accessible name
  return <button type="button" title={text} aria-label={`${label}: ${text}`} className="inline-flex size-5 items-center justify-center rounded-full border border-border text-xs text-text-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-report-tip>i</button>;
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
    return <ul className="flex flex-col gap-1" aria-label={m.label}>{rows.map((r, i) => (
      <li key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm" data-report-bar>
        <span className="truncate" title={String(r[label] ?? "No stage yet")}>{r[label] ?? "No stage yet"}</span>
        <span className="h-2.5 rounded-full bg-primary/10"><span className="block h-2.5 rounded-full bg-primary" style={{ width: `${(Number(r[count] ?? 0) / max) * 100}%` }} /></span>
        <span className="text-right tabular-nums">{r[count]}</span></li>))}</ul>;
  }
  return <Table head={ordered.map(heading)} label={m.label}>{rows.map((r, i) => <tr key={i} data-report-row>{ordered.map((c) => <td key={c} className={cn(typeof r[c] === "number" || MONEY.test(String(r[c] ?? "")) ? "text-right tabular-nums" : "")}>{cellWords(r[c] ?? null)}</td>)}</tr>)}</Table>;
}

function Card({ w, m, person, canExport, onExport, retry }: { w: Widget; m: Metric | undefined; person: string | null; canExport: boolean; onExport: (key: string, label: string) => void; retry: () => void }) {
  const wide = w.visual !== "TILE";
  const label = m?.label ?? w.label ?? heading(w.metricKey.split(".").at(-1)!);   // an unregistered widget has no label yet: its key in words
  const scope = m ? scopeWords(m, person) : null;
  const exportable = canExport && wide && m?.status === "OK" && m.reading?.kind === "LIST" && m.reading.rows.length > 0;
  return (
    <section className={cn("flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4", wide && "sm:col-span-2", !w.registered && "border-dashed bg-surface")} data-report-card={w.metricKey} aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{label}{m ? <Tip label="What this counts" text={m.source} /> : null}</h2>
        {exportable ? <Button variant="outline" size="sm" onClick={() => onExport(w.metricKey, label)} data-report-export={w.metricKey}>Export CSV</Button> : null}
      </div>
      {!w.registered ? <p className="text-sm text-text-muted" data-report-state="not-counted">Not counted yet <Tip label="Not counted yet" text="Coming in Release 1." /></p>
        : !m ? <div className="h-8 animate-pulse rounded bg-text/5" data-report-state="loading" aria-hidden />
        : m.status === "WITHHELD" ? <p className="text-sm text-text-muted" data-report-state="withheld">Not in your access <Tip label="Not in your access" text={withheldTip(m.key)} /></p>
        : m.status === "UNAVAILABLE" ? <div className="flex flex-wrap items-center gap-2 text-sm" data-report-state="unavailable"><span>Could not be counted just now. Try again</span><Button size="sm" onClick={retry} data-report-retry>Retry</Button></div>
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
  const role = readFilters(params, { roles: me.roles, keys: me.keys, period: null }).dashboard;
  const dash = useQuery({ queryKey: ["pf", "reports", "dashboard", token, role], enabled: !!token, retry: false, staleTime: 60_000,
    queryFn: async () => Dashboard.parse(await staffApi(`/platform/reports/dashboards/${role}`)) });
  const ctxQ = useQuery({ queryKey: ["pf", "reports", "filters", token], enabled: !!token, retry: false, staleTime: 60_000, queryFn: async () => FilterContext.parse(await staffApi("/platform/reports/filters")) });
  const period = ctxQ.data?.period ?? null, people = ctxQ.data?.people;
  const f = readFilters(params, { roles: me.roles, keys: me.keys, period });
  const set = (patch: Partial<Filters>) => setParams(writeFilters({ ...f, ...patch }, period, seesAll), { replace: true });
  // BR-6 (m2): only registered widgets are asked for; an unregistered key would refuse the whole query
  const keys = dash.data?.widgets.filter((w) => w.registered).map((w) => w.metricKey) ?? [];
  const body = { metrics: keys, filters: apiFilters(f) };
  const answer = useQuery({ queryKey: ["pf", "reports", "query", token, JSON.stringify(body)], enabled: !!token && keys.length > 0 && !!f.from, retry: false, placeholderData: keepPreviousData,
    queryFn: async () => Answer.parse(await staffApi("/platform/reports/query", { method: "POST", json: body })) });
  const byKey = new Map(answer.data?.metrics.map((m) => [m.key, m]) ?? []);
  const personName = f.staffId ? people?.find((p) => p.id === f.staffId)?.name ?? null : null;
  const [said, setSaid] = React.useState(""), [exportError, setExportError] = React.useState("");
  const exportNow = async (metric: string) => {
    setSaid(""); setExportError("");
    const sent = staffToken();
    const res = await fetch("/api/platform/reports/export", { method: "POST", headers: { "content-type": "application/json", accept: "text/csv, application/problem+json", ...(sent ? { authorization: `Bearer ${sent}` } : {}) }, body: JSON.stringify({ metric, filters: apiFilters(f) }) });
    if (!res.ok) {
      setExportError(res.status === 403 ? "You can't export this table. Ask your firm's Owner for the Export permission." : res.status === 503 ? "This table could not be counted just now, so nothing was exported. Try again." : "The export did not work. Try again.");
      return;
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "report.csv";
    const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaid(`Downloaded ${name}. The export is recorded in the activity log.`);
  };
  const failed = dash.error instanceof StaffApiError ? dash.error : ctxQ.error instanceof StaffApiError ? ctxQ.error : answer.error instanceof StaffApiError ? answer.error : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Reports</h1><p className="mt-1 text-sm text-text-muted">How the firm is doing, counted from your records</p></div>
        <Field label="Dashboard"><Select value={role} onChange={(e) => set({ dashboard: e.target.value as DashboardRole })} data-report-dashboard>{ROLES.map((r) => <option key={r} value={r}>{ROLE_WORDS[r]}</option>)}</Select></Field>
      </header>
      <div role="group" aria-label="Filters" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3" data-report-filters>
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => e.target.value && set({ from: e.target.value })} data-report-from /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={(e) => e.target.value && set({ to: e.target.value })} data-report-to /></Field>
        {seesAll && people
          ? <Field label="Person"><Select value={f.staffId ?? ""} onChange={(e) => set({ staffId: e.target.value || undefined })} data-report-person><option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (left the firm)"}</option>)}</Select></Field>
          : <Field label="Person"><p className="flex min-h-9 items-center text-sm" data-report-person-you>You</p></Field>}
        <Field label="Client type"><Select value={f.clientType ?? "ALL"} onChange={(e) => set({ clientType: e.target.value === "ALL" ? undefined : (e.target.value as Filters["clientType"]) })} data-report-client-type>
          <option value="ALL">All</option><option value="INDIVIDUAL">Individual</option><option value="CORPORATE">Corporate</option></Select></Field>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
      {said ? <Notice tone="ok"><span data-report-export-said>{said}</span></Notice> : null}
      {exportError ? <Notice tone="danger" title="Not exported"><span data-report-export-error>{exportError}</span></Notice> : null}
      {failed ? <Notice tone="danger" title="Reports could not be shown"><span data-report-error>{failed.problem?.detail ?? "Try again in a moment."}</span></Notice> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-report-grid>
        {dash.isPending ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-text/5" aria-hidden data-report-skeleton />)
          : dash.data?.widgets.map((w) => <Card key={w.metricKey} w={w} m={byKey.get(w.metricKey)} person={personName} canExport={ctxQ.data?.canExport === true} onExport={(k) => void exportNow(k)} retry={() => void answer.refetch()} />)}
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
