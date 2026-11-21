// FO-13s part 2 PR B (concept screens/FO-13s2-conflict/concept.md rev 2, approved; BR-8, challenge m7): the manager's page
// for a conflict check that waits for its confirmation, reached by the link the checker copies. It reads FO-13c's
// `for-confirmation` answer (the check, and its terms searched again with the confirmer's visibility: `matchesNow`), then
// gives the result once with `POST conflict-checks/:id/confirm`. The server decides who may confirm (another staff member
// who sees every record, or the firm's Owner or Admin) and answers 404 to anyone else; every refusal is shown in its words.
// After the confirmation the page says so and never links to the prospect, which a confirmer may not open (m7).
// Code SOR/2022-128 s. 5, 15, 16 (our product rule). Unconfirmed: no counsel.
import * as React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Textarea } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { SalesFrame } from "../../sales/sales-frame";
import { Loading } from "../../sales/loading";
import { arrivedLabel } from "../../sales/time";
import { CHOOSE_RESULT, ConflictCheck, ConflictMatch, MATCHED_ON, RESULTS, resultLabel } from "./contract";
import { useLock } from "../../sales/prospect-actions";
import { z } from "zod";

const ForConfirmation = ConflictCheck.extend({ confirmedByName: z.string().nullable().optional(), matchesNow: z.array(ConflictMatch), hiddenNow: z.number() });
const path = (id: string) => `/front-office/conflict-checks/${encodeURIComponent(id)}`;

function ConfirmBody({ id }: { id: string }) {
  const qc = useQueryClient(), key = ["fo", "conflict-check", id];
  const one = useQuery({ queryKey: key, retry: false, queryFn: async () => ForConfirmation.parse(await staffApi(`${path(id)}/for-confirmation`)) });
  const [result, setResult] = React.useState(""), [disclosure, setDisclosure] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [general, setGeneral] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null), [ended, setEnded] = React.useState<string | null>(null);
  const lock = useLock(), form = React.useRef<HTMLFormElement>(null), final = React.useRef<HTMLDivElement>(null), refusal = React.useRef<HTMLDivElement>(null);
  // The final notice takes focus (review m3), else the first field in error (BIC-13), else the refusal (break r2-m5).
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => { if (focusTick) (final.current ?? form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? refusal.current)?.focus(); }, [focusTick]);
  const confirm = useMutation({
    mutationFn: () => staffApi(`${path(id)}/confirm`, { method: "POST", json: { result: result || undefined, disclosureText: result === "POTENTIAL_CONFLICT" ? disclosure : undefined } }),
    onSuccess: (r) => { setDone(resultLabel((r as { result?: string | null })?.result ?? result)); setFocusTick((x) => x + 1); void qc.invalidateQueries({ queryKey: ["fo", "conflict-checks"] }); },
    onError: (e) => {
      if (!(e instanceof StaffApiError)) { setGeneral("Could not reach the server. Confirm again to retry."); setFocusTick((x) => x + 1); return; }
      // Confirmed meanwhile (another manager, or this page's own answer lost), or the result already fixed (m7): the
      // server's sentence is the end of the page; the check is not read again, since a confirmed check no longer waits (review M1).
      if (e.problem.code === "ALREADY_CONFIRMED" || e.problem.code === "RESULT_FIXED" || e.problem.code === "SUPERSEDED") { setEnded(e.message); setFocusTick((x) => x + 1); return; }
      if (e.status === 403) void one.refetch();   // hidden from this manager too now: read again, so Confirm switches off (break r2-m5)
      const fields = e.problem.fields ?? {};
      setErrors(fields); setGeneral(Object.keys(fields).length ? null : e.message);
      setFocusTick((x) => x + 1);
    },
    onSettled: () => lock.free(),
  });
  if (done || ended) return <div data-confirmed={done ? "" : undefined} data-confirm-ended={ended ? "" : undefined} ref={final} tabIndex={-1} className="outline-none">
    {done ? <Notice tone="ok" title={`Check confirmed: ${done}.`}>The checker sees it the next time their page is opened.</Notice> : <Notice tone="warn" title={ended ?? ""} />}</div>;
  if (one.isPending) return <Loading label="Loading the conflict check" rows={2} />;
  if (one.isError) {
    const e = one.error instanceof StaffApiError ? one.error : null;
    return <div data-confirm-refused={e?.problem.code ?? ""}><Notice tone={e?.status === 409 ? "warn" : "danger"} title={e ? e.message : "Could not load the check."}
      action={e ? undefined : <Button size="sm" variant="outline" onClick={() => void one.refetch()}>Try again</Button>} />
      {e?.status === 404 ? <p className="mt-2 text-sm text-text-muted" data-checker-hint>If you recorded a check that waits for its confirmation, send this page's address to a manager who may see every record, or to the firm's Owner or Admin: <span className="select-all font-mono [overflow-wrap:anywhere]">{window.location.origin + window.location.pathname}</span></p> : null}</div>;   // break r2-m4
  }
  const c = one.data, fixed = c.result, stillHidden = c.hiddenNow > 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixed && !result) { setErrors({ result: CHOOSE_RESULT }); setFocusTick((x) => x + 1); return; }   // on screen first, in plain words
    if (lock.take()) confirm.mutate();   // one Confirm at a time (review m4)
  };
  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <section aria-labelledby="fo-confirm-check" className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
        <h2 id="fo-confirm-check" className="text-sm font-semibold">The check</h2>
        <p className="mt-1 [overflow-wrap:anywhere]" data-searched>Searched for {[c.searched.name, c.searched.email, c.searched.phone].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-text-muted" data-checked-by>{arrivedLabel(c.checkedAt)} by {c.checkedByName ?? "a colleague"}</p>
      </section>
      <section aria-labelledby="fo-confirm-matches" className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 id="fo-confirm-matches" className="text-sm font-semibold">Matches, searched again with what you may see</h2>
        {c.matchesNow.length ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm">{c.matchesNow.map((m) => (
            <li key={`${m.source}:${m.recordId}`} data-match={m.kind} className="flex flex-wrap justify-between gap-x-3 rounded-md border border-border px-2 py-1">
              <span className="min-w-0 [overflow-wrap:anywhere]">{m.displayName ?? "(no name)"}{m.source === "CASE" ? <span className="text-text-muted"> · case {m.caseNumber}</span> : null}</span>
              <span className="text-xs text-text-muted">matched on {m.matchedOn.map((k) => MATCHED_ON[k] ?? k).join(", ")}</span>
            </li>))}</ul>
        ) : <p className="mt-2 text-sm text-text-muted">No record matches.</p>}
        {stillHidden ? <p className="mt-2 text-sm text-text-warn" data-still-hidden>{c.hiddenNow} match{c.hiddenNow === 1 ? " is" : "es are"} still hidden from you: a person who may see {c.hiddenNow === 1 ? "it" : "them"} confirms this check.</p> : null}
      </section>
      {general || Object.keys(errors).length ? <div ref={refusal} tabIndex={-1} data-refusal className="flex flex-col gap-2 outline-none">
      {general ? <Notice tone="danger" title={general} /> : null}
      {Object.keys(errors).length ? <div data-error-summary><Notice tone="danger" title="There is a problem"><ul className="list-disc pl-4">{Object.entries(errors).map(([k, v]) => <li key={k}>{k === "disclosureText" ? "Disclosure" : "Result"}: {v}</li>)}</ul></Notice></div> : null}
      </div> : null}
      <fieldset disabled={confirm.isPending || stillHidden} aria-describedby={errors.result ? "fo-confirm-result-error" : undefined} aria-invalid={errors.result ? true : undefined} tabIndex={errors.result ? -1 : undefined} className="flex flex-col gap-2 outline-none">
        <legend className="text-xs font-medium">Result</legend>
        {fixed ? <p className="text-sm" data-fixed-result>The checker recorded: {resultLabel(fixed)}. Confirming keeps it.</p>
          : RESULTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="fo-confirm-result" className="size-4" checked={result === k} onChange={() => { setResult(k); setErrors({}); }} />{l}</label>)}
        {errors.result ? <p id="fo-confirm-result-error" className="text-xs text-text-danger">{errors.result}</p> : null}
      </fieldset>
      {result === "POTENTIAL_CONFLICT" && !fixed ? (
        <Field label="Disclosure" hint="Printed in the retainer the client signs." error={errors.disclosureText}>
          <Textarea rows={4} maxLength={10000} value={disclosure} onChange={(e) => { setDisclosure(e.target.value); setErrors({}); }} />
        </Field>
      ) : null}
      <div><Button type="submit" busy={confirm.isPending} disabled={stillHidden} data-confirm-check>Confirm check</Button></div>
    </form>
  );
}

export function ConflictConfirmPage() {
  const { id = "" } = useParams();
  return (
    <SalesFrame crumbs={[{ label: "Conflict check" }]} back={null}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text">Confirm a conflict check</h1>
        <ConfirmBody id={id} />
      </div>
    </SalesFrame>
  );
}
