// FO-13s part 2 PR A (concept screens/FO-13s2-conflict/concept.md rev 2, approved by the tech lead; BR-1..BR-9): the
// Conflict check section of the prospect page. Its status is the gate's own verdict (FO-13c's `clearance`), worded by the
// latest check (a potential conflict is never "Cleared", challenge M2); the history lists every check with who and when.
// "Run a check" opens a side panel that searches the client's own details (FO-13c `preview`; never typed, BR-2), shows the
// named matches, the server's hidden-matches and scope lines word for word (BR-3, BR-9), and records the result with one
// requestId per opening (BR-6). With any hidden match the result waits for a manager's confirmation (PR B's page).
// Insert-only (BR-1). Code SOR/2022-128 s. 5, 15, 16 (our product rule; the Code names no check step). Unconfirmed: no counsel.
import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Panel, Pill, Textarea } from "@/components/ui/controls";
import { FoldOut } from "@/components/fold-out";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { can } from "../../sales/contract";
import { useLock, useReturnFocus } from "../../sales/prospect-actions";
import { useStaff } from "../../sales/sales-frame";
import { Loading } from "../../sales/loading";
import { arrivedLabel } from "../../sales/time";
import { COMPANY_TERMS, CONFLICT_KEY, conflictKey, ConflictList, conflictPath, CHOOSE_RESULT, FIXED_BY_A_CHECK, MATCHED_ON, POTENTIAL_STATUS, Preview, RESULT_TIP, RESULTS, resultLabel, RUN_REASON, type ConflictCheck, type ConflictMatch } from "./contract";

/** The prospect's checks and the gate's verdict (one query, shared with the Convert dialog). */
export function useConflictList(prospectId: string, fresh = false) {
  return useQuery({ queryKey: conflictKey(prospectId), retry: false, ...(fresh ? { refetchOnMount: "always" as const } : {}), queryFn: async () => ConflictList.parse(await staffApi(conflictPath(prospectId))) });
}

/** The status line (BR-5): the gate's refusal word for word, else worded by the latest check. */
export function ConflictStatus({ list }: { list: ConflictList }) {
  const latest = list.checks[0];
  if (!list.clearance.ok) return <div data-conflict-status={list.clearance.code}><Notice tone={list.clearance.code === "CONFLICT_CANNOT_ACT" ? "danger" : "warn"} title={list.clearance.detail} /></div>;
  if (latest?.result === "POTENTIAL_CONFLICT") return <div data-conflict-status="POTENTIAL"><Notice tone="warn" title={POTENTIAL_STATUS} /></div>;
  return <div data-conflict-status="CLEARED"><Notice tone="ok" title={`Cleared: no conflict found · ${latest?.checkedByName ?? "a colleague"}, ${latest ? arrivedLabel(latest.checkedAt) : ""}`} /></div>;
}

const why = (m: ConflictMatch) => m.matchedOn.map((k) => MATCHED_ON[k] ?? k).join(", ");
function Matches({ matches, label }: { matches: ConflictMatch[]; label: string }) {
  if (!matches.length) return <p className="text-sm text-text-muted" data-no-matches>No record you may open matches.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-1 text-sm">
      {matches.map((m) => (
        <li key={`${m.source}:${m.recordId}`} data-match={m.kind} className="flex flex-wrap justify-between gap-x-3 rounded-md border border-border px-2 py-1">
          <span className="min-w-0 [overflow-wrap:anywhere]">{m.displayName ?? "(no name)"}{m.source === "CASE" ? <span className="text-text-muted"> · case {m.caseNumber}{m.roleOnCase ? `, ${m.roleOnCase.toLowerCase().replace(/_/g, " ")}` : ""}</span> : null}</span>
          <span className="text-xs text-text-muted">matched on {why(m)}</span>
        </li>
      ))}
    </ul>
  );
}

/** BR-8 (PR B): the link the checker sends to a manager who may see every record (the confirm page). */
function WaitingLink({ id }: { id: string }) {
  const toast = useToast(), href = `/front-office/conflict-checks/${encodeURIComponent(id)}`;
  const failed = () => toast.push({ tone: "danger", text: "Could not copy: open the confirm page and copy its address instead." });
  const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(new URL(href, window.location.origin).toString()).then(() => toast.push({ tone: "ok", text: "Link copied." }), failed) : Promise.resolve(failed()));   // no clipboard API: say so (review m2, break m5)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs" data-waiting-link>
      <span className="text-text-muted">Send this link to a manager who may see every record:</span>
      <Link to={href} className="text-text-link hover:underline" data-confirm-link>Open the confirm page</Link>
      <Button size="sm" variant="outline" onClick={() => void copy()}>Copy link</Button>
    </p>
  );
}

function CheckRow({ c, latest }: { c: ConflictCheck; latest: boolean }) {   // only the latest check offers the confirm link (break m4)
  const tone = c.result === "NO_CONFLICT" ? "ok" : c.result === "CONFLICT_CANNOT_ACT" ? "danger" : "warn";
  return (
    <li data-conflict-check={c.id} className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Tooltip><TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pill tone={tone}><span data-result>{resultLabel(c.result)}</span></Pill></span>
        </TooltipTrigger><TooltipContent data-result-tip>{RESULT_TIP[c.result ?? "WAITING"]}</TooltipContent></Tooltip>
        <p className="text-xs text-text-muted">{arrivedLabel(c.checkedAt)} by <span data-checked-by>{c.checkedByName ?? "a colleague"}</span></p>
      </div>
      <p className="mt-1 text-xs text-text-muted" data-counts>{c.matches.length} match{c.matches.length === 1 ? "" : "es"} named{c.hiddenCount ? `, ${c.hiddenCount} hidden` : ""}
        {c.confirmedAt ? ` · confirmed by ${c.confirmedByName ?? "a colleague"}, ${arrivedLabel(c.confirmedAt)}` : c.needsConfirmation ? " · waiting for a manager's confirmation" : ""}</p>
      {c.disclosureText ? <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" data-disclosure>{c.disclosureText}</p> : null}
      {c.needsConfirmation && latest ? <WaitingLink id={c.id} /> : null}
      {c.matches.length || c.hiddenCount ? (
        <FoldOut className="mt-2" summaryClassName="text-xs text-text-link" summary="Matches">   {/* BK-2: the app's one fold-out */}
          <div className="mt-2 flex flex-col gap-2"><Matches matches={c.matches} label="Matches of this check" />
            {c.hiddenCount ? <p className="text-xs text-text-muted">{c.needsConfirmation && c.hiddenLine ? c.hiddenLine : `${c.hiddenCount} match${c.hiddenCount === 1 ? "" : "es"} with records you may not open.`}</p> : null}</div>
        </FoldOut>
      ) : null}
    </li>
  );
}

function RunPanel({ open, onOpenChange, prospectId, corporate, run }: { open: boolean; onOpenChange: (o: boolean) => void; prospectId: string; corporate: boolean; run: number }) {
  const qc = useQueryClient(), toast = useToast(), lock = useLock();
  const [result, setResult] = React.useState(""), [disclosure, setDisclosure] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [general, setGeneral] = React.useState<string | null>(null);
  // Mounted afresh for each opening (its key is the opening's number): one requestId and one search per opening (BR-6; review M2, r2-mn2).
  const requestId = React.useRef<string>(crypto.randomUUID()), body = React.useRef<HTMLFormElement>(null);
  // After a refusal has rendered, and once any search it started has ended, the first field in error takes focus, else the
  // error summary (BIC-13; break m4: Save was disabled, or the fields replaced by Loading, when the focus ran).
  const [focusTick, setFocusTick] = React.useState(0), wantsFocus = React.useRef(false), summary = React.useRef<HTMLDivElement>(null);
  const focusError = () => { wantsFocus.current = true; setFocusTick((x) => x + 1); };
  const preview = useQuery({ queryKey: [...conflictKey(prospectId), "preview", run], enabled: open, retry: false, gcTime: 0, staleTime: 0,
    queryFn: async () => Preview.parse(await staffApi("/front-office/conflict-checks/preview", { method: "POST", json: { prospectId } })) });
  const hidden = (preview.data?.hiddenCount ?? 0) > 0;
  const save = useMutation({
    mutationFn: () => staffApi("/front-office/conflict-checks", { method: "POST", json: { requestId: requestId.current, prospectId, ...(hidden ? {} : { result: result || undefined, disclosureText: result === "POTENTIAL_CONFLICT" ? disclosure : undefined }) } }),
    onSuccess: () => { toast.push({ tone: "ok", text: "Conflict check recorded." }); void qc.invalidateQueries({ queryKey: conflictKey(prospectId), exact: true }); onOpenChange(false); },   // the list only, not this opening's search (break m: one extra preview)
    onError: (e) => {
      if (!(e instanceof StaffApiError)) { setGeneral("Could not reach the server. Save again to retry the same check."); return; }
      if (e.problem.code === "REQUEST_REUSED") { requestId.current = crypto.randomUUID(); void qc.invalidateQueries({ queryKey: conflictKey(prospectId), exact: true }); }   // the first Save may have landed (breaker m2)
      // The search changed since the panel opened (break m2): search again and say the server's words.
      if (e.problem.code === "NEEDS_CONFIRMATION" || e.problem.fields?.result) void preview.refetch();
      const fields = e.problem.fields ?? {};
      setErrors(fields); setGeneral(Object.keys(fields).length ? null : e.message);
      focusError();
    },
    onSettled: () => lock.free(),
  });
  const searching = preview.isFetching || !preview.data;
  React.useEffect(() => {
    if (!wantsFocus.current || searching) return;
    wantsFocus.current = false;
    ((!hidden && body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')) || summary.current)?.focus();
  }, [focusTick, searching, hidden]);
  const submit = (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (searching) return;
    if (!hidden && !result) { setErrors({ result: CHOOSE_RESULT }); focusError(); return; }   // stopped on screen first (EXPERIENCE §2.8; review M1)
    if (lock.take()) save.mutate();
  };
  const dirty = !!result || !!disclosure.trim();
  const s = preview.data?.searched;
  return (
    <Panel open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }} confirmClose={() => !dirty || window.confirm("Discard the result you chose?")} title="Run a conflict check" description="Searches past and current clients, prospects, leads and company contacts for this client."
      footer={<><Button variant="ghost" disabled={save.isPending} onClick={() => { if (!dirty || window.confirm("Discard the result you chose?")) onOpenChange(false); }}>Cancel</Button>
        <Button busy={save.isPending} disabled={searching} type="submit" form="fo-conflict-form" data-save-check>{hidden ? "Record for confirmation" : "Save check"}</Button></>}>
      <form id="fo-conflict-form" ref={body} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {general || Object.keys(errors).length ? <div ref={summary} tabIndex={-1} data-refusal className="flex flex-col gap-2 outline-none">
          {general ? <Notice tone="danger" title={general} /> : null}
          {Object.keys(errors).length ? <div data-error-summary><Notice tone="danger" title="There is a problem"><ul className="list-disc pl-4">{Object.entries(errors).map(([k, v]) => <li key={k}>{({ result: "Result", disclosureText: "Disclosure" } as Record<string, string>)[k] ?? k}: {v}</li>)}</ul></Notice></div> : null}
        </div> : null}
        {preview.isFetching || preview.isPending ? <Loading label="Searching" rows={2} />
          : preview.isError ? <Notice tone="danger" title={preview.error instanceof StaffApiError ? preview.error.message : "Could not search."} action={<Button size="sm" variant="outline" onClick={() => void preview.refetch()}>Try again</Button>} />
          : (<>
            <section aria-labelledby="fo-conflict-searched" className="text-sm">
              <h3 id="fo-conflict-searched" className="text-xs font-medium">Searched for</h3>
              <p data-searched className="[overflow-wrap:anywhere]">{[s?.name, s?.email, s?.phone].filter(Boolean).join(" · ") || "(nothing to search)"}</p>
              {corporate ? <p className="text-xs text-text-muted">{COMPANY_TERMS}</p> : null}
            </section>
            <Matches matches={preview.data.matches} label="Matches found" />
            {preview.data.notStored ? <p className="text-xs text-text-muted" data-not-stored>{preview.data.notStored} more matches were found; the 200 strongest are kept.</p> : null}
            {preview.data.hiddenLine ? <div data-hidden-line><Notice tone="warn" title={`${preview.data.hiddenCount} hidden: ${preview.data.hiddenLine}`} /></div> : null}
            {preview.data.scope ? <p className="text-xs text-text-muted" data-scope>{preview.data.scope}</p> : null}
            <fieldset disabled={hidden || save.isPending} aria-describedby={errors.result ? "fo-conflict-result-error" : undefined} aria-invalid={errors.result ? true : undefined} tabIndex={errors.result ? -1 : undefined} className="flex flex-col gap-2 outline-none">
              <legend className="text-xs font-medium">Result</legend>
              {RESULTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="fo-conflict-result" className="size-4" checked={result === k} onChange={() => { setResult(k); setErrors({}); }} />{l}</label>)}
              {hidden ? <p className="text-xs text-text-muted">A manager who may see the hidden matches gives the result.</p> : null}
              {errors.result ? <p id="fo-conflict-result-error" className="text-xs text-text-danger">{errors.result}</p> : null}
            </fieldset>
            {result === "POTENTIAL_CONFLICT" && !hidden ? (
              <Field label="Disclosure" hint="Printed in the retainer the client signs." error={errors.disclosureText}>
                <Textarea rows={4} maxLength={10000} value={disclosure} onChange={(e) => { setDisclosure(e.target.value); setErrors({}); }} disabled={save.isPending} />
              </Field>
            ) : null}
          </>)}
      </form>
    </Panel>
  );
}

/** The Conflict check section of a prospect's page (full width; Individual and Corporate alike). */
export function ConflictCheckPanel({ prospectId, corporate }: { prospectId: string; corporate: boolean }) {
  const me = useStaff(), focus = useReturnFocus(), list = useConflictList(prospectId);
  const [open, setOpen] = React.useState(false), [run, setRun] = React.useState(0);
  const mayRun = can(me, CONFLICT_KEY);
  const panel = (o: boolean) => { if (o) { focus.mark(); setRun((x) => x + 1); } else focus.back(); setOpen(o); };
  return (
    <TooltipProvider delayDuration={250}><section id="fo-conflict" aria-labelledby="fo-conflict-title" data-conflict-panel tabIndex={-1} className="rounded-xl border border-border bg-surface-raised p-4 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fo-conflict-title" className="text-sm font-semibold">Conflict check</h2>
        {mayRun ? <Button size="sm" variant="outline" data-run-check onClick={() => panel(true)}>Run a check</Button> : null}
      </div>
      {list.isPending ? <div className="mt-2"><Loading label="Loading the conflict checks" rows={1} /></div>
        : list.isError ? <Notice tone="danger" className="mt-2" title={list.error instanceof StaffApiError ? list.error.message : "Could not load the conflict checks."} action={<Button size="sm" variant="outline" onClick={() => void list.refetch()}>Try again</Button>} />
        : (
          <div className="mt-2 flex flex-col gap-2">
            <ConflictStatus list={list.data} />
            {!mayRun ? <p className="text-xs text-text-muted" data-why-no-run>{RUN_REASON}</p> : null}
            {list.data.scope ? <p className="text-xs text-text-muted">{list.data.scope}</p> : null}
            {list.data.checks.length ? <ul className="flex flex-col gap-2" aria-label="Conflict checks, newest first">{list.data.checks.map((c, i) => <CheckRow key={c.id} c={c} latest={i === 0} />)}</ul> : null}
          </div>
        )}
      {mayRun ? <RunPanel key={run} run={run} open={open} onOpenChange={panel} prospectId={prospectId} corporate={corporate} /> : null}
    </section></TooltipProvider>
  );
}

/** In the Convert dialog (BR-5; EXPERIENCE §2.8, challenge m5): the gate's reason before the click, and "Go to the conflict
 *  check" only for a refusal a new check fixes (never for the disclosure or consent refusals, whose fix is the retainer). */
export function ConvertConflictNote({ prospectId, onGo }: { prospectId: string; onGo: () => void }) {
  const list = useConflictList(prospectId, true);   // read again as the dialog opens (breaker m1: another session may have changed the client)
  const c = list.data?.clearance;
  if (!c || c.ok) return null;
  return (
    <div data-convert-conflict={c.code} className="mb-3">
      <Notice tone={c.code === "CONFLICT_CANNOT_ACT" ? "danger" : "warn"} title={c.detail}
        action={FIXED_BY_A_CHECK.has(c.code) ? <Button size="sm" variant="outline" data-go-conflict onClick={onGo}>Go to the conflict check</Button> : undefined} />
    </div>
  );
}
