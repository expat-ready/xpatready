// FO-7s3b part 1 (R1.58; concept screens/fo-7s-money/concept-invoices.md (a) "Trust /money/trust", concept-trust.md (e) and
// (h)'s shortfall list; concept.md BR-1, BR-3; AG-6-60 r7, AG-6-74 r5; P-634 (1), P-653 (2), P-694): Money → Trust. A client
// finder (FO-7q's party search) to open a client's Money view, and the shortfall list: each client whose trust balance is below
// zero after a reversal, in red with "Trust shortfall after a reversal" (FO-7v's read; C5 on the server). While trust does not
// show the read answers 404 and the page says only "not available", no trust word (BR-1). Not here yet: New trust request
// (FO-7s3a part 2), To move (FO-7s3b part 2), Monthly check (FO-7m part 3).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Field, Input, Notice, Table } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { money } from "../invoices/contract";
import { useShortfall } from "./state";
import { PartyHits, partyPath, SEARCH_KEY, SHORTFALL_LABEL, shortfallWords, TRUST_KEY } from "./contract";

function Finder() {
  const token = useStaffToken(), [text, setText] = React.useState(""), q = text.trim();
  const hits = useQuery({ queryKey: ["fo", "money", "parties", token, q], enabled: !!token && q.length >= 2, retry: false,
    queryFn: async () => PartyHits.parse(await staffApi(`/front-office/money/parties?${new URLSearchParams({ q })}`)) });
  return (
    <section aria-labelledby="find-client" className="flex flex-col gap-2">
      <h2 id="find-client" className="text-lg font-semibold">A client's ledger</h2>
      <Field label="Find a client" hint="Type at least 2 letters of the name." className="max-w-md">
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" data-trust-find />
      </Field>
      {q.length < 2 ? null : hits.isError ? <p className="text-sm text-text-danger" data-find-error>{hits.error instanceof StaffApiError ? hits.error.message : "Could not search now."}</p>
        : !hits.data ? <p className="text-sm text-text-muted">Searching…</p>
          : !hits.data.items.length ? <p className="text-sm text-text-muted" data-find-none>No client you can see matches “{q}”.</p>
            : <ul className="flex max-w-md flex-col gap-1" aria-label="Matching clients">{hits.data.items.map((h) => (
              <li key={h.id}><Link to={`/money/parties/${h.kind === "PERSON" ? "person" : "company"}/${h.id}`} className="text-text-link underline underline-offset-2" data-find-hit={h.name}>{h.name}</Link></li>
            ))}</ul>}
    </section>
  );
}

function Body() {
  const me = usePlatformStaff(), allowed = me.keys.includes(TRUST_KEY), q = useShortfall(allowed);
  const header = <header className="flex flex-col gap-2"><MoneyMenuSmall keys={me.keys} /><h1 className="text-2xl font-semibold">{q.data ? "Trust" : "Money"}</h1></header>;
  if (!allowed) return <div className="flex flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-trust-refused>You don't have access to this page.</span></Notice></div>;
  if (q.isError) {
    const e = q.error instanceof StaffApiError ? q.error : null;
    return <div className="flex flex-col gap-4">{header}{e?.status === 404
      ? <Notice tone="info" title="Not available"><span data-trust-off>This page is not available for your firm.</span></Notice>
      : <Notice tone="danger" title="Could not load this page"><span data-trust-error>{e?.message ?? "Please reload the page."}</span></Notice>}</div>;
  }
  if (!q.data) return <div className="flex flex-col gap-4">{header}<Loading label="Loading trust" rows={3} /></div>;
  const rows = q.data.items;
  return (
    <div className="flex flex-col gap-8" data-trust-home>
      {header}
      <p className="-mt-6 text-sm text-text-muted">Each amount is in its own currency. Money leaves trust only by Pay from trust on an issued invoice or a refund to the client.</p>
      <section aria-labelledby="shortfalls" className="flex flex-col gap-3">
        <h2 id="shortfalls" className="text-lg font-semibold">Trust shortfalls</h2>
        {!rows.length ? <p data-shortfall-empty className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">No client is below zero. A client shows here, in red, only after a payment recorded by hand is reversed.</p> : (
          <Table label="Trust shortfalls" head={["Client", "Trust balance", "What it means"]} headClass={[undefined, undefined, "hidden md:table-cell"]}>
            {rows.map((r) => {
              const to = partyPath(r);
              return (
                <tr key={`${r.personId ?? r.companyId}-${r.currency}`} data-shortfall-row={r.name ?? ""}>
                  <td className="font-medium">{to ? <Link to={to} className="text-text-link underline underline-offset-2">{r.name ?? "Client"}</Link> : r.name ?? "Client"}</td>
                  <td className="whitespace-nowrap"><span className="font-semibold tabular-nums text-text-danger" data-shortfall-figure>{money(r.balanceMinor, r.currency)}</span><span className="block text-xs text-text-danger">{SHORTFALL_LABEL}</span></td>
                  <td className="hidden text-sm md:table-cell">{shortfallWords(r.balanceMinor, r.currency, money)} <span className="text-text-muted">Unconfirmed: no counsel.</span></td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
      {me.keys.includes(SEARCH_KEY) ? <Finder /> : null}
    </div>
  );
}

export function TrustHomePage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[]}><Body /></PlatformFrame>;
}
