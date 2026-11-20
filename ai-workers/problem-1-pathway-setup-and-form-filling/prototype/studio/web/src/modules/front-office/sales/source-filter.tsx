// FO-4sf (AG-2-23 rule 1), moved here for R1.30 (QA-533): the one Source control, used by Leads, the prospects List
// and the board, with the same choices (`GET leads/sources`: the sources of the leads the person may see) and words.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FoldArrow } from "@/components/fold-out";
import { Button, Input } from "@/components/ui/controls";
import { LeadSources, words } from "./contract";
import { staffApi } from "./session";
export const useSources = () => useQuery({ queryKey: ["fo", "lead-sources"], queryFn: async () => LeadSources.parse(await staffApi("/front-office/leads/sources")).sources });
/** FO-4sf (AG-2-23 rule 1): one Source control for an open-ended list. A button opens a checkbox list with type-to-find;
 *  each chosen source shows as a removable chip beside it. Escape or a click outside closes it and focus returns. */
export function SourceFilter({ choices, chosen, toggle, clear, failed, retry, legend }: { choices: string[]; chosen: string[]; toggle: (c: string) => void; clear: () => void; failed: boolean; retry: () => void; legend: string }) {
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
            <legend className="sr-only">{legend}</legend>
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

/** The sources in the address (`?source=` once per source) that the person has: one typed in that they have not is
 *  dropped. While the choices load nothing is fetched; when they cannot be loaded the asked ones are kept as they are
 *  and `blocked` says so, so a failed lookup never turns a filtered address into every row (Devin on #1962). */
export function useAddressSources(params: URLSearchParams) {
  const known = useSources();
  const choices = known.data ?? [];
  const asked = params.getAll("source").filter((x, i, all) => all.indexOf(x) === i);
  const sources = known.isPending ? [] : known.isError ? asked : asked.filter((x) => choices.includes(x));
  // `ready`: the list may be fetched. Only an address that asks for a source waits for the choices (break m2).
  const blocked = known.isError && asked.length > 0;
  return { known, choices, sources, blocked, ready: !blocked && !(known.isPending && asked.length > 0) };
}

/** A day filter from the address: a real calendar day as YYYY-MM-DD, else "" (dropped, as Leads always did; break m1:
 *  "abc", "2026-02-30" or "2026-1-5" or a year outside 1900-2999 never reach the server or the from/to comparison). */
export function dayParam(params: URLSearchParams, k: string): string {
  const v = params.get(k) ?? "";
  // The server's own bounds (years 1900 to 2999, prospects.ts dayOf), so a year typo never meets its raw refusal (review A).
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "1900-01-01" && v <= "2999-12-31" && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : "";
}

/** QA-572 (EXPERIENCE :27, :43, BIC-13): a "from" day after the "to" day is said at the from field, in plain words, and
 *  never sent (the server would refuse it). No list is shown while it stands (break M1: a kept list went stale and
 *  ignored a new source), only the words to change the dates. */
export const rangeError = (from: string, to: string) => (from && to && from > to ? "The from date must be on or before the to date." : null);


/** A date filter field (review round 3; EXPERIENCE §2.12, BIC-13). It holds what is typed itself and reports each
 *  change: the address updates after the change event, and a field driven straight from the address was put back for
 *  a moment, which reset the browser's typing of the year (0002 → 0020 → 0202 → 2026) and wiped the field. It
 *  follows the address when that changes from elsewhere (Clear filters, Back). Field's id and aria props pass through. */
export function DayInput({ value, onDay, ...rest }: { value: string; onDay: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return <Input {...rest} type="date" value={draft} onChange={(e) => { setDraft(e.target.value); onDay(e.target.value); }} />;
}
