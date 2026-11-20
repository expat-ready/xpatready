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
import { ConflictCheck, ConflictMatch, MATCHED_ON, RESULTS, resultLabel } from "./contract";
import { z } from "zod";

const ForConfirmation = ConflictCheck.extend({ confirmedByName: z.string().nullable().optional(), matchesNow: z.array(ConflictMatch), hiddenNow: z.number() });
const path = (id: string) => `/front-office/conflict-checks/${encodeURIComponent(id)}`;

function ConfirmBody({ id }: { id: string }) {
  const qc = useQueryClient(), key = ["fo", "conflict-check", id];
  const one = useQuery({ queryKey: key, retry: false, queryFn: async () => ForConfirmation.parse(await staffApi(`${path(id)}/for-confirmation`)) });
  const [result, setResult] = React.useState(""), [disclosure, setDisclosure] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [general, setGeneral] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const confirm = useMutation({
    mutationFn: () => staffApi(`${path(id)}/confirm`, { method: "POST", json: { result: result || undefined, disclosureText: result === "POTENTIAL_CONFLICT" ? disclosure : undefined } }),
    onSuccess: (r) => { setDone(resultLabel((r as { result?: string | null })?.result ?? result)); void qc.invalidateQueries({ queryKey: ["fo", "conflict-checks"] }); },
    onError: (e) => {
      if (!(e instanceof StaffApiError)) { setGeneral("Could not reach the server. Confirm again to retry."); return; }
      // Confirmed meanwhile, or the result is already fixed (m7): the server's words, and the check read again.
      if (e.problem.code === "ALREADY_CONFIRMED" || e.problem.code === "RESULT_FIXED") void one.refetch();
      const fields = e.problem.fields ?? {};
      setErrors(fields); setGeneral(Object.keys(fields).length ? null : e.message);
    },
  });
  if (done) return <div data-confirmed><Notice tone="ok" title={`Check confirmed: ${done}.`}>The checker's page shows it now.</Notice></div>;
  if (one.isPending) return <Loading label="Loading the conflict check" rows={2} />;
  if (one.isError) return <div data-confirm-refused><Notice tone="danger" title={one.error instanceof StaffApiError ? one.error.message : "Could not load the check."} /></div>;
  const c = one.data, fixed = c.result;
  return (
    <form onSubmit={(e) => { e.preventDefault(); confirm.mutate(); }} noValidate className="flex flex-col gap-4">
      <section aria-labelledby="fo-confirm-check" className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
        <h2 id="fo-confirm-check" className="text-sm font-semibold">The check</h2>
        <p className="mt-1" data-searched>Searched for {[c.searched.name, c.searched.email, c.searched.phone].filter(Boolean).join(" · ")}</p>
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
      </section>
      {general ? <Notice tone="danger" title={general} /> : null}
      <fieldset disabled={confirm.isPending} className="flex flex-col gap-2">
        <legend className="text-xs font-medium">Result</legend>
        {fixed ? <p className="text-sm" data-fixed-result>The checker recorded: {resultLabel(fixed)}. Confirming keeps it.</p>
          : RESULTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="fo-confirm-result" className="size-4" checked={result === k} onChange={() => { setResult(k); setErrors({}); }} />{l}</label>)}
        {errors.result ? <p role="alert" className="text-xs text-text-danger">{errors.result}</p> : null}
      </fieldset>
      {result === "POTENTIAL_CONFLICT" && !fixed ? (
        <Field label="Disclosure" hint="Printed in the retainer the client signs." error={errors.disclosureText}>
          <Textarea rows={4} maxLength={10000} value={disclosure} onChange={(e) => { setDisclosure(e.target.value); setErrors({}); }} />
        </Field>
      ) : null}
      <div><Button type="submit" busy={confirm.isPending} data-confirm-check>Confirm check</Button></div>
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
