// FO-9s part 3 (R1.29; concept screens/FO-9s/concept.md r3 §4 S3, board design/fo9s-boards.html S3): the guided merge,
// one dialog in three steps over FO-9b part 2's `POST duplicates/review/:id/preview` and `.../merge` (key
// agent/prospect:merge). 1 Choose what to keep: which record stays, and per field a radio with the default said ("only
// value", "same", "newer"; AG-2-16 rules 1, 8; BR-8). 2 What moves: the preview's counts, nothing deleted (BR-9). 3
// Confirm: one sentence and "Merge 2 people". Back keeps the choices. The merge sends the preview's `updatedAt`, so a
// record changed meanwhile is refused (STALE_VERSION: "One of these records changed. Reload to see it." with Reload);
// any other refusal shows the server's sentence (HAS_MONEY, NEEDS_CASE_SIDE, KEPT_SEPARATE, MERGED_AWAY, NOT_LISTED);
// a server failure reads "Could not merge. Nothing changed." word for word (AG-2-16 §11). An answer lost on the way (the
// merge may have gone through) never says "Nothing changed": the list is read again and the person is told to check it
// (break r1 M1). Every refusal re-reads the list; one that cannot succeed again turns Merge 2 people off. Each step change
// moves focus to the step's heading and is announced (break r1 M2), so a held Enter never runs past a step.
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Notice } from "@/components/ui/controls";
import { Loading } from "../sales/loading";
import { staffApi, StaffApiError } from "../sales/session";
import { FIELD_LABEL, fieldWhy, Merged, MERGE_FAILED, MERGE_UNKNOWN, Preview, STALE_WORDS, type FieldPick, type ReviewPair } from "./review-contract";

type Step = 1 | 2 | 3;
const shown = (v: unknown) => (v === null || v === undefined || v === "" ? "Not given" : String(v));
const STEPS = ["Choose what to keep", "What moves", "Confirm"] as const;
/** "a, b and c" (review r1 minor). */
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** The preview's two warnings, in the server's own words (review.ts MONEY_LINE, CASE_SIDE_LINE). */
const MONEY_WORDS = "This person has invoices, payments, trust money or a tax setting; their records cannot be merged here yet. Nothing was merged.";
const CASE_WORDS = "This person has a case; merge them from the client record.";

export function MergeDialog({ pair, onClose, onMerged, onRefresh, returnFocus }: { pair: ReviewPair | null; onClose: () => void; onMerged: (survivorName: string, mergeRef: string) => void; onRefresh: () => void; returnFocus?: () => HTMLElement | null }) {
  const [survivor, setSurvivor] = React.useState<string>(""), [step, setStep] = React.useState<Step>(1);
  const [picks, setPicks] = React.useState<Record<string, FieldPick>>({}), [error, setError] = React.useState<{ text: string; stale: boolean; final: boolean } | null>(null);
  const [reset, setReset] = React.useState(false), heading = React.useRef<HTMLHeadingElement | null>(null), moved = React.useRef(false), sending = React.useRef(false);
  React.useEffect(() => { if (pair) { setSurvivor(pair.people[0].personId); setStep(1); setPicks({}); setError(null); setReset(false); moved.current = false; } }, [pair]);
  // Focus follows the step (break r1 M2): the new step's heading, never the footer button that changes under the finger.
  React.useEffect(() => { if (moved.current) heading.current?.focus(); }, [step]);
  const go = (s: Step) => { moved.current = true; setError(null); setStep(s); };
  const mine = !!pair && pair.people.some((x) => x.personId === survivor);   // never a preview of the last pair's survivor (break r1 m4)
  const preview = useQuery({
    enabled: mine, retry: false, staleTime: 0, gcTime: 0,
    queryKey: ["fo", "duplicates", "preview", pair?.id, survivor],
    queryFn: async () => Preview.parse(await staffApi(`/front-office/duplicates/review/${pair!.id}/preview`, { method: "POST", json: { survivorId: survivor } })),
  });
  const p = preview.data, nameOf = (id: string) => pair?.people.find((x) => x.personId === id)?.name ?? "";
  const card = (id: string) => { const x = pair?.people.find((y) => y.personId === id); return x ? `${x.name}${x.lead ? ` · ${x.lead}` : ""}` : ""; };
  const same = !!pair && pair.people[0].name === pair.people[1]?.name;   // same names: said with lead numbers (review r1 S2)
  const who = (id: string) => (same ? card(id) : nameOf(id));
  /** The name the survivor will carry: its first and last name as picked (review r1 S1). */
  const afterName = () => { if (!p) return ""; const v = (f: string) => { const r = p.fields.find((x) => x.field === f); return r ? (pickOf(f, r.pick) === "SURVIVOR" ? r.survivor : r.loser) : null; };
    return [v("givenNames"), v("familyName")].filter((x) => x !== null && x !== undefined && x !== "").join(" ") || nameOf(p.survivorId); };
  const pickOf = (f: string, d: FieldPick) => picks[f] ?? d;
  const merge = useMutation({
    mutationFn: async () => Merged.parse(await staffApi(`/front-office/duplicates/review/${pair!.id}/merge`, { method: "POST", json: {
      survivorId: p!.survivorId, choices: Object.fromEntries(p!.fields.map((f) => [f.field, pickOf(f.field, f.pick)])), updatedAt: p!.updatedAt } })),
    onSettled: () => { sending.current = false; },
    onSuccess: (m) => onMerged(afterName(), m.mergeRef),
    onError: (e) => {
      onRefresh();   // every refusal re-reads the list (break r1 M1, review r1 S3)
      if (!(e instanceof StaffApiError)) return setError({ text: MERGE_UNKNOWN, stale: false, final: true });   // no answer: it may have merged
      if (e.status === 401) return;   // the session ended: the frame shows the sign-in
      if (e.problem.code === "STALE_VERSION") return setError({ text: STALE_WORDS, stale: true, final: false });
      if (e.status >= 500 && e.status !== 503) return setError({ text: MERGE_FAILED, stale: false, final: false });   // the server's own failure: nothing changed
      setError({ text: e.message, stale: false, final: e.status !== 503 });   // 409 refusals cannot succeed again here; 503 is "try again"
    },
  });
  const reload = () => { setError(null); setPicks({}); go(1); void preview.refetch(); };
  const loserName = p ? who(p.loserId) : "", survivorName = p ? who(p.survivorId) : "";
  const moves = p ? [p.moves.leads && `${p.moves.leads} lead${p.moves.leads === 1 ? "" : "s"}`, p.moves.notes && `${p.moves.notes} note${p.moves.notes === 1 ? "" : "s"}`, p.moves.calls && `${p.moves.calls} call${p.moves.calls === 1 ? "" : "s"}`, p.moves.bookings && `${p.moves.bookings} booking${p.moves.bookings === 1 ? "" : "s"}`].filter(Boolean) as string[] : [];
  const blocked = !!p && (p.needsCaseSide || p.hasMoney);
  // One sentence once (batch 45594684150): a refusal re-reads the list, which refetches this preview, and the preview then
  // shows the same sentence as its warning; the refusal's copy is not shown again.
  const warned = [p?.hasMoney ? MONEY_WORDS : null, p?.needsCaseSide ? CASE_WORDS : null];
  const shownError = error && !warned.includes(error.text) ? error : null;
  const footer = <>
    <Button variant="ghost" disabled={merge.isPending} onClick={onClose}>Cancel</Button>
    {step > 1 ? <Button variant="outline" disabled={merge.isPending} onClick={() => go((step - 1) as Step)}>Back</Button> : null}
    {step < 3 ? <Button key="next" disabled={!p || blocked} onClick={() => go((step + 1) as Step)}>Next</Button>
      : <Button key="merge" busy={merge.isPending} disabled={!p || blocked || !!error?.stale || !!error?.final} onClick={() => { if (sending.current) return; sending.current = true; setError(null); merge.mutate(); }}>Merge 2 people</Button>}
  </>;
  return (
    // guard: a stray click outside (the dialog shrinks between steps) asks before dropping the choices (break r1 m1).
    <Dialog open={!!pair} wide guard onOpenChange={(o) => { if (!o && !merge.isPending) onClose(); }} returnFocus={returnFocus}
      title={pair ? `Merge ${pair.people.map((x) => (same ? card(x.personId) : x.name)).join(" and ")}` : ""} footer={footer}
      description={<ol className="flex flex-wrap gap-3" aria-label="Steps">{STEPS.map((t, i) => <li key={t} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "font-semibold text-text" : undefined}>{i + 1} · {t}</li>)}</ol>}>
      <div data-merge-dialog data-step={step} className="flex flex-col gap-4 text-sm">
        <h3 ref={heading} tabIndex={-1} data-step-heading className="font-medium outline-none">Step {step} of 3: {STEPS[step - 1]}</h3>
        <p className="sr-only" aria-live="polite">{moved.current ? `Step ${step} of 3: ${STEPS[step - 1]}` : ""}</p>
        {shownError ? <Notice tone="danger" title={shownError.text} action={shownError.stale ? <Button variant="outline" size="sm" onClick={reload}>Reload</Button> : undefined} /> : null}
        {preview.isPending ? <Loading label="Loading both records" rows={3} />
          : preview.isError ? <Notice tone="danger" title={preview.error instanceof StaffApiError ? preview.error.message : "Could not load both records."} action={<Button variant="outline" size="sm" onClick={() => void preview.refetch()}>Try again</Button>} />
            : <>
              {p!.hasMoney ? <Notice tone="warn" title={MONEY_WORDS} /> : null}
              {p!.needsCaseSide ? <Notice tone="warn" title={CASE_WORDS} /> : null}
              {step === 1 ? <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="sr-only">Choose what to keep</legend>
                <div role="radiogroup" aria-label="Which record stays" className="flex flex-wrap gap-4">
                  {pair!.people.map((x) => <label key={x.personId} className="flex min-w-0 items-center gap-2 break-words"><input type="radio" name="survivor" value={x.personId} checked={survivor === x.personId} onChange={() => { setReset(Object.keys(picks).length > 0); setSurvivor(x.personId); setPicks({}); }} /><span><span className="font-medium">{card(x.personId)}</span> stays</span></label>)}
                </div>
                {reset ? <p role="status" data-picks-reset className="text-xs text-text-muted">Your field choices were reset for the new record that stays.</p> : null}
                <p className="text-xs text-text-muted sm:hidden">Scroll the table sideways to see both records.</p>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Each field's value, both records">
                  <table className="w-full min-w-[34rem] text-left" aria-label="Each field's value">
                    <thead><tr className="text-xs text-text-muted"><th className="px-2 py-1 font-medium">Field</th><th className="px-2 py-1 font-medium">{card(p!.survivorId)} (stays)</th><th className="px-2 py-1 font-medium">{card(p!.loserId)} · keep this one instead</th><th className="px-2 py-1 font-medium">Why</th></tr></thead>
                    <tbody>{p!.fields.map((f) => {
                      const cur = pickOf(f.field, f.pick), label = FIELD_LABEL[f.field] ?? f.field;
                      const opt = (side: FieldPick, v: unknown) => <td className="px-2 py-1.5 align-top"><label className="flex items-start gap-2 [overflow-wrap:anywhere]"><input type="radio" name={`f-${f.field}`} aria-label={`${label}: keep ${shown(v)}`} checked={cur === side} onChange={() => { setReset(false); setPicks((x) => ({ ...x, [f.field]: side })); }} /><span className={v === null || v === "" ? "text-text-muted" : undefined}>{shown(v)}</span></label></td>;
                      return <tr key={f.field} data-merge-field={f.field} className="border-t border-border"><th scope="row" className="px-2 py-1.5 text-left font-medium align-top">{label}</th>{opt("SURVIVOR", f.survivor)}{opt("LOSER", f.loser)}<td className="px-2 py-1.5 align-top text-xs text-text-muted">{cur === f.pick ? fieldWhy(f, p!.updatedAt) : "your choice"}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </fieldset> : null}
              {step === 2 ? <section aria-label="What moves" data-merge-moves className="flex flex-col gap-2">
                <p className="font-medium">To {survivorName}</p>
                <p>{moves.length ? list(moves) : "No leads, notes, calls or bookings"} from {loserName}'s record.</p>
                <p>Consent records are copied and kept as they were. Identity and conflict checks stay on their record.</p>
                <p className="text-text-muted">No record is deleted: a value you chose not to keep stays on the merged-away record. You can undo this merge from the Merged tab while nothing new reaches {survivorName} from {loserName}'s record.</p>
              </section> : null}
              {step === 3 ? <p data-merge-confirm className="text-base">{loserName} will be merged into {survivorName}.{moves.length ? ` ${list(moves)} move.` : ""}</p> : null}
            </>}
      </div>
    </Dialog>
  );
}
