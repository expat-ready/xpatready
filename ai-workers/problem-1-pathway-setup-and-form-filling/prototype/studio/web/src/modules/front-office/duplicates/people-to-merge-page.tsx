// FO-9s part 2 (R1.29; concept screens/FO-9s/concept.md r3 §4 S2, board design/fo9s-boards.html S2): Sales › People to
// merge. Tabs To review · Merged · Kept separate over FO-9b part 2's routes. BR-6: only pairs whose two people the viewer
// may open (the server filters); the list, its tabs and Keep separate need agent/prospect:edit, Undo merge needs
// agent/prospect:merge; without the list key the menu item is not shown and a typed address says who to ask. BR-10: Undo
// merge on every not-undone merge on the Merged tab (automatic ones too), always offered; a refusal shows the server's
// reason in its place. BR-11: Keep separate decides the pair (a confirm first: it is not suggested again). Merge… (holders of
// agent/prospect:merge) opens part 3's guided merge (merge-dialog.tsx); a case pair's is off with BR-7's sentence. After a
// merge, a notice "Merged into <name>." offers Undo (the toasts carry no button).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button, Dialog, Notice, Pill, Table } from "@/components/ui/controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/api";
import { can } from "../sales/contract";
import { Loading } from "../sales/loading";
import { assigneesQuery, SalesFrame, useStaff } from "../sales/sales-frame";
import { staffApi, StaffApiError } from "../sales/session";
import { reasonWords } from "./contract";
import { MergeDialog } from "./merge-dialog";
import { CASE_SIDE_LINE, MERGE_KEY, MergeList, mergedBy, REVIEW_KEY, reviewQuery, type MergeRecord, type ReviewPair } from "./review-contract";

type Tab = "OPEN" | "MERGED" | "KEPT_SEPARATE";
const TABS: { tab: Tab; param: string; label: string }[] = [{ tab: "OPEN", param: "review", label: "To review" }, { tab: "MERGED", param: "merged", label: "Merged" }, { tab: "KEPT_SEPARATE", param: "kept", label: "Kept separate" }];
const mergesQuery = { queryKey: ["fo", "duplicates", "merges"], queryFn: async () => MergeList.parse(await staffApi("/front-office/duplicates/merges")).items };
const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const MATCH_TIP = "An exact email or phone is a 100 match. A similar name alone scores its likeness.";
const EMPTY: Record<Tab, string> = {
  OPEN: "No pairs to review. When two records look like one person, they appear here.",
  MERGED: "No merges yet. People you merge, and the ones merged automatically, are listed here and can be split again.",
  KEPT_SEPARATE: "No pairs kept separate. A pair you keep separate, or a person added with “Add as new”, is listed here.",
};

function People({ p }: { p: ReviewPair }) {
  return <ul className="flex flex-col gap-0.5">{p.people.map((x) => <li key={x.personId} className="break-words"><span className="font-medium">{x.name}</span>{x.lead ? <span className="whitespace-nowrap text-text-muted"> · {x.lead}</span> : null}</li>)}</ul>;
}
function Score({ n }: { n: number }) {
  return <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={`Match ${n} of 100. ${MATCH_TIP}`} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" data-match-score={n}><Pill tone="warn">{n}</Pill></span></TooltipTrigger><TooltipContent>{MATCH_TIP}</TooltipContent></Tooltip>;
}
const names = (p: ReviewPair) => p.people.map((x) => x.name).join(" and ");

function PeopleToMergeBody() {
  const me = useStaff(), qc = useQueryClient(), toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.param === params.get("tab"))?.tab ?? "OPEN";
  const allowed = can(me, REVIEW_KEY);
  const retry = (n: number, e: unknown) => !(e instanceof StaffApiError && (e.status === 401 || e.status === 403)) && n < 2;   // a refusal is final
  const open = useQuery({ ...reviewQuery("OPEN"), enabled: allowed, retry });
  const kept = useQuery({ ...reviewQuery("KEPT_SEPARATE"), enabled: allowed, retry });
  const merges = useQuery({ ...mergesQuery, enabled: allowed, retry });
  const staff = useQuery({ ...assigneesQuery, enabled: allowed && tab === "MERGED" });
  const staffNames = React.useMemo(() => new Map((staff.data?.assignees ?? []).map((a) => [a.staffId, a.displayName])), [staff.data]);
  const [confirm, setConfirm] = React.useState<ReviewPair | null>(null);
  // Focus (review r1 M1, WCAG 2.4.3): the dialog returns focus to what opened it; when that row has gone (kept separate)
  // or its button was replaced (Undo), focus moves to the next row's action, else the tab, once the list has refreshed.
  const opener = React.useRef<HTMLElement | null>(null), sending = React.useRef(false);   // one POST per click (review r1 m1)
  const [focusNext, setFocusNext] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusNext) return;
    const el = document.querySelector<HTMLElement>(focusNext) ?? document.querySelector<HTMLElement>(`[data-dup-tab="${TABS.find((t) => t.tab === tab)!.param}"]`);
    if (el) { el.focus(); setFocusNext(null); }
  });
  const [merging, setMerging] = React.useState<ReviewPair | null>(null);
  const [done, setDone] = React.useState<{ name: string; mergeRef: string } | null>(null);   // part 3: "Merged into …" with Undo
  const [refused, setRefused] = React.useState<Record<string, string>>({});   // BR-10: the server's reason in Undo's place
  // A decision also changes the leads (BR-11: Keep separate clears "Possible match"; Undo gives leads back): their cached
  // answers are read again too (break r1 F1).
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["fo", "duplicates"] }), qc.invalidateQueries({ queryKey: ["fo", "leads"] })]);
  /** The next pair's Keep separate after `id` in the To review list, as a selector (or the tab when it was the last). */
  const nextAfter = (id: string) => { const items = open.data?.items ?? [], i = items.findIndex((x) => x.id === id), n = items[i + 1] ?? items[i - 1];
    return n ? `[data-dup-pair="${n.id}"] [data-dup-keep]` : `[data-dup-tab="review"]`; };
  const keep = useMutation({
    mutationFn: async (p: ReviewPair) => staffApi(`/front-office/duplicates/review/${p.id}/keep-separate`, { method: "POST" }),
    onSettled: () => { sending.current = false; },
    onSuccess: async (_, p) => { const next = nextAfter(p.id); opener.current = null; setConfirm(null); toast.push({ tone: "ok", text: `${names(p)} are kept separate.` }); await refresh(); setFocusNext(next); },
    onError: (e, p) => { opener.current = null; setConfirm(null); void refresh().then(() => setFocusNext(nextAfter(p.id))); toast.push({ tone: "danger", text: e instanceof StaffApiError ? e.message : `Could not keep ${names(p)} separate. Nothing changed.` }); },
  });
  const undo = useMutation({
    mutationFn: async (m: MergeRecord) => staffApi(`/front-office/duplicates/merges/${m.id}/undo`, { method: "POST" }),
    // The names on a merge record are the records' current ones (after a merge both may carry the chosen name), so the
    // toast names no one.
    onSettled: () => { sending.current = false; },
    onSuccess: async (_, m) => { if (done?.mergeRef === m.id) setDone(null); toast.push({ tone: "ok", text: "Merge undone: the two records are separate again, each with its own leads." }); await refresh(); setFocusNext(`[data-dup-merge="${m.id}"] [data-dup-after]`); },
    // A refusal shows the server's sentence in the button's place, and the list is read again (review r1 m5).
    // 503 (busy) is "try again": Undo stays offered, the sentence in a toast (BR-10 "always offered"; break r1 F4).
    onError: (e, m) => { if (e instanceof StaffApiError && e.status !== 401 && e.status !== 503) setRefused((r) => ({ ...r, [m.id]: e.message })); else toast.push({ tone: "danger", text: e instanceof StaffApiError && e.status === 503 ? e.message : "Could not undo the merge. Nothing changed." }); void refresh(); setFocusNext(e instanceof StaffApiError && e.status === 503 ? `[data-dup-merge="${m.id}"] button` : `[data-dup-merge="${m.id}"] [data-dup-after]`); },
  });
  // The key taken away mid-session: the list answers 403, said as the no-key sentence (break r1 F7).
  const lost = [open.error, kept.error, merges.error].some((e) => e instanceof StaffApiError && e.status === 403);
  if (!allowed || lost) return <div className="mx-auto flex max-w-6xl flex-col gap-4"><h1 className="text-2xl font-semibold text-text">People to merge</h1><Notice tone="info" title="You need access to People to merge. Ask an Owner or Admin." /></div>;
  const live = merges.data?.filter((m) => !m.undoneAt) ?? [];
  const count: Record<Tab, number | undefined> = { OPEN: open.data?.items.length, MERGED: merges.data ? live.length : undefined, KEPT_SEPARATE: kept.data?.items.length };
  const failed = (what: string, retry: () => void) => <Notice tone="danger" title={`Could not load ${what}.`} action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />;
  const empty = (t: Tab) => <section data-dup-empty={t} className="rounded-xl border border-border bg-surface-raised p-6 text-sm">{EMPTY[t]}</section>;
  const pairs = (q: typeof open, t: "OPEN" | "KEPT_SEPARATE") => q.isPending ? <Loading label="Loading the pairs" rows={3} /> : q.isError ? failed("the pairs", () => void q.refetch())
    : !q.data.items.length ? empty(t)
      : <Table label={t === "OPEN" ? "People to review" : "People kept separate"} head={["People", "What matched", "Match", t === "OPEN" ? "First seen" : "Kept separate", ""]} headClass={[undefined, "hidden sm:table-cell", undefined, "hidden sm:table-cell", undefined]}>
        {q.data.items.map((p) => (
          <tr key={p.id} data-dup-pair={p.id} className="border-t border-border align-top">
            <td className="min-w-[9rem] max-w-[22rem] px-3 py-2"><People p={p} /><p className="mt-1 text-xs text-text-muted sm:hidden">{reasonWords(p.reasons)}</p></td>
            <td className="hidden px-3 py-2 sm:table-cell">{reasonWords(p.reasons)}</td>
            <td className="px-3 py-2"><Score n={p.score} /></td>
            <td className="hidden whitespace-nowrap px-3 py-2 sm:table-cell">{when(t === "OPEN" ? p.firstSeenAt : p.decidedAt ?? p.firstSeenAt)}</td>
            <td className="px-3 py-2">
              {t === "OPEN" ? <div className="flex flex-col items-start gap-1">
                <div className="flex flex-wrap gap-1">
                  {/* BR-7: a case pair's Merge… is off with the sentence; the guided merge itself is part 3 (brief FO-9s-2). */}
                  {can(me, MERGE_KEY) ? <Button variant="outline" size="sm" disabled={p.needsCaseSide} data-dup-merge-open aria-describedby={p.needsCaseSide ? `dup-case-${p.id}` : undefined} onClick={(e) => { opener.current = e.currentTarget; setDone(null); setMerging(p); }}>Merge…</Button> : null}
                  <Button variant="ghost" size="sm" data-dup-keep onClick={(e) => { opener.current = e.currentTarget; setConfirm(p); }}>Keep separate</Button>
                </div>
                {p.needsCaseSide ? <p id={`dup-case-${p.id}`} className="text-xs text-text-muted" data-needs-case-side>{CASE_SIDE_LINE}</p> : null}
              </div> : <span className="text-xs text-text-muted">{p.automatic ? "Decided automatically" : "Decided by staff"}</span>}
            </td>
          </tr>
        ))}
      </Table>;
  const mergedTab = merges.isPending ? <Loading label="Loading the merges" rows={3} /> : merges.isError ? failed("the merges", () => void merges.refetch())
    : !merges.data.length ? empty("MERGED")
      : <Table label="People merged" head={["People", "How", "When", ""]} headClass={[undefined, "hidden sm:table-cell", "hidden sm:table-cell", undefined]}>
        {merges.data.map((m) => (
          <tr key={m.id} data-dup-merge={m.id} className="border-t border-border align-top">
            {/* After a merge both records can carry the chosen name (review r1 m3): then one name, said as two records. */}
            <td className="min-w-[9rem] max-w-[22rem] px-3 py-2 break-words">{m.loser.name === m.survivor.name ? <><span className="font-medium">{m.survivor.name}</span> <span className="text-text-muted">(two records)</span></>
              : <><span className="font-medium">{m.loser.name}</span> <span className="text-text-muted">into</span> <span className="font-medium">{m.survivor.name}</span></>}
              <p className="mt-1 text-xs text-text-muted sm:hidden">{mergedBy(m, me.staffId, staffNames)} · {when(m.at)}</p></td>
            <td className="hidden px-3 py-2 sm:table-cell">{mergedBy(m, me.staffId, staffNames)}</td>
            <td className="hidden whitespace-nowrap px-3 py-2 sm:table-cell">{when(m.at)}</td>
            <td className="max-w-[18rem] px-3 py-2">
              {m.undoneAt ? <span tabIndex={-1} data-dup-after className="outline-none"><Pill tone="neutral">Undone {when(m.undoneAt)}</Pill></span>
                : refused[m.id] ? <p role="status" tabIndex={-1} data-dup-after className="text-xs text-text-warn outline-none" data-undo-refused>{refused[m.id]}</p>
                  : can(me, MERGE_KEY) ? <Button variant="outline" size="sm" busy={undo.isPending && undo.variables?.id === m.id} onClick={() => { if (sending.current) return; sending.current = true; undo.mutate(m); }}>Undo merge</Button>
                    : <span className="text-xs text-text-muted">Someone who may merge people (an Owner, Admin or Case Manager) can undo it.</span>}
            </td>
          </tr>
        ))}
      </Table>;
  return (
    <TooltipProvider delayDuration={250}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold text-text">People to merge</h1>
          <p className="mt-1 text-sm text-text-muted">Pairs that may be one person. Nothing merges here until you choose. Merged people can be split again while nothing new was added.</p>
        </header>
        {done ? <Notice tone="ok" title={`Merged into ${done.name}.`} action={<div className="flex gap-2">
          <Button variant="outline" size="sm" data-merged-undo busy={undo.isPending} onClick={() => { const m = merges.data?.find((x) => x.id === done.mergeRef); if (!m || sending.current) return; sending.current = true; undo.mutate(m); }} disabled={!merges.data?.some((x) => x.id === done.mergeRef && !x.undoneAt)}>Undo</Button>
          <Button variant="ghost" size="sm" onClick={() => setDone(null)}>Dismiss</Button></div>}>
          <span data-merged-notice>It is on the Merged tab, where it can be undone later too.</span>
        </Notice> : null}
        {done && refused[done.mergeRef] ? <Notice tone="warn" title={refused[done.mergeRef]} /> : null}
        <Tabs value={tab} onValueChange={(v) => setParams((s) => { const n = new URLSearchParams(s); n.set("tab", TABS.find((t) => t.tab === v)!.param); return n; }, { replace: true })}>
          <TabsList aria-label="People to merge" className="h-auto flex-wrap">
            {TABS.map((t) => <TabsTrigger key={t.tab} value={t.tab} data-dup-tab={t.param}>{t.label}{count[t.tab] !== undefined ? ` (${count[t.tab]})` : ""}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="OPEN" className="mt-3">{pairs(open, "OPEN")}</TabsContent>
          <TabsContent value="MERGED" className="mt-3">{mergedTab}</TabsContent>
          <TabsContent value="KEPT_SEPARATE" className="mt-3">{pairs(kept, "KEPT_SEPARATE")}</TabsContent>
        </Tabs>
        {/* After a merge the row has gone: focus moves to the notice's Undo (WCAG 2.4.3, as after Keep separate). */}
        <MergeDialog pair={merging} onRefresh={() => void refresh()} returnFocus={() => opener.current?.isConnected ? opener.current : null} onClose={() => setMerging(null)}
          onMerged={(name, mergeRef) => { opener.current = null; setMerging(null); setDone({ name, mergeRef }); void refresh().then(() => setFocusNext("[data-merged-undo]")); }} />
        <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !keep.isPending) setConfirm(null); }} title="Keep these people separate?" returnFocus={() => opener.current}
          description={confirm ? `${names(confirm)} stay two records. The pair leaves To review and is not suggested again.` : undefined}
          footer={<><Button variant="ghost" disabled={keep.isPending} onClick={() => setConfirm(null)}>Cancel</Button><Button busy={keep.isPending} onClick={() => { if (!confirm || sending.current) return; sending.current = true; keep.mutate(confirm); }}>Keep separate</Button></>}>
          <p className="text-sm text-text-muted">Their leads, notes and calls do not change.</p>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export function PeopleToMergePage() {
  return <SalesFrame crumbs={[{ label: "People to merge" }]}><PeopleToMergeBody /></SalesFrame>;
}
