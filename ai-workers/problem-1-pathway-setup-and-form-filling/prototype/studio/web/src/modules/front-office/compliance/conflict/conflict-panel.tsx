// FO-13s part 2 PR A (concept screens/FO-13s2-conflict/concept.md rev 2, approved by the tech lead; BR-1..BR-9): the
// Conflict check section of the prospect page. Its status is the gate's own verdict (FO-13c's `clearance`), worded by the
// latest check (a potential conflict is never "Cleared", challenge M2); the history lists every check with who and when.
// "Run a check" opens a side panel that searches the client's own details (FO-13c `preview`; never typed, BR-2), shows the
// named matches, the server's hidden-matches and scope lines word for word (BR-3, BR-9), and records the result with one
// requestId per opening (BR-6). With any hidden match the result waits for a manager's confirmation (PR B's page).
// Insert-only (BR-1). Code SOR/2022-128 s. 5, 15, 16 (our product rule; the Code names no check step). Unconfirmed: no counsel.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Panel, Pill, Textarea } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { can } from "../../sales/contract";
import { useLock, useReturnFocus } from "../../sales/prospect-actions";
import { useStaff } from "../../sales/sales-frame";
import { Loading } from "../../sales/loading";
import { arrivedLabel } from "../../sales/time";
import { COMPANY_TERMS, CONFLICT_KEY, conflictKey, ConflictList, conflictPath, FIXED_BY_A_CHECK, MATCHED_ON, POTENTIAL_STATUS, Preview, RESULTS, resultLabel, RUN_REASON, type ConflictCheck, type ConflictMatch } from "./contract";

/** The prospect's checks and the gate's verdict (one query, shared with the Convert dialog). */
export function useConflictList(prospectId: string) {
  return useQuery({ queryKey: conflictKey(prospectId), retry: false, queryFn: async () => ConflictList.parse(await staffApi(conflictPath(prospectId))) });
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

function CheckRow({ c }: { c: ConflictCheck }) {
  const tone = c.result === "NO_CONFLICT" ? "ok" : c.result === "CONFLICT_CANNOT_ACT" ? "danger" : "warn";
  return (
    <li data-conflict-check={c.id} className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Pill tone={tone}><span data-result>{resultLabel(c.result)}</span></Pill>
        <p className="text-xs text-text-muted">{arrivedLabel(c.checkedAt)} by <span data-checked-by>{c.checkedByName ?? "a colleague"}</span></p>
      </div>
      <p className="mt-1 text-xs text-text-muted" data-counts>{c.matches.length} match{c.matches.length === 1 ? "" : "es"} named{c.hiddenCount ? `, ${c.hiddenCount} hidden` : ""}
        {c.confirmedAt ? ` · confirmed by ${c.confirmedByName ?? "a colleague"}, ${arrivedLabel(c.confirmedAt)}` : c.needsConfirmation ? " · waiting for a manager's confirmation" : ""}</p>
      {c.disclosureText ? <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" data-disclosure>{c.disclosureText}</p> : null}
      {c.matches.length || c.hiddenLine ? (
        <details className="mt-2"><summary className="cursor-pointer text-xs text-text-link">Matches</summary>
          <div className="mt-2 flex flex-col gap-2"><Matches matches={c.matches} label="Matches of this check" />{c.hiddenLine ? <p className="text-xs text-text-muted">{c.hiddenLine}</p> : null}</div>
        </details>
      ) : null}
    </li>
  );
}

function RunPanel({ open, onOpenChange, prospectId, corporate }: { open: boolean; onOpenChange: (o: boolean) => void; prospectId: string; corporate: boolean }) {
  const qc = useQueryClient(), toast = useToast(), lock = useLock();
  const [result, setResult] = React.useState(""), [disclosure, setDisclosure] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [general, setGeneral] = React.useState<string | null>(null);
  const requestId = React.useRef<string>(crypto.randomUUID());
  React.useEffect(() => { if (open) { setResult(""); setDisclosure(""); setErrors({}); setGeneral(null); requestId.current = crypto.randomUUID(); } }, [open]);   // one requestId per opening (BR-6)
  const preview = useQuery({ queryKey: [...conflictKey(prospectId), "preview"], enabled: open, retry: false, gcTime: 0,
    queryFn: async () => Preview.parse(await staffApi("/front-office/conflict-checks/preview", { method: "POST", json: { prospectId } })) });
  const hidden = (preview.data?.hiddenCount ?? 0) > 0;
  const save = useMutation({
    mutationFn: () => staffApi("/front-office/conflict-checks", { method: "POST", json: { requestId: requestId.current, prospectId, ...(hidden ? {} : { result: result || undefined, disclosureText: result === "POTENTIAL_CONFLICT" ? disclosure : undefined }) } }),
    onSuccess: () => { toast.push({ tone: "ok", text: "Conflict check recorded." }); void qc.invalidateQueries({ queryKey: conflictKey(prospectId) }); onOpenChange(false); },
    onError: (e) => {
      if (!(e instanceof StaffApiError)) { setGeneral("Could not reach the server. Save again to retry the same check."); return; }
      if (e.problem.code === "REQUEST_REUSED") requestId.current = crypto.randomUUID();
      // The search changed since the panel opened (break m2): search again and say the server's words.
      if (e.problem.code === "NEEDS_CONFIRMATION" || e.problem.fields?.result) void preview.refetch();
      const fields = e.problem.fields ?? {};
      setErrors(fields); setGeneral(Object.keys(fields).length ? null : e.message);
    },
    onSettled: () => lock.free(),
  });
  const submit = (ev?: React.FormEvent) => { ev?.preventDefault(); if (lock.take()) save.mutate(); };
  const s = preview.data?.searched;
  return (
    <Panel open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }} title="Run a conflict check" description="Searches past and current clients, prospects, leads and company contacts for this client."
      footer={<><Button variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button busy={save.isPending} disabled={!preview.data} type="submit" form="fo-conflict-form" data-save-check>{hidden ? "Record for confirmation" : "Save check"}</Button></>}>
      <form id="fo-conflict-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {general ? <Notice tone="danger" title={general} /> : null}
        {preview.isPending ? <Loading label="Searching" rows={2} />
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
            <fieldset disabled={hidden || save.isPending} aria-describedby={errors.result ? "fo-conflict-result-error" : undefined} className="flex flex-col gap-2">
              <legend className="text-xs font-medium">Result</legend>
              {RESULTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="fo-conflict-result" className="size-4" checked={result === k} onChange={() => { setResult(k); setErrors({}); }} />{l}</label>)}
              {hidden ? <p className="text-xs text-text-muted">A manager who may see the hidden matches gives the result.</p> : null}
              {errors.result ? <p id="fo-conflict-result-error" role="alert" className="text-xs text-text-danger">{errors.result}</p> : null}
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
  const [open, setOpen] = React.useState(false);
  const mayRun = can(me, CONFLICT_KEY);
  const panel = (o: boolean) => { if (o) focus.mark(); else focus.back(); setOpen(o); };
  return (
    <section id="fo-conflict" aria-labelledby="fo-conflict-title" data-conflict-panel tabIndex={-1} className="rounded-xl border border-border bg-surface-raised p-4 outline-none">
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
            {list.data.checks.length ? <ul className="flex flex-col gap-2" aria-label="Conflict checks, newest first">{list.data.checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul> : null}
          </div>
        )}
      {mayRun ? <RunPanel open={open} onOpenChange={panel} prospectId={prospectId} corporate={corporate} /> : null}
    </section>
  );
}

/** In the Convert dialog (BR-5; EXPERIENCE §2.8, challenge m5): the gate's reason before the click, and "Go to the conflict
 *  check" only for a refusal a new check fixes (never for the disclosure or consent refusals, whose fix is the retainer). */
export function ConvertConflictNote({ prospectId, onGo }: { prospectId: string; onGo: () => void }) {
  const list = useConflictList(prospectId);
  const c = list.data?.clearance;
  if (!c || c.ok) return null;
  return (
    <div data-convert-conflict={c.code} className="mb-3">
      <Notice tone={c.code === "CONFLICT_CANNOT_ACT" ? "danger" : "warn"} title={c.detail}
        action={FIXED_BY_A_CHECK.has(c.code) ? <Button size="sm" variant="outline" data-go-conflict onClick={onGo}>Go to the conflict check</Button> : undefined} />
    </div>
  );
}
