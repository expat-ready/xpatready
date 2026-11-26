// FO-7s1 part 1 (concept screens/fo-7s-money/concept-invoices.md (b) "Invoice detail"; AG-6-1, AG-6-44, AG-6-48; FO-7q's
// `GET …/money/invoices/:id/detail`): one page with sections Overview · Lines · Payments and credits · History, no tabs. The
// header: number, Bill to, status chip, Balance due. Actions only from `allowedActions` (BR-10; a missing route is a missing
// button, never a disabled one): part 1 shows "Use a credit note" (CREDIT_NOTE) and "Download PDF" (DOWNLOAD_PDF); the builder
// and issue (EDIT, ISSUE) are part 2's, Send FO-7s2's; Record payment… (RECORD_PAYMENT) opens FO-7s3a's panel. Every figure is the API's, in its currency.
// A trust figure shows only when the read answers it (trust shows); otherwise no trust word at all (BR-1).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button, Notice, Pill, Table } from "@/components/ui/controls";
import { problemOf } from "@/modules/front-office/sales/contract";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { endSession, setStaffToken, staffApi, StaffApiError, staffToken, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { billToWord, day, Detail, INVOICES_HOME, KIND_WORD, money, rateWord, STATUS_HINT, STATUS_TONE } from "./contract";
import { CreditNotePanel } from "./credit-note-panel";
import { RecordPaymentPanel } from "../payments/record-payment";
import { CopyPayLink, payLinkOffered } from "./pay-link";

/** The PDF needs the bearer token, so it is fetched and saved, not linked. */
async function downloadPdf(id: string, number: string) {
  const token = staffToken();
  const res = await fetch(`/api/front-office/money/invoices/${id}/pdf`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const t = await res.text(); let d: unknown = t; try { d = JSON.parse(t); } catch { /* text */ }
    if (res.status === 401 && staffToken() === token) { if (token) endSession("NOT_SIGNED_IN"); else setStaffToken(null); }
    throw new StaffApiError(res.status, problemOf(d, res.status));
  }
  const href = URL.createObjectURL(await res.blob()), a = document.createElement("a");
  a.href = href; a.download = `${number}.pdf`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3" data-invoice-section={id}><h2 id={`${id}-h`} className="text-lg font-semibold">{title}</h2>{children}</section>
);
const Fact = ({ k, v, data }: { k: string; v: React.ReactNode; data?: string }) => <div className="min-w-0"><dt className="text-xs font-medium text-text-muted">{k}</dt><dd className="text-sm tabular-nums" data-fact={data ?? k}>{v}</dd></div>;
const when = (iso: string) => day(iso.slice(0, 10));
/** A line's tax in words: never a figure on a government fee (AG-6-4 r3, P-607 (7)). */
const taxWords = (l: Detail["invoice"]["lines"][number]) => l.kind === "GOVERNMENT_FEE" ? <span className="text-text-muted">Government fees are never taxed</span>
  : l.ratePpm ? <span data-figure>{money(l.taxMinor, l.currency)} ({rateWord(l.ratePpm)})</span> : <span className="text-text-muted">No tax</span>;

function DetailBody() {
  const { id = "" } = useParams(), token = useStaffToken(), me = usePlatformStaff();
  const q = useQuery({ queryKey: ["fo", "money", "invoice", token, id], enabled: !!token, retry: false, queryFn: async () => Detail.parse(await staffApi(`/front-office/money/invoices/${encodeURIComponent(id)}/detail`)) });
  const [paying, setPaying] = React.useState(false), payOpener = React.useRef<HTMLButtonElement>(null);
  const [crediting, setCrediting] = React.useState(false), [pdfProblem, setPdfProblem] = React.useState<string | null>(null), [pdfBusy, setPdfBusy] = React.useState(false);
  const opener = React.useRef<HTMLButtonElement>(null), heading = React.useRef<HTMLHeadingElement>(null), pdfBox = React.useRef<HTMLDivElement>(null);
  if (q.isError) {
    const e = q.error instanceof StaffApiError ? q.error : null;
    // Another firm's, an unknown, and one outside the caller's view: the same plain not found (never "CAD 0").
    return e?.status === 404 ? <Notice tone="info" title="Invoice not found"><span data-invoice-missing>There is no invoice at this address, or it is not one you can see. <Link to={INVOICES_HOME} className="text-text-link underline">Back to invoices</Link></span></Notice>
      : <Notice tone="danger" title="Could not load the invoice"><span data-invoice-error>{e?.message ?? "Please reload the page."}</span></Notice>;
  }
  if (!q.data) return <Loading label="Loading the invoice" rows={5} />;
  const d = q.data, inv = d.invoice, c = inv.currency, number = inv.number ?? "Draft", acts = new Set(d.allowedActions);
  const history = [
    ...(d.issuedOn ? [{ at: d.issuedOn, text: `Issued as ${number}${inv.dueDate ? `, due ${day(inv.dueDate)}` : ""}` }] : []),
    ...d.payments.map((p) => ({ at: p.receivedOn, text: `Payment of ${money(p.amountMinor, p.currency)} received${p.receiptNumber ? ` (receipt ${p.receiptNumber})` : ""}` })),
    ...d.creditNotes.map((n) => ({ at: n.createdAt.slice(0, 10), text: `${n.number ?? "Credit note"}: ${n.full ? "invoice cancelled" : money(n.amountMinor, n.currency)} — ${n.reason}` })),
    ...(d.writeOff ? [{ at: d.writeOff.createdAt.slice(0, 10), text: `Written off ${money(d.writeOff.amountMinor, d.writeOff.currency)} — ${d.writeOff.reason}` }] : []),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return (
    <div className="flex flex-col gap-6">
      <MoneyMenuSmall keys={me.keys} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-2xl font-semibold outline-none"><span data-invoice-number>{number}</span><Pill tone={STATUS_TONE[inv.statusWord]} title={STATUS_HINT[inv.statusWord]}><span data-invoice-status>{inv.statusWord}</span></Pill></h1>
          <p className="mt-1 text-sm text-text-muted [overflow-wrap:anywhere]">Bill to: <span data-bill-to>{billToWord(d.billTo)}</span>{inv.billToProvince ? ` · ${inv.billToProvince}` : ""}{d.caseLabel ? <> · Case <span data-case>{d.caseLabel}</span></> : null}</p>
          <p className="mt-1 text-base">Balance due: <strong className="tabular-nums" data-figure data-balance>{money(inv.dueMinor, c)}</strong></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {acts.has("RECORD_PAYMENT") && inv.number ? <Button ref={payOpener} className="max-sm:h-11" onClick={() => setPaying(true)} data-action="RECORD_PAYMENT">Record payment…</Button> : null}
          {payLinkOffered(me.keys, inv) ? <CopyPayLink invoiceId={inv.id} /> : null}   {/* FO-7s2 part 2 */}
          {acts.has("CREDIT_NOTE") ? <Button ref={opener} variant={acts.has("RECORD_PAYMENT") ? "outline" : undefined} className="max-sm:h-11" onClick={() => setCrediting(true)} data-action="CREDIT_NOTE">Use a credit note</Button> : null}
          {acts.has("DOWNLOAD_PDF") ? <Button variant="outline" className="max-sm:h-11" busy={pdfBusy} data-action="DOWNLOAD_PDF" onClick={() => { setPdfBusy(true); setPdfProblem(null); downloadPdf(inv.id, number).catch((e) => { setPdfProblem(e instanceof StaffApiError ? e.message : "Could not download the PDF."); requestAnimationFrame(() => pdfBox.current?.focus()); }).finally(() => setPdfBusy(false)); }}>Download PDF</Button> : null}
        </div>
      </header>
      {pdfProblem ? <div ref={pdfBox} tabIndex={-1} className="outline-none"><Notice tone="danger" title="No PDF"><span data-pdf-problem>{pdfProblem}</span></Notice></div> : null}
      <Section id="overview" title="Overview">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Fact k="Issued" v={day(d.issuedOn)} /><Fact k="Due" v={day(inv.dueDate)} />
          <Fact k="Total" v={money(inv.totalMinor, c)} data="total" /><Fact k="Paid" v={money(inv.paidMinor, c)} data="paid" />
          {inv.creditedMinor ? <Fact k="Credited" v={money(inv.creditedMinor, c)} data="credited" /> : null}
          {inv.writtenOffMinor ? <Fact k="Written off" v={money(inv.writtenOffMinor, c)} data="written-off" /> : null}
          {d.trustPaidMinor ? <Fact k="Paid from trust" v={money(d.trustPaidMinor, c)} data="trust-paid" /> : null}
          {inv.extraMinor ? <Fact k="Received beyond the total" v={money(inv.extraMinor, c)} data="extra" /> : null}
        </dl>
      </Section>
      <Section id="lines" title="Lines">
        {inv.status === "ISSUED" ? <p className="text-sm text-text-muted" data-frozen>Issued invoices can't be edited{acts.has("CREDIT_NOTE") ? " — use a credit note." : "."}</p> : null}
        {!inv.lines.length ? <p data-empty className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">No lines yet.</p> : (
          <Table label="Invoice lines" head={["Line", "Qty", "Unit", "Amount", "Tax"]} headClass={[undefined, "hidden sm:table-cell", "hidden sm:table-cell", undefined, "hidden sm:table-cell"]}>
            {inv.lines.map((l) => (
              <tr key={l.id} data-line={l.kind}>
                <td className="min-w-40 [overflow-wrap:anywhere]"><span className="block text-xs text-text-muted">{KIND_WORD[l.kind]}</span>{l.description}</td>
                <td className="hidden tabular-nums sm:table-cell">{l.quantity}</td>
                <td className="hidden whitespace-nowrap tabular-nums sm:table-cell" data-figure>{money(l.unitMinor, l.currency)}</td>
                <td className="whitespace-nowrap tabular-nums"><span data-figure>{money(l.amountMinor, l.currency)}</span><span className="block whitespace-normal text-xs sm:hidden" data-line-tax-small>{taxWords(l)}</span></td>
                <td className="hidden whitespace-nowrap text-sm tabular-nums sm:table-cell" data-line-tax>{taxWords(l)}</td>
              </tr>
            ))}
          </Table>
        )}
        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm" data-totals>
          <dt className="text-text-muted">Subtotal</dt><dd className="text-right tabular-nums" data-figure>{money(inv.subtotalMinor, c)}</dd>
          <dt className="text-text-muted">Tax</dt><dd className="text-right tabular-nums" data-figure>{money(inv.taxMinor, c)}</dd>
          <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums" data-figure data-total>{money(inv.totalMinor, c)}</dd>
        </dl>
      </Section>
      <Section id="payments" title="Payments and credits">
        {!d.payments.length && !d.creditNotes.length && !d.writeOff ? <p className="text-sm text-text-muted" data-no-payments>No payments or credits yet.</p> : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface-raised">
            {d.payments.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm" data-payment><span>Payment · {day(p.receivedOn)}{p.reference ? ` · ${p.reference}` : ""}{p.refundedMinor ? <span className="text-text-muted"> · refunded {money(p.refundedMinor, p.currency)}</span> : null}</span><span className="tabular-nums" data-figure>{money(p.amountMinor, p.currency)}</span></li>)}
            {d.creditNotes.map((n) => <li key={n.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm" data-credit-note><span>{n.number ?? "Credit note"} · {when(n.createdAt)} · {n.reason}</span><span className="tabular-nums" data-figure>{n.full ? "Invoice cancelled" : money(n.amountMinor, n.currency)}</span></li>)}
            {d.writeOff ? <li className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm" data-write-off><span>Written off · {when(d.writeOff.createdAt)} · {d.writeOff.reason}</span><span className="tabular-nums" data-figure>{money(d.writeOff.amountMinor, d.writeOff.currency)}</span></li> : null}
          </ul>
        )}
      </Section>
      <Section id="history" title="History">
        {!history.length ? <p className="text-sm text-text-muted">A draft: nothing has happened to it yet.</p> : <ol className="flex flex-col gap-1 text-sm" data-history>{history.map((h, i) => <li key={i}><span className="text-text-muted">{day(h.at)}</span> · {h.text}</li>)}</ol>}
      </Section>
      {/* kept while open: a payment that settles the invoice drops RECORD_PAYMENT, and the panel still shows its answer and the extra choice */}
      {(acts.has("RECORD_PAYMENT") || paying) && inv.number ? <RecordPaymentPanel open={paying} onOpenChange={setPaying} invoiceId={inv.id} number={inv.number} currency={c} dueMinor={inv.dueMinor} party={billToWord(d.billTo)} returnFocus={() => (payOpener.current?.isConnected ? payOpener.current : heading.current)} /> : null}
      {acts.has("CREDIT_NOTE") && inv.number ? <CreditNotePanel open={crediting} onOpenChange={setCrediting} invoiceId={inv.id} number={inv.number} currency={c} creditableMinor={d.creditableMinor} returnFocus={() => (opener.current?.isConnected ? opener.current : heading.current)} /> : null}
    </div>
  );
}

export function InvoiceDetailPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Invoices", to: INVOICES_HOME }, { label: "Invoice" }]}><DetailBody /></PlatformFrame>;
}
