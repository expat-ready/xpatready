// FO-9s part 2 (R1.29; concept screens/FO-9s/concept.md r3 §4 S2, board design/fo9s-boards.html S2): Sales › People to
// merge. Tabs To review · Merged · Kept separate over FO-9b part 2's routes. BR-6: only pairs whose two people the viewer
// may open (the server filters); the list, its tabs and Keep separate need agent/prospect:edit, Undo merge needs
// agent/prospect:merge; without the list key the menu item is not shown and a typed address says who to ask. BR-10: Undo
// merge on every not-undone merge on the Merged tab (automatic ones too), always offered; a refusal shows the server's
// reason in its place. BR-11: Keep separate decides the pair (a confirm first: it is not suggested again). The guided
// merge (Merge…, BR-7 to BR-9) is part 3.
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
import { MERGE_KEY, MergeList, mergedBy, REVIEW_KEY, reasonWords, reviewQuery, type MergeRecord, type ReviewPair } from "./contract";

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
  return <ul className="flex flex-col gap-0.5">{p.people.map((x) => <li key={x.personId} className="[overflow-wrap:anywhere]"><span className="font-medium">{x.name}</span>{x.lead ? <span className="text-text-muted"> · {x.lead}</span> : null}</li>)}</ul>;
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
  const open = useQuery({ ...reviewQuery("OPEN"), enabled: allowed });
  const kept = useQuery({ ...reviewQuery("KEPT_SEPARATE"), enabled: allowed });
  const merges = useQuery({ ...mergesQuery, enabled: allowed });
  const staff = useQuery({ ...assigneesQuery, enabled: allowed && tab === "MERGED" });
  const staffNames = React.useMemo(() => new Map((staff.data?.assignees ?? []).map((a) => [a.staffId, a.displayName])), [staff.data]);
  const [confirm, setConfirm] = React.useState<ReviewPair | null>(null);
  const [refused, setRefused] = React.useState<Record<string, string>>({});   // BR-10: the server's reason in Undo's place
  const refresh = () => void qc.invalidateQueries({ queryKey: ["fo", "duplicates"] });
  const keep = useMutation({
    mutationFn: async (p: ReviewPair) => staffApi(`/front-office/duplicates/review/${p.id}/keep-separate`, { method: "POST" }),
    onSuccess: (_, p) => { setConfirm(null); refresh(); toast.push({ tone: "ok", text: `${names(p)} are kept separate.` }); },
    onError: (e, p) => { setConfirm(null); refresh(); toast.push({ tone: "danger", text: e instanceof StaffApiError ? e.message : `Could not keep ${names(p)} separate. Nothing changed.` }); },
  });
  const undo = useMutation({
    mutationFn: async (m: MergeRecord) => staffApi(`/front-office/duplicates/merges/${m.id}/undo`, { method: "POST" }),
    onSuccess: (_, m) => { refresh(); toast.push({ tone: "ok", text: `Merge undone: ${m.survivor.name} and ${m.loser.name} are two records again.` }); },
    onError: (e, m) => { if (e instanceof StaffApiError && e.status !== 401) setRefused((r) => ({ ...r, [m.id]: e.message })); else toast.push({ tone: "danger", text: "Could not undo the merge. Nothing changed." }); },
  });
  if (!allowed) return <Notice tone="info" title="You need access to People to merge. Ask an Owner or Admin." />;
  const live = merges.data?.filter((m) => !m.undoneAt) ?? [];
  const count: Record<Tab, number | undefined> = { OPEN: open.data?.items.length, MERGED: merges.data ? live.length : undefined, KEPT_SEPARATE: kept.data?.items.length };
  const failed = (what: string, retry: () => void) => <Notice tone="danger" title={`Could not load ${what}.`} action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />;
  const empty = (t: Tab) => <section data-dup-empty={t} className="rounded-xl border border-border bg-surface-raised p-6 text-sm">{EMPTY[t]}</section>;
  const pairs = (q: typeof open, t: "OPEN" | "KEPT_SEPARATE") => q.isPending ? <Loading label="Loading the pairs" rows={3} /> : q.isError ? failed("the pairs", () => void q.refetch())
    : !q.data.items.length ? empty(t)
      : <Table label={t === "OPEN" ? "People to review" : "People kept separate"} head={["People", "What matched", "Match", t === "OPEN" ? "First seen" : "Kept separate", ""]}>
        {q.data.items.map((p) => (
          <tr key={p.id} data-dup-pair={p.id} className="border-t border-border align-top">
            <td className="max-w-[22rem] px-3 py-2"><People p={p} /></td>
            <td className="px-3 py-2">{reasonWords(p.reasons)}</td>
            <td className="px-3 py-2"><Score n={p.score} /></td>
            <td className="whitespace-nowrap px-3 py-2">{when(t === "OPEN" ? p.firstSeenAt : p.decidedAt ?? p.firstSeenAt)}</td>
            <td className="px-3 py-2">
              {t === "OPEN" ? <div className="flex flex-col items-start gap-1">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(p)}>Keep separate</Button>
                {p.needsCaseSide ? <p className="text-xs text-text-muted" data-needs-case-side>This person has a case; merge them from the client record.</p> : null}
              </div> : <span className="text-xs text-text-muted">{p.automatic ? "Decided automatically" : "Decided by staff"}</span>}
            </td>
          </tr>
        ))}
      </Table>;
  const mergedTab = merges.isPending ? <Loading label="Loading the merges" rows={3} /> : merges.isError ? failed("the merges", () => void merges.refetch())
    : !merges.data.length ? empty("MERGED")
      : <Table label="People merged" head={["People", "How", "When", ""]}>
        {merges.data.map((m) => (
          <tr key={m.id} data-dup-merge={m.id} className="border-t border-border align-top">
            <td className="max-w-[22rem] px-3 py-2 [overflow-wrap:anywhere]"><span className="font-medium">{m.loser.name}</span> <span className="text-text-muted">into</span> <span className="font-medium">{m.survivor.name}</span></td>
            <td className="px-3 py-2">{mergedBy(m, me.staffId, staffNames)}</td>
            <td className="whitespace-nowrap px-3 py-2">{when(m.at)}</td>
            <td className="max-w-[18rem] px-3 py-2">
              {m.undoneAt ? <Pill tone="neutral">Undone {when(m.undoneAt)}</Pill>
                : refused[m.id] ? <p role="status" className="text-xs text-text-warn" data-undo-refused>{refused[m.id]}</p>
                  : can(me, MERGE_KEY) ? <Button variant="outline" size="sm" busy={undo.isPending && undo.variables?.id === m.id} onClick={() => undo.mutate(m)}>Undo merge</Button>
                    : <span className="text-xs text-text-muted">An Owner or Case Manager can undo it.</span>}
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
        <Tabs value={tab} onValueChange={(v) => setParams((s) => { const n = new URLSearchParams(s); n.set("tab", TABS.find((t) => t.tab === v)!.param); return n; }, { replace: true })}>
          <TabsList aria-label="People to merge" className="h-auto flex-wrap">
            {TABS.map((t) => <TabsTrigger key={t.tab} value={t.tab} data-dup-tab={t.param}>{t.label}{count[t.tab] !== undefined ? ` (${count[t.tab]})` : ""}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="OPEN" className="mt-3">{pairs(open, "OPEN")}</TabsContent>
          <TabsContent value="MERGED" className="mt-3">{mergedTab}</TabsContent>
          <TabsContent value="KEPT_SEPARATE" className="mt-3">{pairs(kept, "KEPT_SEPARATE")}</TabsContent>
        </Tabs>
        <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !keep.isPending) setConfirm(null); }} title="Keep these people separate?"
          description={confirm ? `${names(confirm)} stay two records. The pair leaves To review and is not suggested again.` : undefined}
          footer={<><Button variant="ghost" disabled={keep.isPending} onClick={() => setConfirm(null)}>Cancel</Button><Button busy={keep.isPending} onClick={() => confirm && keep.mutate(confirm)}>Keep separate</Button></>}>
          <p className="text-sm text-text-muted">Their leads, notes and calls do not change.</p>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export function PeopleToMergePage() {
  return <SalesFrame crumbs={[{ label: "People to merge" }]}><PeopleToMergeBody /></SalesFrame>;
}
