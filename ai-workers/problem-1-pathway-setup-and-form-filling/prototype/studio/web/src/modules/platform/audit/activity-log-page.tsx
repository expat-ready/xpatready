// AUD-4s (concept screens/AUD-4s/concept.md C1-C9 over concept-draft.md; AG-16-26, SA-6-33, SA-2-29, SA-11-34, AG-13-43; R1.88):
// My account → Activity log, for holders of agent/audit:read (Owner and Admin by default). Read-only: the firm's own lines from
// AUD-4's read, newest first, a page at a time by the cursor (BR-10); date range (default the last 7 days), Person, Area and the
// "ExpatReady staff access" shortcut on top, technical filters under Advanced; one sentence reads every filter back (BR-12); a
// line opens in place on its When cell for the change in words and the raw before and after (C1: values in full); Export CSV
// asks once and says the export is recorded (BR-6). No integrity pill and no claim about integrity (C2: row AUD-4s-i). The keep
// sentence is AUD-5's field (C6). The page holds only the signed-in person's firm: every answer is keyed by the session and the
// body is keyed by the person, so a session's end clears it (BR-13). The server decides every rule.
import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { FoldArrow, FoldOut } from "@/components/fold-out";
import { Button, Dialog, Field, Input, Notice, Pill, Select, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { endSession, staffApi, StaffApiError, staffToken, useStaffToken } from "../session";
import { activeFilters, ADVANCED, apiQuery, AUDIT_KEY, COPY, defaults, DONE_BY, emptyTitle, fileName, KeepPeriods, Page, rangeProblem, readFilters, sentence, when, whenFull, writeFilters,
  type Filters, type Line, type Names, type Person } from "./contract";

const Shell = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="mx-auto flex max-w-6xl flex-col gap-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{COPY.title}</h1><p className="mt-1 text-sm text-text-muted">{COPY.subtitle}</p></div>
      {action}
    </header>
    {children}
  </div>
);

const NoAccess = () => <Shell><Notice tone="info" title={COPY.noAccess}><span data-audit-no-access>{COPY.noAccessAsk}</span></Notice></Shell>;

/** A text filter under Advanced: sent when the person leaves the field or presses Enter, not on every key. */
function TextFilter({ label, value, onCommit, name }: { label: string; value: string; onCommit: (v: string) => void; name: string }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { const v = draft.trim(); if (v !== value) onCommit(v); };
  return <Field label={label}><Input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} data-audit-filter={name} /></Field>;
}

function OpenLine({ line, zone, person, onOnlyPerson }: { line: Line; zone: string; person: Person | undefined; onOnlyPerson: (id: string) => void }) {
  const a = line.advanced;
  return (
    <div className="flex flex-col gap-3 py-1 text-sm" data-audit-open>
      <p className="text-xs text-text-muted"><time dateTime={line.at}>{whenFull(line.at, zone)}</time></p>
      <p className="[overflow-wrap:anywhere]" data-audit-summary-full>{line.summary}</p>
      {line.changes.length ? <ul className="flex flex-col gap-1" aria-label="What changed">{line.changes.map((c, i) => <li key={i} className="font-mono text-xs [overflow-wrap:anywhere]" data-audit-change>{c.words}</li>)}</ul> : null}
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
        <dt className="text-xs font-medium text-text-muted">Action</dt><dd className="[overflow-wrap:anywhere]">{line.actionWords ?? "No name yet (its code is under Advanced)"}</dd>
        <dt className="text-xs font-medium text-text-muted">Area</dt><dd>{line.areaWords}</dd>
        <dt className="text-xs font-medium text-text-muted">Done by</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>{DONE_BY[a.actorType] ?? a.actorType} · {line.who}{person && !person.active ? " (left the firm)" : ""}</span>
          {line.staffId ? <Button variant="outline" size="sm" onClick={() => onOnlyPerson(line.staffId!)} data-audit-only-person>{COPY.onlyPerson}</Button> : null}</dd>
      </dl>
      <FoldOut className="rounded-lg border border-border bg-surface px-3 py-2" data-audit-raw summary={COPY.raw}
        summaryClassName="text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <dl className="mt-2 grid gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-[max-content_1fr]">
          {([["action", a.action], ["record type", a.entity], ["record", a.entityKey], ["case", a.caseId], ["actor", a.actor], ["support session", a.supportSessionId], ["correlation id", a.correlationId]] as const)
            .filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt className="text-text-muted">{k}</dt><dd className="[overflow-wrap:anywhere]">{v}</dd></React.Fragment>)}
        </dl>
        {/* Focusable, so a keyboard can scroll a long detail (WCAG 2.1.1). */}
        <pre tabIndex={0} aria-label="Raw detail" className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface-raised p-2 font-mono text-xs outline-none [overflow-wrap:anywhere] focus-visible:ring-[3px] focus-visible:ring-ring/50" data-audit-detail>{a.detail === null || a.detail === undefined ? "No detail on this line." : JSON.stringify(a.detail, null, 2)}</pre>
      </FoldOut>
    </div>
  );
}

/** BR-13 (break M2, round 2): who an address's filters belong to. Each history entry of this page is stamped with the
 *  signed-in person who set or first read its filters (history state, never the address, so a link sent to a colleague
 *  carries no one's id). An entry stamped for someone else (Back after a sign-out and a new sign-in in the same tab) is
 *  opened without its filters; an unstamped one (a link from mail, a new tab) keeps them: its sender chose them. */
type Stamp = { auditOwner?: string; auditCleared?: boolean } | null;
const ownerOf = (state: unknown) => (state && typeof state === "object" && typeof (state as Stamp & object).auditOwner === "string" ? (state as { auditOwner: string }).auditOwner : null);

function ActivityLog({ owner }: { owner: string }) {
  const location = useLocation(), cleared = !!(location.state as Stamp)?.auditCleared;
  const token = useStaffToken(), qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // C9: the log's zone. AUD-4's answer carries none today, so times are UTC and the sentence says so; never the browser's zone.
  const [zone, setZone] = React.useState("UTC");
  const f = readFilters(params, zone), problem = rangeProblem(f, zone);
  // BR-3: a range the page cannot read is stopped on its field and the list stays as it was (the last range that could be read).
  const [read, setRead] = React.useState<Filters | null>(problem ? null : f);
  const key = read ? apiQuery(read, zone) : "";
  if (!problem && apiQuery(f, zone) !== key) setRead(f);
  const q = useInfiniteQuery({
    queryKey: ["pf", "audit", "lines", token, key], enabled: !!token && !!read, retry: false, initialPageParam: "", placeholderData: keepPreviousData,
    staleTime: 0,   // a log is read fresh: going back to a filter seen before asks again
    queryFn: async ({ pageParam }) => Page.parse(await staffApi(`/platform/audit?${apiQuery(read!, zone, pageParam || undefined)}`)),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const keep = useQuery({ queryKey: ["pf", "audit", "keep", token], enabled: !!token, retry: false, staleTime: Infinity, queryFn: async () => KeepPeriods.parse(await staffApi("/platform/keep-periods")).activityLog });
  const first = q.data?.pages[0];
  React.useEffect(() => { if (first?.timeZone && first.timeZone !== zone) setZone(first.timeZone); }, [first?.timeZone, zone]);
  const names: Names = React.useMemo(() => ({ people: first?.people ?? [], areas: first?.areas ?? [], actions: first?.actions ?? [] }), [first]);
  const lines = React.useMemo(() => q.data?.pages.flatMap((p) => p.lines) ?? [], [q.data]);

  const [said, setSaid] = React.useState("");
  const [tipHidden, setTipHidden] = React.useState(false);
  const set = (patch: Partial<Filters>) => setParams(writeFilters({ ...f, ...patch }, zone), { replace: true, state: { auditOwner: owner } });
  // Removing a chip or clearing the filters keeps the keyboard where it was (review round 1, Minor 2): on the chip that took the
  // removed one's place, else the one before it, else the filters' own box, never the page's start.
  const filtersBox = React.useRef<HTMLElement>(null), refocus = React.useRef<number | "box" | null>(null);
  const clear = () => { refocus.current = "box"; set({ ...defaults(zone), from: f.from, to: f.to }); };
  const removeChip = (key: keyof Filters, at: number) => { refocus.current = at; set({ [key]: key === "ours" ? false : "" }); };
  const chips = activeFilters(f, names), advancedSet = ADVANCED.filter((k) => f[k]).length;
  React.useEffect(() => {
    const at = refocus.current; if (at === null) return; refocus.current = null;
    const left = filtersBox.current?.querySelectorAll<HTMLElement>("[data-audit-chip]") ?? [];
    (typeof at === "number" && left.length ? left[Math.min(at, left.length - 1)] : filtersBox.current)?.focus();
  }, [chips.length]);
  // BR-12: Advanced opens by itself when one of its filters is set (also from the address); the person can still close it.
  const [advanced, setAdvanced] = React.useState(advancedSet > 0);
  React.useEffect(() => { if (advancedSet > 0) setAdvanced(true); }, [advancedSet]);
  // C8 (Minor 7): the shortcut clears Person and Done by (both name firm staff and would always give an empty list), and says so.
  const shortcut = () => {
    if (f.ours) return set({ ours: false });
    const cleared = [f.person ? "Person filter cleared." : "", f.actorType ? "Done by filter cleared." : ""].filter(Boolean).join(" ");
    sayAfter.current = cleared; set({ ours: true, person: "", actorType: "" });
  };

  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  // After Show more, focus moves to the first new line and the count is said (concept §4).
  const body = React.useRef<HTMLDivElement>(null), focusLine = React.useRef<string | null>(null);
  const more = async () => {
    const had = lines.length, r = await q.fetchNextPage(), now = r.data?.pages.flatMap((p) => p.lines) ?? [];
    if (now.length > had) { focusLine.current = now[had].id; setSaid(`Showing ${now.length} lines`); }
  };
  React.useEffect(() => {
    if (!focusLine.current) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-audit-when="${focusLine.current}"]`);
    if (el) { focusLine.current = null; el.focus(); }
  }, [lines.length]);

  // BR-6: one confirm, one file, one new line; Export stays where focus is and does nothing more until the file has come.
  const [asking, setAsking] = React.useState(false), [exporting, setExporting] = React.useState(false), busy = React.useRef(false);
  const [exportError, setExportError] = React.useState<{ title: string; words: string } | null>(null);
  const exportButton = React.useRef<HTMLButtonElement>(null);
  // The shared Dialog has no trigger to return to: when the confirm closes (Cancel, Escape or the export itself), focus goes back to Export CSV.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (asking) { asked.current = true; return; }
    if (!asked.current) return;
    asked.current = false; const t = setTimeout(() => exportButton.current?.focus(), 0); return () => clearTimeout(t);
  }, [asking]);
  // m3, m6: a change of filters takes away the last export's refusal and the last status words; words said for the change
  // itself (the shortcut's "Person filter cleared.") are said after it.
  const sayAfter = React.useRef("");
  React.useEffect(() => { setExportError(null); setSaid(sayAfter.current); sayAfter.current = ""; }, [key]);
  // m4: the confirm repeats the sentence in words, so it opens only once the list (and its names) has loaded.
  const canExport = !!read && !problem && !q.isError && !!q.data && !q.isPlaceholderData;
  const exportNow = async () => {
    if (busy.current || !read) return;
    busy.current = true; setExporting(true); setAsking(false); setExportError(null);
    const sent = staffToken();
    try {
      const res = await fetch(`/api/platform/audit/export?${apiQuery(read, zone)}`, { headers: { accept: "text/csv, application/problem+json", ...(sent ? { authorization: `Bearer ${sent}` } : {}) } });
      if (!res.ok) {
        const p = await res.json().catch(() => ({})) as { code?: string; title?: string; detail?: string; rows?: number; limit?: number };
        if (res.status === 401) { if (staffToken() === sent) endSession(p.code ?? "NOT_SIGNED_IN"); return; }
        setExportError(res.status === 413 && typeof p.rows === "number" && typeof p.limit === "number"
          ? { title: COPY.tooLarge, words: `${p.rows.toLocaleString("en-CA")} lines match; one export holds at most ${p.limit.toLocaleString("en-CA")}. Narrow the dates and export again.` }
          : res.status === 503 || res.status === 422 || res.status === 403 ? { title: p.title ?? COPY.exportFailed, words: p.detail ?? COPY.exportFailedTry } : { title: COPY.exportFailed, words: COPY.exportFailedTry });
        return;
      }
      const blob = await res.blob();
      if (staffToken() !== sent) return;   // the session ended while the file came: nothing of the last firm is saved (BR-13)
      const url = URL.createObjectURL(blob), a = document.createElement("a"), name = fileName(res.headers.get("content-disposition")), rows = res.headers.get("x-export-rows");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setSaid(`Export saved: ${name}${rows ? ` (${Number(rows).toLocaleString("en-CA")} lines)` : ""}. The export is now a line in the log.`);
      void qc.invalidateQueries({ queryKey: ["pf", "audit", "lines"] });   // the export is a new line under every filter that matches it
    } catch { setExportError({ title: COPY.exportFailed, words: COPY.exportFailedTry }); }
    finally { busy.current = false; setExporting(false); }
  };

  const readBack = read ? sentence(read, names, zone) : "";
  const person = (id: string | null) => (id ? names.people.find((p) => p.staffId === id) : undefined);
  const active = names.people.filter((p) => p.active), left = names.people.filter((p) => !p.active);
  const refused = q.error instanceof StaffApiError ? q.error : null;
  const firstUse = !!first && lines.length === 0 && chips.length === 0 && (first.actions?.length ?? 0) === 0;

  return (
    <Shell action={<Button ref={exportButton} variant="outline" aria-disabled={!canExport || exporting || undefined} className={cn((!canExport || exporting) && "opacity-60")}
      onClick={() => { if (canExport && !busy.current) setAsking(true); }} data-audit-export>{exporting ? "Exporting…" : "Export CSV"}</Button>}>
      <section ref={filtersBox} tabIndex={-1} aria-label="Filters" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-audit-filters>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start">
          <Field label="From" error={problem?.field === "from" ? problem.words : null}><Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} data-audit-filter="from" /></Field>
          <Field label="To" error={problem?.field === "to" ? problem.words : null}><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} data-audit-filter="to" /></Field>
          <Field label="Person"><Select value={f.person} onChange={(e) => set({ person: e.target.value })} data-audit-filter="person">
            <option value="">Everyone</option>
            {f.person && !names.people.some((p) => p.staffId === f.person) ? <option value={f.person}>A person not on this list</option> : null}
            {active.map((p) => <option key={p.staffId} value={p.staffId}>{p.name}</option>)}
            {left.map((p) => <option key={p.staffId} value={p.staffId}>{p.name} (left the firm)</option>)}
          </Select></Field>
          <Field label="Area"><Select value={f.area} onChange={(e) => set({ area: e.target.value })} data-audit-filter="area">
            <option value="">All areas</option>
            {f.area && !names.areas.some((a) => a.code === f.area) ? <option value={f.area}>{f.area}</option> : null}
            {names.areas.map((a) => <option key={a.code} value={a.code}>{a.words}</option>)}
          </Select></Field>
          {/* The tip shows on hover of the button or the tip itself and on keyboard focus, stays while the pointer is on it, and
              Escape hides it until focus or the pointer leaves (WCAG 1.4.13; review round 1 m3, round 2 R2-1). */}
          <div className="group relative flex flex-col gap-1.5" onMouseLeave={() => setTipHidden(false)} onBlur={() => setTipHidden(false)}
            onKeyDown={(e) => { if (e.key === "Escape" && !tipHidden) { e.stopPropagation(); setTipHidden(true); } }}><span className="text-xs font-medium text-text" aria-hidden>Shortcut</span>
            <Button variant={f.ours ? "default" : "outline"} aria-pressed={f.ours} aria-describedby="audit-shortcut-tip" onClick={shortcut} data-audit-shortcut>{COPY.shortcut}</Button>
            <span id="audit-shortcut-tip" role="tooltip" className={cn("invisible absolute top-full z-10 mt-1 max-w-64 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-md",
              !tipHidden && "group-hover:visible group-has-[:focus-visible]:visible")} data-audit-shortcut-tip>{COPY.shortcutTip}</span></div>
        </div>
        <div>
          <Button variant="ghost" size="sm" aria-expanded={advanced} aria-controls="audit-advanced" onClick={() => setAdvanced((o) => !o)} data-audit-advanced-toggle>
            <FoldArrow open={advanced} />Advanced filters{advancedSet ? ` (${advancedSet} set)` : ""}</Button>
          <div id="audit-advanced" hidden={!advanced} className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-audit-advanced>
            <Field label="Action"><Select value={f.action} onChange={(e) => set({ action: e.target.value })} data-audit-filter="action">
              <option value="">Any action</option>
              {f.action && !names.actions.some((a) => a.action === f.action) ? <option value={f.action}>{f.action}</option> : null}
              {names.actions.map((a) => <option key={a.action} value={a.action}>{a.words ?? `${a.action} (no name yet)`}</option>)}
            </Select></Field>
            <TextFilter label="Record type" name="entity" value={f.entity} onCommit={(v) => set({ entity: v })} />
            <TextFilter label="Record reference" name="entityKey" value={f.entityKey} onCommit={(v) => set({ entityKey: v })} />
            <Field label="Done by"><Select value={f.actorType} onChange={(e) => set({ actorType: e.target.value })} data-audit-filter="actorType">
              <option value="">Anyone</option>
              {f.actorType && !(f.actorType in DONE_BY) ? <option value={f.actorType}>{f.actorType}</option> : null}
              {Object.entries(DONE_BY).map(([code, words]) => <option key={code} value={code}>{words}</option>)}
            </Select></Field>
          </div>
        </div>
        {chips.length ? <ul aria-label="Filters set" className="flex flex-wrap gap-2" data-audit-chips>{chips.map((c, i) => <li key={c.key} className="min-w-0 max-w-full">
          <button type="button" onClick={() => removeChip(c.key, i)} aria-label={`Remove filter: ${c.words}`} data-audit-chip={c.key}
            className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs outline-none hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span className="min-w-0 truncate">{c.words}</span><X className="size-3 shrink-0" aria-hidden /></button></li>)}</ul> : null}
      </section>

      {cleared ? <Notice tone="info" title="Filters cleared"><span data-audit-filters-cleared>The filters in this address were set in an earlier session on this tab, so the page starts from the last 7 days.</span></Notice> : null}
      {exportError ? <Notice tone="danger" title={exportError.title}><span data-audit-export-error>{exportError.words}</span></Notice> : null}
      <p role="status" className="sr-only" data-audit-said>{said}</p>

      {!read ? null
        : refused?.status === 403 ? <Notice tone="info" title={COPY.noAccess}><span data-audit-no-access>{COPY.noAccessAsk}</span></Notice>
        : q.isError && !q.isFetchNextPageError ? (
          // A filter the server refuses (forced from the address) is shown in the server's words (DW2); anything else offers Retry.
          <Notice tone="danger" title={refused?.status === 422 ? refused.problem.title ?? "Check the filter" : COPY.loadFailed}
            action={refused?.status === 422 ? <Button variant="outline" size="sm" onClick={clear} data-audit-clear>Clear filters</Button> : <Button variant="outline" size="sm" onClick={() => void q.refetch()} data-audit-retry>Retry</Button>}>
            <span data-audit-error>{refused?.status === 422 ? refused.message : COPY.loadFailedTry}</span></Notice>)
        : !q.data ? (
          <div data-audit-loading><p role="status" className="sr-only">{COPY.loading}</p>
            <div aria-hidden className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-text/10" />)}</div></div>)
        : (
          <div ref={body} className={cn("flex flex-col gap-3", q.isPlaceholderData && "opacity-60")} aria-busy={q.isPlaceholderData || undefined} data-audit-list>
            <p className="text-sm [overflow-wrap:anywhere]" data-audit-sentence>Showing {readBack} — {lines.length === 0 ? "no lines" : q.hasNextPage ? `${lines.length} shown, more below` : `${lines.length} ${lines.length === 1 ? "line" : "lines"}`}.</p>
            {f.ours ? <p className="text-xs text-text-muted" data-audit-sessions>{COPY.sessions}</p> : null}
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center" data-audit-empty>
                <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{firstUse ? COPY.firstUse : emptyTitle(read, names)}</h2>
                <p className="mt-1 text-sm text-text-muted">{firstUse ? COPY.firstUseHelp : COPY.emptyHelp}</p>
                {chips.length ? <Button variant="outline" size="sm" className="mt-3" onClick={clear} data-audit-clear>Clear filters</Button> : null}
              </div>
            ) : (
              <Table label="Activity log lines, newest first" head={["When", "Who", "Area", "What happened"]} headClass={["w-px whitespace-nowrap", "hidden sm:table-cell", "hidden lg:table-cell", "w-full"]}>
                {lines.map((l) => {
                  const isOpen = open.has(l.id), p = person(l.staffId), t = when(l.at, zone);
                  return (
                    <React.Fragment key={l.id}>
                      <tr data-audit-line={l.id} className="h-11">
                        <td className="whitespace-nowrap">
                          {/* The When cell is the line's disclosure (concept §4): never a control hidden after a long summary. */}
                          <button type="button" aria-expanded={isOpen} aria-controls={`audit-open-${l.id}`} aria-label={`${t}: details of this line by ${l.who}`} onClick={() => toggle(l.id)} data-audit-when={l.id}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-left text-text-link outline-none hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50">
                            <time dateTime={l.at}>{t}</time><FoldArrow open={isOpen} /></button>
                        </td>
                        <td className="hidden w-40 min-w-40 max-w-48 sm:table-cell" data-audit-who><span className="block [overflow-wrap:break-word]">{l.who}</span>
                          {p && !p.active ? <span className="block text-xs text-text-muted">(left the firm)</span> : null}
                          {l.advanced.supportSessionId ? <Pill tone="info" className="mt-0.5">Support session</Pill> : null}</td>
                        <td className="hidden whitespace-nowrap lg:table-cell">{l.areaWords}</td>
                        <td className="w-full max-w-0">
                          <span className="block text-xs text-text-muted sm:hidden">{l.who}{p && !p.active ? " (left the firm)" : ""}</span>
                          <span className="block truncate" data-audit-summary>{l.summary}</span>
                          {l.changes.length ? <span className="mt-0.5 block truncate font-mono text-xs text-text-muted" data-audit-chip-change>{l.changes[0].words}{l.changes.length > 1 ? ` (+${l.changes.length - 1} more)` : ""}</span> : null}
                          <span className="block text-xs text-text-muted lg:hidden">{l.areaWords}</span>
                        </td>
                      </tr>
                      {isOpen ? <tr><td colSpan={4} id={`audit-open-${l.id}`} className="bg-surface/60"><OpenLine line={l} zone={zone} person={p} onOnlyPerson={(id) => set({ person: id })} /></td></tr> : null}
                    </React.Fragment>
                  );
                })}
              </Table>
            )}
            {q.isFetchNextPageError ? <Notice tone="danger" title="Could not load more">{refused ? refused.message : "Please try again."}</Notice> : null}
            {q.hasNextPage ? <Button variant="outline" className="self-start" busy={q.isFetchingNextPage} onClick={() => void more()} data-audit-more>Show more</Button> : null}
          </div>
        )}
      {keep.data ? <p className="text-xs text-text-muted" data-audit-keep>{keep.data}</p> : null}

      <Dialog open={asking} onOpenChange={setAsking} title={COPY.exportAsk} description={COPY.exportRecorded}
        footer={<><Button variant="outline" onClick={() => setAsking(false)} data-audit-export-cancel>Cancel</Button><Button onClick={() => void exportNow()} data-audit-export-confirm>Export CSV</Button></>}>
        <p className="text-sm [overflow-wrap:anywhere]" data-audit-export-sentence>{readBack ? `${readBack[0].toUpperCase()}${readBack.slice(1)}.` : ""} {COPY.exportFull}</p>
      </Dialog>
    </Shell>
  );
}

function Gate() {
  const me = usePlatformStaff(), location = useLocation(), navigate = useNavigate();
  const owner = `${me.firmId}:${me.staffId}`, stamped = ownerOf(location.state), foreign = stamped !== null && stamped !== owner;
  // Stamp this entry for this person (an unstamped one keeps its filters); an entry of someone else's opens without them.
  React.useLayoutEffect(() => {
    if (foreign) navigate({ pathname: location.pathname, search: "" }, { replace: true, state: { auditOwner: owner, auditCleared: location.search !== "" } });
    else if (stamped === null) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { auditOwner: owner } });
  }, [foreign, stamped, owner, location.pathname, location.search, navigate]);
  if (!me.keys.includes(AUDIT_KEY)) return <NoAccess />;
  // Nothing is drawn from another person's address, not even for one frame. Keyed by the person: nothing a page held for one
  // session is shown to the next (BR-13).
  return foreign ? null : <ActivityLog key={owner} owner={owner} />;
}

export function ActivityLogPage() {
  return <PlatformFrame crumbs={[{ label: "Activity log" }]}><Gate /></PlatformFrame>;
}
