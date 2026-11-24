// PF-17 part 4 PR B (R1.93; concept r2 §4c, BR-1, BR-3, BR-4; SA-2-14; j_93 W2): our console's Firms page. Search
// (name or web address, `?q=`), the health chips (`?health=`), and one table, 50 a page, read from PF-17's
// `GET /api/system/firms` exactly as answered: health is part 1's (shown with its reasons, in words and a shape), failed
// jobs are shown, not judged (BR-3), "N+" with one note when the read reached its cap (BR-4, m1), "Not known" when it
// failed. The order and the filters are the server's; the page never re-sorts. Without the key the API's own words show
// (BR-1). Read only: no row action (a firm's own panel is not part of R1.93, Lead 26 Q3).
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, Input, Notice, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { COPY, failedJobsText, FirmsPage as Page, firmsQuery, HEALTH_CHIPS, HEALTH_WORDS, momentWords, planState, usageText, type FirmHealth, type Usage } from "./contract";
import { SystemFrame, takeArrival } from "./frame";
import { systemApi, SystemApiError, useSystemToken } from "./session";

const TONE: Record<FirmHealth["health"], string> = { HELD: "text-text-danger", ATTENTION: "text-text-warn", OK: "text-text-ok", NOT_LIVE: "text-text-muted" };
const of = (f: FirmHealth, m: Usage["metric"]) => f.usage.find((u) => u.metric === m);
const figure = (u: Usage | undefined) => <span className={cn(u?.over && "font-medium text-text-danger")}>{usageText(u)}</span>;

function FirmsBody() {
  const token = useSystemToken();
  const [params, setParams] = useSearchParams();
  const query = firmsQuery(params);
  // The last answer stays on screen while the next one loads, so a search, chip or page keeps the focus and every typed
  // letter (review and breaker M1); "Loading" shows only before the first answer.
  const list = useQuery({ queryKey: ["sys", "firms", query, token], enabled: !!token, retry: false, placeholderData: keepPreviousData, queryFn: async () => Page.parse(await systemApi(`/firms${query}`)) });
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const put = React.useCallback((k: string, v: string | null) => setParams((old) => { const p = new URLSearchParams(old); if (v) p.set(k, v); else p.delete(k); if (k !== "page") p.delete("page"); return p; }, { replace: k === "q" }), [setParams]);
  React.useEffect(() => { const t = setTimeout(() => { if ((params.get("q") ?? "") !== q.trim()) put("q", q.trim() || null); }, 300); return () => clearTimeout(t); }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps -- on typing only
  // The box follows the address when something else changes it (the menu's Firms link, Back): breaker 3.
  const paramQ = params.get("q") ?? "";
  React.useEffect(() => { if (paramQ !== q.trim()) setQ(paramQ); }, [paramQ]);   // eslint-disable-line react-hooks/exhaustive-deps -- on the address only
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (list.data && takeArrival()) heading.current?.focus(); }, [!!list.data]);   // eslint-disable-line react-hooks/exhaustive-deps -- the first answer after a sign-in (review #9)
  const health = params.get("health");
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  // The heading comes with the first answer (or its refusal), so the page never shows "Firms" over an empty table.
  if (!d && !list.isError) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the firms…</p>;
  const refused = list.error instanceof SystemApiError ? list.error : null;
  const title = <header><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Firms</h1>
    <p className="mt-1 text-sm text-text-muted">Every firm's health, plan and usage. Times in UTC. Failed jobs are shown, not judged.</p></header>;
  // Without the key (403) the API's own words, and nothing to search or press (BR-1; breaker 5).
  if (refused?.status === 403) return <div className="mx-auto flex max-w-7xl flex-col gap-4">{title}<Notice tone="danger" title="Not available"><span data-firms-error>{refused.message}</span></Notice></div>;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {title}
      <div className="flex flex-wrap items-center gap-3">
        <label className="w-full sm:w-80"><span className="sr-only">Search firm name or web address</span>
          <Input type="search" placeholder="Search firm name or web address" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div role="group" aria-label="Health" className="flex flex-wrap gap-2">
          {HEALTH_CHIPS.map((c) => { const on = (c.value ?? null) === (health ?? null);
            return <button key={c.label} type="button" aria-pressed={on} data-chip={c.value ?? "ALL"} onClick={() => put("health", c.value)}
              className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", on ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text")}>{c.label}</button>; })}
        </div>
      </div>
      {list.isFetching && d ? <p role="status" className="sr-only">Updating the firms…</p> : null}
      {list.isError ? (refused && refused.status < 500
        // The address asked for something the API refuses: its field and rule, and a way out (review #2, breaker 1).
        ? <Notice tone="danger" title={refused.problem.title ?? "Not available"} action={<Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>Clear filters</Button>}>
          <span data-firms-error>{refused.message}{refused.problem.fields ? ` ${Object.entries(refused.problem.fields).map(([k, v]) => `${k}: ${v}`).join("; ")}` : ""}</span></Notice>
        : <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}>
          <span data-firms-error>{refused ? refused.message : COPY.loadFailed}</span></Notice>)
        : !d ? null
          : <>
            {!d.failedJobsComplete ? <Notice tone="warn"><span data-failed-capped>{d.firms.some((f) => f.failedJobs === null) ? COPY.failedUnknown : COPY.failedCapped}</span></Notice> : null}
            {!d.complete ? <Notice tone="info"><span data-firms-note>{COPY.figuresIncomplete}</span></Notice> : null}
            {!d.firms.length && d.total > 0 && d.page > 1
              ? <p data-firms-past-end className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">{COPY.pastEnd}
                <Button variant="outline" size="sm" onClick={() => put("page", null)}>Go to page 1</Button></p>
              : !d.firms.length ? <p data-firms-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{COPY.firmsEmpty}</p> : (
              <Table label="Firms" head={["Firm", "Health", "Plan", "Plan state", "Seats", "Cases (individual · corporate)", "Storage", "Failed jobs", "Last staff sign-in"]}>
                {d.firms.map((f) => <tr key={f.id} data-firm-row={f.id}>
                  <td className="min-w-40 [overflow-wrap:anywhere]"><span className="font-medium">{f.name}</span>{f.webAddress ? <span className="block text-xs text-text-muted">{f.webAddress}</span> : null}</td>
                  <td className="min-w-36"><span className={cn("font-medium", TONE[f.health])}><span aria-hidden>{HEALTH_WORDS[f.health].mark} </span>{HEALTH_WORDS[f.health].word}</span>
                    {f.reasons.length ? <span className="block text-xs text-text-muted">{f.reasons.join("; ")}</span> : null}</td>
                  <td>{f.plan?.name ?? "No live plan"}</td>
                  <td>{planState(f.subscription)}</td>
                  <td className="whitespace-nowrap">{figure(of(f, "seats"))}</td>
                  <td className="whitespace-nowrap">{figure(of(f, "active_individual_cases"))} · {figure(of(f, "active_corporate_cases"))}</td>
                  <td className="whitespace-nowrap">{figure(of(f, "storage_mb"))}{of(f, "storage_mb")?.asOf ? <span className="block text-xs text-text-muted">as of {momentWords(of(f, "storage_mb")!.asOf!)}</span> : null}</td>
                  <td data-failed-jobs>{failedJobsText(f.failedJobs, d.failedJobsComplete)}</td>
                  <td className="whitespace-nowrap">{momentWords(f.lastStaffSignInAt)}</td>
                </tr>)}
              </Table>)}
            {pages > 1 && d.firms.length ? <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={d.page <= 1} onClick={() => put("page", String(d.page - 1))}>Previous</Button>
              <span>Page {d.page} of {pages} · {d.total} firms</span>
              <Button variant="outline" size="sm" disabled={d.page >= pages} onClick={() => put("page", String(d.page + 1))}>Next</Button></nav>
              : <p className="text-xs text-text-muted">{d.total} {d.total === 1 ? "firm" : "firms"}</p>}
          </>}
    </div>
  );
}

export function FirmsPage() {
  return <SystemFrame crumbs={[{ label: "Firms" }]}><FirmsBody /></SystemFrame>;
}
