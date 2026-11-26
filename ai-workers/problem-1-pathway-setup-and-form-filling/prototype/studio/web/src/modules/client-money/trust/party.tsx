// FO-7s3b part 1 (R1.58; concept screens/fo-7s-money/concept-trust.md (e); AG-6-60 r1-4, r6-8, AG-6-25 to -27, AG-6-59 r5-6;
// BR-1, BR-3, BR-4; P-634 (1), P-694): a client's Money view at /money/parties/:kind/:id (Lead B, rev 16.36). FO-7r's summary,
// one column per currency and never a total across them; then, only while trust shows, "Trust held" per currency (AG-6-60 r6)
// and FO-7t's ledger, newest first with the server's running balance: Date, Entry, Reference, Payer, Amount, Balance; a
// withdrawal names its invoice (a link waits on the invoice's id in the ledger's answer: contract gap); a balance below zero (only after a reversal) is red with "Trust shortfall after a reversal".
// Out of the caller's view, another firm's or unknown: one plain "not found", never "CAD 0 held" (C5). Not here yet: Pay from
// trust and Refund to client (FO-7s3b part 1b), Send statement (FO-7s5), the case's own view /money/cases/:id (part 1b).
import type * as React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button, Notice, Table } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { money } from "../invoices/contract";
import { entryWords, heldWords, kindWord, LedgerPage, SHORTFALL_LABEL, shortfallWords, Summary, type Figures } from "./contract";

const NOT_TRACKED = "Not tracked yet";
/** A negative trust figure is never bare (BR-3, DW7): red, with its label. */
const Short = ({ minor, currency }: { minor: number; currency: string }) => <><span className="font-semibold tabular-nums text-text-danger" data-balance>{money(minor, currency)}</span><span className="block text-xs text-text-danger">{SHORTFALL_LABEL}</span></>;
const ROWS: { label: string; of: (f: Figures) => React.ReactNode; trust?: boolean }[] = [
  { label: "Billed", of: (f) => money(f.billedMinor, f.currency) }, { label: "Paid", of: (f) => money(f.paidMinor, f.currency) },
  { label: "Paid from trust", of: (f) => money(f.paidFromTrustMinor, f.currency), trust: true }, { label: "Credited", of: (f) => money(f.creditedMinor, f.currency) },
  { label: "Written off", of: (f) => money(f.writtenOffMinor, f.currency) }, { label: "Refunded", of: (f) => money(f.refundedMinor, f.currency) },
  { label: "Owed", of: (f) => money(f.owedMinor, f.currency) }, { label: "Oldest overdue", of: (f) => (f.oldestOverdueDays === null ? "—" : `${f.oldestOverdueDays} days`) },
  { label: "Trust held", of: (f) => (f.trustMinor === null ? "—" : f.trustMinor < 0 ? <Short minor={f.trustMinor} currency={f.currency} /> : money(f.trustMinor, f.currency)), trust: true },
  { label: "Credit", of: (f) => money(f.creditMinor, f.currency) }, { label: "Unbilled", of: () => NOT_TRACKED },
];
const at = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Ledger({ param, id, cases }: { param: string; id: string; cases: Map<string, string | null> }) {
  const token = useStaffToken();
  const q = useInfiniteQuery({
    queryKey: ["fo", "money", "trust", "ledger", token, param, id], enabled: !!token, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => LedgerPage.parse(await staffApi(`/front-office/money/trust/ledger?${new URLSearchParams({ [param]: id, ...(pageParam ? { after: pageParam } : {}) })}`)),
    getNextPageParam: (last) => last.next,
  });
  if (q.isError) return <Notice tone="danger" title="Could not load the trust ledger"><span data-ledger-error>{q.error instanceof StaffApiError ? q.error.message : "Please reload the page."}</span></Notice>;
  if (q.isPending) return <Loading label="Loading the trust ledger" rows={3} />;
  const rows = q.data.pages.flatMap((p) => p.items);
  if (!rows.length) return <p data-ledger-empty className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">No trust entries for this client yet.</p>;
  return (
    <>
      <Table label="Trust ledger" head={["Date", "Entry", "Reference", "Payer", "Amount", "Balance"]} headClass={[undefined, undefined, "hidden md:table-cell", "hidden lg:table-cell", undefined, undefined]}>
        {rows.map((e) => {
          const short = e.balanceAfterMinor < 0, where = e.caseId ? cases.get(e.caseId) ?? "A case" : "Before a case";
          return (
            <tr key={`${e.id}-${e.currency}`} data-ledger-row={e.kind} data-short={short || undefined}>
              <td className="whitespace-nowrap">{at(e.at)}</td>
              <td>{entryWords(e)}
                <span className="block text-xs text-text-muted">{where}</span></td>
              <td className="hidden md:table-cell">{e.reference ?? "—"}</td>
              <td className="hidden lg:table-cell">{e.payer ?? "—"}</td>
              <td className="whitespace-nowrap tabular-nums" data-figure>{e.amountMinor < 0 ? `${money(-e.amountMinor, e.currency)} out` : money(e.amountMinor, e.currency)}</td>
              <td className="whitespace-nowrap">{short ? <Short minor={e.balanceAfterMinor} currency={e.currency} /> : <span className="tabular-nums" data-balance>{money(e.balanceAfterMinor, e.currency)}</span>}</td>
            </tr>
          );
        })}
      </Table>
      {q.hasNextPage ? <div><Button variant="outline" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} data-show-more>Show more</Button></div> : null}
    </>
  );
}

function Body() {
  const { kind = "", id = "" } = useParams(), token = useStaffToken(), me = usePlatformStaff(), param = kindWord(kind);
  const q = useQuery({ queryKey: ["fo", "money", "summary", token, kind, id], enabled: !!token && !!param, retry: false,
    queryFn: async () => Summary.parse(await staffApi(`/front-office/money/parties/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/summary`)) });
  const missing = <Notice tone="info" title="Client not found"><span data-party-missing>There is no client at this address, or it is not one you can see. <Link to="/money/invoices" className="text-text-link underline">Back to invoices</Link></span></Notice>;
  if (!param) return missing;
  if (q.isError) {
    const e = q.error instanceof StaffApiError ? q.error : null;
    return e?.status === 404 ? missing : <Notice tone="danger" title="Could not load this client's money"><span data-party-error>{e?.message ?? "Please reload the page."}</span></Notice>;
  }
  if (!q.data) return <Loading label="Loading this client's money" rows={4} />;
  const s = q.data, cols = s.totals, rows = ROWS.filter((r) => s.trustShows || !r.trust), cases = new Map(s.cases.filter((c) => c.caseId).map((c) => [c.caseId!, c.caseLabel]));
  const held = s.trustShows ? cols.filter((f) => (f.trustMinor ?? 0) >= 0).map((f) => heldWords(s.cases, f.currency, money)).filter((x): x is string => !!x) : [];
  const short = s.trustShows ? cols.filter((f) => (f.trustMinor ?? 0) < 0) : [];
  return (
    <div className="flex flex-col gap-8" data-party-money>
      <header className="flex flex-col gap-2"><MoneyMenuSmall keys={me.keys} /><h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{s.party.name ?? "Client"} — Money</h1>
        <p className="text-sm text-text-muted">Each currency is shown on its own and never added to another.</p></header>
      <section aria-labelledby="summary" className="flex flex-col gap-3">
        <h2 id="summary" className="text-lg font-semibold">Summary</h2>
        {!cols.length ? <p data-summary-empty className="text-sm text-text-muted">No issued invoices{s.trustShows ? " or trust money" : ""} for this client yet.</p> : (
          <Table label="Money summary" head={["", ...cols.map((f) => f.currency)]}>
            {rows.map((r) => <tr key={r.label} data-summary-row={r.label}><th scope="row" className="border-b border-border px-3 py-2 text-left align-top font-medium">{r.label}</th>{cols.map((f) => <td key={f.currency} className="whitespace-nowrap tabular-nums">{r.of(f)}</td>)}</tr>)}
          </Table>
        )}
      </section>
      {s.trustShows ? (
        <section aria-labelledby="trust" className="flex flex-col gap-3" data-trust-section>
          <h2 id="trust" className="text-lg font-semibold">Trust</h2>
          {held.length ? <ul className="flex flex-col gap-1 text-sm" data-trust-held>{held.map((h) => <li key={h}>{h}</li>)}</ul> : null}
          {short.map((f) => (
            <Notice key={f.currency} tone="danger" title={SHORTFALL_LABEL}>
              <span data-trust-short><span className="font-semibold tabular-nums text-text-danger">{money(f.trustMinor ?? 0, f.currency)}</span>. {shortfallWords(f.trustMinor ?? 0, f.currency, money)} Unconfirmed: no counsel.</span>
            </Notice>
          ))}
          <h3 className="text-base font-semibold">Trust ledger</h3>
          <Ledger param={param} id={id} cases={cases} />
        </section>
      ) : null}
    </div>
  );
}

export function PartyMoneyPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Client" }]}><Body /></PlatformFrame>;
}
