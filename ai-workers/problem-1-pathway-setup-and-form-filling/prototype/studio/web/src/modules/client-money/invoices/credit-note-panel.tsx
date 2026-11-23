// FO-7s1 part 1 (concept-invoices.md (b) "Use a credit note", (i) Credit note…; AG-6-48; FO-7b's credit route
// `POST …/money/invoices/:id/credit-notes`, agent/invoice:void): a right panel with Part (an amount) or Cancel invoice (the whole
// remaining), and a reason. The amount's limit and every figure after are the API's (no preview arithmetic here; FO-7s4 part 1
// adds the preview and the money-back choices). Refusals show the API's words on the panel.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError } from "@/modules/platform/session";
import { centsOf, money } from "./contract";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; invoiceId: string; number: string; currency: string; creditableMinor: number; returnFocus: () => HTMLElement | null };
/** The API's per-field words are about cents and limits ("at least 1"); the panel says them in the person's terms (break m4). */
const amountWords = (api: string | null, currency: string, creditable: number) => (api ? `Enter an amount in ${currency} up to ${money(creditable, currency)}.` : undefined);

export function CreditNotePanel({ open, onOpenChange, invoiceId, number, currency, creditableMinor, returnFocus }: Props) {
  const qc = useQueryClient(), toast = useToast();
  const [full, setFull] = React.useState(false), [amount, setAmount] = React.useState(""), [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<{ amount?: string; reason?: string }>({}), [problem, setProblem] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false);
  React.useEffect(() => { if (open) { setFull(false); setAmount(""); setReason(""); setErrors({}); setProblem(null); } }, [open]);
  const dirty = full || !!amount || !!reason;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    const parsed = full ? null : centsOf(amount);
    const bad = { amount: parsed && "error" in parsed ? parsed.error : undefined, reason: reason.trim() ? undefined : "Give a reason, for example Goodwill." };
    // break m1: a check here clears the last refusal, so old words never sit beside new ones
    if (bad.amount || bad.reason) { setErrors(bad); setProblem(null); requestAnimationFrame(() => document.querySelector<HTMLElement>('#credit-note-form [aria-invalid="true"]')?.focus()); return; }
    const cents = parsed && "cents" in parsed ? parsed.cents : null;
    sending.current = true; setBusy(true); setErrors({}); setProblem(null);
    try {
      const r = await staffApi<{ number?: string | null }>(`/front-office/money/invoices/${invoiceId}/credit-notes`, { method: "POST", json: full ? { full: true, reason } : { amountMinor: cents, reason } });
      toast.push({ tone: "ok", text: `${r?.number ?? "The credit note"} issued on ${number}.` });
      await qc.invalidateQueries({ queryKey: ["fo", "money"] });
      onOpenChange(false);
    } catch (x) {
      if (x instanceof StaffApiError) { setErrors({ amount: amountWords(x.field("amountMinor"), currency, creditableMinor), reason: x.field("reason") ? `The reason: ${x.field("reason")}` : undefined }); setProblem(x.message); }
      else setProblem("Not saved. Please try again.");
      // break m2: a refusal may mean the invoice changed (another tab, a role change): read it again
      await qc.invalidateQueries({ queryKey: ["fo", "money"] });
    } finally { sending.current = false; setBusy(false); }
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !dirty || window.confirm("Discard this credit note?")}
      title="Use a credit note" description={`Issued invoices can't be edited. A credit note lowers ${number}'s total. Up to ${money(creditableMinor, currency)} can be credited now.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button type="submit" form="credit-note-form" busy={busy} data-credit-save>Issue credit note</Button></>}>
      <form id="credit-note-form" className="flex flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
        {problem ? <Notice tone="danger" title="Not issued"><span data-credit-problem>{problem}</span></Notice> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium">How much</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="credit-how" checked={!full} onChange={() => setFull(false)} data-credit-part /> Part of it</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="credit-how" checked={full} onChange={() => setFull(true)} data-credit-full /> The whole amount that can be credited ({money(creditableMinor, currency)})</label>
        </fieldset>
        {!full ? <Field label={`Amount (${currency})`} error={errors.amount} hint={(() => { const p = centsOf(amount); return amount && "cents" in p ? <>This credit note: <strong data-credit-reads>{money(p.cents, currency)}</strong>. Up to {money(creditableMinor, currency)}.</> : `For example 100.00. Up to ${money(creditableMinor, currency)}.`; })()}><Input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); }} data-credit-amount /></Field> : null}
        <Field label="Reason" error={errors.reason} hint="Shown on the credit note, for example Goodwill."><Input value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })); }} data-credit-reason /></Field>
      </form>
    </Panel>
  );
}
