// FO-4 part 1 (concept r2 §4 screen 2, pattern Catalogue; BR-4, BR-5, BR-10; AG-2-13c, AG-2-86): Leads. Chips
// Unassigned leads · Mine · All open (Closed comes with Close and Reopen, part 2), a search over the rows shown, and a
// table; Take it on a lead nobody active owns. The chip is kept in the address (?view=), so Back returns to it.
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FoldArrow } from "@/components/fold-out";
import { Button, Input, Pill, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { can, KEY, LeadRows, LeadSources, READ_ONLY_REASON, seesUnassigned, words, type LeadRow } from "./contract";
import { Loading } from "./loading";
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
export function useLeads(view: View, sources: string[] = [], enabled = true) {
  const q = sources.map((x) => `&source=${encodeURIComponent(x)}`).join("");
  return useQuery({ enabled, queryKey: ["fo", "leads", view, ...(sources.length ? [sources] : [])], queryFn: async () => LeadRows.parse(await staffApi(`/front-office/leads?view=${view}${q}`)) });
}
const useSources = () => useQuery({ queryKey: ["fo", "lead-sources"], queryFn: async () => LeadSources.parse(await staffApi("/front-office/leads/sources")).sources });
/** FO-4sf (AG-2-23 rule 1): one Source control for an open-ended list. A button opens a checkbox list with type-to-find;
 *  each chosen source shows as a removable chip beside it. Escape or a click outside closes it and focus returns. */
function SourceFilter({ choices, chosen, toggle, clear, failed, retry }: { choices: string[]; chosen: string[]; toggle: (c: string) => void; clear: () => void; failed: boolean; retry: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [find, setFind] = React.useState("");
  const box = React.useRef<HTMLDivElement>(null), opener = React.useRef<HTMLButtonElement>(null), finder = React.useRef<HTMLInputElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [shift, setShift] = React.useState(0);
  const close = (refocus: boolean) => { setOpen(false); setFind(""); setShift(0); if (refocus) opener.current?.focus(); };
  // The panel never crosses the screen's right edge (review M7: 200 % zoom): it moves left by what would overflow.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => { if (!box.current || !panel.current) return; const left = box.current.getBoundingClientRect().left, width = panel.current.offsetWidth; setShift(Math.min(0, window.innerWidth - 16 - width - left)); };
    place(); window.addEventListener("resize", place);   // again on a resize or zoom while open (review m10)
    return () => window.removeEventListener("resize", place);
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    finder.current?.focus();
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const needle = find.trim().toLowerCase();
  const listed = choices.filter((c) => !needle || words(c).toLowerCase().includes(needle) || c.toLowerCase().includes(needle));
  return (
    <div ref={box} data-source-filter className="relative flex flex-wrap items-center gap-2" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); close(true); } }}
      onBlur={(e) => { if (open && !box.current?.contains(e.relatedTarget as Node | null)) close(false); }}>   {/* focus leaving closes it (review m9) */}
      <Button ref={opener} variant="outline" size="sm" aria-expanded={open} aria-controls="fo-source-list" data-source-toggle onClick={() => (open ? close(true) : setOpen(true))}>
        <FoldArrow open={open} />{chosen.length ? `Source (${chosen.length})` : "Source: all"}
      </Button>
      {chosen.map((c) => (
        <span key={c} data-source-chip={c} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary bg-primary/10 pl-3 pr-1 text-sm font-medium text-text-link [overflow-wrap:anywhere]">
          {words(c)}
          <button type="button" aria-label={`Remove source: ${words(c)}`} onClick={() => { toggle(c); opener.current?.focus(); }} className="rounded-full px-1.5 outline-none hover:bg-text/10 focus-visible:ring-[3px] focus-visible:ring-ring/50">×</button>
        </span>
      ))}
      {chosen.length ? <Button variant="link" size="sm" data-source-clear onClick={clear}>All sources</Button> : null}
      {failed ? <span role="alert" className="text-sm text-text-danger">Could not load the sources. <Button variant="link" size="sm" onClick={retry}>Try again</Button></span> : null}
      {open ? (
        <div id="fo-source-list" ref={panel} tabIndex={-1} style={{ left: shift }} className="absolute top-full outline-none z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-2 shadow-lg">
          <label className="block">
            <span className="sr-only">Find a source</span>
            <Input ref={finder} type="search" placeholder="Find a source" value={find} onChange={(e) => setFind(e.target.value)} data-source-find />
          </label>
          <fieldset className="mt-2 max-h-64 overflow-y-auto">
            <legend className="sr-only">Show leads from these sources</legend>
            {!choices.length ? <p className="px-2 py-1 text-sm text-text-muted">No sources yet.</p>
              : !listed.length ? <p role="status" className="px-2 py-1 text-sm text-text-muted">No source matches “{find.trim()}”.</p>
                : listed.map((c) => (
                  <label key={c} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-text hover:bg-text/5 [overflow-wrap:anywhere]">
                    <input type="checkbox" data-source={c} checked={chosen.includes(c)} onChange={() => toggle(c)} className="size-4 accent-[var(--color-primary,currentColor)]" />
                    {words(c)}
                  </label>
                ))}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
function LeadsBody() {
  const me = useStaff();
  const [params, setParams] = useSearchParams();
  const chips = CHIPS.filter((c) => c.view !== "unassigned" || seesUnassigned(me));
  const asked = params.get("view") as View | null;
  const view: View = chips.some((c) => c.view === asked) ? asked! : chips[0].view;
  // The chip and the sources live in the address (?view=, ?source= once per source), so a reload or Back keeps both
  // (FO-4sf). Only sources the person has are kept: one typed into the address that they have not is dropped.
  const known = useSources();
  const choices = known.data ?? [];
  const askedSources = params.getAll("source").filter((x, i, all) => all.indexOf(x) === i);
  // The sources could not be loaded: the asked ones are kept as they are and no list is fetched, so a failed lookup
  // never turns a filtered address into every lead (Devin on #1962).
  const sources = known.isPending ? [] : known.isError ? askedSources : askedSources.filter((x) => choices.includes(x));
  const blocked = known.isError && askedSources.length > 0;
  const go = (next: View, src: string[]) => { const p = new URLSearchParams(); if (next !== chips[0].view) p.set("view", next); for (const x of src) p.append("source", x); setParams(p, { replace: true }); };
  const toggle = (c: string) => go(view, sources.includes(c) ? sources.filter((x) => x !== c) : choices.filter((x) => x === c || sources.includes(x)));
  const [q, setQ] = React.useState("");
  const rows = useLeads(view, sources, !known.isPending && !blocked);
  const empty = view === "mine" && !can(me, KEY.edit) ? "You have no open leads." : EMPTY[view];
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
        {!canTake ? <p data-why-no-take className="mt-1 text-xs text-text-muted">{READ_ONLY_REASON}</p> : null}
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
        <SourceFilter choices={choices} chosen={sources} toggle={toggle} clear={() => go(view, [])} failed={known.isError} retry={() => known.refetch()} />
        <label className="w-full sm:w-72">
          <span className="sr-only">Search leads by name or number</span>
          <Input type="search" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {blocked ? <p data-source-blocked className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">The leads from {sources.map(words).join(" or ")} are not shown because the sources could not be loaded. Use Try again beside Source, or choose All sources.</p>
        : rows.isPending || known.isPending ? <Loading label="Loading leads" />
        : rows.isError ? <p role="alert" className="text-sm text-text-danger">{rows.error instanceof StaffApiError ? rows.error.message : "Could not load the leads."} <Button variant="link" size="sm" onClick={() => rows.refetch()}>Try again</Button></p>
          : !rows.data.length && sources.length ? <p data-empty role="status" className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">No leads from {sources.map(words).join(" or ")} here. Choose All sources to see every lead.</p>
          : !rows.data.length ? <p data-empty className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">{empty}</p>
            : !shown.length ? <p role="status" className="text-sm text-text-muted">No lead matches “{q.trim()}”{sources.length ? ` among ${sources.map(words).join(" or ")}` : ""}.</p>
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
                      <td>{words(l.source)}</td>
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
