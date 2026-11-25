// FO-4 part 2a (concept r2 §4 screens 4-5; BR-8, BR-9, BR-10, BR-11; AG-2-26, AG-2-44, AG-2-47): one prospect. Its
// stage, value and owner; "Move to…" (never Won); Mark lost (a right panel: a reason from the firm's prospect list is
// required); Convert to client (a yes/no with AG-02's warning while no retainer is signed) and Undo convert (offered
// only for a Convert with no signed retainer, with a reason; the server also refuses once the client is no longer
// empty). Each button follows its permission key and the stage. Log a call, notes and the timeline are part 2b.
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Panel, Pill, Select, Textarea } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { centsOf, CURRENCIES, CURRENCY_REFUSED } from "../../../../../contracts/currencies";
import { Board, can, KEY, LostReasons, money, Prospect, ValueCurrencies } from "./contract";
import { Loading } from "./loading";
import { MoveMenu, STALE_NOTE, useLock, useMove, useOwners, useReturnFocus } from "./prospect-actions";
import { PersonEmail } from "./person-email";
import { SalesFrame, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";
import { arrivedLabel } from "./time";
import { IdentityCheckPanel } from "../compliance/identity/identity-panel";
import { ConflictCheckPanel, ConvertConflictNote, useConflictList } from "../compliance/conflict/conflict-panel";
import { FIXED_BY_A_CHECK } from "../compliance/conflict/contract";
import { RetainerCard } from "../retainers/retainer-card";
import { SignatureRequestsSection } from "../sign/signature-requests";
/** AG-2-47 rule 16's words, shown before Convert while no retainer is signed (the same text the server answers with). */
const NOT_SIGNED = "Retainer not signed. Work can start. Invoices will warn you, and the case will show a warning.";
type Act = "lost" | "convert" | "undo" | "value";
/** Focuses a section once the dialog has gone (the dialog gives focus back to its trigger as it closes; FO-13s m5). */
const focusWhenClosed = (id: string) => { const t0 = Date.now(); const tick = () => { if (document.querySelector('[role="dialog"]') && Date.now() - t0 < 2000) { requestAnimationFrame(tick); return; } setTimeout(() => document.getElementById(id)?.focus(), 80); }; requestAnimationFrame(tick); };
/** A currency as its code and its name ("CAD, Canadian Dollar"); the code alone when the browser has no name for it. */
const NAMES = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en-CA"], { type: "currency" }) : null;
const currencyLabel = (c: string) => { const n = NAMES?.of(c); return n && n !== c ? `${c}, ${n}` : c; };
const DONE: Record<Act, (p: Prospect) => string> = { value: (p) => (p.valueCents === null ? `The value of ${p.number} is cleared.` : `The value of ${p.number} is ${money(p.valueCents, p.currency)}.`), lost: (p) => `${p.number} is marked lost.`, convert: (p) => `${p.number} is now a client.`, undo: (p) => `Convert undone. ${p.number} is back in ${p.stage.label}.` };
function ProspectBody({ id }: { id: string }) {
  const me = useStaff(), owners = useOwners(), move = useMove(), toast = useToast(), qc = useQueryClient();
  const key = ["fo", "prospects", "one", id];
  const one = useQuery({ queryKey: key, retry: false, queryFn: async () => Prospect.parse(await staffApi(`/front-office/prospects/${encodeURIComponent(id)}`)) });
  const verdict = useConflictList(id).data?.clearance, conflictRefused = verdict?.ok === false;   // FO-13s: "Work can start" never shows under a conflict refusal (challenge m5)
  const noteCode = verdict && !verdict.ok ? verdict.code : null;
  const board = useQuery({ queryKey: ["fo", "prospects", "board"], queryFn: async () => Board.parse(await staffApi("/front-office/pipelines/INDIVIDUAL/board")) });
  const [open, setOpen] = React.useState<Act | null>(null);
  const [reasonId, setReasonId] = React.useState(""), [text, setText] = React.useState(""), [error, setError] = React.useState<{ field: string | null; text: string; code?: string } | null>(null);
  const reasons = useQuery({ enabled: open === "lost", queryKey: ["fo", "lost-reasons"], queryFn: async () => LostReasons.parse(await staffApi("/front-office/prospects/lost-reasons")) });
  const lock = useLock(), focus = useReturnFocus();
  const [currency, setCurrency] = React.useState("");
  // The firm's default currency, for a prospect with no value yet (it is CAD until the answer is in, as the server's default is).
  const firmCurrency = useQuery({ queryKey: ["fo", "prospect-currencies"], queryFn: async () => ValueCurrencies.parse(await staffApi("/front-office/prospect-currencies")) }).data?.default ?? "CAD";
  const firstCurrency = (v: Prospect) => (v.valueCents === null ? firmCurrency : v.currency);
  // The Value panel opens on what is stored: the amount as typed digits (never grouped) and the prospect's currency.
  const start = (a: Act | null) => {
    if (a) focus.mark(); else if (open) focus.back();
    const v = a === "value" ? one.data : undefined;
    setOpen(a); setReasonId(""); setText(v && v.valueCents !== null ? (v.valueCents / 100).toFixed(2) : ""); setCurrency(v ? firstCurrency(v) : ""); setError(null);
  };
  const act = useMutation({
    mutationFn: async (a: Act) => {
      // FO-2pv: the value and its currency go together in one PATCH; an empty amount clears the value.
      if (a === "value") return { a, p: Prospect.parse(await staffApi(`/front-office/prospects/${id}`, { method: "PATCH", json: { value: text.trim() === "" ? null : text.trim(), currency } })) };
      const version = one.data!.version, path = `/front-office/prospects/${id}/${a === "lost" ? "lost" : a === "convert" ? "convert" : "undo-convert"}`;
      const json = a === "lost" ? { reasonId, note: text.trim() || undefined, version } : a === "convert" ? { version } : { reason: text, version };
      return { a, p: Prospect.parse(await staffApi(path, { method: "POST", json })) };
    },
    onSuccess: ({ a, p }) => { qc.setQueryData(key, p); start(null); toast.push({ tone: "ok", text: DONE[a](p) }); },
    onError: (e, a) => {
      if (e instanceof StaffApiError && (e.problem.code ?? "").startsWith("CONFLICT_")) void qc.invalidateQueries({ queryKey: ["fo", "conflict-checks", id], exact: true });   // FO-13s: the gate's verdict read again
      const stale = e instanceof StaffApiError && e.problem.code === "STALE";
      // Someone acted first (stale, or it is already lost or won): the panel closes, since its action no longer applies.
      if (e instanceof StaffApiError && ["STALE", "TERMINAL", "ALREADY_WON", "NOT_WON"].includes(e.problem.code ?? "")) { start(null); toast.push({ tone: "danger", text: stale ? `${e.message.replace(/ Reload it\.$/, "")} ${STALE_NOTE}` : e.message }); return; }
      const field = e instanceof StaffApiError ? (["reasonId", "reason", "value", "currency"].find((f) => e.field(f)) ?? null) : null;
      // A refusal about a field stays on the field, with what was typed kept (BIC-13); any other is said at the top of
      // the panel; the prospect is read again either way.
      setError({ field, text: !(e instanceof StaffApiError) ? "Could not save. Please try again." : field === "reasonId" && a === "lost" ? "Choose why it was lost." : e.message, code: e instanceof StaffApiError ? e.problem.code : undefined });
    },
    onSettled: () => { lock.free(); return qc.invalidateQueries({ queryKey: ["fo", "prospects"] }); },
  });
  // A card dropped on the board's "Lost" lands here with ?lost=1 (FO-4 part 2a-ii): the loss flow opens once, for a
  // person who may mark it lost and a prospect still being worked; the mark leaves the address.
  const [params, setParams] = useSearchParams();
  const asked = params.get("lost") === "1", data = one.data;
  React.useEffect(() => {
    if (!asked || !data) return;
    if (can(me, KEY.lose) && (data.stage.kind === "ACTIVE" || data.stage.kind === "NURTURE")) setOpen("lost");
    setParams({}, { replace: true });
  }, [asked, data, me, setParams]);
  if (one.isPending) return <Loading label="Loading the prospect" rows={2} />;
  if (one.isError) {
    const gone = one.error instanceof StaffApiError && one.error.status === 404;
    return (
      <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface-raised p-6">
        <h1 className="text-lg font-semibold">{gone ? "Prospect not found" : "Could not load the prospect"}</h1>
        <p className="mt-1 text-sm text-text-muted">{gone ? "There is no such prospect in your firm, or it is not one you may see." : one.error instanceof StaffApiError ? one.error.message : "Please try again."}</p>
        <Link to="/front-office/pipeline" className="mt-3 inline-block text-sm text-text-link hover:underline">Back to Pipeline</Link>
      </section>
    );
  }
  const p = one.data, name = p.company?.name ?? p.person?.name ?? "(no name)";
  const working = p.stage.kind === "ACTIVE" || p.stage.kind === "NURTURE";
  const mayLose = can(me, KEY.lose) && working, mayConvert = can(me, KEY.convert) && working;
  const mayUndo = can(me, KEY.convert) && p.stage.kind === "WON" && p.wonVia === "CONVERTED" && !p.retainerSigned;
  const mayMove = can(me, KEY.edit) && p.stage.kind === "ACTIVE" && p.type === "INDIVIDUAL";   // the stages read here are the Individual board's (Corporate: FO-4c)
  const submit = (a: Act) => (e?: React.FormEvent) => {
    e?.preventDefault();
    if (a === "lost" && !reasonId) return setError({ field: "reasonId", text: "Choose why it was lost." });
    if (a === "undo" && !text.trim()) return setError({ field: "reason", text: "Say why the Convert is undone." });
    // The same two refusals the server gives, said at the field before anything is sent.
    const amount = a === "value" && text.trim() !== "" ? centsOf(text) : null;
    if (amount && "refused" in amount) return setError({ field: "value", text: amount.refused });
    if (a === "value" && !CURRENCIES.includes(currency)) return setError({ field: "currency", text: CURRENCY_REFUSED });
    if (!lock.take()) return;
    setError(null); act.mutate(a);
  };
  const saidByNote = !!error?.code && FIXED_BY_A_CHECK.has(error.code) && error.code === noteCode;   // FO-13s: said once, by the note with its link; kept when the note cannot show it (break R1)
  const general = error && !error.field && !saidByNote ? <Notice tone="danger" title={error.text} className="mb-3" /> : null;
  const row = (label: string, value: React.ReactNode) => <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm"><dt className="text-text-muted">{label}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd></div>;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-text [overflow-wrap:anywhere]">{name}</h1>
        <Pill tone="info">Prospect</Pill>
        <Pill tone={p.stage.kind === "WON" ? "ok" : "neutral"}><span data-stage-now>{p.stage.label}</span></Pill>
        <span className="text-sm text-text-muted">{p.number}</span>
      </header>
      {p.warning ? <Notice tone="warn" title={p.warning} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="fo-prospect" className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 id="fo-prospect" className="text-sm font-semibold">Prospect</h2>
          <dl className="mt-2">
            {row("From lead", <Link to={`/front-office/leads/${p.leadId}`} className="text-text-link hover:underline">{p.leadNumber}</Link>)}
            {row("Value", <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span data-value>{p.valueCents === null ? <span className="text-text-muted">Not set</span> : money(p.valueCents, p.currency)}</span>
              {can(me, KEY.edit) ? <Button variant="link" size="sm" aria-label={`${p.valueCents === null ? "Set value" : "Change value"}: ${name}, ${p.number}`} onClick={() => start("value")}>{p.valueCents === null ? "Set value" : "Change value"}</Button> : null}</span>)}
            {row("Engaged", arrivedLabel(p.engagedAt))}
            {owners.oneUser ? null : row("Owner", <span data-owner>{owners.name(p.ownerStaffId)}</span>)}
            {p.stage.kind === "WON" ? row("Won by", p.wonVia === "CONVERTED" ? "Convert to client" : "A signed retainer") : null}
            {p.lostReason ? row("Why lost", <span data-lost-reason>{p.lostReason.label}{p.lostNote ? ` · ${p.lostNote}` : ""}</span>) : null}
          </dl>
          {p.person ? <PersonEmail prospectId={p.id} person={p.person} mayEdit={can(me, KEY.edit)} /> : null}   {/* QA-779 part (a) */}
        </section>
        <aside aria-label="Actions" className="flex flex-col items-stretch gap-2 rounded-xl border border-border bg-surface-raised p-4">
          {mayMove ? <MoveMenu prospect={{ id: p.id, number: p.number, name }} from={p.stage.id} stages={board.data?.stages ?? []} version={p.version} move={move} /> : null}
          {mayConvert ? <Button onClick={() => start("convert")}>Convert to client</Button> : null}
          {mayLose ? <Button variant="outline" onClick={() => start("lost")}>Mark lost</Button> : null}
          {mayUndo ? <Button variant="outline" onClick={() => start("undo")}>Undo convert</Button> : null}
          {!mayMove && !mayConvert && !mayLose && !mayUndo ? <p data-no-actions className="text-xs text-text-muted">{p.stage.kind === "LOST" ? "A lost prospect does not move. To work with this person again, engage the lead again." : p.stage.kind === "WON" ? (p.wonVia === "CONVERTED" && !p.retainerSigned ? "Undoing a Convert needs a role that may convert prospects." : "This prospect is a client. A signed retainer cannot be undone here.") : "You can read this prospect. Changing it needs a role that works prospects: ask your firm's Owner or Admin."}</p> : null}
        </aside>
      </div>
      <RetainerCard prospectId={p.id} name={name} working={working} />   {/* FO-5s part 1 (S2) */}
      <SignatureRequestsSection prospectId={p.id} name={name} lost={p.stage.kind === "LOST"} />   {/* FO-6ds */}
      <ConflictCheckPanel prospectId={p.id} corporate={p.type === "CORPORATE"} />
      {p.person ? <IdentityCheckPanel personId={p.person.id} name={p.person.name === "(no name)" ? "" : p.person.name} /> : null}
      <Panel open={open === "lost"} onOpenChange={(o) => start(o ? "lost" : null)} title="Mark lost" description={`${name}, ${p.number}. It leaves the board and is found in the List under Stage: Lost.`}
        footer={<><Button variant="ghost" onClick={() => start(null)}>Cancel</Button><Button busy={act.isPending} onClick={submit("lost")}>Mark lost</Button></>}>
        <form onSubmit={submit("lost")} className="flex flex-col gap-4">
          {general}
          {reasons.isError ? <Notice tone="danger" title="Could not load the reasons." action={<Button variant="link" size="sm" onClick={() => reasons.refetch()}>Try again</Button>} /> : null}
          <Field label="Why was it lost?" error={error?.field === "reasonId" ? error.text : null}>
            <Select value={reasonId} onChange={(e) => { setReasonId(e.target.value); setError(null); }}><option value="">{reasons.isPending ? "Loading…" : "Choose a reason"}</option>{(reasons.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
          </Field>
          <Field label="Note (optional)" hint="Only your firm sees it."><Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        </form>
      </Panel>
      <Panel open={open === "value"} onOpenChange={(o) => start(o ? "value" : null)} title={p.valueCents === null ? "Set the value" : "Change the value"} description={`${name}, ${p.number}. What this prospect may be worth to the firm. It counts in the board's totals of its own currency; amounts are never converted.`}
        footer={<><Button variant="ghost" onClick={() => start(null)}>Cancel</Button><Button busy={act.isPending} onClick={submit("value")}>Save value</Button></>}>
        <form onSubmit={submit("value")} className="flex flex-col gap-4">
          {general}
          <Field label="Amount" hint="Digits only, with up to 2 decimal places, for example 1200.50. Leave it empty to clear the value." error={error?.field === "value" ? error.text : null}>
            <Input inputMode="decimal" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setError(null); }} />
          </Field>
          <Field label="Currency" error={error?.field === "currency" ? error.text : null}>
            <Select value={currency} onChange={(e) => { setCurrency(e.target.value); setError(null); }}>
              {/* A value keeps its own currency first; with no value yet the firm's default comes first; then A to Z. */}
              {[...new Set([firstCurrency(p), firmCurrency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
            </Select>
          </Field>
        </form>
      </Panel>
      <Dialog open={open === "convert"} onOpenChange={(o) => start(o ? "convert" : null)} title={`Convert ${name} to a client?`} description={`${p.number} moves to Won. Only this prospect changes.`}
        footer={<><Button variant="ghost" onClick={() => start(null)}>No, keep as prospect</Button><Button busy={act.isPending} onClick={submit("convert")}>Yes, convert to client</Button></>}>
        {general}
        <ConvertConflictNote prospectId={p.id} onGo={() => { start(null); focusWhenClosed("fo-conflict"); }} />
        {p.retainerSigned ? <p className="text-sm">The retainer is signed.</p> : conflictRefused || error?.code?.startsWith("CONFLICT_") ? null : <Notice tone="warn" title={NOT_SIGNED} />}   {/* also when the list never loaded (break m) */}
      </Dialog>
      <Dialog open={open === "undo"} onOpenChange={(o) => start(o ? "undo" : null)} title={`Undo the Convert of ${name}?`} description={`${p.number} goes back to the stage it was in. Possible only while the client has no case, invoice or signed retainer.`}
        footer={<><Button variant="ghost" onClick={() => start(null)}>No, keep as client</Button><Button busy={act.isPending} onClick={submit("undo")}>Yes, undo convert</Button></>}>
        <form onSubmit={submit("undo")}>
          {general}
          <Field label="Why is it undone?" hint="Kept as an internal note on the prospect." error={error?.field === "reason" ? error.text : null}><Textarea rows={3} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} /></Field>
        </form>
      </Dialog>
    </div>
  );
}
export function ProspectPage() {
  const { id = "" } = useParams();
  const back = { to: "/front-office/pipeline", label: "Pipeline" };
  return <SalesFrame crumbs={[{ label: "Pipeline", to: back.to }, { label: "Prospect" }]} back={back}><ProspectBody id={id} /></SalesFrame>;
}
