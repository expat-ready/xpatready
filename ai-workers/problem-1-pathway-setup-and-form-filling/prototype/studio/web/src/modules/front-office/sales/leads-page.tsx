// FO-4 part 1 (concept r2 §4 screen 2, pattern Catalogue; BR-4, BR-5, BR-10; AG-2-13c, AG-2-86): Leads. Chips
// Unassigned leads · Mine · All open (Closed comes with Close and Reopen, part 2), a search over the rows shown, and a
// table; Take it on a lead nobody active owns. The chip is kept in the address (?view=), so Back returns to it.
// FO-4 part 2a (R1.30; AG-2-23 rule 1): filters by owner (under All open, for people who see colleagues' names) and by
// the day the lead arrived (the firm's zone, both days included), kept in the address like the sources.
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Pill, Select, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { can, KEY, LeadRows, READ_ONLY_REASON, seesUnassigned, words, type LeadRow } from "./contract";
import { AddLeadPanel } from "./add-lead-panel";
import { Loading } from "./loading";
import { useOwners } from "./prospect-actions";
import { DayInput, dayParam, rangeError, SourceFilter, useAddressSources } from "./source-filter";
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
export function useLeads(view: View, sources: string[] = [], enabled = true, more = "") {
  const q = sources.map((x) => `&source=${encodeURIComponent(x)}`).join("") + more;
  return useQuery({ enabled, queryKey: ["fo", "leads", view, ...(sources.length || more ? [sources, more] : [])], queryFn: async () => LeadRows.parse(await staffApi(`/front-office/leads?view=${view}${q}`)) });
}
function LeadsBody() {
  const me = useStaff();
  const [params, setParams] = useSearchParams();
  // R1.32 (X-4, BR-10): a one-user firm sees no Unassigned leads, owner column, owner filter or Take it.
  const owners = useOwners(), solo = owners.settled && owners.oneUser;
  const chips = CHIPS.filter((c) => c.view !== "unassigned" || (seesUnassigned(me) && !solo));
  const asked = params.get("view") as View | null;
  const view: View = chips.some((c) => c.view === asked) ? asked! : chips[0].view;
  // The chip and the sources live in the address (?view=, ?source= once per source), so a reload or Back keeps both
  // (FO-4sf). Only sources the person has are kept: one typed into the address that they have not is dropped.
  const { known, choices, sources, blocked, ready } = useAddressSources(params);
  const day = (k: string) => dayParam(params, k);
  // The date fields show what is in the address as typed (review round 3: a year typed digit by digit passes through
  // 0002, 0020, 0202 before 2026); only a real day in 1900-2999 is sent or compared.
  const typed = { from: params.get("from") ?? "", to: params.get("to") ?? "" };
  // The owner filter is All open's (Mine and Unassigned leads already say whose); it is dropped with any other chip.
  const narrow = { owner: view === "all" && owners.choices.some((o) => o.staffId === params.get("owner")) ? params.get("owner")! : "", from: day("from"), to: day("to") };
  const go = (next: View, src: string[], n: typeof narrow = narrow) => {
    const p = new URLSearchParams(); if (next !== chips[0].view) p.set("view", next); for (const x of src) p.append("source", x);
    if (n.owner && next === "all") p.set("owner", n.owner); if (n.from) p.set("from", n.from); if (n.to) p.set("to", n.to);
    setParams(p, { replace: true });
  };
  const more = (["owner", "from", "to"] as const).filter((k) => narrow[k]).map((k) => `&${k}=${encodeURIComponent(narrow[k])}`).join("");
  const toggle = (c: string) => go(view, sources.includes(c) ? sources.filter((x) => x !== c) : choices.filter((x) => x === c || sources.includes(x)));
  const [q, setQ] = React.useState("");
  // QA-572: a from day after the to day is said at the field and never sent; no list stands under it (break M1).
  const badRange = rangeError(narrow.from, narrow.to);
  const rows = useLeads(view, sources, ready && !badRange && owners.settled, more);   // the chip is known first (re-review M1)
  const empty = view === "mine" && !can(me, KEY.edit) ? "You have no open leads." : EMPTY[view];
  const take = useTakeIt();
  // FO-4 Add a lead (R1.27, QA-606; AG-2-4 rule 10): shown only to people who may create a lead.
  const [adding, setAdding] = React.useState(false), [addKey, setAddKey] = React.useState(0), addButton = React.useRef<HTMLButtonElement>(null);
  const panel = (o: boolean) => { if (o) setAddKey((k) => k + 1); setAdding(o); if (!o) setTimeout(() => addButton.current?.focus(), 60); };
  const canTake = can(me, KEY.edit) && !owners.oneUser;
  const needle = q.trim().toLowerCase();
  const shown = (rows.data ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle) || l.number.toLowerCase().includes(needle));
  // A lead with no active owner: none, or a deactivated one, shown "(Inactive) Name" (BR-4).
  const unowned = (l: LeadRow) => l.ownerStaffId === null || (l.owner ?? "").startsWith("(Inactive) ");
  if (!owners.settled) return <Loading label="Loading leads" />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-text">Leads</h1>
          {can(me, KEY.create) ? <Button ref={addButton} data-add-lead-open onClick={() => panel(true)}>Add a lead</Button> : null}
        </div>
        <p className="mt-1 text-sm text-text-muted">People who showed interest. Take one to work it, or Engage it when it is a real opportunity.</p>
        {!can(me, KEY.edit) ? <p data-why-no-take className="mt-1 text-xs text-text-muted">{READ_ONLY_REASON}</p> : null}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Which leads" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.view} type="button" aria-pressed={c.view === view} data-chip={c.view}
              onClick={() => go(c.view, sources)}
              className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", c.view === view ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text hover:bg-text/5")}>
              {c.label}
            </button>
          ))}
        </div>
        <SourceFilter choices={choices} chosen={sources} toggle={toggle} clear={() => go(view, [])} failed={known.isError} retry={() => known.refetch()} legend="Show leads from these sources" />
        <label className="w-full sm:w-72">
          <span className="sr-only">Search leads by name or number</span>
          <Input type="search" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3" data-lead-filters>
        {view === "all" && !owners.oneUser && owners.choices.length ? <Field label="Owner"><Select value={narrow.owner} onChange={(e) => go(view, sources, { ...narrow, owner: e.target.value })}><option value="">Everyone</option>{owners.choices.map((o) => <option key={o.staffId} value={o.staffId}>{o.displayName}</option>)}</Select></Field> : null}
        <Field label="Arrived from" error={badRange} calm><DayInput value={typed.from} max={narrow.to || undefined} onDay={(v) => go(view, sources, { ...narrow, to: typed.to, from: v })} /></Field>
        <Field label="Arrived to"><DayInput value={typed.to} min={narrow.from || undefined} onDay={(v) => go(view, sources, { ...narrow, from: typed.from, to: v })} /></Field>
        {more ? <Button variant="link" size="sm" data-clear-filters onClick={() => go(view, sources, { owner: "", from: "", to: "" })}>Clear owner and dates</Button> : null}
      </div>
      {blocked ? <p data-source-blocked className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">The leads from {sources.map(words).join(" or ")} are not shown because the sources could not be loaded. Use Try again beside Source, or choose All sources.</p>
        : badRange ? <p data-empty role="status" className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">Change the dates to see the leads: the from date must be on or before the to date.</p>
        : rows.isPending ? <Loading label="Loading leads" />
        : rows.isError ? <p role="alert" className="text-sm text-text-danger">{rows.error instanceof StaffApiError ? rows.error.message : "Could not load the leads."} <Button variant="link" size="sm" onClick={() => rows.refetch()}>Try again</Button></p>
          : !rows.data.length && sources.length ? <p data-empty role="status" className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">No leads from {sources.map(words).join(" or ")} here. Choose All sources to see every lead.</p>
          : !rows.data.length ? <p data-empty role={more ? "status" : undefined} className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{more ? "No leads match the owner and dates chosen." : empty}</p>
            : !shown.length ? <p role="status" className="text-sm text-text-muted">No lead matches “{q.trim()}”{sources.length ? ` among ${sources.map(words).join(" or ")}` : ""}.</p>
              : (
                <Table label={`Leads: ${CHIPS.find((c) => c.view === view)!.label}`} head={["Lead", "Interested in", "Source", ...(owners.oneUser ? [] : ["Owner"]), view === "unassigned" ? "Waited" : "Arrived", ""]}>
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
                      <td>{words(l.source)}</td>
                      {owners.oneUser ? null : <td data-owner>{l.owner ?? <span className="text-text-muted">Nobody</span>}</td>}
                      <td title={view === "unassigned" ? "Time since the enquiry arrived." : undefined}>{view === "unassigned" ? waitedLabel(l.arrivedAt) : arrivedLabel(l.arrivedAt)}</td>
                      <td className="text-right">
                        {canTake && unowned(l) ? <Button size="sm" variant="outline" busy={take.isPending && take.variables?.id === l.id} aria-label={`Take it: ${l.name}, ${l.number}`} onClick={() => take.mutate(l)}>Take it</Button> : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
      <AddLeadPanel key={addKey} open={adding} onOpenChange={panel} />
    </div>
  );
}
export function LeadsPage() {
  return <SalesFrame crumbs={[{ label: "Leads" }]}><LeadsBody /></SalesFrame>;
}
