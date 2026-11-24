// FO-7s1 part 1 (concept screens/fo-7s-money/concept-invoices.md (a); AG-6-1, AG-6-25 to -27, AG-6-30, AG-6-37): Money → Invoices,
// a Catalogue-style list over FO-7q's paged read. Filters Status and Issued (from–to), "More filters": Overdue only; all in the
// address. Columns: Number (or "Draft"), Bill to, Issued, Due, Total, Balance due, Status chip. Each amount in its own currency
// and no total row (BR-4). 50 a page, "Show more" (FO-7q's keyset). Who lacks agent/invoice:list sees a plain refusal.
// Bill to and Case read FO-7q part 3's names (#3306). Not here yet: search by number or party, and the party and case filters.
import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice, Pill, Select, Table } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { anyFilter, billToWord, day, filtersOf, LIST_KEY, money, Page, queryOf, STATUS_HINT, STATUS_TONE, STATUSES, type Filters } from "./contract";

function ListBody() {
  const me = usePlatformStaff(), token = useStaffToken();
  const [params, setParams] = useSearchParams();
  const f = filtersOf(params), allowed = me.keys.includes(LIST_KEY);
  // break m5: "from" after "to" is said on the field in words and nothing is asked of the server
  const datesWrong = !!(f.issuedFrom && f.issuedTo && f.issuedFrom > f.issuedTo);
  const firstNew = React.useRef<number | null>(null);
  const set = (p: Partial<Filters>) => setParams(new URLSearchParams(queryOf({ ...f, ...p })), { replace: true });
  const q = useInfiniteQuery({
    queryKey: ["fo", "money", "invoices", token, queryOf(f)], enabled: !!token && allowed && !datesWrong, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => Page.parse(await staffApi(`/front-office/money/invoices?${queryOf(f, pageParam)}`)),
    getNextPageParam: (last) => last.next,
  });
  const [more, setMore] = React.useState(f.overdue);
  const header = (
    <header className="flex flex-col gap-2"><MoneyMenuSmall keys={me.keys} />
      <div><h1 className="text-2xl font-semibold">Invoices</h1><p className="mt-1 text-sm text-text-muted">Each amount is in its invoice's own currency.</p></div>
    </header>
  );
  if (!allowed) return <div className="flex flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-invoices-refused>You don't have access to invoices.</span></Notice></div>;
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      {header}
      <form role="search" aria-label="Filter invoices" className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()}>
        <Field label="Status" className="w-40"><Select value={f.status} onChange={(e) => set({ status: e.target.value })} data-filter-status><option value="">Any status</option>{STATUSES.map((s) => <option key={s.code} value={s.code}>{s.word}</option>)}</Select></Field>
        <Field label="Issued from" className="w-40"><Input type="date" value={f.issuedFrom} onChange={(e) => set({ issuedFrom: e.target.value })} data-filter-from /></Field>
        <Field label="Issued to" className="w-40" error={datesWrong ? "Choose a date on or after Issued from." : null}><Input type="date" value={f.issuedTo} onChange={(e) => set({ issuedTo: e.target.value })} data-filter-to /></Field>
        <Button type="button" variant="ghost" aria-expanded={more} onClick={() => setMore((m) => !m)} data-more-filters>More filters</Button>
        {more ? <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={f.overdue} onChange={(e) => set({ overdue: e.target.checked })} data-filter-overdue /> Overdue only</label> : null}
        {anyFilter(f) ? <Button type="button" variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })} data-clear-filters>Clear filters</Button> : null}
      </form>
      {datesWrong ? null : q.isError ? <Notice tone="danger" title="Could not load the invoices"><span data-invoices-error>{q.error instanceof StaffApiError ? q.error.message : "Please reload the page."}</span></Notice>
        : q.isPending ? <Loading label="Loading the invoices" rows={4} />
          : !rows.length ? (
            <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
              {anyFilter(f) ? "No invoices match these filters." : "No invoices yet. An invoice starts from a signed retainer or a typed line."}
            </p>
          ) : (
            <>
              <Table label="Invoices" head={["Number", "Bill to", "Case", "Issued", "Due", "Total", "Balance due", "Status"]} headClass={[undefined, "hidden md:table-cell", "hidden xl:table-cell", "hidden lg:table-cell", "hidden sm:table-cell", "hidden md:table-cell", undefined, undefined]}>
                {rows.map((r, i) => (
                  <tr key={r.id} data-invoice-row={r.number ?? "Draft"}>
                    <td className="font-medium"><Link ref={i === firstNew.current ? (el) => { if (el) { el.focus(); firstNew.current = null; } } : undefined} to={`/money/invoices/${r.id}`} className="whitespace-nowrap text-text-link underline underline-offset-2" data-invoice-link>{r.number ?? "Draft"}</Link>
                      <span className="block text-xs font-normal text-text-muted sm:hidden">Due {day(r.dueDate)}</span></td>
                    <td className="hidden min-w-32 [overflow-wrap:anywhere] md:table-cell" data-bill-to>{billToWord(r.billTo)}</td>
                    <td className="hidden whitespace-nowrap xl:table-cell" data-case>{r.caseLabel ?? <span className="text-text-muted">—</span>}</td>
                    <td className="hidden whitespace-nowrap lg:table-cell">{day(r.issuedOn)}</td>
                    <td className="hidden whitespace-nowrap sm:table-cell">{day(r.dueDate)}</td>
                    <td className="hidden whitespace-nowrap tabular-nums md:table-cell" data-figure>{money(r.totalMinor, r.currency)}</td>
                    <td className="whitespace-nowrap tabular-nums" data-figure data-balance>{money(r.dueMinor, r.currency)}</td>
                    <td><Pill tone={STATUS_TONE[r.statusWord]} title={STATUS_HINT[r.statusWord]}>{r.statusWord}</Pill></td>
                  </tr>
                ))}
              </Table>
              {q.hasNextPage ? <div><Button variant="outline" busy={q.isFetchingNextPage} onClick={() => { firstNew.current = rows.length; void q.fetchNextPage(); }} data-show-more>Show more</Button></div> : null}
            </>
          )}
    </div>
  );
}

export function InvoiceListPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Invoices" }]}><ListBody /></PlatformFrame>;
}
