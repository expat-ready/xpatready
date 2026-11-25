// PF-21s part 3 + part 4 (concept screens/pf-21-complaints §4 "Record page", Workspace pattern; BR-1..BR-4, BR-6, BR-8):
// one complaint: header (who it is from, status, handler), the overdue or closed line, Facts on the left and
// "What happened" (every event, newest first) on the right; below 768 px the facts sit above the timeline. Not found has
// one wording for another firm's, someone else's and a bad id (BR-4). Part 4: a next-step bar with the one filled
// button by status and the quiet secondary acts, each one panel (action-drawer.tsx); Change handler only with both keys
// while open; a closed complaint takes a note only. A person who may not act sees the read-only reason instead. An act
// refused with 404 (access lost while working) shows the not-found words and keeps nothing of the record on screen.
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Notice } from "@/components/ui/controls";
import { Loading } from "@/modules/front-office/sales/loading";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError } from "../session";
import { ActionDrawer, keptAction } from "./action-drawer";
import { ACTION, type Action, allowedActions, canAct, canChangeHandler, CATEGORY, CHANNEL, day, dayTime, daysLeftWords, Detail, EVENT, fromOf, KIND, nameOf, nextAction, NOT_FOUND, otherActions, OUTCOME, READ_ONLY, statusOf, word, zoneName } from "./contract";

const Sample = ({ what = "Sample" }: { what?: string }) => <span className="ml-1 text-[11px] text-text-muted">{what}</span>;
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5 border-b border-border py-2.5 last:border-b-0"><dt className="text-xs text-text-muted">{label}</dt><dd className="text-sm [overflow-wrap:anywhere]">{children}</dd></div>;
}
/** The event's own facts in words (its dates, its outcome, a handler change's names). */
function eventLine(e: Detail["events"][number], people: Record<string, string>): string | null {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  if (e.kind === "HANDLER_CHANGED" && typeof d.from === "string" && typeof d.to === "string") return `From ${nameOf(people, d.from)} to ${nameOf(people, d.to)}.`;
  if (e.kind === "CLOSED" && typeof d.outcome === "string") return `Outcome: ${word(OUTCOME, d.outcome)}.`;
  if (e.kind === "RECEIVED" && typeof d.channel === "string") return `By ${word(CHANNEL, d.channel).toLowerCase()}, about ${word(CATEGORY, String(d.category)).toLowerCase()}.`;
  return null;
}

export function NotFound() {
  // Focus lands on the words, also after an act that found the complaint gone (break m5b).
  const h = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { h.current?.focus(); }, []);
  return (
    <div className="mx-auto mt-6 flex max-w-xl flex-col items-start gap-3 rounded-xl border border-border bg-surface-raised p-6" data-not-found>
      <h1 ref={h} tabIndex={-1} className="text-lg font-semibold outline-none">Complaint not found</h1>
      <p className="text-sm text-text-muted">{NOT_FOUND}</p>
      <Link to="/platform/complaints" className="text-sm font-medium text-text-link hover:underline">Back to Complaints</Link>
    </div>
  );
}

function RecordBody({ id }: { id: string }) {
  const me = usePlatformStaff();
  // Only an id can name a complaint: anything else ("handlers", a typo) is Not found without asking (break m8, BR-4).
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const q = useQuery({ queryKey: ["pf", "complaints", "one", id], retry: false, enabled: isId, queryFn: async () => Detail.parse(await staffApi(`/platform/complaints/${encodeURIComponent(id)}`)) });
  // The page opens on its heading, so a keyboard or screen reader starts at the complaint (review m3, break m11).
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { heading.current?.focus(); }, [q.data?.id]);
  // A panel left open when the session ended comes back after signing in again as the same person (break M3).
  const [act, setAct] = React.useState<Action | null>(() => keptAction(me.staffId, id));
  const [lost, setLost] = React.useState(false);
  const primary = React.useRef<HTMLButtonElement>(null), opener = React.useRef<HTMLElement | null>(null);
  // Focus goes back to the button that opened the panel while it is still on the page, else the filled one (break m5a).
  const open = React.useCallback((a: Action) => { restoredAct.current = false; opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setAct(a); }, []);
  // Only a panel brought back after sign-in is checked against what the complaint now allows (break m3); a panel the
  // person opened stays open to show its own refusal.
  const restoredAct = React.useRef(act !== null);
  if (!isId || lost) return <NotFound />;
  if (q.isPending) return <Loading label="Loading the complaint" rows={4} />;
  if (q.isError) return q.error instanceof StaffApiError && (q.error.status === 404 || q.error.status === 403) ? <NotFound />
    : <p role="alert" className="text-sm text-text-danger">{q.error instanceof StaffApiError ? q.error.message : "Could not load the complaint."} <Button variant="link" size="sm" onClick={() => q.refetch()}>Try again</Button></p>;
  const c = q.data, zone = c.firmTimeZone, s = statusOf(c), left = daysLeftWords(c), from = fromOf(c);
  const events = [...c.events].reverse();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4" data-complaint={c.id}>
      <header className="flex flex-col gap-1">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-text outline-none [overflow-wrap:anywhere]">{from}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
          <span className={cn("inline-flex items-center gap-1", c.overdue ? "font-semibold text-text-warn" : c.status === "OPEN" ? "text-text" : "")} data-status={s.text}><span aria-hidden="true">{s.mark}</span>{s.text}</span>
          <span>Handler: <span className="text-text" data-handler>{nameOf(c.people, c.handlerStaffId)}</span></span>
          <span>Received {day(c.receivedAt, zone)}</span>
        </p>
      </header>
      {c.overdue && left ? <Notice tone="warn" title="Needs you">This complaint was due to be acknowledged by {day(c.acknowledgeBy, zone)} ({left.text}).</Notice> : null}
      {c.status === "CLOSED" ? <Notice tone="info" title={`Closed on ${c.closedAt ? day(c.closedAt, zone) : "—"} · outcome: ${word(OUTCOME, c.outcome)}`}>A closed complaint is kept as it is; add a note if something more happens. <span className="text-[11px]">Outcomes are a Sample list.</span></Notice> : null}
      {c.status === "OPEN" && !canAct(me, c) ? <p className="text-sm text-text-muted" data-read-only>{READ_ONLY}</p> : null}
      {canAct(me, c) ? <NextStep c={c} me={me} onAct={open} primary={primary} /> : null}
      {canAct(me, c) ? <ActionDrawer action={act && (!restoredAct.current || allowedActions(me, c).includes(act)) ? act : null} onAct={open} onClose={() => setAct(null)} complaint={c.id} dates={c} zone={zone} handlerId={c.handlerStaffId} onLost={() => { setAct(null); setLost(true); }} returnFocus={() => (opener.current?.isConnected && opener.current.dataset.act ? opener.current : primary.current ?? heading.current)} /> : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-labelledby="pf-facts" className="rounded-xl border border-border bg-surface-raised px-4 py-3">
          <h2 id="pf-facts" className="text-sm font-semibold">Facts</h2>
          <p className="text-xs text-text-muted">Dates and times in the firm's time ({zoneName(zone)}).</p>
          <dl className="mt-1">
            <Fact label="From">{c.complainantName ?? ""}<span className="block text-xs text-text-muted">{word(KIND, c.subjectKind)}{c.complainantContact ? ` · ${c.complainantContact}` : ""}</span></Fact>
            <Fact label="Received">{dayTime(c.receivedAt, zone)}</Fact>
            <Fact label="How it came">{word(CHANNEL, c.channel)}<Sample /></Fact>
            <Fact label="About">{word(CATEGORY, c.category)}<Sample /></Fact>
            <Fact label="Acknowledge by">{dayTime(c.acknowledgeBy, zone)}{c.acknowledgedAt ? ` · acknowledged ${day(c.acknowledgedAt, zone)}` : left ? <span className={cn(" ml-1", left.late ? "font-medium text-text-warn" : "text-text-muted")}>· {left.text}</span> : null}<Sample what="Sample period: 2 business days" /></Fact>
            <Fact label="Response sent">{c.responseSentAt ? dayTime(c.responseSentAt, zone) : <span className="text-text-muted">Not yet</span>}</Fact>
            <Fact label="What it is about"><span className="whitespace-pre-wrap">{c.summary}</span></Fact>
            <Fact label="Recorded by">{nameOf(c.people, c.recordedBy)}</Fact>
          </dl>
        </section>
        <section aria-labelledby="pf-events" className="rounded-xl border border-border bg-surface-raised px-4 py-3">
          <h2 id="pf-events" className="text-sm font-semibold">What happened</h2>
          <ol className="mt-2 flex flex-col" data-timeline>
            {events.map((e) => {
              const line = eventLine(e, c.people);
              return (
                <li key={e.id} className="border-b border-border py-2.5 last:border-b-0" data-event={e.kind}>
                  <p className="text-sm font-medium">{word(EVENT, e.kind)}</p>
                  <p className="text-xs text-text-muted">{dayTime(e.at, zone)} · {nameOf(c.people, e.actor)}</p>
                  {line ? <p className="mt-1 text-sm">{line}</p> : null}
                  {e.note ? <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{e.note}</p> : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

/** The next-step bar: the one filled button named for the act, the other acts quiet beside it, Change handler a link. */
function NextStep({ c, me, onAct, primary }: { c: Detail; me: ReturnType<typeof usePlatformStaff>; onAct: (a: Action) => void; primary: React.RefObject<HTMLButtonElement | null> }) {
  const next = nextAction(c), others = otherActions(c);
  return (
    <section aria-label="Next step" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3" data-next-step={next}>
      {c.status === "OPEN"
        ? <Button ref={primary} onClick={() => onAct(next)} data-act={next}>{ACTION[next].title}</Button>
        : <Button ref={primary} variant="outline" onClick={() => onAct("note")} data-act="note">{ACTION.note.title}</Button>}
      {others.map((a) => <Button key={a} variant="secondary" onClick={() => onAct(a)} data-act={a}>{ACTION[a].title}</Button>)}
      {canChangeHandler(me, c) ? <Button variant="link" className="ml-auto" onClick={() => onAct("handler")} data-act="handler">{ACTION.handler.title}</Button> : null}
    </section>
  );
}

export function ComplaintPage() {
  const { id = "" } = useParams();
  return <PlatformFrame crumbs={[{ label: "Complaints", to: "/platform/complaints" }, { label: "Complaint" }]} back={{ to: "/platform/complaints", label: "Back to Complaints" }}><RecordBody id={id} /></PlatformFrame>;
}
