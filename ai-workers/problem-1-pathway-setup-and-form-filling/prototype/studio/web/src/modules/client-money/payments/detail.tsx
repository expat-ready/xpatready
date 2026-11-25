// FO-7s3a part 1 (concept screens/fo-7s-money/concept-payments.md (c) "Payment detail"; AG-6-19, AG-6-21 r2-3, AG-6-63 r7;
// FO-7q's `GET …/money/payments/:id` with its `allowedActions`): one payment: method, amount, date received, reference, the
// invoice, the receipt number, cleared or "Not yet cleared", refunds, and "Received into" only when the read answers it (trust
// shows). Actions only from `allowedActions` (BR-10): Keep as credit (KEEP_AS_CREDIT, FO-7b's choice route) for extra waiting
// in operating. Refund…, Reverse entry… and Resend receipt are later rows' (FO-7s4; G3), absent here. Out of the caller's
// view, another firm's or unknown: the same plain "not found", never an amount (C5).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button, Notice, Pill } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { day, money } from "../invoices/contract";
import { methodWord, PaymentRow, PAYMENTS_HOME, paymentStatus } from "./contract";

const Fact = ({ k, v, data }: { k: string; v: React.ReactNode; data?: string }) => <div className="min-w-0"><dt className="text-xs font-medium text-text-muted">{k}</dt><dd className="text-sm tabular-nums [overflow-wrap:anywhere]" data-fact={data ?? k}>{v}</dd></div>;

function DetailBody() {
  const { id = "" } = useParams(), token = useStaffToken(), me = usePlatformStaff(), qc = useQueryClient();
  const q = useQuery({ queryKey: ["fo", "money", "payment", token, id], enabled: !!token, retry: false, queryFn: async () => PaymentRow.parse(await staffApi(`/front-office/money/payments/${encodeURIComponent(id)}`)) });
  const [busy, setBusy] = React.useState(false), [said, setSaid] = React.useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  if (q.isError) {
    const e = q.error instanceof StaffApiError ? q.error : null;
    return e?.status === 404 ? <Notice tone="info" title="Payment not found"><span data-payment-missing>There is no payment at this address, or it is not one you can see. <Link to={PAYMENTS_HOME} className="text-text-link underline">Back to payments</Link></span></Notice>
      : <Notice tone="danger" title="Could not load the payment"><span data-payment-error>{e?.message ?? "Please reload the page."}</span></Notice>;
  }
  if (!q.data) return <Loading label="Loading the payment" rows={4} />;
  const p = q.data, c = p.currency, acts = new Set(p.allowedActions), status = paymentStatus(p);
  const keep = async () => {
    setBusy(true); setSaid(null);
    try { await staffApi(`/front-office/money/payments/${p.id}/extra`, { method: "POST", json: { choice: "KEEP_AS_CREDIT" } }); setSaid({ tone: "ok", text: `${money(p.waitingMinor ?? 0, c)} kept as credit.` }); }
    catch (x) { setSaid({ tone: "danger", text: x instanceof StaffApiError ? x.message : "Not saved. Please try again." }); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ["fo", "money"] }); }
  };
  return (
    <div className="flex flex-col gap-6">
      <MoneyMenuSmall keys={me.keys} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold"><span data-payment-receipt>{p.receiptNumber ?? "Payment"}</span><Pill tone={status === "Recorded" ? "ok" : "neutral"}><span data-payment-status>{status}</span></Pill></h1>
          <p className="mt-1 text-base"><strong className="tabular-nums" data-figure data-payment-amount>{money(p.amountMinor, c)}</strong> · {methodWord(p.method)} · received {day(p.receivedOn)}</p>
        </div>
        {acts.has("KEEP_AS_CREDIT") ? <Button variant="outline" busy={busy} onClick={() => void keep()} data-action="KEEP_AS_CREDIT">Keep {money(p.waitingMinor ?? 0, c)} extra as credit</Button> : null}
      </header>
      {said ? <Notice tone={said.tone} title={said.tone === "ok" ? "Saved" : "Not saved"}><span data-payment-said>{said.text}</span></Notice> : null}
      <section aria-labelledby="pay-facts-h" className="flex flex-col gap-3">
        <h2 id="pay-facts-h" className="text-lg font-semibold">Payment</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Fact k="Method" v={methodWord(p.method)} data="method" />
          <Fact k="Amount" v={money(p.amountMinor, c)} data="amount" />
          <Fact k="Date received" v={day(p.receivedOn)} data="received" />
          <Fact k="Reference" v={p.reference ?? "—"} data="reference" />
          <Fact k="For" v={p.invoiceId ? <Link to={`/money/invoices/${p.invoiceId}`} className="text-text-link underline underline-offset-2" data-payment-invoice>{p.invoiceNumber ?? "Invoice"}</Link> : "—"} data="for" />
          <Fact k="Receipt" v={p.receiptNumber ?? "—"} data="receipt" />
          <Fact k="Cleared" v={p.cleared ? "Cleared" : "Not yet cleared"} data="cleared" />
          {p.receivedInto ? <Fact k="Received into" v={p.receivedInto === "TRUST" ? "Trust account" : "Operating account"} data="received-into" /> : null}
          {p.waitingMinor ? <Fact k="Extra waiting for a choice" v={money(p.waitingMinor, c)} data="waiting" /> : null}
        </dl>
      </section>
      <section aria-labelledby="pay-refunds-h" className="flex flex-col gap-3">
        <h2 id="pay-refunds-h" className="text-lg font-semibold">Refunds</h2>
        {!p.refunds.length ? <p className="text-sm text-text-muted" data-no-refunds>Nothing refunded.</p> : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface-raised">
            {p.refunds.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm" data-refund><span>{day(r.createdAt.slice(0, 10))} · {r.reason}</span><span className="tabular-nums" data-figure>{money(r.amountMinor, r.currency)}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PaymentDetailPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Payments", to: PAYMENTS_HOME }, { label: "Payment" }]}><DetailBody /></PlatformFrame>;
}
