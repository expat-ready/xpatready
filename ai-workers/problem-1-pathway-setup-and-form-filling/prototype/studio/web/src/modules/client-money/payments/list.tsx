// FO-7s3a part 1 (concept screens/fo-7s-money/concept-payments.md (c) "Payments list"; AG-6-19, AG-6-25 to -27; FO-7q's
// `GET …/money/payments`, agent/invoice:show): Money → Payments, newest received first. Filters Method and Received (from–to), in
// the address. Columns Date, Receipt, Method, Amount, For (the invoice), Received into (only when the read answers it: trust
// shows), Cleared, Status. Each amount in its own currency, no total row (BR-4). "Show more" by FO-7q's cursor. Not here yet:
// Paid by (FO-7q answers no payer: contract gap).
import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice, Pill, Select, Table } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { day, money } from "../invoices/contract";
import { METHODS, methodWord, PaymentPage, paymentFiltersOf, paymentQueryOf, PAYMENTS_KEY, paymentStatus, type PaymentFilters } from "./contract";

function ListBody() {
  const me = usePlatformStaff(), token = useStaffToken();
  const [params, setParams] = useSearchParams();
  const f = paymentFiltersOf(params), allowed = me.keys.includes(PAYMENTS_KEY), datesWrong = !!(f.from && f.to && f.from > f.to);
  const firstNew = React.useRef<number | null>(null);
  const set = (p: Partial<PaymentFilters>) => setParams(new URLSearchParams(paymentQueryOf({ ...f, ...p })), { replace: true });
  const q = useInfiniteQuery({
    queryKey: ["fo", "money", "payments", token, paymentQueryOf(f)], enabled: !!token && allowed && !datesWrong, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => PaymentPage.parse(await staffApi(`/front-office/money/payments?${paymentQueryOf(f, pageParam)}`)),
    getNextPageParam: (last) => last.next,
  });
  const header = (
    <header className="flex flex-col gap-2"><MoneyMenuSmall keys={me.keys} />
      <div><h1 className="text-2xl font-semibold">Payments</h1><p className="mt-1 text-sm text-text-muted">Each amount is in its own currency.</p></div>
    </header>
  );
  if (!allowed) return <div className="flex flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-payments-refused>You don't have access to payments.</span></Notice></div>;
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [], into = rows.some((r) => r.receivedInto !== undefined), filtered = !!(f.method || f.from || f.to);
  return (
    <div className="flex flex-col gap-4">
      {header}
      <form role="search" aria-label="Filter payments" className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()}>
        <Field label="Method" className="w-44"><Select value={f.method} onChange={(e) => set({ method: e.target.value })} data-filter-method><option value="">Any method</option>{METHODS.map((m) => <option key={m.code} value={m.code}>{m.word}</option>)}<option value="CARD">Card</option></Select></Field>
        <Field label="Received from" className="w-40"><Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} data-filter-from /></Field>
        <Field label="Received to" className="w-40" error={datesWrong ? "Choose a date on or after Received from." : null}><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} data-filter-to /></Field>
        {filtered ? <Button type="button" variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })} data-clear-filters>Clear filters</Button> : null}
      </form>
      {datesWrong ? null : q.isError ? <Notice tone="danger" title="Could not load the payments"><span data-payments-error>{q.error instanceof StaffApiError ? q.error.message : "Please reload the page."}</span></Notice>
        : q.isPending ? <Loading label="Loading the payments" rows={4} />
          : !rows.length ? (
            <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
              {filtered ? "No payments match these filters." : "No payments yet. Payments appear here when you record one or a client pays by card."}
            </p>
          ) : (
            <>
              <Table label="Payments" head={["Date", "Receipt", "Method", "Amount", "For", ...(into ? ["Received into"] : []), "Cleared", "Status"]}
                headClass={[undefined, undefined, "hidden md:table-cell", undefined, "hidden sm:table-cell", ...(into ? ["hidden lg:table-cell"] : []), "hidden lg:table-cell", "hidden md:table-cell"]}>
                {rows.map((r, i) => (
                  <tr key={r.id} data-payment-row={r.receiptNumber ?? r.id}>
                    <td className="whitespace-nowrap">{day(r.receivedOn)}</td>
                    <td className="font-medium"><Link ref={i === firstNew.current ? (el) => { if (el) { el.focus(); firstNew.current = null; } } : undefined} to={`/money/payments/${r.id}`} className="whitespace-nowrap text-text-link underline underline-offset-2" data-payment-link>{r.receiptNumber ?? "Payment"}</Link></td>
                    <td className="hidden md:table-cell">{methodWord(r.method)}</td>
                    <td className="whitespace-nowrap tabular-nums" data-figure>{money(r.amountMinor, r.currency)}</td>
                    <td className="hidden whitespace-nowrap sm:table-cell">{r.invoiceId ? <Link to={`/money/invoices/${r.invoiceId}`} className="text-text-link underline underline-offset-2">{r.invoiceNumber ?? "Invoice"}</Link> : <span className="text-text-muted">—</span>}</td>
                    {into ? <td className="hidden lg:table-cell">{r.receivedInto === "TRUST" ? "Trust" : "Operating"}</td> : null}
                    <td className="hidden whitespace-nowrap lg:table-cell" data-cleared={r.cleared}>{r.cleared ? "Cleared" : "Not yet cleared"}</td>
                    <td className="hidden md:table-cell"><Pill tone={paymentStatus(r) === "Recorded" ? "ok" : "neutral"}>{paymentStatus(r)}</Pill></td>
                  </tr>
                ))}
              </Table>
              {q.hasNextPage ? <div><Button variant="outline" busy={q.isFetchingNextPage} onClick={() => { firstNew.current = rows.length; void q.fetchNextPage(); }} data-show-more>Show more</Button></div> : null}
            </>
          )}
    </div>
  );
}

export function PaymentListPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Payments" }]}><ListBody /></PlatformFrame>;
}
