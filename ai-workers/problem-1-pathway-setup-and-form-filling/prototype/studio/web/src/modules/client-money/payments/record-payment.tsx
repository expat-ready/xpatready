// FO-7s3a part 1 (concept screens/fo-7s-money/concept-payments.md (c) "Record payment"; AG-6-19 r1-3, AG-6-21 r2-3, AG-6-63 r7;
// FO-7b's `POST …/money/invoices/:id/payments`, key agent/payment:record): a right panel on an issued invoice. Method (AG-6-19's
// seven words, never "Card"), Amount in the invoice's currency, Date, Reference. One idempotency key per opening, sent with every
// submit of it; Record disables on the first click. A question the API asks (a duplicate reference: "Record anyway?") is shown in
// its words with "Record anyway", which resubmits on the same key with the API's acknowledge flag. Money over the balance is
// never refused: the API records it all and answers the extra; into operating a person chooses Keep as credit (FO-7b's choice
// route; Refund there is FO-7s4's). No "Received into" while trust does not show (FO-7s3a part 2 adds it). Not here: Paid by and
// Note (FO-7b's route takes neither: contract gap, named in the PR).
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { centsOf, money } from "../invoices/contract";
import { cleanReference, METHODS, newKey, Recorded, recordedWords, type Method } from "./contract";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; invoiceId: string; number: string; currency: string; dueMinor: number; party: string; returnFocus: () => HTMLElement | null };
/** The API's questions a person may answer "Record anyway" to, and the flag that answers each (FO-7b's PaymentIn). */
const ASKS: Record<string, "duplicateReferenceAcknowledged" | "unclearedAcknowledged"> = { DUPLICATE_REFERENCE: "duplicateReferenceAcknowledged", UNCLEARED: "unclearedAcknowledged" };
/** FO-7b refuses a day after its own (UTC) today, so the latest day offered is that one; the default is the person's own day
 *  when it is not later (break M2: west of UTC in the evening, the UTC day is already tomorrow). */
const latestDay = () => new Date().toISOString().slice(0, 10);
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const defaultDay = () => (localDay() < latestDay() ? localDay() : latestDay());
const MINOR_MAX = 2_147_483_647;   // FO-7b's limit (ports/client-money.ts MINOR_MAX)

export function RecordPaymentPanel({ open, onOpenChange, invoiceId, number, currency, dueMinor, party, returnFocus }: Props) {
  const qc = useQueryClient();
  const [method, setMethod] = React.useState<Method | "">(""), [amount, setAmount] = React.useState(""), [on, setOn] = React.useState(defaultDay()), [reference, setReference] = React.useState("");
  const [errors, setErrors] = React.useState<{ method?: string; amount?: string; on?: string; reference?: string }>({});
  const [problem, setProblem] = React.useState<string | null>(null), [ask, setAsk] = React.useState<{ code: string; words: string } | null>(null);
  const [acks, setAcks] = React.useState<Record<string, boolean>>({}), [busy, setBusy] = React.useState(false), [done, setDone] = React.useState<Recorded | null>(null);
  const [kept, setKept] = React.useState<string | null>(null), [keeping, setKeeping] = React.useState(false);
  // Break M1: no answer came back (the network, not the API): the payment may be recorded. The fields are then held as sent and
  // Record sends the same payment on the same key, which the API answers once (a replay), never twice.
  const [unsure, setUnsure] = React.useState(false);
  const key = React.useRef(""), sending = React.useRef(false), doneBox = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    key.current = newKey();   // a new opening is a new payment (FO-7s3a DW4)
    setMethod(""); setAmount(""); setOn(defaultDay()); setReference(""); setErrors({}); setProblem(null); setAsk(null); setAcks({}); setDone(null); setKept(null); setUnsure(false);
  }, [open]);
  const dirty = !done && (!!method || !!amount || !!reference);
  const close = () => { if (!busy && (!dirty || window.confirm("Discard this payment?"))) onOpenChange(false); };   // break m1: the footer's Close asks too

  const send = async (extraAcks: Record<string, boolean> = acks) => {
    if (sending.current) return;
    const parsed = centsOf(amount);
    const bad = { method: method ? undefined : "Choose how the money was paid.", amount: "error" in parsed ? parsed.error : parsed.cents > MINOR_MAX ? `That amount is too large: at most ${money(MINOR_MAX, currency)}.` : undefined, on: on ? undefined : "Enter the date the money was received." };
    if (bad.method || bad.amount || bad.on) { setErrors(bad); setProblem(null); setAsk(null); requestAnimationFrame(() => document.querySelector<HTMLElement>('#record-payment-form [aria-invalid="true"]')?.focus()); return; }
    sending.current = true; setBusy(true); setErrors({}); setProblem(null); setAsk(null);
    try {
      const body = { method, amountMinor: (parsed as { cents: number }).cents, currency, receivedOn: on, ...(cleanReference(reference) ? { reference: cleanReference(reference) } : {}), idempotencyKey: key.current, ...extraAcks };
      const r = Recorded.parse(await staffApi(`/front-office/money/invoices/${invoiceId}/payments`, { method: "POST", json: body }));
      setDone(r); setUnsure(false); requestAnimationFrame(() => doneBox.current?.focus());
      await qc.invalidateQueries({ queryKey: ["fo", "money"] });
    } catch (x) {
      if (x instanceof StaffApiError && x.status === 409 && x.problem.code && ASKS[x.problem.code]) { setAsk({ code: x.problem.code, words: x.message }); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-pay-anyway]")?.focus()); }   // break m4
      else if (x instanceof StaffApiError) {
        setUnsure(false);
        setErrors({ method: x.field("method") ?? undefined, amount: x.field("amountMinor") ? `Enter an amount in ${currency}, for example 100.00.` : undefined, on: x.field("receivedOn") ?? undefined, reference: x.field("reference") ?? undefined });
        setProblem(x.message);
        await qc.invalidateQueries({ queryKey: ["fo", "money"] });   // a refusal may mean the invoice changed elsewhere: read it again
      } else { setUnsure(true); setProblem(null); await qc.invalidateQueries({ queryKey: ["fo", "money"] }); }
    } finally { sending.current = false; setBusy(false); }
  };
  const anyway = () => { if (!ask) return; const next = { ...acks, [ASKS[ask.code]]: true }; setAcks(next); void send(next); };
  const keep = async () => {
    if (!done || keeping) return;
    setKeeping(true); setProblem(null);
    try {
      await staffApi(`/front-office/money/payments/${done.id}/extra`, { method: "POST", json: { choice: "KEEP_AS_CREDIT" } });
      setKept(`${money(done.extra?.waitingMinor ?? 0, done.currency)} kept as credit for ${party}.`);
      await qc.invalidateQueries({ queryKey: ["fo", "money"] });
    } catch (x) { setProblem(x instanceof StaffApiError ? x.message : "Not saved. Please try again."); } finally { setKeeping(false); }
  };

  const extra = done?.extra ?? null, waiting = !!extra && extra.waitingMinor > 0 && extra.choices.includes("KEEP_AS_CREDIT") && !kept;
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !dirty || window.confirm("Discard this payment?")}
      title="Record payment" description={`On ${number}. Balance due: ${money(dueMinor, currency)}. Money over the balance is recorded in full.`}
      footer={done ? <Button onClick={() => onOpenChange(false)} data-pay-close>Done</Button>
        : <><Button variant="ghost" disabled={busy} onClick={close}>Close</Button><Button type="submit" form="record-payment-form" busy={busy} disabled={busy} data-pay-save>Record</Button></>}>
      {done ? (
        <div ref={doneBox} tabIndex={-1} className="flex flex-col gap-3 outline-none" data-pay-done>
          <Notice tone="ok" title="Payment recorded"><span data-pay-receipt>{recordedWords(done, party)}</span></Notice>
          {done.replayed ? <p className="text-sm" data-pay-replayed>This payment was already recorded from this panel: it was not recorded twice.</p> : null}
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-text-muted">Amount</dt><dd className="text-right tabular-nums" data-figure>{money(done.amountMinor, done.currency)}</dd>
            <dt className="text-text-muted">{done.invoice.number ?? number}</dt><dd className="text-right" data-pay-invoice-status>{done.invoice.statusWord} · Balance due <span className="tabular-nums" data-figure>{money(done.invoice.dueMinor, done.currency)}</span></dd>
          </dl>
          {!done.cleared ? <p className="text-sm" data-pay-uncleared>Not yet cleared: a cheque counts as cleared only once the bank has it.</p> : null}
          {extra && extra.amountMinor > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3" data-pay-extra>
              <p className="text-sm font-medium"><span data-figure>{money(extra.amountMinor, done.currency)}</span> extra{extra.note ? ` · ${extra.note}` : ""}</p>
              {waiting ? <>
                <p className="text-sm text-text-muted">More than was due was received. Choose what happens to it.</p>
                <div><Button variant="outline" busy={keeping} onClick={() => void keep()} data-pay-keep>Keep as credit</Button></div>
              </> : kept ? <p className="text-sm" data-pay-kept>{kept}</p> : null}
            </div>
          ) : null}
          {problem ? <Notice tone="danger" title="Not saved"><span data-pay-problem>{problem}</span></Notice> : null}
        </div>
      ) : (
        <form id="record-payment-form" className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
          {problem ? <Notice tone="danger" title="Not recorded"><span data-pay-problem>{problem}</span></Notice> : null}
          {unsure ? <Notice tone="warn" title="No answer yet"><span data-pay-unsure>No answer came back, so this payment may already be recorded. Press Record again: it is recorded once at most. The fields stay as they were sent.</span></Notice> : null}
          {ask ? <Notice tone="warn" title="Check before recording" action={<Button busy={busy} onClick={anyway} data-pay-anyway>Record anyway</Button>}><span data-pay-ask={ask.code}>{ask.words}</span></Notice> : null}
          <Field label="Method" error={errors.method}>
            <Select value={method} disabled={unsure} onChange={(e) => { setMethod(e.target.value as Method); setErrors((x) => ({ ...x, method: undefined })); setAsk(null); }} data-pay-method>
              <option value="">Choose…</option>{METHODS.map((m) => <option key={m.code} value={m.code}>{m.word}</option>)}
            </Select>
          </Field>
          <Field label={`Amount (${currency})`} error={errors.amount} hint={(() => { const p = centsOf(amount); return amount && "cents" in p ? <>Recorded as <strong data-pay-reads>{money(p.cents, currency)}</strong>.</> : `For example 1,000.00. Balance due ${money(dueMinor, currency)}.`; })()}>
            <Input inputMode="decimal" value={amount} readOnly={unsure} onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); setAsk(null); }} data-pay-amount />
          </Field>
          <Field label="Date received" error={errors.on}><Input type="date" value={on} max={latestDay()} readOnly={unsure} onChange={(e) => { setOn(e.target.value); setErrors((x) => ({ ...x, on: undefined })); }} data-pay-date /></Field>
          <Field label="Reference (optional)" error={errors.reference} hint="A cheque number or the bank's reference, for example 4471.">
            <Input value={reference} readOnly={unsure} onChange={(e) => { setReference(e.target.value); setErrors((x) => ({ ...x, reference: undefined })); setAsk(null); setAcks({}); }} data-pay-reference />
          </Field>
        </form>
      )}
    </Panel>
  );
}
