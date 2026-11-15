// FO-4 part 1 (concept r2 §4 screen 2, pattern Catalogue; BR-4, BR-5, BR-10; AG-2-13c, AG-2-86): Leads. Chips
// Unassigned leads · Mine · All open (Closed comes with Close and Reopen, part 2), a search over the rows shown, and a
// table; Take it on a lead nobody active owns. The chip is kept in the address (?view=), so Back returns to it.
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Pill, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { can, KEY, LeadRows, seesUnassigned, type LeadRow } from "./contract";
import { SalesFrame, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";
import { useTakeIt } from "./take-it";
import { arrivedLabel, waitedLabel } from "./time";
type View = "unassigned" | "mine" | "all";
const CHIPS: { view: View; label: string }[] = [{ view: "unassigned", label: "Unassigned leads" }, { view: "mine", label: "Mine" }, { view: "all", label: "All open" }];
const EMPTY: Record<View, string> = {
  unassigned: "No unassigned leads. New enquiries from your web form land here until someone takes them.",
  mine: "You have no open leads. Take one from Unassigned leads, or ask to be assigned one.",
  all: "No open leads.",
};
export function useLeads(view: View) {
  return useQuery({ queryKey: ["fo", "leads", view], queryFn: async () => LeadRows.parse(await staffApi(`/front-office/leads?view=${view}`)) });
}
function LeadsBody() {
  const me = useStaff();
  const [params, setParams] = useSearchParams();
  const chips = CHIPS.filter((c) => c.view !== "unassigned" || seesUnassigned(me));
  const asked = params.get("view") as View | null;
  const view: View = chips.some((c) => c.view === asked) ? asked! : chips[0].view;
  const [q, setQ] = React.useState("");
  const rows = useLeads(view);
  const take = useTakeIt();
  const canTake = can(me, KEY.edit);
  const needle = q.trim().toLowerCase();
  const shown = (rows.data ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle) || l.number.toLowerCase().includes(needle));
  // A lead with no active owner: none, or a deactivated one, shown "(Inactive) Name" (BR-4).
  const unowned = (l: LeadRow) => l.ownerStaffId === null || (l.owner ?? "").startsWith("(Inactive) ");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-text">Leads</h1>
        <p className="mt-1 text-sm text-text-muted">People who showed interest. Take one to work it, or Engage it when it is a real opportunity.</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Which leads" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.view} type="button" aria-pressed={c.view === view} data-chip={c.view}
              onClick={() => setParams(c.view === chips[0].view ? {} : { view: c.view }, { replace: true })}
              className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", c.view === view ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text hover:bg-text/5")}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="w-full sm:w-72">
          <span className="sr-only">Search leads by name or number</span>
          <Input type="search" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {rows.isPending ? <p role="status" className="text-sm text-text-muted">Loading leads…</p>
        : rows.isError ? <p role="alert" className="text-sm text-text-danger">{rows.error instanceof StaffApiError ? rows.error.message : "Could not load the leads."} <Button variant="link" size="sm" onClick={() => rows.refetch()}>Try again</Button></p>
          : !rows.data.length ? <p data-empty className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{EMPTY[view]}</p>
            : !shown.length ? <p role="status" className="text-sm text-text-muted">No lead matches “{q.trim()}”.</p>
              : (
                <Table label={`Leads: ${CHIPS.find((c) => c.view === view)!.label}`} head={["Lead", "Interested in", "Source", "Owner", view === "unassigned" ? "Waited" : "Arrived", ""]}>
                  {shown.map((l) => (
                    <tr key={l.id} data-lead-row={l.number}>
                      <td>
                        <Link to={`/front-office/leads/${l.id}`} state={{ from: view }} className="font-medium text-text-link hover:underline [overflow-wrap:anywhere]">{l.name}</Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-muted">
                          <span>{l.number}</span>
                          {l.possibleMatch ? <Pill tone="info" title="Someone with the same email or phone is already on file. Open the lead to see who.">Possible match</Pill> : null}
                          {l.fixNumber ? <Pill tone="warn" title="The phone number could not be read. Open the lead to fix it.">Fix number</Pill> : null}
                        </div>
                      </td>
                      <td>{l.interestedIn ?? <span className="text-text-muted">Not given</span>}</td>
                      <td>{l.source}</td>
                      <td data-owner>{l.owner ?? <span className="text-text-muted">Nobody</span>}</td>
                      <td title={view === "unassigned" ? "Time since the enquiry arrived." : undefined}>{view === "unassigned" ? waitedLabel(l.arrivedAt) : arrivedLabel(l.arrivedAt)}</td>
                      <td className="text-right">
                        {canTake && unowned(l) ? <Button size="sm" variant="outline" busy={take.isPending && take.variables?.id === l.id} aria-label={`Take it: ${l.name}, ${l.number}`} onClick={() => take.mutate(l)}>Take it</Button> : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
    </div>
  );
}
export function LeadsPage() {
  return <SalesFrame crumbs={[{ label: "Leads" }]}><LeadsBody /></SalesFrame>;
}
