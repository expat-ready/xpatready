// FO-9s part 3 (R1.29; concept screens/FO-9s/concept.md r3 §4 S3, board design/fo9s-boards.html S3): the guided merge,
// one dialog in three steps over FO-9b part 2's `POST duplicates/review/:id/preview` and `.../merge` (key
// agent/prospect:merge). 1 Choose what to keep: which record stays, and per field a radio with the default said ("only
// value", "same", "newer"; AG-2-16 rules 1, 8; BR-8). 2 What moves: the preview's counts, nothing deleted (BR-9). 3
// Confirm: one sentence and "Merge 2 people". Back keeps the choices. The merge sends the preview's `updatedAt`, so a
// record changed meanwhile is refused (STALE_VERSION: "One of these records changed. Reload to see it." with Reload);
// any other refusal shows the server's sentence (HAS_MONEY, NEEDS_CASE_SIDE, KEPT_SEPARATE, MERGED_AWAY, NOT_LISTED);
// a failure with no answer reads "Could not merge. Nothing changed." word for word (AG-2-16 §11).
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Notice } from "@/components/ui/controls";
import { Loading } from "../sales/loading";
import { staffApi, StaffApiError } from "../sales/session";
import { FIELD_LABEL, fieldWhy, Merged, MERGE_FAILED, Preview, STALE_WORDS, type FieldPick, type ReviewPair } from "./review-contract";

type Step = 1 | 2 | 3;
const shown = (v: unknown) => (v === null || v === undefined || v === "" ? "Not given" : String(v));

export function MergeDialog({ pair, onClose, onMerged, returnFocus }: { pair: ReviewPair | null; onClose: () => void; onMerged: (survivorName: string, mergeRef: string) => void; returnFocus?: () => HTMLElement | null }) {
  const [survivor, setSurvivor] = React.useState<string>(""), [step, setStep] = React.useState<Step>(1);
  const [picks, setPicks] = React.useState<Record<string, FieldPick>>({}), [error, setError] = React.useState<{ text: string; stale: boolean } | null>(null);
  React.useEffect(() => { if (pair) { setSurvivor(pair.people[0].personId); setStep(1); setPicks({}); setError(null); } }, [pair]);
  const preview = useQuery({
    enabled: !!pair && !!survivor, retry: false, staleTime: 0, gcTime: 0,
    queryKey: ["fo", "duplicates", "preview", pair?.id, survivor],
    queryFn: async () => Preview.parse(await staffApi(`/front-office/duplicates/review/${pair!.id}/preview`, { method: "POST", json: { survivorId: survivor } })),
  });
  const p = preview.data, nameOf = (id: string) => pair?.people.find((x) => x.personId === id)?.name ?? "";
  const card = (id: string) => { const x = pair?.people.find((y) => y.personId === id); return x ? `${x.name}${x.lead ? ` · ${x.lead}` : ""}` : ""; };
  const pickOf = (f: string, d: FieldPick) => picks[f] ?? d;
  const merge = useMutation({
    mutationFn: async () => Merged.parse(await staffApi(`/front-office/duplicates/review/${pair!.id}/merge`, { method: "POST", json: {
      survivorId: p!.survivorId, choices: Object.fromEntries(p!.fields.map((f) => [f.field, pickOf(f.field, f.pick)])), updatedAt: p!.updatedAt } })),
    onSuccess: (m) => onMerged(nameOf(p!.survivorId), m.mergeRef),
    onError: (e) => setError(e instanceof StaffApiError && e.status !== 401
      ? { text: e.problem.code === "STALE_VERSION" ? STALE_WORDS : e.message, stale: e.problem.code === "STALE_VERSION" }
      : { text: MERGE_FAILED, stale: false }),
  });
  const reload = () => { setError(null); setPicks({}); setStep(1); void preview.refetch(); };
  const loserName = p ? nameOf(p.loserId) : "", survivorName = p ? nameOf(p.survivorId) : "";
  const moves = p ? [p.moves.leads && `${p.moves.leads} lead${p.moves.leads === 1 ? "" : "s"}`, p.moves.notes && `${p.moves.notes} note${p.moves.notes === 1 ? "" : "s"}`, p.moves.calls && `${p.moves.calls} call${p.moves.calls === 1 ? "" : "s"}`, p.moves.bookings && `${p.moves.bookings} booking${p.moves.bookings === 1 ? "" : "s"}`].filter(Boolean) as string[] : [];
  const blocked = !!p && (p.needsCaseSide || p.hasMoney);
  const footer = <>
    <Button variant="ghost" disabled={merge.isPending} onClick={onClose}>Cancel</Button>
    {step > 1 ? <Button variant="outline" disabled={merge.isPending} onClick={() => { setError(null); setStep((s) => (s - 1) as Step); }}>Back</Button> : null}
    {step < 3 ? <Button disabled={!p || blocked} onClick={() => setStep((s) => (s + 1) as Step)}>Next</Button>
      : <Button busy={merge.isPending} disabled={!p || blocked || !!error?.stale} onClick={() => { setError(null); merge.mutate(); }}>Merge 2 people</Button>}
  </>;
  return (
    <Dialog open={!!pair} wide onOpenChange={(o) => { if (!o && !merge.isPending) onClose(); }} returnFocus={returnFocus}
      title={pair ? `Merge ${pair.people.map((x) => x.name).join(" and ")}` : ""} footer={footer}
      description={<ol className="flex flex-wrap gap-3" aria-label="Steps">{(["Choose what to keep", "What moves", "Confirm"] as const).map((t, i) => <li key={t} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "font-semibold text-text" : undefined}>{i + 1} · {t}</li>)}</ol>}>
      <div data-merge-dialog data-step={step} className="flex flex-col gap-4 text-sm">
        {error ? <Notice tone="danger" title={error.text} action={error.stale ? <Button variant="outline" size="sm" onClick={reload}>Reload</Button> : undefined} /> : null}
        {preview.isPending ? <Loading label="Loading both records" rows={3} />
          : preview.isError ? <Notice tone="danger" title={preview.error instanceof StaffApiError ? preview.error.message : "Could not load both records."} action={<Button variant="outline" size="sm" onClick={() => void preview.refetch()}>Try again</Button>} />
            : <>
              {p!.hasMoney ? <Notice tone="warn" title="This person has invoices, payments, trust money or a tax setting; their records cannot be merged here yet. Nothing was merged." /> : null}
              {p!.needsCaseSide ? <Notice tone="warn" title="This person has a case; merge them from the client record." /> : null}
              {step === 1 ? <fieldset className="flex flex-col gap-3">
                <legend className="sr-only">Choose what to keep</legend>
                <div role="radiogroup" aria-label="Which record stays" className="flex flex-wrap gap-4">
                  {pair!.people.map((x) => <label key={x.personId} className="flex items-center gap-2"><input type="radio" name="survivor" checked={survivor === x.personId} onChange={() => { setSurvivor(x.personId); setPicks({}); }} /><span><span className="font-medium">{card(x.personId)}</span> stays</span></label>)}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left" aria-label="Each field's value">
                    <thead><tr className="text-xs text-text-muted"><th className="px-2 py-1 font-medium">Field</th><th className="px-2 py-1 font-medium">{card(p!.survivorId)} (stays)</th><th className="px-2 py-1 font-medium">{card(p!.loserId)}</th><th className="px-2 py-1 font-medium">Why</th></tr></thead>
                    <tbody>{p!.fields.map((f) => {
                      const cur = pickOf(f.field, f.pick), label = FIELD_LABEL[f.field] ?? f.field;
                      const opt = (side: FieldPick, v: unknown) => <td className="px-2 py-1.5 align-top"><label className="flex items-start gap-2 [overflow-wrap:anywhere]"><input type="radio" name={`f-${f.field}`} aria-label={`${label}: keep ${shown(v)}`} checked={cur === side} onChange={() => setPicks((x) => ({ ...x, [f.field]: side }))} /><span className={v === null || v === "" ? "text-text-muted" : undefined}>{shown(v)}</span></label></td>;
                      return <tr key={f.field} data-merge-field={f.field} className="border-t border-border"><th scope="row" className="px-2 py-1.5 text-left font-medium align-top">{label}</th>{opt("SURVIVOR", f.survivor)}{opt("LOSER", f.loser)}<td className="px-2 py-1.5 align-top text-xs text-text-muted">{cur === f.pick ? fieldWhy(f) : "your choice"}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </fieldset> : null}
              {step === 2 ? <section aria-label="What moves" data-merge-moves className="flex flex-col gap-2">
                <h3 className="font-medium">What moves to {survivorName}</h3>
                <p>{moves.length ? moves.join(", ") : "No leads, notes, calls or bookings"} from {loserName}'s record.</p>
                <p>Consent records are copied and kept as they were. Identity and conflict checks stay on their record.</p>
                <p className="text-text-muted">Nothing is deleted. You can undo this merge from the Merged tab while nothing new reaches {survivorName} from {loserName}'s record.</p>
              </section> : null}
              {step === 3 ? <p data-merge-confirm className="text-base">{loserName} will be merged into {survivorName}.{moves.length ? ` ${moves.join(", ")} move.` : ""}</p> : null}
            </>}
      </div>
    </Dialog>
  );
}
